export type CharKind = 'letter' | 'punct' | 'space'
export type Level = 1 | 2 | 3 | 4 | 5 | 6
export type Hint = 'show' | 'slot' | 'none'

export interface Ch {
  ch: string
  kind: CharKind
  word: number
  /** first typeable character of its word (the one kept visible at level 4) */
  initial: boolean
}

export interface Fragment {
  text: string
  words: string[]
  chars: Ch[]
  /** letters and spaces the user has to type; punctuation is filled in automatically */
  typeable: number
  /** starts a new line of the source text */
  breakBefore: boolean
}

const LETTER = /[\p{L}\p{N}]/u

export function isLetter(c: string): boolean {
  return LETTER.test(c)
}

/** Comparison key for a typed character. Case never matters; accents only in strict mode. */
export function fold(c: string, strict: boolean): string {
  const lower = c.toLowerCase()
  if (strict || lower === 'ñ') return lower
  return lower.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

const ABBREVIATIONS = new Set(['art.', 'arts.', 'inc.', 'etc.', 'ee.uu.', 'n.', 'núm.'])
const CONNECTORS = new Set(['por', 'para', 'que', 'cuando', 'mediante', 'salvo', 'con', 'sin'])

const SENTENCE_MIN = 5
const CLAUSE_MIN = 9
const CONNECTOR_MIN = 12
const HARD_MAX = 18
const TAIL_MIN = 4

function splitLine(line: string): string[][] {
  const words = line.split(/\s+/).filter(Boolean)
  const out: string[][] = []
  let cur: string[] = []
  words.forEach((word, i) => {
    cur.push(word)
    const next = words[i + 1]
    if (!next) return
    const bare = word.replace(/[)"»”]+$/, '')
    const last = bare.slice(-1)
    const abbr = ABBREVIATIONS.has(word.toLowerCase().replace(/^[("«“]+/, ''))
    const sentenceEnd = !abbr && /[.;:]/.test(last) && cur.length >= SENTENCE_MIN
    const clauseEnd = last === ',' && cur.length >= CLAUSE_MIN
    const connector = cur.length >= CONNECTOR_MIN && CONNECTORS.has(next.toLowerCase())
    if (sentenceEnd || clauseEnd || connector || cur.length >= HARD_MAX) {
      out.push(cur)
      cur = []
    }
  })
  if (cur.length) {
    if (cur.length < TAIL_MIN && out.length) out[out.length - 1].push(...cur)
    else out.push(cur)
  }
  return out
}

function buildFragment(words: string[], breakBefore: boolean): Fragment {
  const chars: Ch[] = []
  let typeable = 0
  words.forEach((word, w) => {
    if (w > 0) {
      chars.push({ ch: ' ', kind: 'space', word: w - 1, initial: false })
      typeable++
    }
    let seenLetter = false
    for (const ch of word) {
      const letter = isLetter(ch)
      chars.push({ ch, kind: letter ? 'letter' : 'punct', word: w, initial: letter && !seenLetter })
      if (letter) {
        seenLetter = true
        typeable++
      }
    }
  })
  return { text: words.join(' '), words, chars, typeable, breakBefore }
}

/**
 * Splits a text into the fragments that are learned independently.
 * Every line of the source is kept apart; long lines are cut at sentence and clause boundaries.
 */
export function splitFragments(text: string): Fragment[] {
  const fragments: Fragment[] = []
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean)
  lines.forEach((line, li) => {
    splitLine(line).forEach((words, wi) => {
      const frag = buildFragment(words, li > 0 && wi === 0)
      if (frag.typeable > 0) fragments.push(frag)
    })
  })
  return fragments
}

const STOPWORDS = new Set(
  (
    'a al algo ante aquel aquella aquellas aquello aquellos como con cual cuales cualquier cuya cuyo de del desde ' +
    'donde e el ella ellas ellos en entre era es esa esas ese eso esos esta estas este esto estos ha han hay la las ' +
    'le les lo los mas más me mi ni no o os otra otro para pero por que se sea sean ser si sin sobre son su sus tal ' +
    'tales también tan toda todas todo todos u un una uno unas unos y ya él'
  ).split(' '),
)

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const HIDDEN_SHARE: Partial<Record<Level, number>> = { 2: 0.3, 3: 0.7 }

/**
 * Words hidden at the gap levels (2 and 3). Meaningful words go first: long ones and numbers
 * before connectors. The seed shuffles near ties so each pass hides a slightly different set.
 */
export function hiddenWords(frag: Fragment, level: Level, seed: number): Set<number> {
  const share = HIDDEN_SHARE[level]
  if (!share) return new Set()
  const rand = mulberry32(seed)
  const scored = frag.words.map((word, index) => {
    const bare = [...word].filter(isLetter).join('').toLowerCase()
    let score = 0
    if (bare && !STOPWORDS.has(bare)) score = bare.length + (/\d/.test(bare) ? 5 : 0) + 4
    else score = Math.min(bare.length, 3) * 0.5
    return { index, score: score + rand() * 3 }
  })
  scored.sort((a, b) => b.score - a.score)
  const count = Math.max(1, Math.round(frag.words.length * share))
  return new Set(scored.slice(0, count).map((s) => s.index))
}

/** How a character that has not been typed yet is displayed. */
export function hintFor(c: Ch, level: Level, hidden: Set<number>, revealed: boolean): Hint {
  if (c.kind === 'space') return level === 6 && !revealed ? 'none' : 'show'
  if (revealed || level === 1) return 'show'
  if (level === 6) return 'none'
  if (c.kind === 'punct') return 'show'
  if (level === 5) return 'slot'
  if (level === 4) return c.initial ? 'show' : 'slot'
  return hidden.has(c.word) ? 'slot' : 'show'
}

export const LEVEL_NAMES: Record<Level, string> = {
  1: 'Copia',
  2: 'Huecos clave',
  3: 'Huecos amplios',
  4: 'Iniciales',
  5: 'Silueta',
  6: 'Recuerdo libre',
}

export const LEVEL_HELP: Record<Level, string> = {
  1: 'Ves el texto completo y lo copias.',
  2: 'Desaparecen los términos más importantes.',
  3: 'Solo quedan los conectores.',
  4: 'Queda la primera letra de cada palabra.',
  5: 'Queda solo el largo de cada palabra.',
  6: 'Solo el título. Escribes todo de memoria.',
}
