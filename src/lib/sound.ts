import type { SessionEvent } from './session'

export type SoundEvent = SessionEvent | 'finish'

export interface SoundSettings {
  enabled: boolean
  /** 0 to 1 */
  volume: number
  events: Record<SoundEvent, boolean>
}

export const DEFAULT_SOUND: SoundSettings = {
  enabled: true,
  volume: 0.5,
  events: { key: true, error: true, word: true, reveal: true, fragment: true, finish: true },
}

export const SOUND_LABELS: Record<SoundEvent, string> = {
  key: 'Cada tecla',
  error: 'Errores',
  word: 'Palabra de memoria',
  reveal: 'Ayudas',
  fragment: 'Fragmento completo',
  finish: 'Fin de la pasada',
}

export const SOUND_EVENTS = Object.keys(SOUND_LABELS) as SoundEvent[]

/** how the pass went, so the closing sound matches the result screen */
export type FinishMood = 'mastered' | 'up' | 'steady'

export interface SoundDetail {
  /** clean words in a row: the word chime climbs with it */
  combo?: number
  mood?: FinishMood
}

const SEMITONE = 2 ** (1 / 12)
const COMBO_STEPS = 12

let ctx: AudioContext | null = null
let noise: AudioBuffer | null = null

function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null
  ctx ??= new AudioContext()
  // browsers keep the context suspended until the first key or click
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (!noise) {
    noise = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.05), ac.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  return noise
}

function envelope(ac: AudioContext, out: AudioNode, at: number, dur: number, peak: number): GainNode {
  const gain = ac.createGain()
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.006)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  gain.connect(out)
  return gain
}

interface Tone {
  freq: number
  /** glide target */
  to?: number
  /** seconds after the sound starts */
  delay?: number
  dur: number
  type?: OscillatorType
  peak?: number
}

function tone(ac: AudioContext, out: AudioNode, { freq, to, delay = 0, dur, type = 'sine', peak = 0.3 }: Tone) {
  const at = ac.currentTime + delay
  const osc = ac.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, at)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, at + dur)
  osc.connect(envelope(ac, out, at, dur, peak))
  osc.start(at)
  osc.stop(at + dur + 0.02)
}

function click(ac: AudioContext, out: AudioNode) {
  const at = ac.currentTime
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac)
  const filter = ac.createBiquadFilter()
  filter.type = 'bandpass'
  // a little drift so a run of keys does not sound like a machine gun
  filter.frequency.value = 1900 + Math.random() * 700
  filter.Q.value = 1.4
  src.connect(filter).connect(envelope(ac, out, at, 0.035, 0.5))
  src.start(at)
  src.stop(at + 0.05)
}

const FINISH: Record<FinishMood, number[]> = {
  mastered: [523.25, 659.25, 783.99, 1046.5],
  up: [523.25, 659.25, 783.99],
  steady: [392, 523.25],
}

export function playSound(event: SoundEvent, settings: SoundSettings, detail: SoundDetail = {}) {
  if (!settings.enabled || !settings.events[event] || settings.volume <= 0) return
  const ac = audio()
  if (!ac) return
  const out = ac.createGain()
  // squared so the slider feels even to the ear
  out.gain.value = settings.volume ** 2
  out.connect(ac.destination)

  switch (event) {
    case 'key':
      return click(ac, out)
    case 'error':
      return tone(ac, out, { freq: 170, to: 110, dur: 0.14, type: 'square', peak: 0.16 })
    case 'word': {
      const freq = 659.25 * SEMITONE ** Math.min(detail.combo ?? 0, COMBO_STEPS)
      tone(ac, out, { freq, dur: 0.09, type: 'triangle', peak: 0.22 })
      return tone(ac, out, { freq: freq * 1.5, delay: 0.05, dur: 0.14, type: 'triangle', peak: 0.18 })
    }
    case 'reveal':
      return tone(ac, out, { freq: 520, to: 390, dur: 0.22, peak: 0.2 })
    case 'fragment':
      tone(ac, out, { freq: 523.25, dur: 0.12, type: 'triangle', peak: 0.24 })
      return tone(ac, out, { freq: 783.99, delay: 0.09, dur: 0.22, type: 'triangle', peak: 0.24 })
    case 'finish':
      return FINISH[detail.mood ?? 'up'].forEach((freq, i, notes) =>
        tone(ac, out, { freq, delay: i * 0.1, dur: i === notes.length - 1 ? 0.5 : 0.2, type: 'triangle', peak: 0.26 }),
      )
  }
}
