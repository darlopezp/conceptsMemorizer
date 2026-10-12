import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Card } from '../data/seed'
import { accuracy, daysUntil, type CardProgress, type FragResult, type PassReport } from '../lib/progress'
import {
  createSession,
  eventBetween,
  liveAccuracy,
  progressRatio,
  reveal,
  typeChar,
  wordsPerMinute,
  type Session,
} from '../lib/session'
import { playSound, type SoundSettings } from '../lib/sound'
import { hintFor, LEVEL_NAMES, type Fragment as TextFragment } from '../lib/text'
import { FragBars } from './FragBars'
import { ArrowDownIcon, ArrowLeftIcon, ArrowUpIcon, CheckIcon, MinusIcon, VolumeIcon, VolumeOffIcon } from './icons'

const TRAIL = 3
const READING_LINE = 0.3
const IDLE_MS = 550
/** gives the caret anchor the height of a line of text without taking any width */
const ZERO_WIDTH = '​'

interface Props {
  card: Card
  progress: CardProgress
  strict: boolean
  sound: SoundSettings
  onToggleSound: () => void
  onFinish: (results: FragResult[]) => PassReport
  onNext: () => void
  onRepeat: () => void
  onExit: () => void
}

export function Trainer({ card, progress, strict, sound, onToggleSound, onFinish, onNext, onRepeat, onExit }: Props) {
  const [session, setSession] = useState<Session>(() =>
    createSession(
      card.text,
      progress.frags.map((f) => f.level),
      progress.passes + 1,
      strict,
    ),
  )
  const [report, setReport] = useState<PassReport | null>(null)
  const [before] = useState(progress)
  const input = useRef<HTMLInputElement>(null)
  const reported = useRef(false)
  const live = useRef(session)
  const latestSound = useRef(sound)
  latestSound.current = sound

  useEffect(() => {
    if (session.done && !reported.current) {
      reported.current = true
      const result = onFinish(session.results)
      setReport(result)
      const mood = result.mastered ? 'mastered' : result.outcomes.includes('up') ? 'up' : 'steady'
      playSound('finish', latestSound.current, { mood })
    }
  }, [session.done, session.results, onFinish])

  /** Advances the session outside of React's updater so each key can sound the moment it lands. */
  const step = useCallback((change: (s: Session) => Session) => {
    const prev = live.current
    const next = change(prev)
    live.current = next
    setSession(next)
    const event = eventBetween(prev, next)
    if (event) playSound(event, latestSound.current, { combo: next.combo })
  }, [])

  const feed = useCallback(
    (text: string) => {
      const now = Date.now()
      step((s) => [...text].reduce((acc, c) => typeChar(acc, c, now), s))
    },
    [step],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onExit()
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (report) {
        if (e.key === 'Enter') onNext()
        else if (e.key.toLowerCase() === 'r') onRepeat()
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        step(reveal)
        return
      }
      if (document.activeElement !== input.current) input.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [report, onExit, onNext, onRepeat, step])

  const drain = () => {
    const el = input.current
    if (!el || !el.value) return
    feed(el.value)
    el.value = ''
  }

  return (
    <div className="trainer" onClick={() => input.current?.focus()}>
      <div className="trainer__progress" aria-hidden="true">
        <i style={{ transform: `scaleX(${progressRatio(session)})` }} />
      </div>

      <header className="trainer__top">
        <button className="ghost-btn" onClick={onExit} aria-label="Volver al inicio">
          <ArrowLeftIcon />
          <kbd>Esc</kbd>
        </button>
        <span className="trainer__group">{card.group}</span>
        <div className="trainer__live" aria-live="off">
          <span className={`combo ${session.combo >= 3 ? 'is-on' : ''}`} key={session.combo}>
            ×{session.combo}
          </span>
          <span className="trainer__acc">{Math.round(liveAccuracy(session) * 100)}%</span>
          <button
            className="ghost-btn"
            onClick={onToggleSound}
            aria-pressed={sound.enabled}
            aria-label={sound.enabled ? 'Silenciar sonidos' : 'Activar sonidos'}
            title={sound.enabled ? 'Silenciar' : 'Activar sonidos'}
          >
            {sound.enabled ? <VolumeIcon /> : <VolumeOffIcon />}
          </button>
        </div>
      </header>

      <div className="trainer__head">
        <h1>{card.title}</h1>
        {card.source && <span className="tag">{card.source}</span>}
      </div>

      {report ? (
        <Results
          session={session}
          before={before}
          report={report}
          onNext={onNext}
          onRepeat={onRepeat}
          onExit={onExit}
        />
      ) : (
        <>
          <Stage session={session} />
          <footer className="trainer__keys">
            <span>
              <kbd>Tab</kbd> revelar palabra
            </span>
            <span>La puntuación se escribe sola</span>
            <span>Tres fallos seguidos revelan la palabra</span>
          </footer>
        </>
      )}

      <input
        ref={input}
        className="capture"
        aria-label={`Escribe la definición de ${card.title}`}
        autoFocus
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onInput={(e) => {
          if (!(e.nativeEvent as InputEvent).isComposing) drain()
        }}
        onCompositionEnd={drain}
      />
    </div>
  )
}

