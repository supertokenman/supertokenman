import { useEffect, useState } from 'react'

// The team channel is a lazy pane. What the eager bundle holds is this: a way to ask for it to open,
// and the count of posts from teammates that arrived while it was closed.
type Listener = (team?: string) => void
const listeners = new Set<Listener>()
let shown = false

export const openChannel = (team?: string) => listeners.forEach((l) => l(team))
export const onOpenChannel = (fn: Listener) => (listeners.add(fn), () => void listeners.delete(fn))
/** The pane tells the badge it is on screen (posts stop counting) or that everything was read. */
export function channelSeen(on: boolean) {
  shown = on
  window.dispatchEvent(new Event('stm:chan-seen'))
}

export function useChannelUnread(): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    const off = window.stm.channel.onPosted((_team, v) => {
      if (v.post && v.post.from !== 'you' && !shown) setN((x) => x + 1)
    })
    const seen = () => setN(0)
    window.addEventListener('stm:chan-seen', seen)
    return () => {
      off()
      window.removeEventListener('stm:chan-seen', seen)
    }
  }, [])
  return n
}
