import { useEffect, useRef, useState } from 'react'
import { playSound, SOUND_EVENTS, SOUND_LABELS, type SoundEvent, type SoundSettings } from '../lib/sound'
import type { Settings } from '../lib/store'
import { ChevronUpIcon, SlidersIcon } from './icons'

interface Props {
  settings: Settings
  onSettings: (patch: Partial<Settings>) => void
}

/** Floating button, always on screen, that unfolds the settings above it. */
export function SettingsPanel({ settings, onSettings }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLElement>(null)
  const sound = settings.sound

  /** Saves the change and plays a sample, so every control can be judged by ear. */
  const setSound = (patch: Partial<SoundSettings>, sample: SoundEvent) => {
    const updated = { ...sound, ...patch }
    onSettings({ sound: updated })
    playSound(sample, updated)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onPointer = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  return (
    <aside className={`settings ${open ? 'is-open' : ''}`} ref={root} aria-label="Configuración">
      <button
        className="settings__toggle"
        aria-expanded={open}
        aria-controls="settings-panel"
        onClick={() => setOpen((o) => !o)}
      >
        <SlidersIcon size={16} />
        <span>Configuración</span>
        <ChevronUpIcon size={16} />
      </button>

      <div className="settings__panel" id="settings-panel">
        <section>
          <h3>Sonido</h3>
          <label className="switch">
            <input type="checkbox" checked={sound.enabled} onChange={(e) => setSound({ enabled: e.target.checked }, 'word')} />
            <span>Efectos de sonido</span>
          </label>
          <label className="settings__range">
            <span>
              Volumen <b>{Math.round(sound.volume * 100)}</b>
            </span>
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
        </section>

        <section>
          <h3>Qué suena</h3>
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
        </section>

        <section>
          <h3>Escritura</h3>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.strictAccents}
              onChange={(e) => onSettings({ strictAccents: e.target.checked })}
            />
            <span>Exigir tildes al escribir</span>
          </label>
        </section>
      </div>
    </aside>
  )
}
