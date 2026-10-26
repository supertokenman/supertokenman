import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeEntries, categorize, summarize, CAT } from '../lib/analyze.mjs';

let n = 0;
const req = (ctxRead, write, out = 100, extra = {}) => ({
  type: 'assistant',
  timestamp: new Date(1e12 + n * 1000).toISOString(),
  message: {
    id: `m${++n}`,
    model: 'claude-opus-5-5',
    content: extra.toolUse ? [{ type: 'tool_use', id: extra.toolUse.id, name: extra.toolUse.name, input: extra.toolUse.input }] : [{ type: 'text', text: 'ok' }],
    usage: { input_tokens: 0, cache_read_input_tokens: ctxRead, cache_creation_input_tokens: write, output_tokens: out, cache_creation: { ephemeral_1h_input_tokens: write } },
  },
});
const result = (id, chars) => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'x'.repeat(chars) }] } });
const user = (text) => ({ type: 'user', message: { content: text } });

test('categorizes commands, files, web and MCP', () => {
  assert.equal(categorize('Bash', { command: 'cd engine && CI=1 npm test -- -t x' }).cat, 'Bash: npm test');
  assert.equal(categorize('Bash', { command: 'f=/tmp/x; grep -n a $f' }).cat, 'Bash: grep');
  assert.equal(categorize('Bash', { command: 'python3 bz/gerar.py roteiro.json' }).cat, 'Bash: python3 gerar.py');
  assert.equal(categorize('Read', { file_path: '/a/b.tsx' }).cat, 'Read: .tsx');
  assert.equal(categorize('WebFetch', { url: 'https://docs.x.com/a' }).cat, 'WebFetch: docs.x.com');
  assert.equal(categorize('mcp__github__get_file_contents', {}).cat, 'MCP: github');
});

test('a large result early costs more than late (it is re-read on every request)', () => {
  const early = analyzeEntries([
    user('hi'),
    req(0, 30000, 100, { toolUse: { id: 't1', name: 'Bash', input: { command: 'npm test' } } }),
    result('t1', 35000), // ~10k tokens
    req(30000, 10100, 100),
    ...Array.from({ length: 20 }, (_, i) => [user('more'), req(40200 + i * 110, 110, 100)]).flat(),
  ]);
  const late = analyzeEntries([
    user('hi'),
    ...Array.from({ length: 20 }, (_, i) => [user('more'), req(i === 0 ? 0 : 30000 + (i - 1) * 110, i === 0 ? 30000 : 110, 100)]).flat(),
    req(32200, 0, 100, { toolUse: { id: 't2', name: 'Bash', input: { command: 'npm test' } } }),
    result('t2', 35000),
    req(32300, 10100, 100),
  ]);
  const cost = (r) => r.byCat['Bash: npm test'] || 0;
  // Opus 5.5: 10k tokens cost the write (2 x $4) + 20 re-reads ($0.20 each) versus the write alone
  assert.ok(cost(early) > cost(late) * 1.4, `early=${cost(early)} late=${cost(late)}`);
  assert.equal(early.fixedContext > 25000, true);
});

test('detects lost cache and compaction', () => {
  const r = analyzeEntries([
    user('hi'),
    req(0, 50000),
    user('a'),
    req(50000, 200),
    user('back after 2 hours'),
    req(0, 50400), // everything rewritten: lost cache
    user('b'),
    req(50400, 100),
    { type: 'system', subtype: 'compact_boundary' },
    user('c'),
    req(0, 8000), // context dropped: compacted
  ]);
  assert.equal(r.rebuilds, 1);
  // ~50k tokens rewritten at $8/MTok instead of re-read at $0.20/MTok
  assert.ok(r.byCat[CAT.rebuild] > 0.3, String(r.byCat[CAT.rebuild]));
  assert.equal(r.compactions, 1);
  assert.ok(r.byCat[CAT.compact] > 0);
});

test('split messages with the same id count once; thinking is separate', () => {
  const m = req(0, 1000, 500);
  m.message.usage.output_tokens_details = { thinking_tokens: 300 };
  const r = analyzeEntries([user('hi'), m, structuredClone(m)]);
  assert.equal(r.requests, 1);
  // Opus 5.5 output: $20/MTok
  assert.ok(Math.abs(r.byCat[CAT.thinking] - (300 * 20) / 1e6) < 1e-12);
  assert.ok(Math.abs(r.byCat[CAT.output] - (200 * 20) / 1e6) < 1e-12);
});

test('summarize produces recommendations from the numbers', () => {
  const r = analyzeEntries([user('hi'), req(0, 60000), ...Array.from({ length: 30 }, (_, i) => [user('x'), req(60000 + i * 50, 50)]).flat()]);
  const s = summarize([r]);
  assert.ok(s.tips.some((t) => t.includes('fixed context')));
  assert.equal(s.cats[0].cat, CAT.fixed);
});
