import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { priceFor, requestUsd, savedUsd } from '../lib/pricing.mjs';
import { usdRate, fmtMoney } from '../lib/money.mjs';
import { writeState } from '../lib/store.mjs';

test('price table: the longest model prefix wins and provider prefixes are ignored', () => {
  assert.equal(priceFor('claude-opus-5-5').input, 4);
  assert.equal(priceFor('claude-opus-5').input, 5);
  assert.equal(priceFor('claude-opus-4-8').input, 5);
  assert.equal(priceFor('claude-sonnet-5-5').read, 0.2);
  assert.equal(priceFor('claude-fable-5-1').read, 0.25);
  assert.equal(priceFor('anthropic.claude-haiku-5-5').input, 0.1);
  assert.equal(priceFor('claude-opus-5-5[1m]').input, 4);
  assert.equal(priceFor('something-else').input, 4); // unknown -> current default (Opus 5.5)
});

test('request cost: 1h and 5m cache writes, reads, output and fast mode', () => {
  const u = { input_tokens: 1000, cache_creation_input_tokens: 2000, cache_creation: { ephemeral_1h_input_tokens: 1000 }, cache_read_input_tokens: 10000, output_tokens: 500 };
  // Opus 5.5: 1000*4 + 1000*8 + 1000*5 + 10000*0.2 + 500*20 = 29000 per 1e6
  assert.ok(Math.abs(requestUsd(u, 'claude-opus-5-5') - 0.029) < 1e-12);
  assert.ok(Math.abs(requestUsd({ ...u, speed: 'fast' }, 'claude-opus-5-5') - 0.058) < 1e-12);
  // what a 10k-token cut saves: the write plus each later re-read
  assert.ok(Math.abs(savedUsd(10000, 5, 'claude-sonnet-5-5') - (10000 * (4 + 0.2 * 5)) / 1e6) < 1e-12);
});

test('exchange rate: uses a fresh cached value without network, formats BRL', () => {
  process.env.TOKEN_KIT_HOME = mkdtempSync(join(tmpdir(), 'tk-fx-'));
  const now = Date.now();
  writeState('fx-BRL', { rate: 5.1, source: 'cache', at: now - 3600000 });
  assert.equal(usdRate({ currency: 'BRL', fallbackRate: 5, planMonthlyUsd: 100 }, now).rate, 5.1);
  assert.equal(usdRate({ currency: 'USD', fallbackRate: 5, planMonthlyUsd: 100 }, now).rate, 1);
  assert.equal(fmtMoney(12.4, 'BRL'), 'R$12.40');
  assert.equal(fmtMoney(1234.5, 'BRL'), 'R$1,235');
});
