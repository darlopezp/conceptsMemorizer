import { useCallback, useEffect, useRef, useState } from 'react'
import { SEED_CARDS, type Card } from '../data/seed'
import type { Player, ProgressMap, Score } from './online'
import {
  applyPass,
  dayKey,
  freshProgress,
  mastery,
  statusOf,
  type CardProgress,
  type FragResult,
  type PassReport,
} from './progress'
import { DEFAULT_SOUND, type SoundSettings } from './sound'
import { splitFragments, type Level } from './text'

const STORAGE_KEY = 'literal:v1'
/** cards being learned at the same time before a new one is introduced */
const LEARNING_WINDOW = 4

export interface Settings {
  strictAccents: boolean
  sound: SoundSettings
}

export interface AppState {
  cards: Card[]
  progress: Record<string, CardProgress>
  /** passes completed per calendar day */
  days: Record<string, number>
  settings: Settings
  /** identity in the shared challenge, once a nickname has been taken */
  player: Player | null
}

function signature(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return `${text.length}:${h >>> 0}`
}

/** Progress for a card, rebuilt from scratch when its text no longer matches. */
export function progressFor(state: AppState, card: Card): CardProgress {
  const sig = signature(card.text)
  const saved = state.progress[card.id]
  if (saved && saved.sig === sig) return saved
  return freshProgress(sig, splitFragments(card.text).length)
}

function initialState(): AppState {
  return { cards: SEED_CARDS, progress: {}, days: {}, settings: { strictAccents: false, sound: DEFAULT_SOUND }, player: null }
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return initialState()
    const parsed = JSON.parse(raw) as Partial<AppState>
    const base = initialState()
    const sound = parsed.settings?.sound
    return {
      cards: Array.isArray(parsed.cards) ? parsed.cards : base.cards,
      progress: parsed.progress ?? {},
      days: parsed.days ?? {},
      player: parsed.player ?? null,
      settings: {
        ...base.settings,
        ...parsed.settings,
        // merged by hand so a save from before a sound existed still gets its default
        sound: { ...DEFAULT_SOUND, ...sound, events: { ...DEFAULT_SOUND.events, ...sound?.events } },
      },
    }
  } catch {
    return initialState()
  }
}

export function missingSeedCards(state: AppState): Card[] {
  return SEED_CARDS.filter((seed) => !state.cards.some((c) => c.id === seed.id))
}

/** Only untouched built-in cards and shared cards compete: a private or reworded card would not be comparable. */
export function competes(card: Card): boolean {
  const seed = SEED_CARDS.find((s) => s.id === card.id)
  return seed ? seed.text === card.text : Boolean(card.author)
}

export function scoreOf(card: Card, progress: CardProgress): Score {
  return { card_id: card.id, mastery: mastery(progress), mastered: progress.due !== null, passes: progress.passes }
}

/** Everything this browser has earned so far, to bring the server up to date in one go. */
export function allScores(state: AppState): Score[] {
  return state.cards
    .filter(competes)
    .map((card) => scoreOf(card, progressFor(state, card)))
    .filter((score) => score.passes > 0)
}

/** Joins what two devices know, keeping for each card the side that has practised it more. */
export function mergeProgress(local: ProgressMap, remote: ProgressMap): ProgressMap {
  const merged = { ...remote, ...local }
  for (const [id, theirs] of Object.entries(remote)) {
    if (local[id] && theirs.passes > local[id].passes) merged[id] = theirs
  }
  return merged
}

export type Scope = { kind: 'all' } | { kind: 'group'; group: string } | { kind: 'card'; id: string }

export function inScope(card: Card, scope: Scope): boolean {
  if (scope.kind === 'card') return card.id === scope.id
  if (card.paused) return false
  return scope.kind === 'all' || card.group === scope.group
}

/**
 * Next card to practice: pending reviews first, then the cards being learned (least recent first),
 * bringing in a new one only while the learning window has room.
 */
