// @ts-check
// Memory vault: plain Markdown files (an Obsidian vault, synced with git) in three tiers.
//   rules/              long term: stable rules and preferences, read when relevant
//   projects/<name>.md  medium term: state, decisions and next steps of a project
//   sessions/<name>/    short term: one note per session, written automatically from the transcript
// Nothing here is loaded into context by itself: Claude reads a note or runs `tk recall` when it needs one.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, relative } from 'node:path';
import { requestUsd } from './pricing.mjs';
import { fmtMoney } from './money.mjs';

/** @param {string} [p] */
export function vaultPath(p) {
  if (!p) return '';
  return p.startsWith('~') ? join(homedir(), p.slice(1)) : p;
}

/** Project root: the git repository containing `cwd`, or `cwd` itself. */
export function projectRoot(cwd) {
  const r = spawnSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : cwd;
}

/** Project name: the root folder's name, safe for a file name. */
export function projectName(root) {
  return basename(root).replace(/[^A-Za-z0-9._-]+/g, '-') || 'misc';
}

const clip = (/** @type {string} */ s, /** @type {number} */ n) => {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};

/** Text of a user message, or '' for tool results and system-injected content. */
function promptText(e) {
  if (e.isMeta) return '';
  const c = e.message?.content;
  const t = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((b) => b.type === 'text').map((b) => b.text).join('\n') : '';
  // skip command wrappers, reminders and interruption markers
  if (!t || /^\s*<(?:command-|local-command|system-reminder|user-memory)/.test(t) || /^\[Request interrupted/.test(t)) return '';
  return t;
}

/**
 * Session note built from the transcript alone (no model call): what was asked, what changed, what ran.
 * @param {any[]} entries transcript lines in order
 * @param {{ session: string, project: string, rate: number, currency: string, root?: string }} meta
 */
export function buildNote(entries, meta) {
  /** @type {string[]} */
  const prompts = [];
  /** @type {Set<string>} */
  const files = new Set();
  /** @type {string[]} */
  const commands = [];
  /** @type {Set<string>} */
  const seen = new Set();
  let usd = 0;
  let start = '';
  let end = '';
  let model = '';
  let lastText = '';
  for (const e of entries) {
    if (e.timestamp) {
      start = start || e.timestamp;
      end = e.timestamp;
    }
    if (e.isSidechain) continue;
    if (e.type === 'user') {
      const t = promptText(e);
      if (t) prompts.push(t);
      continue;
    }
    if (e.type !== 'assistant' || !e.message) continue;
    const m = e.message;
    if (m.usage && m.id && !seen.has(m.id) && m.model !== '<synthetic>') {
      seen.add(m.id);
      usd += requestUsd(m.usage, m.model);
      model = m.model || model;
    }
    for (const b of Array.isArray(m.content) ? m.content : []) {
      if (b.type === 'text' && b.text.trim()) lastText = b.text;
      if (b.type !== 'tool_use') continue;
      const fp = b.input?.file_path || b.input?.notebook_path;
      if (fp && /^(?:Edit|Write|MultiEdit|NotebookEdit)$/.test(b.name)) {
        const rel = meta.root ? relative(meta.root, String(fp)) : String(fp);
        files.add(rel && !rel.startsWith('..') ? rel : String(fp));
      }
      if (b.name === 'Bash' && b.input?.command) {
        const c = clip(String(b.input.command), 140);
        if (!commands.includes(c)) commands.push(c);
      }
    }
  }
  const title = prompts.length ? clip(prompts[0], 90) : 'Untitled session';
  const day = (end || new Date().toISOString()).slice(0, 10);
  const list = (/** @type {string[]} */ xs, n = 12) => (xs.length ? xs.slice(-n).map((x) => `- ${x}`).join('\n') + (xs.length > n ? `\n- … ${xs.length - n} earlier` : '') : '- none');
  return [
    '---',
    `project: ${meta.project}`,
    `session: ${meta.session}`,
    `date: ${day}`,
    `start: ${start}`,
    `end: ${end}`,
    `model: ${model || 'unknown'}`,
    `api_value_usd: ${usd.toFixed(2)}`,
    'tags: [session]',
    '---',
    '',
    `# ${title}`,
    '',
    `API value of this session: ${fmtMoney(usd * meta.rate, meta.currency)}. Written automatically by token-kit from the transcript; edit freely.`,
    '',
    '## What was asked',
    '',
    list(prompts.map((p) => clip(p, 220)), 8),
    '',
    '## Files changed',
    '',
    list([...files].map((f) => `\`${f}\``), 25),
    '',
    '## Commands',
    '',
    list(commands.map((c) => `\`${c.replace(/`/g, "'")}\``), 12),
    '',
    '## Last answer (excerpt)',
    '',
    lastText ? `> ${clip(lastText, 700)}` : '> none',
    '',
  ].join('\n');
}

