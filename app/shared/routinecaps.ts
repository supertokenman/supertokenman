// Caps on triggers and routines: the minimum interval, the number enabled, and auto-disable after repeated
// failures. Pure: the callers pass the list, the change and the clock. Settings may lower a cap, not lift it
// past the hard limits below.

import type { When } from './triggers.js'

export type Caps = { minEvery: number; maxEnabled: number; maxFailures: number }
export const DEFAULT_CAPS: Caps = { minEvery: 15, maxEnabled: 20, maxFailures: 10 }
/** Hard limits: the interval never drops under 5 minutes, at most 50 enabled, at least 3 failures before auto-disable. */
export const HARD = { minEvery: 5, maxEnabled: 50, minFailures: 3 } as const

/** Caps from settings: a number that is not finite or out of the hard limits falls back to the default. */
export function clampCaps(input: Partial<Record<keyof Caps, unknown>> | undefined): Caps {
  const num = (v: unknown, d: number, min: number, max = Infinity) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d
  return {
    minEvery: num(input?.minEvery, DEFAULT_CAPS.minEvery, HARD.minEvery),
    maxEnabled: num(input?.maxEnabled, DEFAULT_CAPS.maxEnabled, 1, HARD.maxEnabled),
    maxFailures: num(input?.maxFailures, DEFAULT_CAPS.maxFailures, HARD.minFailures),
  }
}

/** The part of a trigger or routine the caps read. */
export type Capped = { id: string; enabled: boolean; when: When; failures?: number; disabledReason?: 'failures'; note?: string }

/** A proposed save: the item as it will be after the change. */
export type CapChange = { id: string; when: When; enabled: boolean }

export type CapDecision = { ok: true } | { ok: false; reason: string }

/**
 * Whether saving `change` into `list` is allowed. An `every` schedule under the minimum interval is refused;
 * enabling one more than the maximum is refused (disabling one first is the way out). Disabled items and the
 * item being changed do not count toward the enabled total.
 */
export function capDecision(list: Capped[], change: CapChange, _now: number, caps: Caps = DEFAULT_CAPS): CapDecision {
  if (change.when.kind === 'every' && change.when.minutes < caps.minEvery) {
    return { ok: false, reason: `Runs can be at most every ${caps.minEvery} minutes. Pick a longer interval.` }
  }
  if (change.enabled) {
    const others = list.filter((x) => x.enabled && x.id !== change.id).length
    if (others + 1 > caps.maxEnabled) {
      return { ok: false, reason: `At most ${caps.maxEnabled} routines and triggers can be enabled. Disable one first.` }
    }
  }
  return { ok: true }
}

/**
 * The item after one run ended. A success resets the failure count. The failure count reaching the limit
 * disables the item with the reason `failures` and a note; a disabled item is never re-enabled here.
 */
export function afterRun<T extends Capped>(t: T, ok: boolean, caps: Caps = DEFAULT_CAPS): T {
  if (ok) return { ...t, failures: 0 }
  const failures = (t.failures ?? 0) + 1
  if (failures >= caps.maxFailures) {
    return { ...t, failures, enabled: false, disabledReason: 'failures', note: `Disabled after ${failures} failed runs in a row. Re-enable it to try again.` }
  }
  return { ...t, failures }
}
