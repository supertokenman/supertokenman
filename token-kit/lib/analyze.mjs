// @ts-check
// Reads Claude Code transcripts (~/.claude/projects/**/*.jsonl) and attributes the cost of each request
// to what was in context: fixed context, tool results by command/file, messages, etc.
//
// Core idea: a tool result does not only cost when it enters. It is re-read (via cache) on every
// following request until the session ends or is compacted. That is why a 20k-token `npm test` at the
// start of a long session can cost more than everything you typed.
//
// Costs are in USD at each model's API list price (lib/pricing.mjs). On a subscription that is the API
// value of the work, not what you are billed; Anthropic does not publish how plan limits weigh each token type.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeForMatch } from './profiles.mjs';
import { splitTopLevel } from './shell.mjs';
import { priceFor } from './pricing.mjs';


export const CAT = {
  fixed: 'Fixed context (system prompt, tools, CLAUDE.md, skills, MCP)',
  model: 'Claude responses kept in context',
  user: 'Your messages',
  thinking: 'Output: thinking',
  output: 'Output: text and tool calls',
  rebuild: 'Lost cache (pause longer than the TTL, model or tool change)',
  compact: 'Summary after compaction',
  other: 'Other (system reminders, attachments)',
};

/**
 * @typedef {object} Item
 * @property {string} cat
 * @property {string} [detail] file or command, for the most expensive items ranking
 * @property {number} chars
 * @property {number} tokens
 * @property {number} cost    accumulated cost (USD)
 * @property {number} reads   how many requests re-read the item
 */

/**
 * @typedef {object} SessionReport
 * @property {string} file
 * @property {boolean} subagent
 * @property {string} start
 * @property {string} end
 * @property {number} requests
 * @property {number} peakContext
 * @property {number} fixedContext
 * @property {number} compactions
 * @property {number} rebuilds
 * @property {number} cost
 * @property {Record<string, number>} byCat
 * @property {Item[]} items
 * @property {Record<string, number>} models
 */

/**
 * Category of a tool result.
 * @param {string} name
 * @param {any} input
 * @returns {{ cat: string, detail?: string }}
 */
export function categorize(name, input = {}) {
  if (name === 'Bash' || name === 'PowerShell') {
    const cmd = String(input.command || '');
    const segs = splitTopLevel(cmd) || [{ text: cmd }];
    const main = segs.map((s) => normalizeForMatch(s.text)).find((t) => t && !/^(?:cd|export|set|source|\.)\s/.test(t) && !/^[A-Za-z_]\w*=\S*$/.test(t)) || cmd;
    const w = main.split(/\s+/);
    const two = /^(?:npm|pnpm|yarn|bun|npx|git|python3?|pip3?|docker|cargo|go|wrangler|node|uv|poetry|kubectl|gh|make)$/.test(w[0]);
    let key = two && w[1] ? `${w[0]} ${w[1]}` : w[0];
    if (/^python3?$/.test(w[0]) && w[1] && /\.py$/.test(w[1])) key = `${w[0]} ${w[1].split('/').pop()}`;
    return { cat: `Bash: ${key.slice(0, 40)}`, detail: cmd.slice(0, 160) };
  }
  if (name === 'Read') {
    const f = String(input.file_path || '');
    const ext = (f.match(/\.[A-Za-z0-9]+$/) || ['(no extension)'])[0];
    return { cat: `Read: ${ext}`, detail: f };
  }
  if (name === 'WebFetch') {
    let host = '';
    try {
      host = new URL(String(input.url)).host;
    } catch {
      // invalid url
    }
    return { cat: `WebFetch: ${host || '?'}`, detail: String(input.url || '') };
  }
  if (name.startsWith('mcp__')) {
    const [, server, tool] = name.split('__');
    return { cat: `MCP: ${server}`, detail: `${server}.${tool}` };
  }
  if (name === 'Agent' || name === 'Task') return { cat: 'Agent: subagent result', detail: String(input.description || '') };
  if (name === 'Skill') return { cat: `Skill: ${input.skill || '?'}`, detail: String(input.skill || '') };
  if (name === 'Grep' || name === 'Glob') return { cat: name, detail: String(input.pattern || '') };
  return { cat: name };
}

