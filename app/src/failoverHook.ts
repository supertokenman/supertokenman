import { useEffect, useState } from 'react'
import type { CardView } from '../shared/qfcwire'

/** The open failover card of a panel, if any. The card itself is a lazy chunk. */
export function useFailoverCard(sid: string): CardView | null {
  const [card, setCard] = useState<CardView | null>(null)
  useEffect(() => {
    let live = true
    void window.stm.failover.current(sid).then((c) => live && setCard(c), () => undefined)
    const off = window.stm.failover.onCard((id, c) => id === sid && setCard(c.closed ? null : c))
    return () => {
      live = false
      off()
    }
  }, [sid])
  return card
}
