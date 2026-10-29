#!/usr/bin/env node
// Token benchmark runner. See bench/README.md.
//   node bench/run.mjs --variant A|B --task <id|all> --out results.jsonl [--keep] [--extra-args "..."]
//   node bench/run.mjs --report results.jsonl

import { spawn } from 'node:child_process';
import {
  appendFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReport, formatReport, parseRecords } from './lib/score.mjs';
import { pickVariant, variantEnv } from './lib/variants.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const TASKS_DIR = join(here, 'tasks');
const CLAUDE_TIMEOUT_MS = 15 * 60 * 1000;
const CHECK_TIMEOUT_MS = 5 * 60 * 1000;

const USAGE = `usage:
  node bench/run.mjs --variant A|B|C|D --task <id|all> --out <file.jsonl> [--keep] [--extra-args "<claude flags>"]
  node bench/run.mjs --report <file.jsonl> [--baseline A] [--compare B]

--variant defaults to the BENCH_VARIANT environment variable.
A = old guide, B = capability card, C = B + terse inter-agent mode, D = B + output condensing.
The app reads STM_PROMPT_VARIANT, STM_TERSE and STM_CONDENSE in a development run (see bench/README.md).`;

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`missing value for ${a}`);
      return argv[++i];
    };
    switch (a) {
      case '--report': opts.report = next(); break;
      case '--variant': opts.variant = next(); break;
      case '--baseline': opts.baseline = next(); break;
      case '--compare': opts.compare = next(); break;
      case '--task': opts.task = next(); break;
      case '--out': opts.out = next(); break;
      case '--extra-args': opts.extraArgs = next(); break;
      case '--keep': opts.keep = true; break;
      case '--help':
      case '-h': opts.help = true; break;
      default: throw new Error(`unknown argument: ${a}`);
    }
  }
  return opts;
}

function validateTask(task, file) {
  const fail = (msg) => { throw new Error(`${file}: ${msg}`); };
  if (!task || typeof task.id !== 'string') fail('missing id');
  if (typeof task.prompt !== 'string') fail('missing prompt');
  if (task.setup && task.setup.files && typeof task.setup.files !== 'object') fail('setup.files must be an object');
  const c = task.check;
  if (c?.kind === 'command') {
    if (typeof c.run !== 'string' || !c.run.trim()) fail('command check needs run');
  } else if (c?.kind === 'contains') {
    if (typeof c.file !== 'string' || typeof c.text !== 'string') fail('contains check needs file and text');
  } else {
    fail('check.kind must be "command" or "contains"');
  }
  return task;
}

export function loadTasks(dir = TASKS_DIR) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => validateTask(JSON.parse(readFileSync(join(dir, f), 'utf8')), f));
}

function writeSetup(dir, files = {}) {
  for (const [rel, content] of Object.entries(files)) {
    const target = resolve(dir, rel);
    const inside = relative(dir, target);
    if (isAbsolute(rel) || inside.startsWith('..') || isAbsolute(inside)) {
      throw new Error(`setup path escapes task dir: ${rel}`);
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

// Spawns a process without a shell. Resolves with exit code, output and flags.
function run(cmd, args, { cwd, env, timeoutMs }) {
  return new Promise((done) => {
    const child = spawn(cmd, args, { cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      done({ code: null, stdout, stderr, timedOut, error: err.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ code, stdout, stderr, timedOut, error: null });
    });
  });
}

async function runCheck(check, dir, resultText) {
  if (check.kind === 'command') {
    const [cmd, ...args] = check.run.trim().split(/\s+/);
    const r = await run(cmd, args, { cwd: dir, env: process.env, timeoutMs: CHECK_TIMEOUT_MS });
    const detail = r.error ?? (r.code === 0 ? 'ok' : (r.stderr || r.stdout).slice(-500));
    return { pass: r.code === 0, detail };
  }
  // contains: file "@reply" means the final text reply of claude.
  let text;
  if (check.file === '@reply') {
    text = resultText;
  } else {
    try {
      text = readFileSync(resolve(dir, check.file), 'utf8');
    } catch (err) {
      return { pass: false, detail: `missing file ${check.file}` };
    }
  }
  const pass = text.includes(check.text);
  return { pass, detail: pass ? 'ok' : `text not found: ${check.text}` };
}

async function runTask(task, variant, { keep, extraArgs }) {
  const dir = mkdtempSync(join(tmpdir(), `bench-${task.id}-`));
  const started = Date.now();
  let line;
  try {
    writeSetup(dir, task.setup?.files);
    const args = ['-p', task.prompt, '--output-format', 'stream-json', '--verbose', ...extraArgs];
    const env = { ...process.env, ...variantEnv(variant) };
    const r = await run('claude', args, { cwd: dir, env, timeoutMs: CLAUDE_TIMEOUT_MS });
    const parsed = parseRecords(r.stdout);
    const check = r.error
      ? { pass: false, detail: r.error }
      : await runCheck(task.check, dir, parsed.resultText);
    line = {
      ts: new Date().toISOString(),
      task: task.id,
      variant,
      pass: check.pass && parsed.found,
      checkDetail: String(check.detail).slice(0, 500),
      exitCode: r.code,
      timedOut: r.timedOut,
      durationMs: Date.now() - started,
      metrics: {
        inputTokens: parsed.inputTokens,
        outputTokens: parsed.outputTokens,
        cacheRead: parsed.cacheRead,
        cacheWrite: parsed.cacheWrite,
        totalTokens: parsed.totalTokens,
        costUsd: parsed.costUsd,
        turns: parsed.turns,
      },
      found: parsed.found,
    };
    if (!parsed.found) line.error = r.stderr.slice(-500) || 'no result record in stream-json output';
  } catch (err) {
    line = { ts: new Date().toISOString(), task: task.id, variant, pass: false, error: err.message, durationMs: Date.now() - started };
  } finally {
    if (keep) console.error(`kept ${dir}`);
    else rmSync(dir, { recursive: true, force: true });
  }
  return line;
}

async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) { console.log(USAGE); return 0; }

  if (opts.report) {
    const lines = readFileSync(opts.report, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
    const baseline = opts.baseline ?? 'A';
    const compare = opts.compare ?? 'B';
    if (!pickVariant(baseline, {}) || !pickVariant(compare, {})) { console.error(USAGE); return 2; }
    console.log(formatReport(buildReport(lines, { baseline, variant: compare })));
    return 0;
  }

  opts.variant = pickVariant(opts.variant);
  if (!opts.variant || !opts.task || !opts.out) {
    console.error(USAGE);
    return 2;
  }

  const all = loadTasks();
  const selected = opts.task === 'all' ? all : all.filter((t) => t.id === opts.task);
  if (!selected.length) {
    console.error(`no task matches "${opts.task}". Available: ${all.map((t) => t.id).join(', ')}`);
    return 2;
  }

  const extraArgs = opts.extraArgs ? opts.extraArgs.trim().split(/\s+/).filter(Boolean) : [];
  let failures = 0;
  for (const task of selected) {
    const line = await runTask(task, opts.variant, { keep: opts.keep, extraArgs });
    appendFileSync(opts.out, `${JSON.stringify(line)}\n`);
    if (!line.pass) failures += 1;
    const tokens = line.metrics?.totalTokens ?? '-';
    console.log(`${task.id} [${opts.variant}]: ${line.pass ? 'PASS' : 'FAIL'} tokens=${tokens}`);
  }
  return failures ? 1 : 0;
}

main(process.argv.slice(2)).then(
  (code) => { process.exitCode = code; },
  (err) => { console.error(err.message); process.exitCode = 2; },
);
