import type { FragResult } from './progress'
import { fold, hiddenWords, hintFor, isLetter, splitFragments, type Fragment, type Level } from './text'

const ERRORS_PER_WORD = 3
const STRIKES_TO_REVEAL = 3

export interface Session {
  frags: Fragment[]
  levels: Level[]
  hidden: Set<number>[]
  strict: boolean
  /** current fragment and position inside it */
  fi: number
  ci: number
  /** wrong keys per word, capped so one forgotten word cannot sink the whole fragment */
  wordErrors: number[][]
  revealed: boolean[][]
  /** words written from memory without errors, used for the marker flash */
  recalled: boolean[][]
  strikes: number
  results: FragResult[]
  done: boolean
  combo: number
  bestCombo: number
  /** bumps on every wrong key so the view can replay its shake */
  errorTick: number
  typed: number
  startedAt: number | null
  endedAt: number | null
}

export function createSession(text: string, levels: Level[], seed: number, strict: boolean): Session {
  const frags = splitFragments(text)
  const session: Session = {
    frags,
    levels: frags.map((_, i) => levels[i] ?? 1),
    hidden: [],
    strict,
    fi: 0,
    ci: 0,
    wordErrors: frags.map((f) => f.words.map(() => 0)),
    revealed: frags.map((f) => f.words.map(() => false)),
    recalled: frags.map((f) => f.words.map(() => false)),
    strikes: 0,
    results: [],
    done: frags.length === 0,
    combo: 0,
    bestCombo: 0,
    errorTick: 0,
    typed: 0,
    startedAt: null,
    endedAt: null,
  }
  session.hidden = frags.map((f, i) => hiddenWords(f, session.levels[i], seed * 131 + i))
  return settle(session, 0)
}

function wordIsHidden(s: Session, fi: number, word: number): boolean {
  if (s.revealed[fi][word]) return false
  return s.frags[fi].chars.some(
    (c, i) =>
      c.word === word &&
      c.kind === 'letter' &&
      (fi > s.fi || i >= s.ci) &&
      hintFor(c, s.levels[fi], s.hidden[fi], false) !== 'show',
  )
}

/** Word the cursor is working on: the next one when it is resting on a space. */
function targetWord(s: Session): number {
  const frag = s.frags[s.fi]
  const c = frag.chars[s.ci]
  return c.kind === 'space' ? Math.min(c.word + 1, frag.words.length - 1) : c.word
}

function closeFragment(s: Session): FragResult {
  const frag = s.frags[s.fi]
  return {
    typeable: frag.typeable,
    errors: s.wordErrors[s.fi].reduce((a, b) => a + b, 0),
    words: frag.words.length,
    revealed: s.revealed[s.fi].filter(Boolean).length,
  }
}

/** Skips punctuation, which is never typed, and moves on when a fragment is finished. */
function settle(s: Session, now: number): Session {
  let next = s
  while (!next.done) {
    const frag = next.frags[next.fi]
    if (next.ci < frag.chars.length) {
      if (frag.chars[next.ci].kind !== 'punct') break
      next = { ...next, ci: next.ci + 1 }
      continue
    }
    const results = [...next.results, closeFragment(next)]
    const fi = next.fi + 1
    const done = fi >= next.frags.length
    next = { ...next, results, fi, ci: 0, strikes: 0, done, endedAt: done ? now : null }
  }
  return next
}

export function typeChar(s: Session, raw: string, now: number): Session {
  if (s.done) return s
  const frag = s.frags[s.fi]
  const expected = frag.chars[s.ci]
  const isSpace = raw === ' '
  if (!isSpace && !isLetter(raw)) return s
  // the space that separates two fragments is optional
  if (isSpace && expected.kind !== 'space') {
    const atStart = !frag.chars.slice(0, s.ci).some((c) => c.kind !== 'punct')
    if (atStart) return s
  }
  const startedAt = s.startedAt ?? now

  if (fold(raw, s.strict) === fold(expected.ch, s.strict)) {
    let { combo, bestCombo } = s
    let recalled = s.recalled
    const nextChar = frag.chars[s.ci + 1]
    const wordEnds = expected.kind === 'letter' && (!nextChar || nextChar.word !== expected.word || nextChar.kind !== 'letter')
    const lastLetter = wordEnds && !frag.chars.slice(s.ci + 1).some((c) => c.word === expected.word && c.kind === 'letter')
    if (lastLetter) {
      const w = expected.word
      const clean = s.wordErrors[s.fi][w] === 0 && !s.revealed[s.fi][w]
      combo = clean ? combo + 1 : 0
      bestCombo = Math.max(bestCombo, combo)
      const fromMemory = hintFor(expected, s.levels[s.fi], s.hidden[s.fi], false) !== 'show'
      if (clean && fromMemory) {
        recalled = recalled.map((row, i) => (i === s.fi ? row.map((v, j) => v || j === w) : row))
      }
    }
    return settle(
      { ...s, ci: s.ci + 1, strikes: 0, combo, bestCombo, recalled, typed: s.typed + 1, startedAt },
      now,
    )
  }

  // a miss on a space belongs to the word the user is trying to start
  const word = targetWord(s)
  const wordErrors = s.wordErrors.map((row, i) =>
    i === s.fi ? row.map((v, j) => (j === word ? Math.min(ERRORS_PER_WORD, v + 1) : v)) : row,
  )
  const strikes = s.strikes + 1
  let next: Session = { ...s, wordErrors, strikes, combo: 0, errorTick: s.errorTick + 1, startedAt }
  if (strikes >= STRIKES_TO_REVEAL) next = reveal(next)
  return next
}

/** Shows the word under the cursor. It only counts as help when something was actually hidden. */
export function reveal(s: Session): Session {
  if (s.done) return s
  const word = targetWord(s)
  if (!wordIsHidden(s, s.fi, word)) return s
  const revealed = s.revealed.map((row, i) => (i === s.fi ? row.map((v, j) => v || j === word) : row))
  return { ...s, revealed, combo: 0 }
}

export type SessionEvent = 'key' | 'error' | 'word' | 'reveal' | 'fragment'

const countTrue = (rows: boolean[][]) => rows.reduce((acc, row) => acc + row.filter(Boolean).length, 0)

/**
 * The most significant thing that happened between two states, for feedback such as sound.
 * Finishing the pass is left out: the view reports it once the result is known.
 */
export function eventBetween(prev: Session, next: Session): SessionEvent | null {
  if (prev === next) return null
  if (countTrue(next.revealed) > countTrue(prev.revealed)) return 'reveal'
  if (next.errorTick > prev.errorTick) return 'error'
  if (next.typed === prev.typed || next.done) return null
  if (next.fi > prev.fi) return 'fragment'
  if (countTrue(next.recalled) > countTrue(prev.recalled)) return 'word'
  return 'key'
}

export function progressRatio(s: Session): number {
  const total = s.frags.reduce((acc, f) => acc + f.typeable, 0)
  return total ? s.typed / total : 0
}

export function liveAccuracy(s: Session): number {
  const errors = s.wordErrors.reduce((acc, row) => acc + row.reduce((a, b) => a + b, 0), 0)
  return s.typed + errors ? s.typed / (s.typed + errors) : 1
}

export function wordsPerMinute(s: Session, now: number): number {
  if (!s.startedAt) return 0
  const minutes = ((s.endedAt ?? now) - s.startedAt) / 60000
  return minutes > 0 ? Math.round(s.typed / 5 / minutes) : 0
}
