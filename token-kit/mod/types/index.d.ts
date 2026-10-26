/** Context, plan windows and cost as the engine last measured them. */
export type Snapshot = {
  contextTokens: number
  window: number
  percent: number | null
  limits: { kind: string; percentUsed: number; resetsAt?: string }[]
  costUsd: number | null
  at: number
}

/** A tool result that entered the main conversation, and the step it entered at. */
export type Item = { id: string; label: string; tokens: number; step: number }

/** Main-thread model requests so far (their times, newest last) and the last one's model. */
export type Steps = { times: number[]; model: string }

/** token-kit's own cuts in this session, read from its stats file: when, and tokens kept out. */
export type Savings = { cuts: { at: number; tokens: number }[] }

/** USD to the display currency. */
export type Fx = { currency: string; rate: number; at: number; source: string }

declare module 'claude-code' {
  interface PluginState {
    'supertokenman': {
      snapshot: Snapshot | null
      items: Item[]
      steps: Steps
      savings: Savings
      fx: Fx
    }
  }
}
