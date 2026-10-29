import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRecords, compare, aggregate, buildReport, formatReport } from './score.mjs';

const resultRecord = (overrides = {}) => ({
  type: 'result',
  subtype: 'success',
  result: '# Team: Alpha\n...',
  total_cost_usd: 0.1234,
  num_turns: 4,
  usage: {
    input_tokens: 100,
    output_tokens: 50,
    cache_read_input_tokens: 2000,
    cache_creation_input_tokens: 300,
  },
  ...overrides,
});

test('parseRecords reads usage and cost from the final result record only', () => {
  const records = [
    { type: 'system', subtype: 'init' },
    { type: 'assistant', message: { usage: { input_tokens: 999 } } },
    resultRecord({ num_turns: 4 }),
  ];
  const r = parseRecords(records);
  assert.equal(r.found, true);
  assert.equal(r.inputTokens, 100);
  assert.equal(r.outputTokens, 50);
  assert.equal(r.cacheRead, 2000);
  assert.equal(r.cacheWrite, 300);
  assert.equal(r.costUsd, 0.1234);
  assert.equal(r.turns, 4);
  assert.equal(r.totalTokens, 2450);
  assert.equal(r.resultText, '# Team: Alpha\n...');
});

test('parseRecords accepts a JSONL string and skips non-JSON lines', () => {
  const text = [
    'warning: something on stderr',
    JSON.stringify({ type: 'assistant' }),
    JSON.stringify(resultRecord({ usage: { input_tokens: 7, output_tokens: 3 } })),
    '',
  ].join('\n');
  const r = parseRecords(text);
  assert.equal(r.found, true);
  assert.equal(r.inputTokens, 7);
  assert.equal(r.outputTokens, 3);
  assert.equal(r.cacheRead, 0);
  assert.equal(r.cacheWrite, 0);
});

test('parseRecords reports found=false and zeros when no result record exists', () => {
  const r = parseRecords([{ type: 'assistant' }]);
  assert.equal(r.found, false);
  assert.equal(r.totalTokens, 0);
  assert.equal(r.turns, 0);
  assert.equal(r.resultText, '');
});

test('compare adopts when variant saves at least 10% total tokens with equal pass rate', () => {
  const a = { totalTokens: 1000, costUsd: 0.5, turns: 10, passRate: 1 };
  const b = { totalTokens: 850, costUsd: 0.4, turns: 9, passRate: 1 };
  const c = compare(a, b);
  assert.equal(c.verdict, 'adopt');
  assert.equal(c.passA, 1);
  assert.equal(c.passB, 1);
  assert.ok(Math.abs(c.deltaPct.totalTokens - -15) < 1e-9);
});

test('compare rejects when variant pass rate is lower, even if cheaper', () => {
  const a = { totalTokens: 1000, passRate: 1 };
  const b = { totalTokens: 300, passRate: 0.5 };
  assert.equal(compare(a, b).verdict, 'reject');
});

test('compare reports no clear win for savings under 10%', () => {
  const a = { totalTokens: 1000, pass: true };
  const b = { totalTokens: 950, pass: true };
  const c = compare(a, b);
  assert.equal(c.verdict, 'no clear win');
  assert.equal(c.passA, 1);
  assert.equal(c.passB, 1);
});

test('compare gives null deltas when baseline is zero and no clear win on increase', () => {
  const c = compare({ totalTokens: 0, costUsd: 0, passRate: 1 }, { totalTokens: 500, costUsd: 0.2, passRate: 1 });
  assert.equal(c.deltaPct.totalTokens, null);
  assert.equal(c.deltaPct.costUsd, null);
  assert.equal(c.verdict, 'no clear win');
});

test('aggregate sums metrics and computes pass rate over runs', () => {
  const runs = [
    { pass: true, metrics: { inputTokens: 10, outputTokens: 5, cacheRead: 0, cacheWrite: 0, costUsd: 0.1, turns: 2 } },
    { pass: false, metrics: { inputTokens: 20, outputTokens: 5, cacheRead: 100, cacheWrite: 0, costUsd: 0.2, turns: 3 } },
  ];
  const agg = aggregate(runs);
  assert.equal(agg.inputTokens, 30);
  assert.equal(agg.totalTokens, 140);
  assert.equal(agg.turns, 5);
  assert.equal(agg.passRate, 0.5);
  assert.equal(agg.n, 2);
});

test('buildReport pairs tasks and formatReport prints a verdict table', () => {
  const lines = [
    { task: 't1', variant: 'A', pass: true, metrics: { inputTokens: 1000 } },
    { task: 't1', variant: 'B', pass: true, metrics: { inputTokens: 500 } },
    { task: 't2', variant: 'A', pass: true, metrics: { inputTokens: 100 } },
  ];
  const report = buildReport(lines);
  assert.equal(report.rows.length, 2);
  assert.equal(report.rows[0].comparison.verdict, 'adopt');
  assert.equal(report.rows[1].comparison, null);
  assert.equal(report.overall.verdict, 'adopt');
  const text = formatReport(report);
  assert.match(text, /t1/);
  assert.match(text, /adopt/);
  assert.match(text, /incomplete/);
});
