import { useMemo, useState } from 'react'
import type { Boards } from '../lib/challenge'
import type { Board, Player, Rank } from '../lib/online'
import { Marker, useMarkerCycle } from './MarkerCycle'

const TOP = 10
const MIN_PASSWORD = 4
/** how long each ranking stays on screen before the next one takes over */
const HOLD_MS = 5000

type Metric = 'points' | 'mastered' | 'passes'

const BOARDS: { id: Board; title: string; hint: string }[] = [
  { id: 'base', title: 'Global', hint: 'tarjetas base' },
  { id: 'community', title: 'Comunidad', hint: 'tarjetas compartidas' },
]

const METRICS: { id: Metric; tab: string; word: string }[] = [
  { id: 'points', tab: 'Puntos', word: 'puntos' },
  { id: 'mastered', tab: 'De memoria', word: 'tarjetas de memoria' },
  { id: 'passes', tab: 'Pasadas', word: 'pasadas' },
]

interface Slide {
  key: string
  board: (typeof BOARDS)[number]
  metric: (typeof METRICS)[number]
  rows: { rank: Rank; place: number }[]
  max: number
}

/** One ranking per board and figure, leaving out the ones nobody has a number for yet. */
function buildSlides(boards: Boards | null, me?: string): Slide[] {
  if (!boards) return []
  const slides: Slide[] = []
  for (const board of BOARDS) {
    for (const metric of METRICS) {
      const ranked = boards[board.id]
        .filter((r) => metric.id === 'points' || r[metric.id] > 0)
        // the server already sorts by points, which also breaks ties in the other figures
        .sort((a, b) => b[metric.id] - a[metric.id])
        .map((rank, i) => ({ rank, place: i + 1 }))
      if (!ranked.length) continue
      const rows = ranked.slice(0, TOP)
      // whoever is outside the top still gets to see where they stand
      const mine = ranked.findIndex((r) => r.rank.nick === me)
      if (mine >= TOP) rows.push(ranked[mine])
      slides.push({ key: `${board.id}:${metric.id}`, board, metric, rows, max: ranked[0].rank[metric.id] || 1 })
    }
  }
  return slides
}

function detail(rank: Rank, metric: Metric): string {
  const parts: Record<Metric, string> = {
    points: `${rank.points} pts`,
    mastered: `${rank.mastered} de memoria`,
    passes: `${rank.passes} ${rank.passes === 1 ? 'pasada' : 'pasadas'}`,
  }
  return METRICS.filter((m) => m.id !== metric)
    .map((m) => parts[m.id])
    .join(' · ')
}

interface Props {
  player: Player | null
  boards: Boards | null
  error: string | null
  onJoin: (nick: string, password: string) => Promise<boolean>
  onLeave: () => void
}

export function Challenge({ player, boards, error, onJoin, onLeave }: Props) {
  const [nick, setNick] = useState('')
  const [password, setPassword] = useState('')
  const [joining, setJoining] = useState(false)
  const clean = nick.trim()
  const valid = clean.length >= 2 && clean.length <= 20 && password.length >= MIN_PASSWORD

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid || joining) return
    setJoining(true)
    if (await onJoin(clean, password)) setPassword('')
    setJoining(false)
  }

  return (
    <section className="challenge" aria-labelledby="challenge-title">
      <header className="challenge__head">
        <div>
          <h2 id="challenge-title">Reto hasta el jueves</h2>
          <p>Cada tarjeta suma hasta 100 puntos según cuánto te falte para escribirla de memoria.</p>
        </div>
        {player ? (
          <div className="challenge__me">
            <span className="pill">
              Juegas como <strong>{player.nick}</strong>
            </span>
            <button className="btn btn--quiet" onClick={onLeave}>
              Salir
            </button>
          </div>
        ) : (
          <form className="challenge__join" onSubmit={submit}>
            <input
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              placeholder="Tu apodo"
              aria-label="Apodo para el reto"
              maxLength={20}
              autoComplete="username"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña"
              aria-label="Contraseña del reto"
              maxLength={72}
              autoComplete="current-password"
            />
            <button className="btn btn--primary" disabled={!valid || joining}>
              {joining ? 'Entrando…' : 'Entrar'}
            </button>
            <small>Si el apodo es nuevo, queda tuyo con esa contraseña (mínimo {MIN_PASSWORD} caracteres).</small>
          </form>
        )}
      </header>

      {error && (
        <p className="challenge__error" role="alert">
          {error}
        </p>
      )}

      <Leaderboard boards={boards} me={player?.nick} />
    </section>
  )
}

/** A single ranking that rotates through every board and figure there is data for. */
function Leaderboard({ boards, me }: { boards: Boards | null; me?: string }) {
  const slides = useMemo(() => buildSlides(boards, me), [boards, me])
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const paused = hovered || focused
  const { index, covered, jump } = useMarkerCycle(slides.length, { hold: HOLD_MS, paused })
  const slide = slides[index]

  if (!slide) {
    return <p className="board__empty">{boards ? 'Todavía sin puntajes. Entra al reto y entrena para abrir el ranking.' : 'Cargando…'}</p>
  }

  // the tallest ranking sets the height, so the page below does not jump on every change
  const tallest = Math.max(...slides.map((s) => s.rows.length))

  return (
    <div
      className={`board ${covered ? 'is-swapping' : ''} ${paused ? 'is-paused' : ''}`}
      data-metric={slide.metric.id}
      style={{ '--hold': `${HOLD_MS}ms`, '--rows': tallest } as React.CSSProperties}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <div className="board__head">
        <div>
          <h3>
            Ranking por <Marker word={slide.metric.word} covered={covered} />
          </h3>
          <p className="board__scope">
            {slide.board.title} · {slide.board.hint}
          </p>
        </div>
        {slides.length > 1 && (
          <div className="board__tabs" role="group" aria-label="Elegir ranking">
            {BOARDS.map((board) => {
              const own = slides.map((s, at) => ({ s, at })).filter(({ s }) => s.board === board)
              if (!own.length) return null
              return (
                <div key={board.id}>
                  <span>{board.title}</span>
                  {own.map(({ s, at }) => (
                    <button
                      key={s.key}
                      className={`board__tab ${at === index ? 'is-active' : ''}`}
                      aria-pressed={at === index}
                      aria-label={`${s.metric.tab}, ${board.title}`}
                      onClick={() => jump(at)}
                    >
                      {s.metric.tab}
                      <i aria-hidden="true" />
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <ol className="board__list" key={slide.key}>
        {slide.rows.map(({ rank, place }, i) => (
          <li
            key={rank.nick}
            className={`board__row ${rank.nick === me ? 'is-me' : ''} ${place === 1 ? 'is-first' : ''}`}
            style={{ '--i': i, '--share': rank[slide.metric.id] / slide.max } as React.CSSProperties}
          >
            <i className="board__bar" aria-hidden="true" />
            <span className="board__place">{place}</span>
            <span className="board__nick">
              {rank.nick}
              {rank.nick === me && <span className="tag tag--author">tú</span>}
            </span>
            <span className="board__detail">{detail(rank, slide.metric.id)}</span>
            <strong>{rank[slide.metric.id]}</strong>
          </li>
        ))}
      </ol>
    </div>
  )
}
