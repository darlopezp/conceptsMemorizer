import type { Level } from './text'

export interface FragState {
  level: Level
  /** consecutive clean passes at the current level */
  streak: number
}

export interface CardProgress {
  /** fingerprint of the text the fragments were built from */
  sig: string
  frags: FragState[]
  /** position in the review schedule; 0 while the card is still being learned */
  stage: number
  due: number | null
  lastSeen: number
  passes: number
}

export interface FragResult {
  typeable: number
  errors: number
  words: number
  revealed: number
}

export type Outcome = 'up' | 'stay' | 'down'

export const PASS_ACCURACY = 0.95
export const FAIL_ACCURACY = 0.8
/** from this level on, a fragment needs two clean passes in a row to move up */
export const DOUBLE_CHECK_FROM: Level = 4
export const REVIEW_DAYS = [1, 3, 7, 16, 30]
/** level a fragment falls back to when free recall fails */
const RELEARN_LEVEL: Level = 4
const DAY = 24 * 60 * 60 * 1000

export function accuracy(r: FragResult): number {
  return r.typeable / (r.typeable + r.errors)
}

export function judge(r: FragResult): Outcome {
  const acc = accuracy(r)
  if (acc < FAIL_ACCURACY || r.revealed > r.words / 3) return 'down'
  if (acc >= PASS_ACCURACY && r.revealed === 0) return 'up'
  return 'stay'
}

export function advance(state: FragState, outcome: Outcome): FragState {
  const { level } = state
  if (outcome === 'stay') return { level, streak: 0 }
  if (outcome === 'down') {
    if (level === 6) return { level: RELEARN_LEVEL, streak: 0 }
    return { level: Math.max(1, level - 1) as Level, streak: 0 }
  }
  const streak = state.streak + 1
  if (level === 6) return { level, streak }
  const needed = level >= DOUBLE_CHECK_FROM ? 2 : 1
  if (streak >= needed) return { level: (level + 1) as Level, streak: 0 }
  return { level, streak }
}

export function freshProgress(sig: string, fragments: number, level: Level = 1): CardProgress {
  return {
    sig,
    frags: Array.from({ length: fragments }, () => ({ level, streak: 0 })),
    stage: 0,
    due: null,
    lastSeen: 0,
    passes: 0,
  }
}

export interface PassReport {
  progress: CardProgress
  outcomes: Outcome[]
  /** the whole card was written from memory without help */
  mastered: boolean
}

export function applyPass(progress: CardProgress, results: FragResult[], now: number): PassReport {
  const outcomes = results.map(judge)
  const frags = progress.frags.map((f, i) => advance(f, outcomes[i]))
  const mastered =
    progress.frags.every((f) => f.level === 6) && outcomes.every((o) => o === 'up')
  let { stage, due } = progress
  if (mastered) {
    stage = Math.min(stage + 1, REVIEW_DAYS.length)
    due = now + REVIEW_DAYS[stage - 1] * DAY
  } else if (progress.frags.every((f) => f.level === 6)) {
    stage = 0
    due = null
  }
  return {
    progress: { ...progress, frags, stage, due, lastSeen: now, passes: progress.passes + 1 },
    outcomes,
    mastered,
  }
}

export type CardStatus = 'new' | 'learning' | 'due' | 'resting'

export function statusOf(p: CardProgress, now: number): CardStatus {
  if (p.due !== null) return p.due <= now ? 'due' : 'resting'
  return p.passes === 0 ? 'new' : 'learning'
}

/** 0..1, how far the card is from being written fully from memory */
export function mastery(p: CardProgress): number {
  if (!p.frags.length) return 0
  if (p.due !== null) return 1
  const sum = p.frags.reduce((acc, f) => acc + (f.level - 1) + Math.min(f.streak, 1) * 0.5, 0)
  return Math.min(0.97, sum / (p.frags.length * 5.5))
}

export function cardLevel(p: CardProgress): Level {
  return p.frags.reduce<Level>((min, f) => (f.level < min ? f.level : min), 6)
}

export function daysUntil(due: number, now: number): number {
  return Math.max(0, Math.ceil((due - now) / DAY))
}

export function dayKey(time: number): string {
  const d = new Date(time)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** consecutive days with practice, counting today or, if today is still empty, up to yesterday */
export function dayStreak(days: Record<string, number>, now: number): number {
  let cursor = now
  if (!days[dayKey(cursor)]) cursor -= DAY
  let count = 0
  while (days[dayKey(cursor)]) {
    count++
    cursor -= DAY
  }
  return count
}
