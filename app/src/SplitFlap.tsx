import { useEffect, useRef, useState } from 'react'
import { plan } from '../shared/splitflap'

/** A value that changes like a departures board: each changed character flips to the new one. */
export function SplitFlap(props: { value: string; className?: string }) {
  const [shown, setShown] = useState(props.value)
  const last = useRef(props.value)
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const p = plan(last.current, props.value, { reduced })
    last.current = props.value
    let i = 0
    setShown(p.frames[0]!)
    if (p.frames.length === 1) return
    const t = setInterval(() => (++i < p.frames.length ? setShown(p.frames[i]!) : clearInterval(t)), p.stepMs)
    return () => clearInterval(t)
  }, [props.value])
  return (
    <span className={`flap ${props.className ?? ''}`} aria-label={props.value}>
      {[...shown].map((ch, i) => <span key={`${i}-${ch}`} aria-hidden="true">{ch}</span>)}
    </span>
  )
}
