import { useEffect, useMemo } from 'react'
import type { Card } from '../data/seed'
import {
  cardLevel,
  dayKey,
  dayStreak,
  daysUntil,
  mastery,
  statusOf,
  type CardProgress,
  type CardStatus,
} from '../lib/progress'
import type { Boards } from '../lib/challenge'
import { ONLINE } from '../lib/online'
import { missingSeedCards, pickNext, progressFor, type AppState, type Scope, type Settings } from '../lib/store'
import { playSound, SOUND_EVENTS, SOUND_LABELS, type SoundEvent, type SoundSettings } from '../lib/sound'
import { LEVEL_HELP, LEVEL_NAMES, type Level } from '../lib/text'
import { Challenge } from './Challenge'
import { FragBars } from './FragBars'
import { ClockIcon, FlameIcon, PauseIcon, PencilIcon, PlayIcon, PlusIcon } from './icons'
import { MarkerCycle } from './MarkerCycle'

const LADDER: { level: Level; sample: string }[] = [
  { level: 1, sample: 'el dato personal' },
  { level: 2, sample: 'el dato ________' },
  { level: 3, sample: 'el ____ ________' },
  { level: 4, sample: 'e_ d___ p_______' },
  { level: 5, sample: '__ ____ ________' },
  { level: 6, sample: '' },
]

interface Props {
  state: AppState
  onTrain: (scope: Scope) => void
  onEdit: (card: Card | null) => void
  onTogglePaused: (id: string) => void
  onSettings: (patch: Partial<Settings>) => void
  onRestore: () => void
  boards: Boards | null
  challengeError: string | null
  onJoin: (nick: string, password: string) => Promise<boolean>
  onLeave: () => void
  locked: boolean
}

function statusLabel(status: CardStatus, p: CardProgress, now: number): string {
  if (status === 'new') return 'Nueva'
  if (status === 'due') return 'Toca repasar'
  if (status === 'resting') {
    const days = daysUntil(p.due!, now)
    return `Repaso en ${days} ${days === 1 ? 'día' : 'días'}`
  }
  const level = cardLevel(p)
  return `Nivel ${level} · ${LEVEL_NAMES[level]}`
}