/** Size in characters of message content (text, blocks, images). */
function contentChars(c) {
  if (typeof c === 'string') return c.length;
  if (!Array.isArray(c)) return c ? JSON.stringify(c).length : 0;
  let n = 0;
  for (const b of c) {
    if (b.type === 'text') n += (b.text || '').length;
    else if (b.type === 'image') n += 1600 * 3.5; // ~1.6k tokens per image
    else if (b.type === 'tool_result') n += contentChars(b.content);
    else if (b.type === 'document') n += 20000;
    else n += JSON.stringify(b).length;
  }
  return n;
}

/**
 * Analyzes an already-read transcript (JSONL lines in order).
 * @param {any[]} entries
 * @param {string} file
 * @returns {SessionReport}
 */
export function analyzeEntries(entries, file = '') {
  /** @type {Map<string, { name: string, input: any }>} */
  const toolUses = new Map();
  /** @type {Set<string>} */
  const seenMsg = new Set();
  /** @type {Item[]} */
  let inContext = [];
  /** @type {Item[]} */
  const allItems = [];
  /** @type {Array<{ cat: string, detail?: string, chars: number }>} */
  let pending = [];
  /** @type {Record<string, number>} */
  const byCat = {};
  /** @type {Record<string, number>} */
  const models = {};
  const add = (/** @type {string} */ cat, /** @type {number} */ v) => (byCat[cat] = (byCat[cat] || 0) + v);

  let prevCtx = 0;
  let prevVisibleOut = 0;
  let requests = 0;
  let peak = 0;
  let fixed = 0;
  let compactions = 0;
  let rebuilds = 0;
  let subagent = /[\\/]subagents[\\/]/.test(file);
  let start = '';
  let end = '';

  /**
   * @param {string} cat
   * @param {number} tokens
   * @param {number} chars
   * @param {string=} detail
   */
  const newItem = (cat, tokens, chars, detail) => {
    /** @type {Item} */
    const it = { cat, detail, chars, tokens, cost: 0, reads: 0 };
    inContext.push(it);
    allItems.push(it);
    return it;
  };

  for (const e of entries) {
    if (!e || typeof e !== 'object') continue;
    if (e.isSidechain) subagent = true;
    if (e.timestamp) {
      if (!start) start = e.timestamp;
      end = e.timestamp;
    }
    if (e.type === 'system' && e.subtype === 'compact_boundary') compactions++;

    if (e.type === 'attachment') {
      const chars = Array.isArray(e.rendered) ? e.rendered.reduce((n, r) => n + contentChars(r.content), 0) : 0;
      if (chars) pending.push({ cat: CAT.other, chars });
      continue;
    }

    if (e.type === 'user' && e.message) {
      const c = e.message.content;
      if (typeof c === 'string') {
        pending.push({ cat: CAT.user, chars: c.length });
        continue;
      }
      if (!Array.isArray(c)) continue;
      for (const b of c) {
        if (b.type === 'tool_result') {
          const tu = toolUses.get(b.tool_use_id);
          const { cat, detail } = tu ? categorize(tu.name, tu.input) : { cat: 'Unknown tool', detail: undefined };
          pending.push({ cat, detail, chars: contentChars(b.content) });
        } else if (b.type === 'text') {
          pending.push({ cat: e.isMeta ? CAT.other : CAT.user, chars: (b.text || '').length });
        } else {
          pending.push({ cat: CAT.user, chars: contentChars([b]) });
        }
      }
      continue;
    }

    if (e.type !== 'assistant' || !e.message) continue;
    const m = e.message;
    for (const b of Array.isArray(m.content) ? m.content : []) if (b.type === 'tool_use') toolUses.set(b.id, { name: b.name, input: b.input });
    if (!m.usage || !m.id || seenMsg.has(m.id)) continue;
    seenMsg.add(m.id);
    if (m.model === '<synthetic>') continue;

    const u = m.usage;
    const cw = u.cache_creation_input_tokens || 0;
    const cr = u.cache_read_input_tokens || 0;
    const inp = u.input_tokens || 0;
    const ctx = inp + cw + cr;
    const out = u.output_tokens || 0;
    const thinking = u.output_tokens_details?.thinking_tokens || 0;
    const w1h = u.cache_creation?.ephemeral_1h_input_tokens ?? cw;
    // USD per token at this model's list price; fast mode costs 2x
    const p = priceFor(m.model);
    const k = (u.speed === 'fast' ? 2 : 1) / 1e6;
    const pIn = p.input * k;
    const pRead = p.read * k;
    const pOut = p.output * k;
    const wWrite = cw ? (w1h * pIn * 2 + (cw - w1h) * pIn * 1.25) / cw : pIn * 2;
    requests++;
    models[m.model || '?'] = (models[m.model || '?'] || 0) + 1;
    peak = Math.max(peak, ctx);

    // 1. what entered the context since the previous request
    let delta;
    let written = -1; // new tokens for cost purposes (after compaction, the whole context)
    let firstNew = inContext.length;
    if (requests === 1) {
      delta = ctx;
    } else if (ctx < prevCtx * 0.6) {
      // compaction (or /clear in the same transcript): the previous context is gone
      inContext = [];
      firstNew = 0;
      if (!compactions) compactions++;
      newItem(CAT.compact, ctx, 0);
      delta = 0;
      written = ctx;
      pending = [];
    } else {
      delta = Math.max(0, ctx - prevCtx);
    }
    if (delta > 0) {
      let rest = delta;
      if (requests > 1 && prevVisibleOut) {
        const t = Math.min(rest, prevVisibleOut);
        newItem(CAT.model, t, 0);
        rest -= t;
      }
      const pchars = pending.reduce((n, p) => n + p.chars, 0);
      const est = pchars / 3.5;
      if (requests === 1) {
        // first request: whatever is not a message/attachment is fixed context
        const scale = est > rest ? rest / est : 1;
        for (const p of pending) if (p.chars) newItem(p.cat, (p.chars / 3.5) * scale, p.chars, p.detail);
        fixed = Math.max(0, rest - est * scale);
        if (fixed) newItem(CAT.fixed, fixed, 0);
      } else if (pchars > 0) {
        for (const p of pending) if (p.chars) newItem(p.cat, (p.chars / pchars) * rest, p.chars, p.detail);
      } else if (rest > 0) {
        newItem(CAT.other, rest, 0);
      }
    }
    pending = [];

    // 2. input cost: reading everything + writing what is new; any excess is lost cache
    const inputCost = inp * pIn + cw * wWrite + cr * pRead;
    if (written < 0) written = delta;
    const expected = (ctx - written) * pRead + written * wWrite;
    const excess = requests > 1 ? Math.max(0, inputCost - expected) : 0;
    if (excess > ctx * pRead * 3) rebuilds++; // more than 3x the cost of simply re-reading the context
    add(CAT.rebuild, excess);
    // new items pay the write; existing items pay the re-read
    const base = inputCost - excess;
    const oldTokens = inContext.slice(0, firstNew).reduce((n, it) => n + it.tokens, 0);
    const newTokens = inContext.slice(firstNew).reduce((n, it) => n + it.tokens, 0);
    const readPart = Math.min(base, oldTokens * pRead);
    inContext.forEach((it, i) => {
      const share = i < firstNew ? (oldTokens ? (it.tokens / oldTokens) * readPart : 0) : newTokens ? (it.tokens / newTokens) * (base - readPart) : 0;
      it.cost += share;
      it.reads++;
      add(it.cat, share);
    });

    // 3. output cost
    add(CAT.thinking, thinking * pOut);
    add(CAT.output, (out - thinking) * pOut);

    prevCtx = ctx;
    prevVisibleOut = Math.max(0, out - thinking);
  }

  const cost = Object.values(byCat).reduce((a, b) => a + b, 0);
  return { file, subagent, start, end, requests, peakContext: peak, fixedContext: Math.round(fixed), compactions, rebuilds, cost, byCat, items: allItems, models };
}

