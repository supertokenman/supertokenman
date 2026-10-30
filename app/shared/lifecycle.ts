// Runtime lifecycle: keepRunning, background mode, clean-exit marker, resume offer, update gate.
// Pure reducer: the caller performs the returned effects (windows, Tray, dock, marker file, sessions).

export type Phase = 'attached' | 'background' | 'quitting'

export interface LifeState {
  phase: Phase
  keepRunning: boolean
  /** panels working or queued */
  live: number
  /** panels in the saved layout */
  layoutPanels: number
  /** panels to offer for resume after a crash or reboot; 0 = no offer */
  resumeOffer: number
  /** update downloaded while panels ran; installs on the next real quit */
  pendingInstall: boolean
}

export type Effect =
  | 'hide-windows' | 'dock-hide' | 'dock-show' | 'show-window' | 'show-tray' | 'hide-tray'
  | 'request-snapshot' | 'reopen-panels' | 'stop-all'
  | 'write-clean-marker' | 'write-interrupted-marker' | 'clear-marker'
  | 'ask-update-gate' | 'quit-and-install' | 'exit'

export type LifeEvent =
  | { type: 'launch'; layoutPanels: number; cleanExit: boolean }
  | { type: 'live'; count: number }
  | { type: 'keep-running'; on: boolean }
  | { type: 'quit-request'; source: 'cmd-q' | 'window-close' }
  | { type: 'quit-and-stop' }
  | { type: 'stop-all' }
  | { type: 'open' }
  | { type: 'crash' }
  | { type: 'update-ready' }
  | { type: 'update-answer'; restart: boolean }
  | { type: 'resume' }
  | { type: 'dismiss-resume' }

export function initialLife(keepRunning = false): LifeState {
  return { phase: 'attached', keepRunning, live: 0, layoutPanels: 0, resumeOffer: 0, pendingInstall: false }
}

/** What a close or Cmd+Q does: keep panels in the background, or quit. */
export function quitMode(s: Pick<LifeState, 'keepRunning' | 'live'>): 'background' | 'quit' {
  return s.keepRunning && s.live > 0 ? 'background' : 'quit'
}

const stop = (s: LifeState): LifeState => ({ ...s, live: 0 })

/** Real quit: stop everything, write the clean-exit marker, then install a pending update or exit. */
function quitNow(s: LifeState): [LifeState, Effect[]] {
  const effects: Effect[] = ['stop-all', 'write-clean-marker', s.pendingInstall ? 'quit-and-install' : 'exit']
  return [{ ...stop(s), phase: 'quitting', pendingInstall: false }, effects]
}

/** Update install: stop panels, mark the exit as interrupted so the relaunch offers resume. */
function installNow(s: LifeState): [LifeState, Effect[]] {
  return [{ ...stop(s), phase: 'quitting', pendingInstall: false }, ['stop-all', 'write-interrupted-marker', 'quit-and-install']]
}

export function reduceLife(s: LifeState, ev: LifeEvent): [LifeState, Effect[]] {
  switch (ev.type) {
    case 'launch':
      // A crash or reboot leaves no clean-exit marker: offer the saved layout, nothing runs until the user clicks.
      return [
        {
          ...s,
          phase: 'attached',
          layoutPanels: Math.max(0, Math.floor(ev.layoutPanels)),
          resumeOffer: ev.cleanExit ? 0 : Math.max(0, Math.floor(ev.layoutPanels)),
        },
        ['clear-marker', 'show-window'],
      ]

    case 'live':
      return [{ ...s, live: Math.max(0, Math.floor(ev.count)) }, []]

    case 'keep-running':
      return [{ ...s, keepRunning: ev.on }, []]

    case 'quit-request': {
      if (s.phase === 'quitting') return [s, []]
      if (quitMode(s) === 'quit') return quitNow(s)
      // Already in background: the Tray owns the real quit, so a second close changes nothing.
      if (s.phase === 'background') return [s, []]
      return [{ ...s, phase: 'background' }, ['hide-windows', 'dock-hide', 'show-tray']]
    }

    case 'quit-and-stop':
      return s.phase === 'quitting' ? [s, []] : quitNow(s)

    case 'stop-all':
      // Tray "Stop all" (after confirm): panels end, the app stays where it is.
      return [stop(s), ['stop-all']]

    case 'open':
      if (s.phase === 'quitting') return [s, []]
      if (s.phase === 'attached') return [s, ['show-window']]
      return [
        { ...s, phase: 'attached' },
        ['dock-show', 'show-window', 'hide-tray', 'request-snapshot'],
      ]

    case 'crash':
      // Best-effort marker from a last-chance handler; the next launch then offers resume.
      return [{ ...stop(s), phase: 'quitting' }, ['write-interrupted-marker']]

    case 'update-ready':
      if (s.live === 0) return installNow(s)
      return [s, ['ask-update-gate']]

    case 'update-answer':
      if (ev.restart) return installNow(s)
      return [{ ...s, pendingInstall: true }, []]

    case 'resume':
      return [{ ...s, resumeOffer: 0 }, ['reopen-panels']]

    case 'dismiss-resume':
      return [{ ...s, resumeOffer: 0 }, []]
  }
}
