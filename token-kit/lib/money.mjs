// @ts-check
// Converts USD to the display currency (BRL by default) with the day's exchange rate, cached for 12 hours.
import { spawnSync } from 'node:child_process';
import { readState, writeState } from './store.mjs';

/** Free, keyless sources; both answer `{ rates: { BRL: 5.04 } }`. */
const SOURCES = [
  (/** @type {string} */ c) => `https://api.frankfurter.dev/v1/latest?base=USD&symbols=${c}`,
  () => 'https://open.er-api.com/v6/latest/USD',
];

/**
 * @typedef {object} MoneyConfig
 * @property {string} currency     ISO code shown to the user (BRL, USD, EUR...)
 * @property {number} fallbackRate used when no rate can be fetched
 * @property {number} planMonthlyUsd your plan's monthly price, to value the capacity freed
 */

/**
 * Rate from USD to `currency`. Synchronous on purpose (the menu bar script runs once and exits):
 * fetches with curl at most every 12 hours, otherwise reads the cached value.
 * @param {MoneyConfig} cfg
 * @returns {{ rate: number, source: string, at: number }}
 */
export function usdRate(cfg, now = Date.now()) {
  if (cfg.currency === 'USD') return { rate: 1, source: 'USD', at: now };
  const cached = readState(`fx-${cfg.currency}`);
  if (cached && now - cached.at < 12 * 3600000) return cached;
  for (const source of SOURCES) {
    const url = source(cfg.currency);
    const r = spawnSync('curl', ['-fsS', '-m', '4', url], { encoding: 'utf8' });
    try {
      const rate = Number(JSON.parse(r.stdout)?.rates?.[cfg.currency]);
      if (rate > 0) {
        const v = { rate, source: new URL(url).host, at: now };
        writeState(`fx-${cfg.currency}`, v);
        return v;
      }
    } catch {
      // next source
    }
  }
  return cached || { rate: cfg.fallbackRate, source: 'fallback', at: now };
}

/**
 * @param {number} amount in the display currency
 * @param {string} currency
 */
export function fmtMoney(amount, currency) {
  const digits = Math.abs(amount) >= 100 ? 0 : 2;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount);
}