/**
 * @param {string} file
 * @returns {SessionReport | null}
 */
export function analyzeFile(file) {
  let txt;
  try {
    txt = readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const entries = [];
  for (const line of txt.split('\n')) {
    if (!line) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // corrupted line
    }
  }
  const r = analyzeEntries(entries, file);
  return r.requests ? r : null;
}

/**
 * Lists transcripts modified in the last `days` days.
 * @param {string} root
 * @param {number} days
 * @returns {string[]}
 */
export function findTranscripts(root, days) {
  const since = Date.now() - days * 86400000;
  /** @type {string[]} */
  const out = [];
  const walk = (/** @type {string} */ dir) => {
    let names;
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const n of names) {
      const p = join(dir, n);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(p);
      else if (n.endsWith('.jsonl') && st.mtimeMs >= since) out.push(p);
    }
  };
  try {
    if (statSync(root).isFile()) return [root];
  } catch {
    return [];
  }
  walk(root);
  return out;
}

/**
 * Combines sessions into a report with recommendations.
 * @param {SessionReport[]} sessions
 * @param {number} top
 */
export function summarize(sessions, top = 15) {
  /** @type {Record<string, number>} */
  const byCat = {};
  let total = 0;
  let subagentCost = 0;
  for (const s of sessions) {
    if (s.subagent) subagentCost += s.cost;
    for (const [k, v] of Object.entries(s.byCat)) {
      byCat[k] = (byCat[k] || 0) + v;
      total += v;
    }
  }
  const cats = Object.entries(byCat)
    .map(([cat, cost]) => ({ cat, cost, pct: total ? (cost / total) * 100 : 0 }))
    .sort((a, b) => b.cost - a.cost);
  const items = sessions
    .flatMap((s) => s.items.filter((i) => i.detail).map((i) => ({ ...i, session: s.file })))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, top);
  const main = sessions.filter((s) => !s.subagent);
  const avgFixed = main.length ? main.reduce((n, s) => n + s.fixedContext, 0) / main.length : 0;
  const pct = (/** @type {(c: string) => boolean} */ f) => cats.filter((c) => f(c.cat)).reduce((n, c) => n + c.pct, 0);

  /** @type {string[]} */
  const tips = [];
  const fixedPct = pct((c) => c === CAT.fixed);
  if (avgFixed > 25000 || fixedPct > 15)
    tips.push(
      `Average fixed context of ${Math.round(avgFixed / 1000)}k tokens (${fixedPct.toFixed(0)}% of cost) is re-read on every message. ` +
        'Run `tk audit` and /doctor; disable plugins, MCP servers and skills you do not use, and trim CLAUDE.md.',
    );
  const rebuildPct = pct((c) => c === CAT.rebuild);
  if (rebuildPct > 5)
    tips.push(`${rebuildPct.toFixed(0)}% of cost was lost cache. When you come back to a long session after more than 1 h, prefer /clear (or /compact) over continuing; avoid switching models mid-session.`);
  const long = main.filter((s) => s.peakContext > 200000);
  if (long.length)
    tips.push(`${long.length} session(s) went past 200k tokens of context (peak ${Math.round(Math.max(...long.map((s) => s.peakContext)) / 1000)}k). Every message there re-reads everything: use /clear between topics and a focused /compact before 150k.`);
  const thinkPct = pct((c) => c === CAT.thinking);
  if (thinkPct > 15) tips.push(`Thinking is ${thinkPct.toFixed(0)}% of cost: use /effort low or medium for mechanical tasks.`);
  const bashPct = pct((c) => c.startsWith('Bash:'));
  if (bashPct > 10) tips.push(`Bash output adds up to ${bashPct.toFixed(0)}%: token-kit (wrapper + RTK) targets this. See the commands in the ranking.`);
  const readPct = pct((c) => c.startsWith('Read:'));
  if (readPct > 10) tips.push(`File reads add up to ${readPct.toFixed(0)}%: read-guard pushes Grep + offset/limit on large files.`);
  const subPct = total ? (subagentCost / total) * 100 : 0;
  if (subPct > 10) tips.push(`Subagents add up to ${subPct.toFixed(0)}%: set CLAUDE_CODE_SUBAGENT_MODEL=sonnet (or haiku) and avoid large workflows.`);
  const webPct = pct((c) => c.startsWith('WebFetch') || c.startsWith('MCP:') || c === 'WebSearch');
  if (webPct > 10) tips.push(`Web and MCP add up to ${webPct.toFixed(0)}%: ask for summaries instead of whole pages and cap MAX_MCP_OUTPUT_TOKENS.`);

  return {
    sessions: sessions.length,
    mainSessions: main.length,
    requests: sessions.reduce((n, s) => n + s.requests, 0),
    total,
    subagentCost,
    avgFixed,
    cats,
    items,
    longest: [...main].sort((a, b) => b.cost - a.cost).slice(0, 8),
    tips,
  };
}