export function pickNext(state: AppState, scope: Scope, now: number, justDone?: string): Card | null {
  const pool = state.cards.filter((c) => inScope(c, scope))
  if (scope.kind === 'card') return pool[0] ?? null
  const candidates = pool.length > 1 ? pool.filter((c) => c.id !== justDone) : pool
  const withStatus = candidates.map((card) => {
    const progress = progressFor(state, card)
    return { card, progress, status: statusOf(progress, now) }
  })
  const due = withStatus.filter((c) => c.status === 'due').sort((a, b) => a.progress.due! - b.progress.due!)
  if (due.length) return due[0].card
  const learning = withStatus
    .filter((c) => c.status === 'learning')
    .sort((a, b) => a.progress.lastSeen - b.progress.lastSeen)
  const fresh = withStatus.filter((c) => c.status === 'new')
  const learningInPool = pool.filter((c) => statusOf(progressFor(state, c), now) === 'learning').length
  if (fresh.length && learningInPool < LEARNING_WINDOW) return fresh[0].card
  if (learning.length) return learning[0].card
  if (fresh.length) return fresh[0].card
  // everything is resting: offer the review that comes up soonest
  const resting = withStatus.sort((a, b) => (a.progress.due ?? 0) - (b.progress.due ?? 0))
  return resting[0]?.card ?? null
}

export function useStore() {
  const [state, setState] = useState<AppState>(load)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [state])

  const latest = useRef(state)
  latest.current = state

  const recordPass = useCallback((card: Card, results: FragResult[]): PassReport => {
    const now = Date.now()
    const report = applyPass(progressFor(latest.current, card), results, now)
    const key = dayKey(now)
    setState((prev) => ({
      ...prev,
      progress: { ...prev.progress, [card.id]: report.progress },
      days: { ...prev.days, [key]: (prev.days[key] ?? 0) + 1 },
    }))
    return report
  }, [])

  const saveCard = useCallback((card: Card, startLevel?: Level) => {
    setState((prev) => {
      const exists = prev.cards.some((c) => c.id === card.id)
      const cards = exists ? prev.cards.map((c) => (c.id === card.id ? card : c)) : [...prev.cards, card]
      const progress = { ...prev.progress }
      if (startLevel) {
        progress[card.id] = freshProgress(signature(card.text), splitFragments(card.text).length, startLevel)
      }
      return { ...prev, cards, progress }
    })
  }, [])

  const deleteCard = useCallback((id: string) => {
    setState((prev) => {
      const progress = { ...prev.progress }
      delete progress[id]
      return { ...prev, cards: prev.cards.filter((c) => c.id !== id), progress }
    })
  }, [])

  /** Puts back the built-in cards that were deleted, each one next to its original neighbours. */
  const restoreSeed = useCallback(() => {
    setState((prev) => {
      const cards = [...prev.cards]
      SEED_CARDS.forEach((seed, i) => {
        if (cards.some((c) => c.id === seed.id)) return
        const before = SEED_CARDS.slice(0, i).reverse().find((s) => cards.some((c) => c.id === s.id))
        const at = before ? cards.findIndex((c) => c.id === before.id) + 1 : 0
        cards.splice(at, 0, seed)
      })
      return { ...prev, cards }
    })
  }, [])

  const togglePaused = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      cards: prev.cards.map((c) => (c.id === id ? { ...c, paused: !c.paused } : c)),
    }))
  }, [])

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }))
  }, [])

  /** Signs in or out; signing in can bring along the progress saved from another device. */
  const setPlayer = useCallback((player: Player | null, progress?: ProgressMap) => {
    setState((prev) => ({ ...prev, player, progress: progress ?? prev.progress }))
  }, [])

  /**
   * Brings the local copy of the shared cards in line with the server. Cards from other people arrive
   * paused, so they only join the training queue when the user asks for them.
   */
  const mergeCommunity = useCallback((remote: Card[]) => {
    setState((prev) => {
      const me = prev.player?.nick
      const byId = new Map(remote.map((c) => [c.id, c]))
      const cards = prev.cards
        .filter((c) => !c.author || c.author === me || byId.has(c.id))
        .map((c) => {
          const shared = byId.get(c.id)
          return shared && c.author !== me ? { ...shared, paused: c.paused } : c
        })
      for (const shared of remote) {
        if (!cards.some((c) => c.id === shared.id)) cards.push({ ...shared, paused: shared.author !== me })
      }
      return { ...prev, cards }
    })
  }, [])

  return {
    state,
    latest,
    recordPass,
    saveCard,
    deleteCard,
    restoreSeed,
    togglePaused,
    updateSettings,
    setPlayer,
    mergeCommunity,
  }
}

export type Store = ReturnType<typeof useStore>
