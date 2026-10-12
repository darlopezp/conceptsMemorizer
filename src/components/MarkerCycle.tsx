import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const HOLD_MS = 2400
const WIPE_MS = 500

/** A word that cycles behind a highlighter bar: the bar covers it, the word swaps, the bar wipes away. */
export function MarkerCycle({ words }: { words: string[] }) {
  const [index, setIndex] = useState(0)
  const [covered, setCovered] = useState(true)
  const [width, setWidth] = useState<number>()
  const sizer = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const measure = () => sizer.current && setWidth(sizer.current.getBoundingClientRect().width)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [index])

  useEffect(() => {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const uncover = setTimeout(() => setCovered(false), 60)
    if (still || words.length < 2) return () => clearTimeout(uncover)
    const cover = setTimeout(() => setCovered(true), HOLD_MS)
    const swap = setTimeout(() => setIndex((i) => (i + 1) % words.length), HOLD_MS + WIPE_MS)
    return () => {
      clearTimeout(uncover)
      clearTimeout(cover)
      clearTimeout(swap)
    }
  }, [index, words.length])

  return (
    <span className="marker-cycle" style={{ width }}>
      <span className="marker-cycle__sizer" ref={sizer} aria-hidden="true">
        {words[index]}
      </span>
      <span className="marker-cycle__word">{words[index]}</span>
      <span className={`marker-cycle__bar ${covered ? 'is-covering' : ''}`} aria-hidden="true" />
    </span>
  )
}
