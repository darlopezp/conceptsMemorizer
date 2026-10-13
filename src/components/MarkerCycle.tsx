import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const HOLD_MS = 2400
const WIPE_MS = 500

/**
 * Timing of a highlighter cycle over `count` items: hold, cover, swap, reveal.
 * `jump` goes to a given item through the same cover and reveal, even while paused.
 */
export function useMarkerCycle(count: number, { hold = HOLD_MS, paused = false } = {}) {
  const [index, setIndex] = useState(0)
  const [covered, setCovered] = useState(true)
  const [target, setTarget] = useState<number | null>(null)
  const current = count ? index % count : 0

  useEffect(() => {
    const uncover = setTimeout(() => setCovered(false), 60)
    return () => clearTimeout(uncover)
  }, [index])

  useEffect(() => {
    if (target !== null) {
      setCovered(true)
      const swap = setTimeout(() => {
        setIndex(target)
        setTarget(null)
      }, WIPE_MS)
      return () => clearTimeout(swap)
    }
    if (paused) {
      // a pause can land between cover and swap, and the bar must not stay over the word
      setCovered(false)
      return
    }
    if (count < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const cover = setTimeout(() => setCovered(true), hold)
    const swap = setTimeout(() => setIndex((i) => (i + 1) % count), hold + WIPE_MS)
    return () => {
      clearTimeout(cover)
      clearTimeout(swap)
    }
  }, [index, count, hold, paused, target])

  const jump = (to: number) => {
    if (to !== current) setTarget(to)
  }

  return { index: current, covered, jump }
}

/** A word behind a highlighter bar, sized to the word so the line around it reflows smoothly. */
export function Marker({ word, covered }: { word: string; covered: boolean }) {
  const [width, setWidth] = useState<number>()
  const sizer = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const measure = () => sizer.current && setWidth(sizer.current.getBoundingClientRect().width)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [word])

  return (
    <span className="marker-cycle" style={{ width }}>
      <span className="marker-cycle__sizer" ref={sizer} aria-hidden="true">
        {word}
      </span>
      <span className="marker-cycle__word">{word}</span>
      <span className={`marker-cycle__bar ${covered ? 'is-covering' : ''}`} aria-hidden="true" />
    </span>
  )
}

/** A word that cycles behind a highlighter bar: the bar covers it, the word swaps, the bar wipes away. */
export function MarkerCycle({ words }: { words: string[] }) {
  const { index, covered } = useMarkerCycle(words.length)
  return <Marker word={words[index]} covered={covered} />
}
