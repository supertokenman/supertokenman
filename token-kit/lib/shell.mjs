// @ts-check

/**
 * @typedef {object} Segment
 * @property {number} start  index in the original command
 * @property {number} end    exclusive
 * @property {string} text   text without surrounding whitespace
 * @property {string} before separator before it ('' at the start)
 * @property {string} after  separator after it ('' at the end)
 * @property {boolean} plain no redirection, subshell or control construct
 */

const CONTROL = /^(?:if|then|else|elif|fi|for|while|until|do|done|case|esac|function|select|\{|\}|\(|\)|!)(?:\s|$)/;

/**
 * Splits a command on top-level separators (&&, ||, ;, |, |&, &).
 * Respects quotes, escapes, $(...), `...`, (...) and {...}.
 * Returns null when it cannot be parsed safely (heredoc, newline, unclosed quotes).
 * @param {string} cmd
 * @returns {Segment[] | null}
 */
export function splitTopLevel(cmd) {
  if (/\n/.test(cmd.trim()) || /<<(?!<)/.test(cmd)) return null;
  /** @type {Segment[]} */
  const segs = [];
  let depth = 0;
  let quote = '';
  let segStart = 0;
  let before = '';
  let plain = true;

  const push = (/** @type {number} */ end, /** @type {string} */ after) => {
    const raw = cmd.slice(segStart, end);
    const lead = raw.length - raw.trimStart().length;
    const text = raw.trim();
    segs.push({ start: segStart + lead, end: segStart + lead + text.length, text, before, after, plain: plain && !CONTROL.test(text) });
    before = after;
    plain = true;
  };

  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (quote) {
      if (c === '\\' && quote === '"') i++;
      else if (c === quote) quote = '';
      continue;
    }
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      if (c === '`') plain = false;
      continue;
    }
    if (c === '$' && cmd[i + 1] === '(') {
      depth++;
      i++;
      plain = false;
      continue;
    }
    if (c === '(' || c === '{') {
      // `{` only opens a group at the start of a command; `${VAR}` is an expansion
      if (c === '{' && cmd[i - 1] === '$') {
        const close = cmd.indexOf('}', i);
        if (close > 0) i = close;
        continue;
      }
      depth++;
      plain = false;
      continue;
    }
    if (c === ')' || c === '}') {
      if (depth > 0) depth--;
      continue;
    }
    if (depth > 0) continue;
    if (c === '>' || c === '<') {
      // `2>&1`, `>&2`, `>|`: the & and | here are part of the redirection
      plain = false;
      if (cmd[i + 1] === '&' || cmd[i + 1] === '|') i++;
      continue;
    }
    if (c === '&' && cmd[i + 1] === '>') {
      plain = false;
      i++;
      continue;
    }
    if (c === '#' && (i === 0 || /\s/.test(cmd[i - 1]))) {
      // comment until the end: stop
      push(i, '');
      return quote ? null : segs.filter((s, k) => s.text || k < segs.length - 1);
    }
    const two = cmd.slice(i, i + 2);
    if (two === '&&' || two === '||' || two === '|&') {
      push(i, two);
      segStart = i + 2;
      i++;
      continue;
    }
    if (c === ';' || c === '|' || c === '&') {
      push(i, c);
      segStart = i + 1;
      continue;
    }
  }
  if (quote || depth !== 0) return null;
  push(cmd.length, '');
  return segs.filter((s, k) => s.text || k < segs.length - 1);
}

/** Shell-safe single quoting. */
export function shq(s) {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Wraps the chosen segments: `seg 2>&1 | node condense --profile X`.
 * Segments that are part of a pipeline or run in the background are left alone.
 * `cd` and `export` stay in the main shell, because only the segment becomes a pipeline.
 * @param {string} cmd
 * @param {(seg: Segment) => string | null} chooseProfile returns the profile name or null
 * @param {string} condenseCmd e.g. `node /home/x/.claude/token-kit/bin/tk-condense.mjs`
 * @param {string} [session] session id, passed to the condenser for stats
 * @returns {{ command: string, wrapped: string[] } | null}
 */
export function wrapCommand(cmd, chooseProfile, condenseCmd, session) {
  const segs = splitTopLevel(cmd);
  if (!segs) return null;
  /** @type {Array<{ seg: Segment, profile: string }>} */
  const picks = [];
  for (const original of segs) {
    let seg = original;
    // `npm test 2>&1` is common and equivalent to what the wrapper already does
    if (!seg.plain && /\s2>&1$/.test(seg.text)) {
      const text = seg.text.replace(/\s+2>&1$/, '');
      const inner = splitTopLevel(text);
      if (inner && inner.length === 1 && inner[0].plain) seg = { ...seg, text, plain: true };
    }
    if (!seg.plain || !seg.text) continue;
    if (seg.before === '|' || seg.before === '|&' || seg.after === '|' || seg.after === '|&' || seg.after === '&') continue;
    const profile = chooseProfile(seg);
    if (profile) picks.push({ seg, profile });
  }
  if (!picks.length) return null;
  const sessionArg = session && /^[A-Za-z0-9_-]{1,80}$/.test(session) ? ` --session ${session}` : '';
  let out = cmd;
  for (const { seg, profile } of [...picks].reverse()) {
    out = `${out.slice(0, seg.start)}${seg.text} 2>&1 | ${condenseCmd} --profile ${shq(profile)}${sessionArg}${out.slice(seg.end)}`;
  }
  return { command: `set -o pipefail; ${out}`, wrapped: picks.map((p) => p.profile) };
}
