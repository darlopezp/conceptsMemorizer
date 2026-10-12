import { describe, expect, it } from 'vitest'
import { SEED_CARDS } from '../data/seed'
import { advance, applyPass, freshProgress, judge, statusOf } from './progress'
import { createSession, eventBetween, reveal, typeChar, type Session } from './session'
import { hiddenWords, hintFor, splitFragments, type Level } from './text'

function typeAll(s: Session, text: string): Session {
  return [...text].reduce((acc, c) => typeChar(acc, c, 1000), s)
}

describe('splitFragments', () => {
  it('keeps the full text and never produces tiny or huge fragments', () => {
    for (const card of SEED_CARDS) {
      const frags = splitFragments(card.text)
      expect(frags.map((f) => f.text).join(' ')).toBe(card.text.replace(/\n+/g, ' '))
      for (const f of frags) expect(f.words.length).toBeLessThanOrEqual(21)
    }
  })

  it('does not cut after abbreviations', () => {
    const frags = splitFragments('uno dos tres cuatro cinco (art. 19 N° 12 de la Constitución) y algo más.')
    expect(frags).toHaveLength(1)
  })

  it('starts a fragment on every source line', () => {
    const frags = splitFragments('Primera línea corta.\nSegunda línea corta.')
    expect(frags.map((f) => f.breakBefore)).toEqual([false, true])
  })
})

describe('hints', () => {
  const [frag] = splitFragments('una operación produce el mismo resultado')
  const render = (level: Level, hidden = new Set<number>()) =>
    frag.chars.map((c) => ({ show: c.ch, slot: '_', none: '' })[hintFor(c, level, hidden, false)]).join('')

  it('removes help level by level', () => {
    expect(render(1)).toBe('una operación produce el mismo resultado')
    expect(render(4)).toBe('u__ o________ p______ e_ m____ r________')
    expect(render(5)).toBe('___ _________ _______ __ _____ _________')
    expect(render(6)).toBe('')
  })

  it('hides meaningful words before connectors', () => {
    const hidden = hiddenWords(frag, 2, 7)
    expect(hidden.size).toBe(2)
    for (const w of hidden) expect(['operación', 'produce', 'resultado', 'mismo']).toContain(frag.words[w])
  })
})

describe('session', () => {
  it('fills punctuation and ignores accents and case', () => {
    const s = typeAll(createSession('Solo la ley, o el título.', [6], 1, false), 'solo la ley o el titulo')
    expect(s.done).toBe(true)
    expect(s.results[0]).toMatchObject({ errors: 0, revealed: 0 })
  })

  it('requires accents in strict mode', () => {
    const s = typeAll(createSession('título', [1], 1, true), 'ti')
    expect(s.done).toBe(false)
    expect(s.wordErrors[0][0]).toBe(1)
  })

  it('reveals the word after three misses and counts it as help', () => {
    let s = createSession('la ley', [5], 1, false)
    s = typeAll(s, 'la xxx')
    expect(s.revealed[0]).toEqual([false, true])
    s = typeAll(s, 'ley')
    expect(s.results[0]).toMatchObject({ errors: 3, revealed: 1 })
  })

  it('does not count a reveal when the word is already visible', () => {
    const s = reveal(createSession('la ley', [1], 1, false))
    expect(s.revealed[0]).toEqual([false, false])
  })

  it('accepts an optional space between fragments', () => {
    const text = 'Primera línea corta.\nSegunda línea corta.'
    const s = typeAll(createSession(text, [1, 1], 1, false), 'primera linea corta segunda linea corta')
    expect(s.done).toBe(true)
    expect(s.results).toHaveLength(2)
  })

  it('names what happened on each key', () => {
    const events = (s: Session, text: string) =>
      [...text].map((c) => {
        const next = typeChar(s, c, 1000)
        const event = eventBetween(s, next)
        s = next
        return event
      })
    const text = 'Primera línea corta.\nSegunda línea corta.'
    // a copied word is just keys, a miss is an error, the last key of the pass is left to the view
    expect(events(createSession(text, [1, 1], 1, false), 'prx')).toEqual(['key', 'key', 'error'])
    expect(events(createSession(text, [1, 1], 1, false), 'primera linea corta').at(-1)).toBe('fragment')
    expect(events(createSession('la ley', [5], 1, false), 'la xxxley')).toEqual(
      ['key', 'word', 'key', 'error', 'error', 'reveal', 'key', 'key', null],
    )
    const idle = createSession('la ley', [1], 1, false)
    expect(eventBetween(idle, reveal(idle))).toBeNull()
  })
})

describe('progression', () => {
  const clean = { typeable: 40, errors: 0, words: 8, revealed: 0 }

  it('judges a fragment', () => {
    expect(judge(clean)).toBe('up')
    expect(judge({ ...clean, errors: 4 })).toBe('stay')
    expect(judge({ ...clean, revealed: 1 })).toBe('stay')
    expect(judge({ ...clean, errors: 12 })).toBe('down')
    expect(judge({ ...clean, revealed: 3 })).toBe('down')
  })

  it('asks for two clean passes from level 4 on', () => {
    expect(advance({ level: 3, streak: 0 }, 'up')).toEqual({ level: 4, streak: 0 })
    expect(advance({ level: 4, streak: 0 }, 'up')).toEqual({ level: 4, streak: 1 })
    expect(advance({ level: 4, streak: 1 }, 'up')).toEqual({ level: 5, streak: 0 })
    expect(advance({ level: 6, streak: 0 }, 'down')).toEqual({ level: 4, streak: 0 })
  })

  it('schedules a review once the whole card is recalled', () => {
    const now = Date.UTC(2026, 9, 12)
    let p = freshProgress('x', 2, 6)
    const first = applyPass(p, [clean, clean], now)
    expect(first.mastered).toBe(true)
    expect(statusOf(first.progress, now)).toBe('resting')
    expect(statusOf(first.progress, now + 2 * 86400000)).toBe('due')
    p = applyPass(first.progress, [clean, { ...clean, errors: 20 }], now).progress
    expect(p.due).toBeNull()
    expect(p.frags.map((f) => f.level)).toEqual([6, 4])
  })
})
