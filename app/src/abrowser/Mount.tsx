import { lazy, Suspense, useEffect, useState } from 'react'

const Dock = lazy(() => import('./Dock').then((x) => ({ default: x.Dock })))

/**
 * The agent browser's place in the window: nothing until the feature is on, then the pane (a lazy chunk)
 * beside the panels. Tiny on purpose: it is the only part that loads at startup.
 */
export function AgentBrowserMount(props: { focus: string | null; panels: string[]; names: Record<string, string> }) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const api = window.stm?.agentBrowser
    if (!api) return
    void api.enabled().then(setOn, () => setOn(false))
    return api.onEnabled(setOn)
  }, [])
  if (!on) return null
  return (
    <Suspense fallback={null}>
      <Dock {...props} />
    </Suspense>
  )
}
