// When the release update check may run. Kept apart from main.ts so a test pins the rules:
// - the automatic check is opt-in: a fresh profile (updateCheck unset) never reaches GitHub on its own
//   (v0.1.12 Mac proof: the launch check made 35 github.com requests and one direct TCP connection);
// - the automatic check waits AUTO_DELAY_MS after the window is up, so it never competes with launch;
// - a check the person asks for (the Update button) always runs in a release build.

export const AUTO_DELAY_MS = 60_000
/** The wait before the automatic check; STM_UPDATE_DELAY_MS shortens it for the netwatch check only. */
export const autoDelay = (env: Record<string, string | undefined> = {}) => {
  const n = Number(env.STM_UPDATE_DELAY_MS)
  return Number.isFinite(n) && n >= 0 && env.STM_UPDATE_DELAY_MS !== undefined ? n : AUTO_DELAY_MS
}

/** A released Mac build that updates from GitHub Releases. STM_UPDATE_RELEASE_MODE=1 forces it on for
 * the netwatch check only, so CI exercises the gate on Linux without a signed build. */
export function releaseMode(o: { packaged: boolean; platform: string; hasUpdateYml: boolean; env?: Record<string, string | undefined> }): boolean {
  if (o.env?.STM_UPDATE_RELEASE_MODE === '1') return true
  return o.packaged && o.platform === 'darwin' && o.hasUpdateYml
}

/** May this check reach the network? `auto` is the timer's check; otherwise the person pressed Update. */
export function checkAllowed(auto: boolean, setting: boolean | undefined): boolean {
  return auto ? setting === true : true
}

export type InstallDecision = { action: 'install' } | { action: 'ask'; live: number; message: string }

/**
 * May the downloaded update restart the app now? With panels working or waiting, restarting stops them,
 * so the person is asked first; `confirmed` is their yes. No answer means the update installs on the
 * next real quit, never silently.
 */
export function installGate(live: number, confirmed: boolean): InstallDecision {
  const n = Math.max(0, Math.floor(live))
  if (n === 0 || confirmed) return { action: 'install' }
  return {
    action: 'ask',
    live: n,
    message: `Restarting now stops ${n === 1 ? '1 panel' : `${n} panels`} that ${n === 1 ? 'is' : 'are'} still running. Restart now, or install the update the next time you quit.`,
  }
}
