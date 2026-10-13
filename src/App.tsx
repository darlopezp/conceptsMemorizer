import { useCallback, useMemo, useState } from 'react'
import { CardEditor } from './components/CardEditor'
import { Home } from './components/Home'
import { Profile } from './components/Profile'
import { Trainer } from './components/Trainer'
import type { Card } from './data/seed'
import { useChallenge } from './lib/challenge'
import type { FragResult } from './lib/progress'
import type { Level } from './lib/text'
import { pickNext, progressFor, useStore, type Scope } from './lib/store'

type View = { name: 'home' } | { name: 'profile' } | { name: 'train'; scope: Scope; cardId: string; run: number }

export function App() {
  const store = useStore()
  const { state, recordPass } = store
  const challenge = useChallenge(store)
  const { reportPass, syncCard, removeCard } = challenge
  const [view, setView] = useState<View>({ name: 'home' })
  const [editing, setEditing] = useState<{ card: Card | null } | null>(null)

  const training = view.name === 'train' ? view : null
  const card = training ? state.cards.find((c) => c.id === training.cardId) : undefined
  const groups = useMemo(() => [...new Set(state.cards.map((c) => c.group))], [state.cards])

  const train = useCallback(
    (scope: Scope) => {
      const next = pickNext(state, scope, Date.now())
      if (next) setView({ name: 'train', scope, cardId: next.id, run: 0 })
    },
    [state],
  )
  const exit = useCallback(() => setView({ name: 'home' }), [])
  const finish = useCallback(
    (results: FragResult[], ms: number) => {
      const report = recordPass(card!, results, ms)
      reportPass(card!, report.progress)
      return report
    },
    [recordPass, reportPass, card],
  )
  const saveCard = (saved: Card, startLevel?: Level) => {
    store.saveCard(saved, startLevel)
    syncCard(saved, state.cards.find((c) => c.id === saved.id))
  }
  const deleteCard = (id: string) => {
    const deleted = state.cards.find((c) => c.id === id)
    store.deleteCard(id)
    if (deleted) removeCard(deleted)
  }
  const repeat = useCallback(() => setView((v) => (v.name === 'train' ? { ...v, run: v.run + 1 } : v)), [])
  const next = useCallback(() => {
    if (!training) return
    const following = pickNext(state, training.scope, Date.now(), training.cardId)
    if (!following) return exit()
    setView({ ...training, cardId: following.id, run: training.run + 1 })
  }, [state, training, exit])

  if (training && card) {
    return (
      <Trainer
        key={`${card.id}:${training.run}`}
        card={card}
        progress={progressFor(state, card)}
        strict={state.settings.strictAccents}
        sound={state.settings.sound}
        onToggleSound={() =>
          store.updateSettings({ sound: { ...state.settings.sound, enabled: !state.settings.sound.enabled } })
        }
        onFinish={finish}
        onNext={next}
        onRepeat={repeat}
        onExit={exit}
      />
    )
  }

  if (view.name === 'profile') {
    return <Profile state={state} onBack={exit} onTrain={() => train({ kind: 'all' })} />
  }

  return (
    <>
      <Home
        state={state}
        onTrain={train}
        onProfile={() => setView({ name: 'profile' })}
        onEdit={(c) => setEditing({ card: c })}
        onTogglePaused={store.togglePaused}
        onSettings={store.updateSettings}
        onRestore={store.restoreSeed}
        boards={challenge.boards}
        challengeError={challenge.error}
        onJoin={challenge.join}
        onLeave={challenge.leave}
        locked={editing !== null}
      />
      {editing && (
        <CardEditor
          card={editing.card}
          groups={groups}
          me={state.player?.nick ?? null}
          onSave={saveCard}
          onDelete={deleteCard}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