/** @param {string} vault @param {string} project @param {string} day @param {string} session */
export function notePath(vault, project, day, session) {
  return join(vault, 'sessions', project, `${day}-${session.slice(0, 8)}.md`);
}

/**
 * Lists Markdown files under the vault, skipping tooling folders.
 * @param {string} dir
 * @returns {string[]}
 */
function markdownFiles(dir) {
  /** @type {string[]} */
  const out = [];
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const n of names) {
    if (n.startsWith('.') || n === 'node_modules') continue;
    const p = join(dir, n);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...markdownFiles(p));
    else if (n.endsWith('.md')) out.push(p);
  }
  return out;
}

/**
 * Searches the vault and returns a short, ranked excerpt: rules and project notes first, then the newest sessions.
 * @param {string} vault
 * @param {string} query words that must all appear on a line (case-insensitive)
 * @param {{ project?: string, maxLines?: number }} [opt]
 */
export function recall(vault, query, opt = {}) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const max = opt.maxLines ?? 40;
  const rank = (/** @type {string} */ rel) => (rel.startsWith('rules') ? 0 : rel.startsWith('projects') ? 1 : 2);
  const files = markdownFiles(vault)
    .map((f) => ({ f, rel: relative(vault, f), mtime: statSync(f).mtimeMs }))
    .filter(({ rel }) => !opt.project || !rel.startsWith('sessions') || rel.startsWith(join('sessions', opt.project)))
    .sort((a, b) => rank(a.rel) - rank(b.rel) || b.mtime - a.mtime);
  /** @type {string[]} */
  const out = [];
  let total = 0;
  for (const { f, rel } of files) {
    const lines = readFileSync(f, 'utf8').split('\n');
    const hits = lines.map((l, i) => ({ l, i })).filter(({ l }) => words.every((w) => l.toLowerCase().includes(w)));
    if (!hits.length) continue;
    total += hits.length;
    for (const { l, i } of hits) {
      if (out.length >= max) break;
      out.push(`${rel}:${i + 1}: ${clip(l, 200)}`);
    }
  }
  if (total > out.length) out.push(`… ${total - out.length} more matches; narrow the query or open the files above`);
  return out;
}

/**
 * Creates the vault skeleton. Never overwrites existing files.
 * @param {string} dir
 * @param {string} templatesDir
 * @param {string[]} projects
 */
export function initVault(dir, templatesDir, projects) {
  /** @type {string[]} */
  const created = [];
  const put = (/** @type {string} */ rel, /** @type {string} */ content) => {
    const p = join(dir, rel);
    if (existsSync(p)) return;
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, content);
    created.push(rel);
  };
  for (const name of ['README.md', 'rules/README.md', '.gitignore']) put(name, readFileSync(join(templatesDir, name), 'utf8'));
  const projectTemplate = readFileSync(join(templatesDir, 'projects', '_template.md'), 'utf8');
  for (const p of projects) put(join('projects', `${p}.md`), projectTemplate.replaceAll('{{project}}', p));
  put(join('sessions', '.gitkeep'), '');
  return created;
}
