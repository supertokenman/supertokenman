#!/usr/bin/env node
// @ts-check
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { KIT_DIR, claudeDir, dataDir, configPath, stableNode } from '../lib/paths.mjs';
import { DEFAULTS, loadConfig, mergeConfig, resetConfigCache } from '../lib/config.mjs';
import { initVault, recall, vaultPath } from '../lib/vault.mjs';
import { applyKit, removeKit, isRtkHook } from '../lib/settings.mjs';
import { readStats } from '../lib/store.mjs';
import { analyzeFile, findTranscripts, summarize } from '../lib/analyze.mjs';
import { which } from '../lib/rtk.mjs';
import { computeBar, renderSwiftBar } from '../lib/bar.mjs';
import { usdRate, fmtMoney } from '../lib/money.mjs';

const CCUSAGE = 'ccusage@20.0.26';
const RTK_VERSION = 'v1.0.1';
const PARTS = ['bin', 'hooks', 'lib', 'statusline', 'templates', 'package.json'];
const KIT_BLOCK = /<!-- token-kit:(?:start|inicio) -->[\s\S]*?<!-- token-kit:(?:end|fim) -->\n?/;

const [cmd = 'help', ...rest] = process.argv.slice(2);
/** @param {string} name */
const flag = (name) => rest.includes(`--${name}`);
/** @param {string} name @param {string} [def] */
const opt = (name, def) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 && rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[i + 1] : def;
};
const k = (/** @type {number} */ n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 1e4 ? 0 : 1)}k` : String(Math.round(n)));

/** @param {string} p */
function readJson(p) {
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    console.error(`Could not read ${p} as JSON (${/** @type {Error} */ (e).message}). Fix the file first; nothing was changed.`);
    process.exit(1);
  }
}

/** @param {string} p @param {unknown} v */
function writeJson(p, v) {
  mkdirSync(dirname(p), { recursive: true });
  if (existsSync(p)) copyFileSync(p, `${p}.bak-token-kit`);
  writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
}

function install() {
  const dest = dataDir();
  const settingsPath = opt('settings', join(claudeDir(), 'settings.json')) || '';
  const dry = flag('dry-run');
  if (Number(process.versions.node.split('.')[0]) < 18) {
    console.error('Requires Node 18 or newer.');
    process.exit(1);
  }
  if (!dry) {
    mkdirSync(dest, { recursive: true });
    if (resolve(KIT_DIR) !== resolve(dest)) for (const p of PARTS) cpSync(join(KIT_DIR, p), join(dest, p), { recursive: true });
    const current = existsSync(configPath()) ? readJson(configPath()) : DEFAULTS;
    const preset = opt('config');
    let next = preset ? mergeConfig(current, readJson(preset)) : current;
    if (opt('vault')) next = mergeConfig(next, { vault: { path: opt('vault') } });
    writeFileSync(configPath(), JSON.stringify(next, null, 2) + '\n');
    resetConfigCache();
    if (preset) console.log(`preset ${preset} merged into ${configPath()}`);
  }
  const { settings, notes } = applyKit(readJson(settingsPath), {
    kitDir: dest,
    statusline: !flag('no-statusline'),
    forceStatusline: flag('force-statusline'),
    replaceRtkHook: flag('replace-rtk-hook'),
    subagentModel: opt('subagent-model'),
    effort: opt('effort'),
    bashMaxChars: opt('bash-max-chars') ? Number(opt('bash-max-chars')) : undefined,
  });
  if (dry) {
    console.log(JSON.stringify(settings, null, 2));
    return;
  }
  writeJson(settingsPath, settings);
  if (flag('claude-md')) addClaudeMd();

  console.log(`token-kit installed in ${dest}`);
  console.log(`settings: ${settingsPath} (backup at ${settingsPath}.bak-token-kit)`);
  console.log('hooks: pre-bash (RTK + condenser), post-bash (safety net), read-guard, prompt-nudge');
  if (!which('rtk')) console.log('RTK not found: the kit works without it, but install it to compress git/ls/grep etc. (https://github.com/rtk-ai/rtk)');
  for (const n of notes) console.log(`note: ${n}`);
  console.log('Restart the Claude Code session to load the hooks. Then run `tk doctor`.');
}

function addClaudeMd() {
  const p = join(claudeDir(), 'CLAUDE.md');
  let snippet = readFileSync(join(KIT_DIR, 'templates', 'CLAUDE.token-saving.md'), 'utf8');
  const vault = loadConfig().vault.path;
  if (vault)
    snippet = snippet.replace(
      '<!-- token-kit:end -->',
      `- Memory vault at \`${vault}\`: when starting work on a project, read \`projects/<repo name>.md\` there; search past sessions with \`node ${join(dataDir(), 'bin', 'tk.mjs')} recall <words>\`. Update the project note when a decision or next step changes. Commit vault changes and push them straight to the vault's main branch: no branch, no pull request.\n<!-- token-kit:end -->`,
    );
  const cur = existsSync(p) ? readFileSync(p, 'utf8') : '';
  // also matches the Portuguese markers written by earlier versions
  const next = KIT_BLOCK.test(cur)
    ? cur.replace(KIT_BLOCK, snippet)
    : `${cur}${cur && !cur.endsWith('\n') ? '\n' : ''}${cur ? '\n' : ''}${snippet}`;
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, next);
  console.log(`token-saving rules added to ${p}`);
}