function Stage({ session }: { session: Session }) {
  const stage = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const anchor = useRef<HTMLSpanElement>(null)
  const active = useRef<HTMLDivElement>(null)
  const caret = useRef<HTMLDivElement>(null)
  const [offset, setOffset] = useState(0)
  const [box, setBox] = useState({ x: 0, y: 0, h: 0 })

  useLayoutEffect(() => {
    const measure = () => {
      if (!stage.current || !scroller.current || !anchor.current || !active.current) return
      const origin = scroller.current.getBoundingClientRect()
      const at = anchor.current.getBoundingClientRect()
      setBox({ x: at.left - origin.left, y: at.top - origin.top, h: at.height })
      setOffset(stage.current.clientHeight * READING_LINE - active.current.offsetTop)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [session.fi, session.ci, session.revealed])

  // the caret only blinks while the hands are still
  useEffect(() => {
    const el = caret.current
    if (!el) return
    el.classList.remove('is-idle')
    const t = setTimeout(() => el.classList.add('is-idle'), IDLE_MS)
    return () => clearTimeout(t)
  }, [session.fi, session.ci, session.errorTick])

  useEffect(() => {
    if (!session.errorTick) return
    caret.current?.firstElementChild?.animate(
      [
        { transform: 'translateX(0)', background: 'var(--err)' },
        { transform: 'translateX(-5px)' },
        { transform: 'translateX(5px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 200, easing: 'ease-out' },
    )
  }, [session.errorTick])

  const current = session.frags[session.fi]?.chars[session.ci]
  const lostAtSpace = current?.kind === 'space' && session.strikes > 0

  return (
    <div className="stage" ref={stage}>
      <div className="stage__scroller" ref={scroller} style={{ transform: `translateY(${offset}px)` }}>
        {session.frags.map((frag, fi) => (
          <div
            key={fi}
            ref={fi === session.fi ? active : undefined}
            className={`frag ${fi === session.fi ? 'is-active' : fi < session.fi ? 'is-done' : 'is-ahead'} ${
              frag.breakBefore ? 'has-break' : ''
            }`}
          >
            <span className="frag__level" title={LEVEL_NAMES[session.levels[fi]]}>
              {session.levels[fi]}
            </span>
            <p className="frag__text">
              <FragmentText session={session} frag={frag} fi={fi} anchor={anchor} />
            </p>
          </div>
        ))}
        <div
          ref={caret}
          className="caret"
          style={{ transform: `translate(${box.x}px, ${box.y}px)`, height: box.h || undefined }}
        >
          <i>{lostAtSpace ? '␣' : ''}</i>
        </div>
      </div>
    </div>
  )
}

function FragmentText({
  session,
  frag,
  fi,
  anchor,
}: {
  session: Session
  frag: TextFragment
  fi: number
  anchor: React.RefObject<HTMLSpanElement>
}) {
  const level = session.levels[fi]
  const hidden = session.hidden[fi]
  const isActive = fi === session.fi
  const cursor = fi < session.fi ? frag.chars.length : isActive ? session.ci : 0
  const out: ReactNode[] = []
  let word: ReactNode[] = []
  let wordIndex = 0

  const flushWord = () => {
    if (!word.length) return
    const cls = [
      'w',
      session.recalled[fi][wordIndex] ? 'is-recalled' : '',
      session.revealed[fi][wordIndex] ? 'is-helped' : '',
      session.wordErrors[fi][wordIndex] ? 'is-missed' : '',
    ]
    out.push(
      <span key={`w${wordIndex}`} className={cls.filter(Boolean).join(' ')}>
        {word}
      </span>,
    )
    word = []
  }

  frag.chars.forEach((c, i) => {
    const mark = isActive && i === cursor ? <span key="anchor" ref={anchor} className="anchor">{ZERO_WIDTH}</span> : null
    if (c.kind === 'space') {
      flushWord()
      if (mark) out.push(mark)
      const helped = session.revealed[fi][c.word] || session.revealed[fi][c.word + 1]
      if (i < cursor || hintFor(c, level, hidden, helped) === 'show') out.push(' ')
      return
    }
    wordIndex = c.word
    if (mark) word.push(mark)
    if (i < cursor) {
      const age = isActive ? cursor - i : TRAIL + 1
      word.push(
        <span key={i} className={`c is-typed ${age <= TRAIL ? `trail-${age}` : ''}`}>
          {c.ch}
        </span>,
      )
      return
    }
    const hint = hintFor(c, level, hidden, session.revealed[fi][c.word])
    if (hint === 'show') word.push(<span key={i} className="c is-ghost">{c.ch}</span>)
    else if (hint === 'slot') word.push(<span key={i} className="c is-slot">{' '}</span>)
  })
  flushWord()
  if (isActive && cursor >= frag.chars.length) out.push(<span key="anchor" ref={anchor} className="anchor">{ZERO_WIDTH}</span>)
  return <>{out}</>
}

function headline(report: PassReport): { lead: string; marked: string } {
  const ups = report.outcomes.filter((o) => o === 'up').length
  const downs = report.outcomes.filter((o) => o === 'down').length
  const total = report.outcomes.length
  if (report.mastered) return { lead: 'Escrita de memoria.', marked: 'Dominada' }
  if (ups === total) return { lead: 'Pasada limpia.', marked: total === 1 ? 'Sube de nivel' : 'Todo sube' }
  if (ups > 0) return { lead: 'Vas avanzando.', marked: `${ups} de ${total} suben` }
  if (downs > 0) return { lead: 'Todavía no está firme.', marked: 'Un paso atrás' }
  return { lead: 'Casi.', marked: 'Otra vuelta' }
}

function Results({
  session,
  before,
  report,
  onNext,
  onRepeat,
  onExit,
}: {
  session: Session
  before: CardProgress
  report: PassReport
  onNext: () => void
  onRepeat: () => void
  onExit: () => void
}) {
  const total = session.results.reduce(
    (acc, r) => ({ typeable: acc.typeable + r.typeable, errors: acc.errors + r.errors, words: 0, revealed: acc.revealed + r.revealed }),
    { typeable: 0, errors: 0, words: 0, revealed: 0 },
  )
  const seconds = Math.round(((session.endedAt ?? 0) - (session.startedAt ?? 0)) / 1000)
  const { lead, marked } = headline(report)
  const due = report.progress.due

  return (
    <div className="results">
      <p className="results__lead">{lead}</p>
      <h2 className="results__title">
        <span className="marker-wipe">{marked}</span>
      </h2>

      <div className="results__bars">
        <FragBars frags={before.frags} />
        <span className="results__arrow" aria-hidden="true">
          →
        </span>
        <FragBars frags={report.progress.frags} done={report.mastered} />
      </div>

      <dl className="results__stats">
        <div>
          <dt>Precisión</dt>
          <dd>{Math.round(accuracy(total) * 100)}%</dd>
        </div>
        <div>
          <dt>Ayudas</dt>
          <dd>{total.revealed}</dd>
        </div>
        <div>
          <dt>Mejor racha</dt>
          <dd>×{session.bestCombo}</dd>
        </div>
        <div>
          <dt>Velocidad</dt>
          <dd>{wordsPerMinute(session, Date.now())} ppm</dd>
        </div>
        <div>
          <dt>Tiempo</dt>
          <dd>{seconds} s</dd>
        </div>
      </dl>

      {due !== null && (
        <p className="results__due">
          Próximo repaso en {daysUntil(due, Date.now())} {daysUntil(due, Date.now()) === 1 ? 'día' : 'días'}.
        </p>
      )}

      <ol className="review">
        {session.frags.map((frag, fi) => {
          const outcome = report.outcomes[fi]
          const from = session.levels[fi]
          const to = report.progress.frags[fi].level
          const waiting = outcome === 'up' && from === to && from < 6
          return (
            <li key={fi} className={`review__row is-${outcome}`}>
              <span className="review__badge">
                {outcome === 'up' ? (
                  from === 6 ? <CheckIcon size={14} /> : <ArrowUpIcon size={14} />
                ) : outcome === 'down' ? (
                  <ArrowDownIcon size={14} />
                ) : (
                  <MinusIcon size={14} />
                )}
                <span>
                  {from === to ? `Nivel ${from}` : `${from} → ${to}`}
                  {waiting ? ' · falta 1 limpia' : ''}
                </span>
              </span>
              <p>
                {frag.words.map((w, wi) => (
                  <Fragment key={wi}>
                    <span
                      className={
                        session.revealed[fi][wi] ? 'is-helped' : session.wordErrors[fi][wi] ? 'is-missed' : undefined
                      }
                    >
                      {w}
                    </span>{' '}
                  </Fragment>
                ))}
              </p>
            </li>
          )
        })}
      </ol>

      <div className="results__actions">
        <button className="btn btn--primary" onClick={onNext}>
          Siguiente <kbd>Enter</kbd>
        </button>
        <button className="btn" onClick={onRepeat}>
          Repetir <kbd>R</kbd>
        </button>
        <button className="btn btn--quiet" onClick={onExit}>
          Inicio <kbd>Esc</kbd>
        </button>
      </div>
    </div>
  )
}
