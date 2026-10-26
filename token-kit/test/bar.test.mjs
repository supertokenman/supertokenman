import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeBar, renderSwiftBar } from '../lib/bar.mjs';
import { recordStat, writeState } from '../lib/store.mjs';

const TK = join(import.meta.dirname, '..', 'bin', 'tk.mjs');
const req = (id, ts, read, write, out = 100) =>
  JSON.stringify({ type: 'assistant', timestamp: new Date(ts).toISOString(), message: { id, model: 'm', content: [], usage: { input_tokens: 0, cache_read_input_tokens: read, cache_creation_input_tokens: write, output_tokens: out } } });

function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'tk-bar-'));
  process.env.TOKEN_KIT_HOME = join(home, 'kit');
  const projects = join(home, 'projects', 'proj');
  mkdirSync(projects, { recursive: true });
  const now = Date.now();
  const t0 = now - 60000 * 30;
  // 1 request before the cut and 10 after: each would have re-read the saved tokens
  const lines = [req('a', t0, 0, 30000)];
  for (let i = 1; i <= 10; i++) lines.push(req(`b${i}`, t0 + i * 60000, 30000, 500));
  lines.push(req('b1', t0 + 60000, 30000, 500)); // split message: counts once
  writeFileSync(join(projects, 'sess1.jsonl'), lines.join('\n'));
  return { home, projects: join(home, 'projects'), now, t0 };
}

test('adds up real usage and savings with avoided re-reads in the same session', () => {
  const { projects, now } = fixture();
  recordStat({ kind: 'wrap', profile: 'test', cmd: 'test', inChars: 40400, outChars: 400, session: 'sess1' }); // 10k tokens
  recordStat({ kind: 'read-guard', profile: 'large', cmd: '/x', inChars: 90000, outChars: 0 });
  const d = computeBar(projects, now);
  assert.equal(d.today.sessions, 1);
  // unknown model 'm' is priced as Opus 5.5: write $8, read $0.20, output $20 per MTok
  // 30000*8 + 100*20, then 10 x (30000*0.2 + 500*8 + 100*20)
  assert.ok(Math.abs(d.today.used - (242000 + 10 * 12000) / 1e6) < 1e-9, String(d.today.used));
  assert.equal(d.today.cuts, 1);
  assert.equal(d.today.blocked, 1);
  assert.ok(Math.abs(d.today.direct - (10000 * 8) / 1e6) < 1e-9);
  // the cut was recorded now, after every request: no re-reads yet
  assert.ok(Math.abs(d.today.saved - (10000 * 8) / 1e6) < 1e-9);
});

test('a cut mid-session counts the following requests', () => {
  const { projects, now, t0 } = fixture();
  const entry = { ts: new Date(t0 + 30000).toISOString(), kind: 'wrap', profile: 'test', cmd: 'test', inChars: 40400, outChars: 400, session: 'sess1' };
  mkdirSync(process.env.TOKEN_KIT_HOME, { recursive: true });
  writeFileSync(join(process.env.TOKEN_KIT_HOME, `stats-${new Date().toISOString().slice(0, 7)}.jsonl`), JSON.stringify(entry) + '\n', { flag: 'a' });
  const d = computeBar(projects, now);
  // write $8 + 10 re-reads at $0.20, per MTok
  assert.ok(Math.abs(d.today.saved - (10000 * (8 + 0.2 * 10)) / 1e6) < 1e-9, String(d.today.saved));
});

test('SwiftBar menu: title with savings, sections and actions', () => {
  const { projects, now } = fixture();
  recordStat({ kind: 'post', profile: 'generic', cmd: 'find .', inChars: 80400, outChars: 400, session: 'sess1' });
  writeState('ctx-x', { tokens: 1, at: now, fiveHour: { pct: 42.4, resetsAt: now + 3600000 }, sevenDay: { pct: 61, resetsAt: now + 86400000 } });
  const money = { currency: 'BRL', rate: 5, source: 'test', at: now, planMonthlyUsd: 100 };
  const out = renderSwiftBar(computeBar(projects, now), { node: '/usr/bin/node', tk: '/k/tk.mjs' }, money);
  const [title] = out.split('\n');
  // 20k tokens kept out: $8/MTok write = $0.16, at R$5 = R$0.80
  assert.equal(title, 'R$0.80 saved | color=#d97757,#d97757');
  assert.match(out, /tooltip="Plan capacity freed: R\$[\d.]+\/month, \d+% of a \$100 plan"/);
  assert.doesNotMatch(out, /sfimage|font=|[\u{1F300}-\u{1FAFF}]/u);
  // the card: a PNG drawn at 2x, shown at its point size, plan bars included (5h and 7d)
  const [, img, w, h] = out.match(/^\| image=([A-Za-z0-9+/=]+) width=(\d+) height=(\d+) tooltip="Today [^"]+"$/m);
  const png = Buffer.from(img, 'base64');
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), Number(w) * 2);
  assert.equal(png.readUInt32BE(20), Number(h) * 2);
  assert.equal(Number(h), 280);
  assert.match(out, /tooltip="Today R\$[\d.]+ used, R\$0\.80 saved \(\d+%\), 1 cut\. Last 7 days/);
  // the actions are buttons drawn in the card's style, each still running its command
  assert.match(out, /^\| image=[A-Za-z0-9+/=]+ width=340 height=26 bash="\/usr\/bin\/node" param1="\/k\/tk\.mjs" param2=analyze terminal=true$/m);
  assert.match(out, /^\| image=[A-Za-z0-9+/=]+ width=340 height=26 refresh=true$/m);
  assert.doesNotMatch(out, /^(Detailed|Kit|Refresh)/m);
});

test('install-bar writes an executable plugin that prints the menu', () => {
  const { home } = fixture();
  const dir = join(home, 'plugins');
  mkdirSync(dir);
  const env = { ...process.env, CLAUDE_CONFIG_DIR: home };
  const r = spawnSync(process.execPath, [TK, 'install-bar', '--dir', dir], { encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stderr);
  const plugin = join(dir, 'token-kit.5m.sh');
  assert.ok(statSync(plugin).mode & 0o111);
  for (const tag of ['hideAbout', 'hideSwiftBar', 'hideLastUpdated']) assert.match(readFileSync(plugin, 'utf8'), new RegExp(`<swiftbar\\.${tag}>true<`));
  const out = spawnSync('bash', [plugin], { encoding: 'utf8', env });
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout, /^R\$[\d.,]+ (used|saved)/);
  assert.match(out.stdout, /^\| image=/m);
});