export function Home({
  state,
  onTrain,
  onEdit,
  onTogglePaused,
  onSettings,
  onRestore,
  boards,
  challengeError,
  onJoin,
  onLeave,
  locked,
}: Props) {
  const now = Date.now()
  const rows = useMemo(
    () =>
      state.cards.map((card) => {
        const progress = progressFor(state, card)
        return { card, progress, status: statusOf(progress, now) }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state],
  )
  const groups = useMemo(() => {
    const map = new Map<string, typeof rows>()
    for (const row of rows) {
      if (!row.card.author) map.set(row.card.group, [...(map.get(row.card.group) ?? []), row])
    }
    return [...map.entries()]
  }, [rows])
  const community = rows.filter((r) => r.card.author)
  const me = state.player?.nick

  const active = rows.filter((r) => !r.card.paused)
  const overall = active.length ? active.reduce((acc, r) => acc + mastery(r.progress), 0) / active.length : 0
  const dueCount = active.filter((r) => r.status === 'due').length
  const masteredCount = active.filter((r) => r.progress.due !== null).length
  const streak = dayStreak(state.days, now)
  const missing = missingSeedCards(state)
  const today = state.days[dayKey(now)] ?? 0
  const next = pickNext(state, { kind: 'all' }, now)
  const nextRow = rows.find((r) => r.card.id === next?.id)
  const sound = state.settings.sound

  /** Saves the change and plays a sample, so every control can be judged by ear. */
  const setSound = (patch: Partial<SoundSettings>, sample: SoundEvent) => {
    const updated = { ...sound, ...patch }
    onSettings({ sound: updated })
    playSound(sample, updated)
  }

  useEffect(() => {
    if (locked) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (e.key === 'Enter' && tag !== 'BUTTON' && tag !== 'INPUT' && tag !== 'TEXTAREA') onTrain({ kind: 'all' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [locked, onTrain])

  const deck = (items: typeof rows) => (
    <ul className="deck">
      {items.map(({ card, progress, status }) => (
        <li key={card.id} className={`row is-${status} ${card.paused ? 'is-paused' : ''}`}>
          <button className="row__main" onClick={() => onTrain({ kind: 'card', id: card.id })}>
            <span className="row__title">
              {card.title}
              {card.source && <span className="tag">{card.source}</span>}
              {card.author && <span className="tag tag--author">por {card.author}</span>}
            </span>
            <FragBars frags={progress.frags} done={progress.due !== null} />
            <span className="row__status">
              {status === 'due' && <ClockIcon size={14} />}
              {card.paused ? 'En pausa' : statusLabel(status, progress, now)}
            </span>
          </button>
          <button
            className="icon-btn"
            onClick={() => onTogglePaused(card.id)}
            aria-pressed={!!card.paused}
            aria-label={card.paused ? `Reanudar ${card.title}` : `Pausar ${card.title}`}
            title={card.paused ? 'Reanudar: vuelve a aparecer al entrenar' : 'Pausar: no aparece al entrenar'}
          >
            {card.paused ? <PlayIcon size={16} /> : <PauseIcon size={16} />}
          </button>
          {!card.author || card.author === me ? (
            <button
              className="icon-btn"
              onClick={() => onEdit(card)}
              aria-label={`Editar ${card.title}`}
              title="Editar"
            >
              <PencilIcon size={16} />
            </button>
          ) : (
            <span className="row__gap" />
          )}
        </li>
      ))}
    </ul>
  )

  return (
    <div className="home">
      <nav className="nav">
        <span className="wordmark">
          Literal<i aria-hidden="true" />
        </span>
        <div className="nav__right">
          <span className={`pill ${streak ? 'is-lit' : ''}`} title="Días seguidos practicando">
            <FlameIcon size={16} />
            {streak} {streak === 1 ? 'día' : 'días'}
          </span>
          <button className="btn" onClick={() => onEdit(null)}>
            <PlusIcon size={16} /> Nueva tarjeta
          </button>
        </div>
      </nav>

      <header className="hero">
        <h1>
          Memoriza <MarkerCycle words={['definiciones', 'artículos', 'principios', 'conceptos']} />
          <br />
          letra por letra.
        </h1>
        <p className="hero__sub">
          Primero copias el texto. Después las ayudas van desapareciendo hasta que lo escribes solo con el título.
        </p>

        <div className="hero__cta">
          <button className="btn btn--primary btn--big" onClick={() => onTrain({ kind: 'all' })} disabled={!next}>
            <PlayIcon size={18} /> Entrenar <kbd>Enter</kbd>
          </button>
          {nextRow && (
            <p className="hero__next">
              Sigue: <strong>{nextRow.card.title}</strong>
              <span>{statusLabel(nextRow.status, nextRow.progress, now)}</span>
            </p>
          )}
        </div>

        <dl className="stats">
          <div>
            <dt>Dominio</dt>
            <dd>{Math.round(overall * 100)}%</dd>
            <span className="meter" aria-hidden="true">
              <i style={{ transform: `scaleX(${overall})` }} />
            </span>
          </div>
          <div>
            <dt>De memoria</dt>
            <dd>
              {masteredCount}
              <small>/{active.length}</small>
            </dd>
          </div>
          <div>
            <dt>Para repasar</dt>
            <dd>{dueCount}</dd>
          </div>
          <div>
            <dt>Pasadas hoy</dt>
            <dd>{today}</dd>
          </div>
        </dl>
      </header>

      {ONLINE && <Challenge player={state.player} boards={boards} error={challengeError} onJoin={onJoin} onLeave={onLeave} />}

      <section className="ladder" aria-label="Los seis niveles">
        {LADDER.map(({ level, sample }) => (
          <div key={level} className="ladder__step">
            <span className="ladder__n">{level}</span>
            <strong>{LEVEL_NAMES[level]}</strong>
            <code aria-hidden="true">{sample || ' '}</code>
            <p>{LEVEL_HELP[level]}</p>
          </div>
        ))}
      </section>

      {groups.map(([group, items]) => (
        <section key={group} className="group">
          <header className="group__head">
            <h2>{group}</h2>
            <button className="btn btn--quiet" onClick={() => onTrain({ kind: 'group', group })}>
              <PlayIcon size={14} /> Entrenar grupo
            </button>
          </header>
          {deck(items)}
        </section>
      ))}

      {community.length > 0 && (
        <section className="group">
          <header className="group__head">
            <h2>Comunidad</h2>
            <span className="group__hint">Reanuda las que quieras sumar a tu entrenamiento</span>
          </header>
          {deck(community)}
        </section>
      )}

      <section className="sound" aria-label="Sonido">
        <div className="sound__main">
          <label className="switch">
            <input type="checkbox" checked={sound.enabled} onChange={(e) => setSound({ enabled: e.target.checked }, 'word')} />
            <span>Efectos de sonido</span>
          </label>
          <label className="sound__volume">
            <span>Volumen</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(sound.volume * 100)}
              disabled={!sound.enabled}
              onChange={(e) => setSound({ volume: Number(e.target.value) / 100 }, 'word')}
            />
          </label>
        </div>
        <div className="sound__events">
          {SOUND_EVENTS.map((event) => (
            <label key={event} className="switch">
              <input
                type="checkbox"
                checked={sound.events[event]}
                disabled={!sound.enabled}
                onChange={(e) => setSound({ events: { ...sound.events, [event]: e.target.checked } }, event)}
              />
              <span>{SOUND_LABELS[event]}</span>
            </label>
          ))}
        </div>
      </section>

      <footer className="home__foot">
        <label className="switch">
          <input
            type="checkbox"
            checked={state.settings.strictAccents}
            onChange={(e) => onSettings({ strictAccents: e.target.checked })}
          />
          <span>Exigir tildes al escribir</span>
        </label>
        {missing.length > 0 && (
          <button className="btn" onClick={onRestore} title={missing.map((c) => `${c.title} (${c.source})`).join(', ')}>
            Restaurar {missing.length} {missing.length === 1 ? 'tarjeta borrada' : 'tarjetas borradas'}
          </button>
        )}
        <span>El progreso se guarda en este navegador.</span>
      </footer>
    </div>
  )
}