function uninstall() {
  const settingsPath = opt('settings', join(claudeDir(), 'settings.json')) || '';
  writeJson(settingsPath, removeKit(readJson(settingsPath)));
  const md = join(claudeDir(), 'CLAUDE.md');
  if (existsSync(md)) {
    const cur = readFileSync(md, 'utf8');
    if (KIT_BLOCK.test(cur)) writeFileSync(md, cur.replace(new RegExp(`\\n?${KIT_BLOCK.source}`), '\n'));
  }
  if (flag('purge')) rmSync(dataDir(), { recursive: true, force: true });
  console.log(`token-kit removed from ${settingsPath}${flag('purge') ? ` and ${dataDir()} deleted` : ''}.`);
  console.log('Settings install may have added (CLAUDE_CODE_SUBAGENT_MODEL, effortLevel, bashOutputMaxChars) were kept: remove them by hand if you want.');
}

function doctor() {
  let ok = true;
  const check = (/** @type {boolean} */ cond, /** @type {string} */ good, /** @type {string} */ bad) => {
    console.log(`${cond ? 'ok ' : 'FAIL'} ${cond ? good : bad}`);
    if (!cond) ok = false;
  };
  const settingsPath = opt('settings', join(claudeDir(), 'settings.json')) || '';
  const s = readJson(settingsPath);
  const cmds = Object.values(s.hooks || {}).flat().flatMap((/** @type {any} */ e) => (e.hooks || []).map((/** @type {any} */ h) => String(h.command)));
  check(Number(process.versions.node.split('.')[0]) >= 18, `Node ${process.versions.node}`, `Node ${process.versions.node}: requires 18+`);
  check(existsSync(join(dataDir(), 'hooks', 'pre-bash.mjs')), `kit in ${dataDir()}`, `kit not found in ${dataDir()}: run tk install`);
  for (const h of ['pre-bash', 'post-bash', 'read-guard', 'prompt-nudge', 'session-note'])
    check(cmds.some((c) => c.includes(`${h}.mjs`)), `hook ${h} configured`, `hook ${h} missing from ${settingsPath}`);
  const rtk = which('rtk');
  console.log(`${rtk ? 'ok ' : '-- '} RTK ${rtk ? `at ${rtk}` : 'not installed (optional)'}`);
  const rtkHook = Object.values(s.hooks || {}).flat().some(isRtkHook);
  check(!rtkHook, 'no duplicate RTK hook', 'RTK\'s own hook is also installed: run tk install --replace-rtk-hook');
  console.log(`${String(s.statusLine?.command || '').includes('token-kit') ? 'ok ' : '-- '} statusline ${s.statusLine ? s.statusLine.command : 'none'}`);

  // end-to-end test of the installed hooks
  const pre = join(dataDir(), 'hooks', 'pre-bash.mjs');
  if (existsSync(pre)) {
    const r = spawnSync(process.execPath, [pre], { input: JSON.stringify({ tool_input: { command: 'npm test' } }), encoding: 'utf8' });
    let out = {};
    try {
      out = JSON.parse(r.stdout);
    } catch {
      // empty
    }
    const c = /** @type {any} */ (out).hookSpecificOutput?.updatedInput?.command || '';
    check(c.includes('tk-condense'), 'pre-bash wraps `npm test`', `pre-bash did not respond as expected: ${r.stdout || r.stderr}`);
  }
  try {
    loadConfig();
    check(true, `config ${configPath()}`, '');
  } catch (e) {
    check(false, '', `invalid config: ${e}`);
  }
  process.exit(ok ? 0 : 1);
}

