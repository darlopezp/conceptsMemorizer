import { useCallback, useEffect, useState } from 'react'
import type { Card } from '../data/seed'
import {
  errorMessage,
  fetchBoard,
  enterChallenge,
  fetchCommunityCards,
  ONLINE,
  OnlineError,
  publishCard,
  submitScores,
  unpublishCard,
  type Rank,
} from './online'
import type { CardProgress } from './progress'
import { allScores, competes, mergeProgress, scoreOf, type Store } from './store'

export interface Boards {
  /** built-in cards, the same for everyone */
  base: Rank[]
  community: Rank[]
}

/**
 * Keeps the shared side of the app in step with the server. Every call is best effort:
 * the local progress never waits for the network, and the next load sends whatever was missed.
 */
export function useChallenge({ latest, setPlayer, mergeCommunity }: Store) {
  const [boards, setBoards] = useState<Boards | null>(null)
  const [error, setError] = useState<string | null>(null)

  const attempt = useCallback(
    async (task: () => Promise<void>): Promise<boolean> => {
      if (!ONLINE) return false
      try {
        await task()
        setError(null)
        return true
      } catch (e) {
        // the server forgot this nickname, so holding on to it would make every later call fail
        if (e instanceof OnlineError && e.message === 'unknown_player') setPlayer(null)
        setError(errorMessage(e))
        return false
      }
    },
    [setPlayer],
  )

  const refresh = useCallback(async () => {
    const [cards, base, community] = await Promise.all([
      fetchCommunityCards(),
      fetchBoard('base'),
      fetchBoard('community'),
    ])
    mergeCommunity(cards)
    setBoards({ base, community })
  }, [mergeCommunity])

  useEffect(() => {
    void attempt(async () => {
      const { player } = latest.current
      if (player) await submitScores(player, allScores(latest.current), latest.current.progress)
      await refresh()
    })
  }, [attempt, refresh, latest])

  const join = useCallback(
    (nick: string, password: string) =>
      attempt(async () => {
        const { player, progress: saved } = await enterChallenge(nick, password)
        const progress = mergeProgress(latest.current.progress, saved)
        setPlayer(player, progress)
        await submitScores(player, allScores({ ...latest.current, progress }), progress)
        await refresh()
      }),
    [attempt, refresh, setPlayer, latest],
  )

  const reportPass = useCallback(
    (card: Card, progress: CardProgress) => {
      const { player } = latest.current
      if (!player) return
      const scores = competes(card) ? [scoreOf(card, progress)] : []
      void attempt(async () => {
        await submitScores(player, scores, { ...latest.current.progress, [card.id]: progress })
        if (scores.length) await refresh()
      })
    },
    [attempt, refresh, latest],
  )

  /** Call after saving a card: shares it, updates it or takes it back, whichever the change means. */
  const syncCard = useCallback(
    (card: Card, previous?: Card) => {
      const { player } = latest.current
      if (!player || (!card.author && !previous?.author)) return
      void attempt(async () => {
        await (card.author ? publishCard(player, card) : unpublishCard(player, card.id))
        await refresh()
      })
    },
    [attempt, refresh, latest],
  )

  const removeCard = useCallback(
    (card: Card) => {
      const { player } = latest.current
      if (!player || card.author !== player.nick) return
      void attempt(async () => {
        await unpublishCard(player, card.id)
        await refresh()
      })
    },
    [attempt, refresh, latest],
  )

  // the progress stays on the server; wiping the local copy keeps it out of the next person's account
  const leave = useCallback(() => setPlayer(null, {}), [setPlayer])

  return { boards, error, join, leave, reportPass, syncCard, removeCard }
}

export type Challenge = ReturnType<typeof useChallenge>
