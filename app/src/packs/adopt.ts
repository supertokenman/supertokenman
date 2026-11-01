import { useEffect } from 'react'
import type { PanelAction } from '../state'

type Opened = { sid: string; cwd: string; branch: string; base: string; repo: string }

/**
 * Panels that main opened itself (the two sides of a pack eval) join the window here, with their branch so the
 * worktree bar shows; the Packs sheet announces them. They close through the existing stm:close-panels event.
 */
export function useAdoptPanels(dispatch: (a: PanelAction) => void, openedCwd: { current: Record<string, string> }) {
  useEffect(() => {
    const adopt = (e: Event) => {
      const d = (e as CustomEvent<{ model: string; panels: Opened[] }>).detail
      for (const o of d.panels) {
        openedCwd.current[o.sid] = o.cwd
        dispatch({ kind: 'open', sid: o.sid, cwd: o.cwd, model: d.model, worktree: { branch: o.branch, base: o.base, repo: o.repo } })
      }
    }
    window.addEventListener('stm:adopt-panels', adopt)
    return () => window.removeEventListener('stm:adopt-panels', adopt)
  }, [dispatch, openedCwd])
}