function stats() {
  const days = Number(opt('days', '7'));
  const entries = readStats(days);
  if (!entries.length) {
    console.log(`Nothing recorded in the last ${days} days.`);
    return;
  }
  /** @type {Record<string, { n: number, saved: number }>} */
  const by = {};
  let saved = 0;
  let blocked = 0;
  for (const e of entries) {
    if (e.kind === 'read-guard') {
      blocked++;
      continue;
    }
    const key = `${e.kind}:${e.profile}`;
    const d = Math.max(0, e.inChars - e.outChars);
    by[key] = by[key] || { n: 0, saved: 0 };
    by[key].n++;
    by[key].saved += d;
    saved += d;
  }
  console.log(`Last ${days} days: ~${k(saved / 4)} fewer tokens in context (estimate: chars/4).`);
  for (const [key, v] of Object.entries(by).sort((a, b) => b[1].saved - a[1].saved)) console.log(`  ${key.padEnd(22)} ${String(v.n).padStart(5)}x  ~${k(v.saved / 4)} tokens`);
  if (blocked) console.log(`  read-guard: ${blocked} full read(s) of large files blocked`);
  console.log('Every token kept out of context is also not re-read on later messages, so the real savings are larger.');
}

function analyze() {
  const days = Number(opt('days', '30'));
  const root = opt('path', join(claudeDir(), 'projects')) || '';
  const files = findTranscripts(root, days);
  const sessions = files.map(analyzeFile).filter((s) => s !== null);
  if (!sessions.length) {
    console.log(`No transcripts in ${root} in the last ${days} days.`);
    return;
  }
  const r = summarize(/** @type {any} */ (sessions), Number(opt('top', '15')));
  const m = loadConfig().money;
  const fx = usdRate(m);
  const $ = (/** @type {number} */ usd) => fmtMoney(usd * fx.rate, m.currency);
  if (flag('json')) {
    console.log(JSON.stringify({ ...r, longest: r.longest.map(({ items, ...s }) => s) }, null, 2));
    return;
  }
  console.log(`${r.mainSessions} session(s) + ${r.sessions - r.mainSessions} subagent, ${r.requests} requests, last ${days} days.`);
  console.log(`API value of this usage: ${$(r.total)} (US$ ${r.total.toFixed(2)} at list prices, US$1 = ${fmtMoney(fx.rate, m.currency)}).`);
  console.log('On a subscription this is not what you pay; it is what the same work would cost on the API.\n');
  console.log('Where the cost went:');
  for (const c of r.cats.filter((c) => c.pct >= 0.5).slice(0, 20)) console.log(`  ${c.pct.toFixed(1).padStart(5)}%  ${$(c.cost).padStart(9)}  ${c.cat}`);
  console.log('\nMost expensive items (cost includes every re-read until the session ends or compacts):');
  for (const i of r.items) console.log(`  ${$(i.cost).padStart(9)}  ${k(i.tokens).padStart(5)} tok x${String(i.reads).padEnd(4)} ${i.cat}  ${String(i.detail).slice(0, 90)}`);
  console.log('\nMost expensive sessions:');
  for (const s of r.longest)
    console.log(`  ${$(s.cost).padStart(9)}  ${s.start.slice(0, 10)}  ${String(s.requests).padStart(4)} req  peak ${k(s.peakContext).padStart(5)}  fixed ${k(s.fixedContext).padStart(4)}  ${s.compactions} compactions  ${s.rebuilds} cache rebuilds  ${s.file.split(/[\\/]/).slice(-2).join('/')}`);
  console.log('\nRecommendations:');
  for (const t of r.tips.length ? r.tips : ['Nothing unusual. Keep using /clear between topics.']) console.log(`  - ${t}`);
}

