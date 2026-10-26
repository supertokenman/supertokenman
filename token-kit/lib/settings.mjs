// @ts-check
import { join } from 'node:path';
import { condenseInvocation } from './paths.mjs';

const MARK = /token-kit[\\/](?:hooks|statusline)[\\/]/;

/** @param {string} kitDir @param {string} rel */
const nodeCmd = (kitDir, rel) => {
  const p = join(kitDir, rel);
  return /\s/.test(p) ? `node "${p}"` : `node ${p}`;
};

/**
 * The kit's hooks in settings.json format.
 * @param {string} kitDir
 */
export function kitHooks(kitDir) {
  const h = (/** @type {string} */ rel, timeout = 10) => ({ type: 'command', command: nodeCmd(kitDir, rel), timeout });
  // background: writing the session note must never delay the next prompt
  const bg = (/** @type {string} */ rel) => ({ type: 'command', command: nodeCmd(kitDir, rel), async: true });
  return {
    PreToolUse: [
      { matcher: 'Bash', hooks: [h('hooks/pre-bash.mjs')] },
      { matcher: 'Read', hooks: [h('hooks/read-guard.mjs')] },
    ],
    PostToolUse: [{ matcher: 'Bash', hooks: [h('hooks/post-bash.mjs')] }],
    UserPromptSubmit: [{ hooks: [h('hooks/prompt-nudge.mjs', 5)] }],
    Stop: [{ hooks: [bg('hooks/session-note.mjs')] }],
  };
}

/**
 * Rules so the wrapper does not trigger extra permission prompts.
 * @param {string} kitDir
 */
export function kitAllowRules(kitDir) {
  return ['Bash(set -o pipefail)', `Bash(${condenseInvocation(kitDir)} *)`];
}

/** @param {any} entry */
const isOurs = (entry) => (entry.hooks || []).some((/** @type {any} */ h) => MARK.test(String(h.command || '')));
/** @param {any} entry */
export const isRtkHook = (entry) => (entry.hooks || []).some((/** @type {any} */ h) => /rtk-rewrite|\brtk\s+hook\b/.test(String(h.command || '')) && !MARK.test(String(h.command || '')));

/**
 * @typedef {object} ApplyOptions
 * @property {string} kitDir
 * @property {boolean} [statusline]      install the statusline if there is none
 * @property {boolean} [forceStatusline] replace an existing statusline
 * @property {boolean} [replaceRtkHook]  remove RTK's own hook (the kit calls RTK itself)
 * @property {string} [subagentModel]
 * @property {string} [effort]
 * @property {number} [bashMaxChars]
 */

/**
 * Removes what the kit added to settings (hooks, rules, statusline). Leaves everything else alone.
 * @param {any} settings
 */
export function removeKit(settings) {
  const s = structuredClone(settings || {});
  for (const ev of Object.keys(s.hooks || {})) {
    s.hooks[ev] = s.hooks[ev].filter((/** @type {any} */ e) => !isOurs(e));
    if (!s.hooks[ev].length) delete s.hooks[ev];
  }
  if (s.hooks && !Object.keys(s.hooks).length) delete s.hooks;
  if (s.permissions?.allow) {
    s.permissions.allow = s.permissions.allow.filter((/** @type {string} */ r) => !/tk-condense\.mjs|^Bash\(set -o pipefail\)$/.test(r));
    if (!s.permissions.allow.length) delete s.permissions.allow;
    if (!Object.keys(s.permissions).length) delete s.permissions;
  }
  if (s.statusLine && MARK.test(String(s.statusLine.command || ''))) delete s.statusLine;
  return s;
}

/**
 * Applies the kit to settings idempotently. Returns the new object and notes.
 * @param {any} settings
 * @param {ApplyOptions} opt
 * @returns {{ settings: any, notes: string[] }}
 */
export function applyKit(settings, opt) {
  const s = removeKit(settings);
  /** @type {string[]} */
  const notes = [];
  s.hooks = s.hooks || {};
  if (opt.replaceRtkHook) {
    for (const ev of Object.keys(s.hooks)) {
      const before = s.hooks[ev].length;
      s.hooks[ev] = s.hooks[ev].filter((/** @type {any} */ e) => !isRtkHook(e));
      if (s.hooks[ev].length < before) notes.push(`removed RTK's own hook from ${ev} (the kit calls RTK itself)`);
      if (!s.hooks[ev].length) delete s.hooks[ev];
    }
  } else if (Object.values(s.hooks).some((list) => /** @type {any[]} */ (list).some(isRtkHook))) {
    notes.push('an RTK hook is installed: two hooks rewriting the same command conflict. Run again with --replace-rtk-hook or turn RTK off in the kit (rtk.mode = "off").');
  }
  for (const [ev, entries] of Object.entries(kitHooks(opt.kitDir))) s.hooks[ev] = [...(s.hooks[ev] || []), ...entries];

  s.permissions = s.permissions || {};
  s.permissions.allow = [...new Set([...(s.permissions.allow || []), ...kitAllowRules(opt.kitDir)])];

  if (opt.statusline !== false) {
    if (!s.statusLine || opt.forceStatusline) s.statusLine = { type: 'command', command: nodeCmd(opt.kitDir, 'statusline/statusline.mjs'), padding: 0 };
    else notes.push('you already have a statusline; the kit\'s was not installed (use --force-statusline to replace it).');
  }
  if (opt.subagentModel) s.env = { ...(s.env || {}), CLAUDE_CODE_SUBAGENT_MODEL: opt.subagentModel };
  if (opt.effort) s.effortLevel = opt.effort;
  if (opt.bashMaxChars) s.bashOutputMaxChars = opt.bashMaxChars;
  return { settings: s, notes };
}
