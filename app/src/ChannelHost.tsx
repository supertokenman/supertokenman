import { lazy, Suspense, useEffect, useState } from 'react'
import { onOpenChannel } from './channelOpen'

const ChannelPane = lazy(() => import('./ChannelPane'))

/** Mounted once: opens the team channel pane when something asks for it. The pane's code loads then, not at startup. */
export function ChannelHost() {
  const [open, setOpen] = useState<{ team?: string } | null>(null)
  useEffect(() => onOpenChannel((team) => setOpen({ team })), [])
  if (!open) return null
  return (
    <Suspense fallback={null}>
      <ChannelPane team={open.team} onClose={() => setOpen(null)} />
    </Suspense>
  )
}
