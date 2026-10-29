import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickVariant, variantEnv, VARIANTS } from './variants.mjs';

test('the flag wins over BENCH_VARIANT, and an unknown variant is refused', () => {
  assert.equal(pickVariant('C', { BENCH_VARIANT: 'A' }), 'C');
  assert.equal(pickVariant(undefined, { BENCH_VARIANT: 'D' }), 'D');
  assert.equal(pickVariant('E', {}), null);
  assert.equal(pickVariant(undefined, {}), null);
});

test('each variant differs from B in one thing', () => {
  const diff = (v) => Object.keys(VARIANTS.B).filter((k) => VARIANTS[v][k] !== VARIANTS.B[k]);
  assert.deepEqual(diff('A'), ['STM_PROMPT_VARIANT']);
  assert.deepEqual(diff('C'), ['STM_TERSE']);
  assert.deepEqual(diff('D'), ['STM_CONDENSE']);
});

test('the child environment carries the variant and the app variables', () => {
  assert.deepEqual(variantEnv('C'), { BENCH_VARIANT: 'C', STM_PROMPT_VARIANT: 'card', STM_TERSE: '1', STM_CONDENSE: '0' });
});
