import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { dayKey, dayStreak, mastery, statusOf, type CardStatus } from '../lib/progress'
import { ONLINE } from '../lib/online'
import {
  accuracyOf,
  bestStreak,
  dailySeries,
  RANK_MIN_TYPED,
  totalsOf,
  wpmOf,
  type DayPoint,
} from '../lib/stats'
import { competes, progressFor, type AppState } from '../lib/store'
import { FragBars } from './FragBars'
import {
  ArrowLeftIcon,
  CheckIcon,
  FlameIcon,
  GaugeIcon,
  KeyboardIcon,
  PlayIcon,
  RepeatIcon,
  TargetIcon,
} from './icons'

const TICKS = 40
/** days the activity chart covers at least, and the shortest range it can be narrowed to */
const MIN_HISTORY = 30
const MIN_RANGE = 6
const MAIN_H = 190
const NAV_H = 46
const PAD = { l: 8, r: 36, t: 22, b: 8 }
const AXIS = [0, 0.25, 0.5, 0.75, 1]

const int = new Intl.NumberFormat('es')
const decimal = new Intl.NumberFormat('es', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const shortDay = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' })
const longDay = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' })

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const plural = (n: number, one: string, many: string) => `${int.format(n)} ${n === 1 ? one : many}`
export const percentText = (ratio: number) => decimal.format(ratio * 100)

function duration(ms: number): string {
  const minutes = Math.round(ms / 60000)
  if (minutes < 1) return `${Math.round(ms / 1000)} s`
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`
}

function stageOf(ratio: number): string {
  if (ratio >= 1) return 'De memoria'
  if (ratio >= 0.75) return 'Casi listo'
  if (ratio >= 0.4) return 'Avanzando'
  if (ratio > 0) return 'Arrancando'
  return 'Sin empezar'
}

const STATUS: { id: CardStatus; label: string }[] = [
  { id: 'new', label: 'Nuevas' },
  { id: 'learning', label: 'Aprendiendo' },
  { id: 'due', label: 'Toca repasar' },
  { id: 'resting', label: 'En descanso' },
]

interface Props {
  state: AppState
  onBack: () => void
  onTrain: () => void
}

export function Profile({ state, onBack, onTrain }: Props) {
  const now = Date.now()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  const rows = useMemo(
    () =>
      state.cards.map((card) => {
        const progress = progressFor(state, card)
        return { card, progress, status: statusOf(progress, now) }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state],
  )
  const series = useMemo(
    () => dailySeries(state.days, now, MIN_HISTORY),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.days],
  )

  const active = rows.filter((r) => !r.card.paused)
  const overall = active.length ? active.reduce((acc, r) => acc + mastery(r.progress), 0) / active.length : 0
  const mastered = active.filter((r) => r.progress.due !== null).length
  const totals = totalsOf(rows.map((r) => r.progress))
  const wpm = wpmOf(totals)
  const accuracy = accuracyOf(totals)
  const bestWpm = Math.max(0, ...rows.map((r) => wpmOf(r.progress) ?? 0))
  const streak = dayStreak(state.days, now)
  const longest = bestStreak(series)
  const today = state.days[dayKey(now)] ?? 0
  const busiest = Math.max(0, ...series.map((p) => p.passes))
  const activeDays = series.filter((p) => p.passes > 0).length
  const firstDay = series.find((p) => p.passes > 0)
  // the global board only counts built-in cards with their original text
  const ranked = totalsOf(rows.filter((r) => competes(r.card) && !r.card.author).map((r) => r.progress)).typed
  const practised = rows.filter((r) => r.progress.passes > 0).sort((a, b) => b.progress.passes - a.progress.passes)

  return (
    <div className="home profile">
      <nav className="nav">
        <button className="ghost-btn" onClick={onBack} aria-label="Volver al inicio">
          <ArrowLeftIcon />
          <kbd>Esc</kbd>
        </button>
        <span className="wordmark">
          Literal<i aria-hidden="true" />
        </span>
      </nav>

      <header className="profile__head">
        <h1>{state.player ? state.player.nick : 'Tu perfil'}</h1>
        <p>
          {firstDay
            ? `Practicas desde el ${longDay.format(firstDay.time)} · ${plural(activeDays, 'día activo', 'días activos')}` +
              (totals.ms ? ` · ${duration(totals.ms)} escribiendo` : '')
            : 'Todavía no hay pasadas. Entrena una tarjeta y aquí verás cómo avanzas.'}
        </p>
      </header>

      <section className="profile__top" aria-label="Resumen">
        <div className="dial-card">
          <Dial ratio={overall} label={stageOf(overall)} />
          <ul className="dial-card__legend">
            {STATUS.map(({ id, label }) => (
              <li key={id} className={`is-${id}`}>
                <i aria-hidden="true" />
                {label}
                <strong>{active.filter((r) => r.status === id).length}</strong>
              </li>
            ))}
          </ul>
        </div>

        <div className="statcards">
          <StatCard
            icon={<GaugeIcon size={14} />}
            title="Velocidad media"
            accent="var(--speed)"
            value={wpm === null ? '–' : int.format(wpm)}
            unit="ppm"
            note={bestWpm ? `mejor ${bestWpm}` : undefined}
            share={wpm && bestWpm ? wpm / bestWpm : 0}
          />
          <StatCard
            icon={<TargetIcon size={14} />}
            title="Precisión"
            accent="var(--marker-soft)"
            value={accuracy === null ? '–' : percentText(accuracy)}
            unit="%"
            note={accuracy === null ? undefined : plural(totals.errors, 'fallo', 'fallos')}
            share={accuracy ?? 0}
          />
          <StatCard
            icon={<CheckIcon size={14} />}
            title="De memoria"
            accent="var(--ok)"
            value={String(mastered)}
            unit={`/ ${active.length}`}
            note={`${Math.round((active.length ? mastered / active.length : 0) * 100)}%`}
            share={active.length ? mastered / active.length : 0}
          />
          <StatCard
            icon={<FlameIcon size={14} />}
            title="Racha"
            accent="var(--help)"
            value={String(streak)}
            unit={streak === 1 ? 'día' : 'días'}
            note={`mejor ${longest}`}
            share={longest ? streak / longest : 0}
          />
          <StatCard
            icon={<RepeatIcon size={14} />}
            title="Pasadas"
            accent="var(--marker)"
            value={int.format(totals.passes)}
            note={`hoy ${today}`}
            share={busiest ? today / busiest : 0}
          />
          <StatCard
            icon={<KeyboardIcon size={14} />}
            title="Caracteres"
            accent="var(--speed)"
            value={int.format(totals.typed)}
            note={
              !ONLINE
                ? undefined
                : ranked >= RANK_MIN_TYPED
                  ? 'en el ranking'
                  : `${ranked}/${RANK_MIN_TYPED} ranking`
            }
            share={ONLINE ? ranked / RANK_MIN_TYPED : undefined}
          />
        </div>
      </section>

      <section className="panel" aria-labelledby="activity-title">
        <ActivityChart series={series} />
      </section>

      <section className="panel" aria-labelledby="cards-title">
        <header className="panel__head">
          <h2 id="cards-title">Por tarjeta</h2>
          <span className="panel__hint">{plural(practised.length, 'tarjeta practicada', 'tarjetas practicadas')}</span>
        </header>
        {practised.length ? (
          <ol className="cardstats">
            <li className="cardstats__row cardstats__row--head" aria-hidden="true">
              <span>Tarjeta</span>
              <span>Niveles</span>
              <span className="num">Pasadas</span>
              <span className="num">Velocidad</span>
              <span className="num">Precisión</span>
            </li>
            {practised.map(({ card, progress }) => {
              const cardWpm = wpmOf(progress)
              const cardAccuracy = accuracyOf(progress)
              return (
                <li key={card.id} className="cardstats__row">
                  <span className="cardstats__title">
                    {card.title}
                    {card.source && <span className="tag">{card.source}</span>}
                  </span>
                  <FragBars frags={progress.frags} done={progress.due !== null} />
                  <span className="num">
                    <em>Pasadas</em>
                    {progress.passes}
                  </span>
                  <span className="num">
                    <em>Velocidad</em>
                    {cardWpm === null ? '–' : `${cardWpm} ppm`}
                  </span>
                  <span className="num">
                    <em>Precisión</em>
                    {cardAccuracy === null ? '–' : `${percentText(cardAccuracy)}%`}
                  </span>
                </li>
              )
            })}
          </ol>
        ) : (
          <div className="panel__empty">
            <p>Aún no has practicado ninguna tarjeta.</p>
            <button className="btn btn--primary" onClick={onTrain}>
              <PlayIcon size={16} /> Entrenar
            </button>
          </div>
        )}
        {practised.some((r) => r.progress.typed === undefined) && (
          <p className="panel__foot">La velocidad y la precisión cuentan desde las pasadas hechas con esta versión.</p>
        )}
      </section>
    </div>
  )
}

/** A ring of ticks that light up with the ratio, around the figure itself. */
function Dial({ ratio, label }: { ratio: number; label: string }) {
  const lit = ratio > 0 ? Math.max(1, Math.round(ratio * TICKS)) : 0
  return (
    <div className={`dial ${ratio >= 1 ? 'is-full' : ''}`} role="img" aria-label={`Dominio ${Math.round(ratio * 100)}%, ${label}`}>
      <svg viewBox="0 0 200 200" aria-hidden="true">
        {Array.from({ length: TICKS }, (_, i) => (
          <line
            key={i}
            x1="100"
            y1="8"
            x2="100"
            y2="22"
            transform={`rotate(${(i * 360) / TICKS} 100 100)`}
            className={i < lit ? 'is-lit' : undefined}
            style={{ animationDelay: `${i * 18}ms` }}
          />
        ))}
        <circle cx="100" cy="100" r="64" />
      </svg>
      <div className="dial__text">
        <strong>
          {Math.round(ratio * 100)}
          <small>%</small>
        </strong>
        <span>{label}</span>
      </div>
    </div>
  )
}

function StatCard({
  icon,
  title,
  accent,
  value,
  unit,
  note,
  share,
}: {
  icon: ReactNode
  title: string
  accent: string
  value: string
  unit?: string
  note?: string
  /** 0..1 fill of the bar; left out, the card has no bar */
  share?: number
}) {
  return (
    <div className="statcard" style={{ '--accent': accent } as React.CSSProperties}>
      <div className="statcard__head">
        <i aria-hidden="true">{icon}</i>
        <span>{title}</span>
        {note && <small>{note}</small>}
      </div>
      <p className="statcard__value">
        {value}
        {unit && <small>{unit}</small>}
      </p>
      {share !== undefined && (
        <span className="statcard__bar" aria-hidden="true">
          <i style={{ transform: `scaleX(${clamp(share, 0, 1)})` }} />
        </span>
      )}
    </div>
  )
}

type Grip = 'move' | 'left' | 'right'

/** Passes per day over a range picked on the strip below: drag the window or its edges. */
function ActivityChart({ series }: { series: DayPoint[] }) {
  const last = series.length - 1
  const root = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(560)
  const [win, setWin] = useState({ start: Math.max(0, last - (MIN_HISTORY - 1)), end: last })
  const [hover, setHover] = useState<number | null>(null)
  const drag = useRef<{ grip: Grip; from: number; start: number; end: number } | null>(null)
  const gradient = useId()
  const plot = Math.max(1, width - PAD.l - PAD.r)
  /** days per pixel on the strip, read by the drag listeners */
  const scale = useRef(1)
  scale.current = last / plot

  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      const delta = Math.round((e.clientX - d.from) * scale.current)
      if (d.grip === 'move') {
        const span = d.end - d.start
        const start = clamp(d.start + delta, 0, last - span)
        setWin({ start, end: start + span })
      } else if (d.grip === 'left') {
        setWin({ start: clamp(d.start + delta, 0, d.end - MIN_RANGE), end: d.end })
      } else {
        setWin({ start: d.start, end: clamp(d.end + delta, d.start + MIN_RANGE, last) })
      }
    }
    const onUp = () => {
      drag.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [last])

  const grab = (grip: Grip) => (e: React.PointerEvent) => {
    e.preventDefault()
    drag.current = { grip, from: e.clientX, ...win }
  }

  const shift = (e: React.KeyboardEvent) => {
    const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
    if (!step) return
    e.preventDefault()
    const span = win.end - win.start
    const start = clamp(win.start + step * (e.shiftKey ? 7 : 1), 0, last - span)
    setWin({ start, end: start + span })
  }

  const slice = series.slice(win.start, win.end + 1)
  const n = slice.length
  const peak = Math.max(...slice.map((p) => p.passes))
  // a multiple of four keeps every tick of the axis on a whole number of passes
  const top = Math.max(4, Math.ceil(peak / 4) * 4)
  const x = (i: number) => PAD.l + (i / (n - 1)) * plot
  const y = (v: number) => PAD.t + (1 - v / top) * (MAIN_H - PAD.t - PAD.b)
  const line = slice.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.passes).toFixed(1)}`).join(' ')
  const floor = MAIN_H - PAD.b
  const area = `${line} L${x(n - 1).toFixed(1)},${floor} L${x(0).toFixed(1)},${floor} Z`

  const all = Math.max(...series.map((p) => p.passes), 1)
  const nx = (i: number) => PAD.l + (i / last) * plot
  const strip = series
    .map((p, i) => `${i ? 'L' : 'M'}${nx(i).toFixed(1)},${(4 + (1 - p.passes / all) * (NAV_H - 8)).toFixed(1)}`)
    .join(' ')
  const from = nx(win.start)
  const to = nx(win.end)

  const point = hover !== null && hover < n ? slice[hover] : null
  const tip = point ? `${plural(point.passes, 'pasada', 'pasadas')} · ${shortDay.format(point.time)}` : ''
  const tipWidth = tip.length * 6.4 + 16
  const total = slice.reduce((acc, p) => acc + p.passes, 0)
  const presets = [7, MIN_HISTORY, ...(series.length > MIN_HISTORY ? [series.length] : [])]

  return (
    <div className="chart" ref={root}>
      <header className="panel__head">
        <div>
          <h2 id="activity-title">Pasadas por día</h2>
          <span className="panel__hint">
            {plural(total, 'pasada', 'pasadas')} en {n} días · arrastra la franja para moverte
          </span>
        </div>
        <div className="chart__presets" role="group" aria-label="Rango">
          {presets.map((days) => {
            const start = Math.max(0, last - (days - 1))
            return (
              <button
                key={days}
                className={`board__tab ${win.end === last && win.start === start ? 'is-active' : ''}`}
                aria-pressed={win.end === last && win.start === start}
                onClick={() => setWin({ start, end: last })}
              >
                {days === series.length ? 'Todo' : `${days} días`}
              </button>
            )
          })}
        </div>
      </header>

      <svg
        className="chart__main"
        width={width}
        height={MAIN_H}
        role="img"
        aria-label={`${plural(total, 'pasada', 'pasadas')} entre el ${shortDay.format(slice[0].time)} y el ${shortDay.format(slice[n - 1].time)}`}
        onPointerMove={(e) => {
          const left = e.currentTarget.getBoundingClientRect().left
          setHover(clamp(Math.round(((e.clientX - left - PAD.l) / plot) * (n - 1)), 0, n - 1))
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--marker)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--marker)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {AXIS.map((f) => {
          const ty = PAD.t + f * (MAIN_H - PAD.t - PAD.b)
          return (
            <g key={f}>
              <line className="chart__grid" x1={PAD.l} y1={ty} x2={width - PAD.r} y2={ty} />
              <text className="chart__tick" x={width - PAD.r + 8} y={ty + 4}>
                {top * (1 - f)}
              </text>
            </g>
          )
        })}
        <path key={`${win.start}-${win.end}`} className="chart__area" d={area} fill={`url(#${gradient})`} />
        <path className="chart__line" d={line} />
        {point && hover !== null && (
          <g pointerEvents="none">
            <line className="chart__cross" x1={x(hover)} y1={PAD.t} x2={x(hover)} y2={floor} />
            <circle className="chart__dot" cx={x(hover)} cy={y(point.passes)} r="4" />
            <g transform={`translate(${clamp(x(hover) - tipWidth / 2, PAD.l, width - PAD.r - tipWidth)} 0)`}>
              <rect className="chart__tip" width={tipWidth} height="20" rx="5" />
              <text className="chart__tiptext" x={tipWidth / 2} y="14" textAnchor="middle">
                {tip}
              </text>
            </g>
          </g>
        )}
      </svg>

      <svg className="chart__nav" width={width} height={NAV_H}>
        <path className="chart__strip" d={strip} />
        <rect className="chart__mask" x={PAD.l} y="0" width={Math.max(0, from - PAD.l)} height={NAV_H} />
        <rect className="chart__mask" x={to} y="0" width={Math.max(0, width - PAD.r - to)} height={NAV_H} />
        <rect
          className="chart__window"
          x={from}
          y="1"
          width={to - from}
          height={NAV_H - 2}
          rx="4"
          tabIndex={0}
          role="slider"
          aria-label="Rango de días, flechas para mover"
          aria-valuemin={0}
          aria-valuemax={last}
          aria-valuenow={win.start}
          aria-valuetext={`${shortDay.format(series[win.start].time)} a ${shortDay.format(series[win.end].time)}`}
          onPointerDown={grab('move')}
          onKeyDown={shift}
        />
        {(['left', 'right'] as const).map((grip) => {
          const at = grip === 'left' ? from : to
          return (
            <g key={grip} className="chart__grip" onPointerDown={grab(grip)}>
              <rect x={at - 10} y="0" width="20" height={NAV_H} fill="transparent" />
              <rect x={at - 2} y={NAV_H / 2 - 9} width="4" height="18" rx="2" />
            </g>
          )
        })}
      </svg>

      <div className="chart__ends">
        <span>{shortDay.format(series[win.start].time)}</span>
        <span>{win.end === last ? 'hoy' : shortDay.format(series[win.end].time)}</span>
      </div>
    </div>
  )
}
