import type { Card } from '../data/seed'
import type { CardProgress } from './progress'

const BASE = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** without both variables the app stays fully local and hides everything shared */
export const ONLINE = Boolean(BASE && KEY)

export interface Player {
  id: string
  nick: string
  /** session token handed out after the password check, so the password itself is never stored */
  secret: string
}

export interface Score {
  card_id: string
  mastery: number
  mastered: boolean
  passes: number
}

export interface Rank {
  nick: string
  points: number
  mastered: number
  passes: number
}

export type Board = 'base' | 'community'

export class OnlineError extends Error {
  constructor(
    message: string,
    /** Postgres error code, when the database rejected the request */
    readonly code?: string,
  ) {
    super(message)
  }
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/rest/v1/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { apikey: KEY!, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw new OnlineError(data?.message ?? res.statusText, data?.code)
  return data as T
}

const auth = (p: Player) => ({ p_id: p.id, p_secret: p.secret })

export type ProgressMap = Record<string, CardProgress>

/** Signs in, or takes the nickname with that password when it is still free. */
export async function enterChallenge(nick: string, password: string): Promise<{ player: Player; progress: ProgressMap }> {
  const { progress, ...player } = await request<Player & { progress: ProgressMap }>('rpc/enter_challenge', {
    p_nick: nick,
    p_password: password,
  })
  return { player, progress }
}

/** Sends scores for the boards plus the full progress, which is what another device restores from. */
export function submitScores(player: Player, scores: Score[], progress: ProgressMap): Promise<void> {
  return request('rpc/submit_scores', { ...auth(player), p_scores: scores, p_progress: progress })
}

export function publishCard(player: Player, card: Card): Promise<void> {
  const { id, title, source, group, text } = card
  return request('rpc/publish_card', { ...auth(player), p_card: { id, title, source, group, text } })
}

export function unpublishCard(player: Player, id: string): Promise<void> {
  return request('rpc/unpublish_card', { ...auth(player), p_card_id: id })
}

export function fetchCommunityCards(): Promise<Card[]> {
  return request<Card[]>('community_cards?select=id,title,source,group,text,author&order=created_at.asc')
}

export function fetchBoard(board: Board): Promise<Rank[]> {
  return request<Rank[]>(
    `leaderboard?select=nick,points,mastered,passes&community=eq.${board === 'community'}` +
      '&order=points.desc,mastered.desc,updated_at.asc&limit=100',
  )
}

export function errorMessage(e: unknown): string {
  if (e instanceof OnlineError) {
    if (e.code === '23505') return 'Ese apodo se acaba de tomar. Prueba otra vez.'
    if (e.message === 'wrong_password') return 'Ese apodo ya existe y la contraseña no coincide.'
    if (e.message === 'bad_password') return 'La contraseña debe tener al menos 4 caracteres.'
    if (e.code === '23514') return 'Algún campo es demasiado largo para compartirlo.'
    if (e.message === 'not_author') return 'Esa tarjeta es de otra persona.'
    if (e.message === 'unknown_player') return 'El servidor no reconoce tu apodo. Vuelve a entrar al reto.'
  }
  return 'No se pudo conectar con el reto. Tu progreso local está a salvo.'
}