/** Rough token estimate for a text file. */
const fileTokens = (/** @type {string} */ p) => (existsSync(p) ? Math.round(statSync(p).size / 3.5) : 0);

function audit() {
  const dir = resolve(opt('dir', process.cwd()) || '.');
  const user = readJson(join(claudeDir(), 'settings.json'));
  const claudeJson = readJson(join(dirname(claudeDir()), '.claude.json'));
  console.log('Loaded on every message (estimate: chars/3.5):\n');
  /** @type {string[]} */
  const mds = [join(claudeDir(), 'CLAUDE.md')];
  for (let d = dir; ; d = dirname(d)) {
    mds.push(join(d, 'CLAUDE.md'), join(d, 'CLAUDE.local.md'), join(d, '.claude', 'CLAUDE.md'));
    if (dirname(d) === d) break;
  }
  let total = 0;
  for (const p of [...new Set(mds)]) {
    const t = fileTokens(p);
    if (t) console.log(`  ${k(t).padStart(6)} tok  ${p}`);
    total += t;
  }
  const plugins = Object.entries(user.enabledPlugins || {}).filter(([, v]) => v);
  console.log(`\n  plugins enabled in ~/.claude/settings.json: ${plugins.length ? plugins.map(([n]) => n).join(', ') : 'none'}`);
  const mcpUser = Object.keys(claudeJson.mcpServers || {});
  const mcpProj = Object.keys(claudeJson.projects?.[dir]?.mcpServers || {});
  const mcpFile = Object.keys(readJson(join(dir, '.mcp.json')).mcpServers || {});
  console.log(`  MCP (user): ${mcpUser.join(', ') || 'none'}`);
  console.log(`  MCP (project): ${[...mcpProj, ...mcpFile].join(', ') || 'none'}`);
  for (const sk of [join(claudeDir(), 'skills'), join(dir, '.claude', 'skills')]) {
    let n = 0;
    try {
      n = readdirSync(sk).length;
    } catch {
      // no skills
    }
    if (n) console.log(`  skills in ${sk}: ${n} (only each one's description stays in context)`);
  }
  console.log(`\nCLAUDE.md files total: ~${k(total)} tokens.`);
  console.log('\nTo see the real context and what weighs on your limits, also use in Claude Code:');
  console.log('  /context       what fills the window right now');
  console.log('  /usage         plan usage and what contributes most');
  console.log('  /doctor        finds unused skills, MCP servers and plugins, trims CLAUDE.md');
  console.log('  /skill-doctor  loaded skills you do not use');
  console.log('claude.ai plugins and connectors (Desktop/cloud) are turned off in claude.ai > Settings > Connectors/Plugins.');
}

function usage() {
  const r = spawnSync('npx', ['-y', CCUSAGE, ...(rest.length ? rest : ['daily'])], { stdio: 'inherit', shell: process.platform === 'win32' });
  process.exit(r.status ?? 1);
}

