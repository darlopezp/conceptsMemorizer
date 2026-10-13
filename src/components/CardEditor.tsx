import { useEffect, useMemo, useState } from 'react'
import { SEED_CARDS, type Card } from '../data/seed'
import { LEVEL_NAMES, splitFragments, type Level } from '../lib/text'
import { TrashIcon, XIcon } from './icons'

interface Props {
  card: Card | null
  groups: string[]
  /** nickname in the challenge; without one there is nobody to credit a shared card to */
  me: string | null
  onSave: (card: Card, startLevel?: Level) => void
  onDelete: (id: string) => void
  onClose: () => void
}

const LEVELS: Level[] = [1, 2, 3, 4, 5, 6]

export function CardEditor({ card, groups, me, onSave, onDelete, onClose }: Props) {
  const [title, setTitle] = useState(card?.title ?? '')
  const [source, setSource] = useState(card?.source ?? '')
  const [group, setGroup] = useState(card?.group ?? groups[0] ?? '')
  const [text, setText] = useState(card?.text ?? '')
  const [level, setLevel] = useState<Level | 0>(card ? 0 : 1)
  const [confirming, setConfirming] = useState(false)
  const canShare = me !== null && !SEED_CARDS.some((s) => s.id === card?.id)
  const [shared, setShared] = useState(card ? card.author !== undefined : true)
  const fragments = useMemo(() => splitFragments(text), [text])
  const valid = title.trim() && fragments.length > 0

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    onSave(
      {
        id: card?.id ?? `card-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        title: title.trim(),
        source: source.trim(),
        group: group.trim() || 'Sin grupo',
        text: text.trim(),
        paused: card?.paused,
        author: canShare && shared ? me : undefined,
      },
      level || undefined,
    )
    onClose()
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="editor-title" onSubmit={submit}>
        <header className="modal__head">
          <h2 id="editor-title">{card ? 'Editar tarjeta' : 'Nueva tarjeta'}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <XIcon />
          </button>
        </header>

        <div className="field-row">
          <label className="field">
            <span>Título</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dato personal" autoFocus />
          </label>
          <label className="field">
            <span>Fuente</span>
            <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Ley 21.719, art. 2" />
          </label>
        </div>

        <label className="field">
          <span>Grupo</span>
          <input value={group} onChange={(e) => setGroup(e.target.value)} list="groups" />
          <datalist id="groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </label>

        <label className="field">
          <span>Texto literal</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            placeholder="Pega aquí la definición exacta. Un salto de línea fuerza un fragmento nuevo."
          />
        </label>

        {fragments.length > 0 && (
          <div className="preview">
            <p>
              Se aprende en {fragments.length} {fragments.length === 1 ? 'fragmento' : 'fragmentos'}:
            </p>
            <ol>
              {fragments.map((f, i) => (
                <li key={i}>{f.text}</li>
              ))}
            </ol>
          </div>
        )}

        <label className="field">
          <span>Nivel</span>
          <select value={level} onChange={(e) => setLevel(Number(e.target.value) as Level | 0)}>
            {card && <option value={0}>Mantener el progreso actual</option>}
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {card ? 'Reiniciar en' : 'Empezar en'} nivel {l} · {LEVEL_NAMES[l]}
              </option>
            ))}
          </select>
          {card && <small>Si cambias el texto, el progreso vuelve al nivel 1.</small>}
        </label>

        {canShare && (
          <label className="switch">
            <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
            <span>Compartir en Comunidad: todos la verán, con tu apodo</span>
          </label>
        )}

        <footer className="modal__foot">
          {card &&
            (confirming ? (
              <button type="button" className="btn btn--danger" onClick={() => (onDelete(card.id), onClose())}>
                <TrashIcon size={16} /> Confirmar borrado
              </button>
            ) : (
              <button type="button" className="btn btn--quiet" onClick={() => setConfirming(true)}>
                <TrashIcon size={16} /> Borrar
              </button>
            ))}
          <span className="spacer" />
          <button type="button" className="btn btn--quiet" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary" disabled={!valid}>
            Guardar
          </button>
        </footer>
      </form>
    </div>
  )
}
