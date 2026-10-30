import { useEffect, useState } from 'react'
import type { QueueView } from './bridge'

/** How many items wait in a panel's queue, and whether it is paused. Cheap: the list itself is a lazy chunk. */
export function useQueueState(sid: string): { count: number; paused: boolean } {
  const [v, setV] = useState({ count: 0, paused: false })
  useEffect(() => {
    let live = true
    const set = (q: QueueView) => live && setV((o) => (o.count === q.queue.items.length && o.paused === q.queue.paused ? o : { count: q.queue.items.length, paused: q.queue.paused }))
    void window.stm.queue.get(sid).then(set, () => undefined)
    const off = window.stm.queue.onChanged((id, q) => id === sid && set(q))
    return () => {
      live = false
      off()
    }
  }, [sid])
  return v
}