/** Self-contained setup script for cloud environments: the kit is embedded, with no network or repo access needed. */
function cloudScript() {
  const tar = spawnSync('tar', ['czf', '-', ...PARTS], { cwd: KIT_DIR, maxBuffer: 64 * 1024 * 1024 });
  if (tar.status !== 0) {
    console.error(`tar failed: ${tar.stderr}`);
    process.exit(1);
  }
  const b64 = tar.stdout.toString('base64').replace(/.{76}/g, '$&\n');
  const pkg = JSON.parse(readFileSync(join(KIT_DIR, 'package.json'), 'utf8'));
  const presetPath = opt('config');
  const preset = presetPath ? JSON.stringify(readJson(presetPath), null, 2) : '';
  const args = rest
    .filter((a, i) => a !== '--no-rtk' && a !== '--config' && rest[i - 1] !== '--config')
    .concat(preset ? ['--config', '"$TK_SRC/preset.json"'] : [])
    .join(' ') || '--claude-md';
  const rtk = flag('no-rtk')
    ? ''
    : [
        '# RTK (optional): pinned version because the GitHub API often refuses the latest-version lookup during setup',
        `if ! command -v rtk >/dev/null 2>&1; then`,
        `  (curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | RTK_VERSION=${RTK_VERSION} sh) >/dev/null 2>&1 \\`,
        '    && ln -sf "$HOME/.local/bin/rtk" /usr/local/bin/rtk 2>/dev/null || echo "token-kit: RTK not installed (the kit works without it)" >&2',
        'fi',
      ].join('\n');
  process.stdout.write(
    [
      '#!/bin/bash',
      `# token-kit ${pkg.version}: paste into the "Setup script" of a Claude Code cloud environment.`,
      '# Generated by `tk cloud-script`. Never fails: if something goes wrong, the session starts without the kit.',
      'set -u',
      'TK_SRC="$(mktemp -d)"',
      `base64 -d > "$TK_SRC/kit.tgz" <<'TOKEN_KIT_B64'`,
      b64,
      'TOKEN_KIT_B64',
      ...(preset ? [`cat > "$TK_SRC/preset.json" <<'TOKEN_KIT_PRESET'`, preset, 'TOKEN_KIT_PRESET'] : []),
      `tar xzf "$TK_SRC/kit.tgz" -C "$TK_SRC" && node "$TK_SRC/bin/tk.mjs" install ${args} || echo "token-kit: install failed" >&2`,
      rtk,
      'rm -rf "$TK_SRC"',
      'exit 0',
      '',
    ].join('\n'),
  );
}

/** Path of the installed tk (the menu bar plugin must survive moving the repository). */
const installedTk = () => (existsSync(join(dataDir(), 'bin', 'tk.mjs')) ? join(dataDir(), 'bin', 'tk.mjs') : join(KIT_DIR, 'bin', 'tk.mjs'));

function bar() {
  const d = computeBar(opt('path', join(claudeDir(), 'projects')) || '');
  const m = loadConfig().money;
  const money = { ...usdRate(m), currency: m.currency, planMonthlyUsd: m.planMonthlyUsd };
  if (flag('json')) console.log(JSON.stringify({ ...d, money }, null, 2));
  else process.stdout.write(renderSwiftBar(d, { node: stableNode(), tk: installedTk() }, money));
}

