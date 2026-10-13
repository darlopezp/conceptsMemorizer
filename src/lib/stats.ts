import { dayKey, type CardProgress } from './progress'

/** characters a player must have typed before their averages are steady enough to rank */
export const RANK_MIN_TYPED = 150

const DAY = 24 * 60 * 60 * 1000

export interface Totals {
  passes: number
  typed: number
  errors: number
  ms: number
}

export function totalsOf(list: CardProgress[]): Totals {
  return list.reduce(
    (acc, p) => ({
      passes: acc.passes + p.passes,
      typed: acc.typed + (p.typed ?? 0),
      errors: acc.errors + (p.errors ?? 0),
      ms: acc.ms + (p.ms ?? 0),
    }),
    { passes: 0, typed: 0, errors: 0, ms: 0 },
  )
}

/** average words per minute, a word being 5 characters; null until some pass has been timed */
export function wpmOf(t: { typed?: number; ms?: number }): number | null {
  if (!t.typed || !t.ms) return null
  return Math.round(t.typed / 5 / (t.ms / 60000))
}

/** 0..1, or null until something has been typed */
export function accuracyOf(t: { typed?: number; errors?: number }): number | null {
  if (!t.typed) return null
  return t.typed / (t.typed + (t.errors ?? 0))
}

export interface DayPoint {
  time: number
  passes: number
}

/** One point per calendar day up to today, going back to the first day practised or `minLength` days. */
export function dailySeries(days: Record<string, number>, now: number, minLength: number): DayPoint[] {
  // noon keeps the day arithmetic clear of daylight saving changes
  const end = new Date(now)
  end.setHours(12, 0, 0, 0)
  const firstKey = Object.keys(days).sort()[0]
  const first = firstKey ? new Date(`${firstKey}T12:00:00`).getTime() : end.getTime()
  const length = Math.max(minLength, Math.round((end.getTime() - first) / DAY) + 1)
  return Array.from({ length }, (_, i) => {
    const day = new Date(end)
    day.setDate(end.getDate() - (length - 1 - i))
    return { time: day.getTime(), passes: days[dayKey(day.getTime())] ?? 0 }
  })
}

/** longest run of consecutive days with practice */
export function bestStreak(series: DayPoint[]): number {
  let best = 0
  let run = 0
  for (const point of series) {
    run = point.passes > 0 ? run + 1 : 0
    best = Math.max(best, run)
  }
  return best
}
