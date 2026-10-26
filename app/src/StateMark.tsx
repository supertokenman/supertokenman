// A state shown as one of the brand's pictograms that moves the way the state feels, instead of a word:
// up breathes a ring, busy turns, warn asks with a small sway, down lands filled with a jolt, off is a
// dashed ghost. The word stays for the pointer (title) and for screen readers (aria-label).
export type MarkState = 'up' | 'busy' | 'warn' | 'down' | 'off'
export type MarkShape = 'square' | 'circle' | 'triangle' | 'cut' | 'cross'

const DEFAULT_SHAPE: Record<MarkState, MarkShape> = { up: 'circle', busy: 'triangle', warn: 'cut', down: 'square', off: 'circle' }

export function StateMark(props: { state: MarkState; label: string; shape?: MarkShape; size?: 'sm' | 'md' }) {
  const shape = props.shape ?? DEFAULT_SHAPE[props.state]
  return (
    <span className={`sm-mark ${props.state} ${props.size ?? 'sm'}`} role="img" aria-label={props.label} title={props.label}>
      <svg viewBox="0 0 10 10" aria-hidden>
        {shape === 'square' && <rect x="1" y="1" width="8" height="8" />}
        {shape === 'circle' && <circle cx="5" cy="5" r="4" />}
        {shape === 'triangle' && <path d="M5 1 9.2 9H.8Z" />}
        {shape === 'cut' && <path d="M1 1h8v5L6 9H1Z" />}
        {shape === 'cross' && <path d="m1.5 1.5 7 7m0-7-7 7" />}
      </svg>
    </span>
  )
}