/** Installs the SwiftBar (or xbar) plugin: a script that runs `tk bar` every 5 minutes. */
function installBar() {
  let dir = opt('dir');
  if (!dir && process.platform === 'darwin') {
    const r = spawnSync('defaults', ['read', 'com.ameba.SwiftBar', 'PluginDirectory'], { encoding: 'utf8' });
    dir = r.status === 0 ? r.stdout.trim() : undefined;
  }
  if (!dir) {
    console.error('Could not find the SwiftBar plugin folder. Install it with `brew install --cask swiftbar`, open the app, choose a plugin folder and run this again (or pass --dir <folder>).');
    process.exit(1);
  }
  const file = join(dir, 'token-kit.5m.sh');
  const q = (/** @type {string} */ s) => `'${s.replace(/'/g, `'\\''`)}'`;
  writeFileSync(
    file,
    [
      '#!/bin/bash',
      '# <xbar.title>token-kit</xbar.title>',
      '# <xbar.desc>Real usage vs token-kit savings in Claude Code</xbar.desc>',
      '# <swiftbar.hideAbout>true</swiftbar.hideAbout>',
      '# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>',
      '# <swiftbar.hideDisablePlugin>true</swiftbar.hideDisablePlugin>',
      '# <swiftbar.hideLastUpdated>true</swiftbar.hideLastUpdated>',
      '# <swiftbar.hideSwiftBar>true</swiftbar.hideSwiftBar>',
      `exec ${q(stableNode())} ${q(installedTk())} bar`,
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  console.log(`plugin installed: ${file} (refreshes every 5 min; the file name sets the interval)`);
}

/** Creates the vault skeleton and points the kit at it. */
function vaultCmd() {
  if (rest[0] !== 'init' || !rest[1]) {
    console.error('usage: tk vault init <folder> [--projects name1,name2]');
    process.exit(1);
  }
  const dir = resolve(vaultPath(rest[1]));
  const projects = (opt('projects') || '').split(',').filter(Boolean);
  const created = initVault(dir, join(KIT_DIR, 'templates', 'vault'), projects);
  const current = existsSync(configPath()) ? readJson(configPath()) : DEFAULTS;
  mkdirSync(dataDir(), { recursive: true });
  writeFileSync(configPath(), JSON.stringify(mergeConfig(current, { vault: { path: dir } }), null, 2) + '\n');
  resetConfigCache();
  console.log(`vault ready at ${dir}${created.length ? ` (created ${created.join(', ')})` : ' (already existed)'}`);
  console.log('Session notes are written there after every reply. Re-run `tk install --claude-md` so Claude knows where the vault is.');
}

function recallCmd() {
  const vault = vaultPath(loadConfig().vault.path);
  const query = rest.filter((a, i) => !a.startsWith('--') && rest[i - 1] !== '--project').join(' ');
  if (!vault || !query) {
    console.error(vault ? 'usage: tk recall <words> [--project name]' : 'No vault configured: run `tk vault init <folder>` first.');
    process.exit(1);
  }
  const lines = recall(vault, query, { project: opt('project') });
  console.log(lines.length ? lines.join('\n') : `No matches for "${query}" in ${vault}.`);
}

function help() {
  console.log(`token-kit: token savings for Claude Code

  tk install [--claude-md] [--config preset.json] [--vault folder] [--effort low] [--subagent-model sonnet] [--bash-max-chars 20000]
             [--no-statusline | --force-statusline] [--replace-rtk-hook] [--settings file] [--dry-run]
  tk uninstall [--purge]
  tk doctor                 checks the install and tests the hooks
  tk analyze [--days 30] [--path dir|file.jsonl] [--top 15] [--json]
                            reads your transcripts and shows where the cost went
  tk stats [--days 7]       how much the kit kept out of context
  tk audit [--dir .]        what is loaded on every message (CLAUDE.md, plugins, MCP, skills)
  tk usage [args]           ccusage (cost per day/session from local logs)
  tk condense --profile test < output.txt
  tk vault init <folder> [--projects a,b]
                            creates the memory vault (rules, projects, sessions)
  tk recall <words> [--project name]
                            searches the vault and prints matching lines only
  tk bar [--json]           menu bar numbers (SwiftBar/xbar format)
  tk install-bar [--dir <plugin folder>]
                            installs the SwiftBar plugin
  tk cloud-script [--no-rtk] [install options] > setup.sh
                            self-contained setup script for cloud sessions (Desktop, web, mobile)`);
}

/** @type {Record<string, () => void>} */
const commands = {
  install,
  uninstall,
  doctor,
  stats,
  analyze,
  audit,
  usage,
  'cloud-script': cloudScript,
  bar,
  'install-bar': installBar,
  vault: vaultCmd,
  recall: recallCmd,
  condense: () => {
    process.argv = [process.argv[0], join(KIT_DIR, 'bin', 'tk-condense.mjs'), ...rest];
    import('./tk-condense.mjs');
  },
  help,
};
(commands[cmd] || help)();
