import type { FragState } from '../lib/progress'

/** One bar per fragment; its height is the level that fragment has reached. */
export function FragBars({ frags, done }: { frags: FragState[]; done?: boolean }) {
  const label = `Niveles por fragmento: ${frags.map((f) => f.level).join(', ')}`
  return (
    <span className={`bars ${done ? 'is-done' : ''}`} role="img" aria-label={label}>
      {frags.map((f, i) => (
        <i key={i} data-level={f.level} style={{ height: `${(f.level / 6) * 100}%` }} />
      ))}
    </span>
  )
}
