import { useState } from 'react'
import type { Boards } from '../lib/challenge'
import type { Player, Rank } from '../lib/online'

const TOP = 10
const MIN_PASSWORD = 4

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

      <div className="challenge__boards">
        <BoardList title="Global" hint="Tarjetas base" ranks={boards?.base} me={player?.nick} />
        <BoardList title="Comunidad" hint="Tarjetas compartidas" ranks={boards?.community} me={player?.nick} />
      </div>
    </section>
  )
}

function BoardList({ title, hint, ranks, me }: { title: string; hint: string; ranks?: Rank[]; me?: string }) {
  const mine = ranks?.findIndex((r) => r.nick === me) ?? -1
  const rows = (ranks ?? []).map((rank, i) => ({ rank, place: i + 1 }))
  const shown = rows.slice(0, TOP)
  // whoever is outside the top still gets to see where they stand
  if (mine >= TOP) shown.push(rows[mine])

  return (
    <div className="board">
      <h3>
        {title} <span>{hint}</span>
      </h3>
      {!ranks ? (
        <p className="board__empty">Cargando…</p>
      ) : !shown.length ? (
        <p className="board__empty">Todavía sin puntajes.</p>
      ) : (
        <ol>
          {shown.map(({ rank, place }) => (
            <li key={rank.nick} className={rank.nick === me ? 'is-me' : undefined}>
              <span className="board__place">{place}</span>
              <span className="board__nick">{rank.nick}</span>
              <span className="board__detail">
                {rank.mastered} de memoria · {rank.passes} {rank.passes === 1 ? 'pasada' : 'pasadas'}
              </span>
              <strong>{rank.points}</strong>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
