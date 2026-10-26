// @ts-check
import { readFileSync } from 'node:fs';
import { configPath } from './paths.mjs';

/**
 * @typedef {object} UserProfile
 * @property {string} name
 * @property {string} match   regex tested against the command (leading env assignments stripped)
 * @property {string[]} [keep] regexes for lines that are always kept
 * @property {string[]} [drop] regexes for lines that are dropped
 * @property {number} [tail]  trailing lines kept
 */

/**
 * @typedef {object} Config
 * @property {boolean} enabled
 * @property {{ maxLines: number, maxChars: number, head: number, tail: number, context: number, maxBlocks: number }} condense
 * @property {{ mode: 'auto' | 'off', skip: string[] }} rtk
 * @property {{ enabled: boolean, maxChars: number, skip: string[] }} post
 * @property {{ enabled: boolean, maxLines: number, maxBytes: number, generatedMaxBytes: number, retryWindowMin: number }} readGuard
 * @property {{ enabled: boolean, contextPct: number[], contextTokens: number[], fiveHourPct: number, cacheMinTokens: number }} nudge
 * @property {{ keepDays: number, maxFiles: number }} logs
 * @property {import('./money.mjs').MoneyConfig} money
 * @property {{ path: string }} vault
 * @property {UserProfile[]} profiles
 */

/** @type {Config} */
export const DEFAULTS = {
  enabled: true,
  condense: { maxLines: 60, maxChars: 6000, head: 6, tail: 25, context: 2, maxBlocks: 12 },
  // diff and show: every line matters, so they never go through RTK
  rtk: { mode: 'auto', skip: ['^git\\s+(?:diff|show|blame|format-patch)\\b', '^git\\s+log\\s+.*(?:-p|--patch)\\b'] },
  post: {
    enabled: true,
    maxChars: 10000,
    // Outputs where the content itself is the point: never condense.
    skip: [
      '^(git\\s+(diff|show|blame|format-patch)|git\\s+log\\s+.*-p)\\b',
      '^(cat|head|tail|sed|awk|nl|less|more|bat|jq|yq|diff|xxd|od|base64)\\b',
    ],
  },
  readGuard: { enabled: true, maxLines: 600, maxBytes: 60000, generatedMaxBytes: 20000, retryWindowMin: 15 },
  nudge: { enabled: true, contextPct: [60, 85], contextTokens: [120000, 170000], fiveHourPct: 80, cacheMinTokens: 40000 },
  logs: { keepDays: 7, maxFiles: 200 },
  // planMonthlyUsd: Max 5x list price; set your own if you pay a different amount
  money: { currency: 'BRL', fallbackRate: 5.05, planMonthlyUsd: 100 },
  // memory vault folder (tk vault init); empty = off
  vault: { path: '' },
  profiles: [],
};

/**
 * @param {any} base
 * @param {any} over
 * @returns {any}
 */
function merge(base, over) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over === undefined ? base : over;
  /** @type {Record<string, any>} */
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) out[k] = k in base ? merge(base[k], v) : v;
  return out;
}

/**
 * Merges a partial config (preset) into another. Profiles with the same name are replaced; others are appended.
 * @param {any} base
 * @param {any} over
 * @returns {any}
 */
export function mergeConfig(base, over) {
  const out = merge(base, { ...over, profiles: undefined });
  const profiles = [...(base.profiles || [])];
  for (const p of over.profiles || []) {
    const i = profiles.findIndex((x) => x.name === p.name);
    if (i >= 0) profiles[i] = p;
    else profiles.push(p);
  }
  out.profiles = profiles;
  return out;
}

/** @type {Config | undefined} */
let cached;

/** Reads config.json and fills in defaults. A missing or invalid file yields the defaults. */
export function loadConfig() {
  if (cached) return cached;
  let user = {};
  try {
    user = JSON.parse(readFileSync(configPath(), 'utf8'));
  } catch {
    // no config: defaults
  }
  cached = /** @type {Config} */ (merge(DEFAULTS, user));
  return cached;
}

export function resetConfigCache() {
  cached = undefined;
}
