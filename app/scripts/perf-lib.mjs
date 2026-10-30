// The pure part of the Mac performance run (perf-mac.mjs): medians, the process tree from `ps`, the
// start-up chunks named in index.html, the comparison with the previous release, and PERF.md.
// Tested in perf-lib.test.ts.

export const median = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

/** Rounds of typing per CPU throttle: PERF_TYPING_ROUNDS overrides. 7 rounds of 200 keys at 30 ms is about 45 s per throttle. */
export const TYPING_ROUNDS = (() => { const n = Number(process.env.PERF_TYPING_ROUNDS); return Number.isInteger(n) && n > 0 ? n : 7 })()
/** CPU throttles typing is measured at (CDP Emulation.setCPUThrottlingRate). */
export const TYPING_THROTTLES = [1, 4]

/** Per-key script and task time (ms) from two Performance.getMetrics maps around `chars` keys. */
export function perKeyMs(before, after, chars) {
  const d = (k) => Math.round(((after[k] - before[k]) * 1000 / chars) * 100) / 100
  return { scriptMs: d('ScriptDuration'), taskMs: d('TaskDuration') }
}

/**
 * Typing rounds ({ throttle, scriptMs, taskMs, longestFrameMs, framesOver16, framesOver33, frames,
 * longestInputMs }) into the result. Primary: perKey.x1 / perKey.x4 = median over rounds of script and
 * task time per key (steady between versions). Frames are kept, noisy, for reference only.
 */
export function summarizeTyping(rounds, chars = 200) {
  const at = (t) => rounds.filter((r) => r.throttle === t)
  const mid = (rs, k) => median(rs.map((r) => r[k]))
  const perKey = {}
  for (const t of [...new Set(rounds.map((r) => r.throttle))]) perKey[`x${t}`] = { rounds: at(t).length, scriptMs: mid(at(t), 'scriptMs'), taskMs: mid(at(t), 'taskMs') }
  const ref = at(1).length ? at(1) : rounds
  return {
    method: 2, rounds: ref.length, chars, perKey,
    longestFrameMs: mid(ref, 'longestFrameMs'), worstFrameMs: Math.max(0, ...ref.map((r) => r.longestFrameMs)),
    framesOver16: mid(ref, 'framesOver16'), framesOver33: mid(ref, 'framesOver33'), frames: mid(ref, 'frames'), longestInputMs: mid(ref, 'longestInputMs'),
    all: rounds,
  }
}

/** `ps -A -o pid=,ppid=,%cpu=,rss=` into rows. */
export function parsePs(text) {
  return String(text).split('\n').map((l) => l.trim().split(/\s+/)).filter((f) => f.length >= 4 && /^\d+$/.test(f[0]))
    .map(([pid, ppid, cpu, rss]) => ({ pid: Number(pid), ppid: Number(ppid), cpu: Number(cpu), rss: Number(rss) }))
}

/** The root and everything under it: total CPU % and RSS in MB. */
export function treeUsage(rows, root) {
  const kids = new Map()
  for (const r of rows) kids.set(r.ppid, [...(kids.get(r.ppid) ?? []), r])
  const seen = rows.filter((r) => r.pid === root)
  for (let i = 0; i < seen.length; i++) for (const k of kids.get(seen[i].pid) ?? []) seen.push(k)
  return { processes: seen.length, cpu: seen.reduce((n, r) => n + r.cpu, 0), rssMb: seen.reduce((n, r) => n + r.rss, 0) / 1024 }
}

/** Script and modulepreload files that index.html loads at start, as paths inside dist. */
export function startupChunks(html) {
  const refs = [...String(html).matchAll(/<(?:script[^>]*\bsrc|link[^>]*rel="(?:modulepreload|stylesheet)"[^>]*\bhref)="([^"]+)"/g)].map((m) => m[1])
  const alt = [...String(html).matchAll(/<link[^>]*\bhref="([^"]+)"[^>]*rel="(?:modulepreload|stylesheet)"/g)].map((m) => m[1])
  return [...new Set([...refs, ...alt])].filter((r) => !/^(https?:|data:)/.test(r)).map((r) => r.replace(/^\.?\//, ''))
}

/** Performance.getMetrics result into a name -> value map. */
export const metricsMap = (res) => Object.fromEntries((res?.metrics ?? []).map((m) => [m.name, m.value]))

/** Layouts and style recalcs per second between two getMetrics maps. */
export function perSecond(before, after, seconds) {
  const d = (k) => ((after[k] ?? 0) - (before[k] ?? 0)) / seconds
  return { layoutsPerS: d('LayoutCount'), recalcsPerS: d('RecalcStyleCount') }
}

/** Numbers to compare, flattened: "idle.four.cpu" -> 1.2. */
export function flatten(o, pre = '') {
  const out = {}
  for (const [k, v] of Object.entries(o ?? {})) {
    const key = pre ? `${pre}.${k}` : k
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = v
    else if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, key))
  }
  return out
}

/** Sections of the results whose `method` differs between two runs (a missing one counts as 1). */
export const changedMethod = (prev, cur) =>
  Object.keys(cur?.results ?? {}).filter((k) => prev?.results?.[k] && (prev.results[k].method ?? 1) !== (cur.results[k]?.method ?? 1))

/** Every number in both runs' results, with the change, marked when it moved more than `limit`. */
export function compare(prev, cur, limit = 0.1) {
  // a section measured another way (its `method` differs) is not compared: see changedMethod
  const skip = new Set(changedMethod(prev, cur))
  const a = flatten(prev?.results)
  const b = flatten(cur?.results)
  const fresh = Object.keys(b).filter((k) => !(k in a) && k.startsWith('typing.perKey.') && Object.keys(a).length)
    .map((k) => ({ key: k, before: null, after: b[k], change: null, marked: false, isNew: true }))
  return [...Object.keys(b).filter((k) => k in a && !skip.has(k.split('.')[0])).map((k) => {
    const change = a[k] === 0 ? (b[k] === 0 ? 0 : Infinity) : (b[k] - a[k]) / Math.abs(a[k])
    return { key: k, before: a[k], after: b[k], change, marked: Math.abs(change) > limit && Math.abs(b[k] - a[k]) > 1e-9 }
  }), ...fresh]
}

const f = (x, d = 1) => (x === null || x === undefined ? '-' : Number(x).toFixed(d))
const pct = (c) => (c === null ? 'new in this version' : c === Infinity ? 'new' : `${c >= 0 ? '+' : ''}${(c * 100).toFixed(0)}%`)

/** PERF.md from perf.json, with the comparison when there is one. */
export function render(p, cmp, prevVersion, prev) {
  const r = p.results
  const rows = [
    ...(r.launch.method >= 2
      ? [
          [`Launch to window shown (median of ${r.launch.runs} after ${r.launch.coldRuns} cold)`, `${f(r.launch.windowMs, 0)} ms (${f(r.launch.windowMin, 0)} to ${f(r.launch.windowMax, 0)})`],
          ['Launch to composer usable (median)', `${f(r.launch.composerMs, 0)} ms (${f(r.launch.composerMin, 0)} to ${f(r.launch.composerMax, 0)})`],
          ['Cold launch (slowest of the first ' + r.launch.coldRuns + '): window / composer', `${f(r.launch.coldWindowMs, 0)} / ${f(r.launch.coldComposerMs, 0)} ms`],
        ]
      : [
          ['Launch to window shown (median of ' + r.launch.runs + ')', `${f(r.launch.windowMs, 0)} ms`],
          ['Launch to composer usable (median)', `${f(r.launch.composerMs, 0)} ms`],
        ]),
    ['Idle, 1 panel: layouts / style recalcs per s', `${f(r.idle.one.layoutsPerS, 2)} / ${f(r.idle.one.recalcsPerS, 2)}`],
    ['Idle, 1 panel: CPU of the process tree', `${f(r.idle.one.cpu)} %`],
    ['Idle, 1 panel: memory of the process tree', `${f(r.idle.one.rssMb, 0)} MB`],
    ['Idle, 4 panels: layouts / style recalcs per s', `${f(r.idle.four.layoutsPerS, 2)} / ${f(r.idle.four.recalcsPerS, 2)}`],
    ['Idle, 4 panels: CPU of the process tree', `${f(r.idle.four.cpu)} %`],
    ['Idle, 4 panels: memory of the process tree', `${f(r.idle.four.rssMb, 0)} MB`],
    ['Memory per added panel', `${f(r.idle.perPanelMb, 0)} MB`],
    ...(r.typing.perKey
      ? Object.entries(r.typing.perKey).flatMap(([x, v]) => [
          [`Typing, ${x.slice(1)}x CPU: script time per key (median of ${v.rounds} rounds)`, `${f(v.scriptMs, 2)} ms`],
          [`Typing, ${x.slice(1)}x CPU: task time per key (median of ${v.rounds} rounds)`, `${f(v.taskMs, 2)} ms`],
        ])
      : []),
    r.typing.rounds
      ? [`Typing 200 characters: longest frame (noisy, for reference; median of ${r.typing.rounds} rounds; worst)`, `${f(r.typing.longestFrameMs, 0)} ms; ${f(r.typing.worstFrameMs, 0)} ms`]
      : ['Typing 200 characters: longest frame', `${f(r.typing.longestFrameMs, 0)} ms`],
    ['Typing: frames over 16 ms (noisy, for reference)', `${r.typing.framesOver16 ?? '-'}`],
    ['Typing: frames over 33 ms (noisy, for reference)', `${r.typing.framesOver33 ?? '-'}`],
    ['Typing: longest input to paint', `${f(r.typing.longestInputMs, 0)} ms`],
    ['Renderer JS and CSS in the app (dist)', `${f(r.size.distKb, 0)} KB`],
    ['Start-up chunks, gzip', `${f(r.size.startupGzipKb, 0)} KB`],
    ['App bundle on disk', `${f(r.size.appMb)} MB`],
    ['dmg', `${f(r.size.dmgMb)} MB`],
  ]
  let md = `# Mac performance: SuperTokenMan ${p.version}

${p.system}, ${p.chip}, runner ${p.runner}, ${p.date}. Fresh profile, mock Anthropic API on loopback.
Recorded only: no budget fails this run yet (budgets are in docs/ROADMAP.md, v1.1).

| What | Value |
|---|---|
${rows.map(([a, b]) => `| ${a} | ${b} |`).join('\n')}
`
  if (cmp?.length) {
    md += `
## Against ${prevVersion}

Changes over 10% are marked.${changedMethod(prev, p).length ? ` Measured differently since ${prevVersion}, so not compared: ${changedMethod(prev, p).join(', ')}.` : ''}

| What | ${prevVersion} | ${p.version} | Change |
|---|---|---|---|
${cmp.map((c) => `| ${c.marked ? '**' + c.key + '**' : c.key} | ${c.isNew ? '-' : f(c.before, 2)} | ${f(c.after, 2)} | ${c.marked ? '**' + pct(c.change) + '**' : pct(c.change)} |`).join('\n')}
`
  } else md += '\nNo perf.json on the previous release to compare with.\n'
  md += `
## How

- Launch: wall clock from process spawn to the window's document being visible, and to the composer
  textarea being enabled and taking focus, polled every 50 ms over Chromium's debugging port. The first
  launches of a newly installed app are slow (system checks of the signed bundle, cold disk cache): they
  are shown as the cold launch, and the median, minimum and maximum are of the launches after them.
- Idle: 30 s after a 10 s settle. Layouts and style recalcs are deltas of CDP \`Performance.getMetrics\`;
  CPU and memory are \`ps\` samples of the app and every process under it, once a second, averaged.
- Typing: 200 characters typed into the composer, 30 ms apart, in rounds at 1x and at a 4x CPU throttle
  (CDP \`Emulation.setCPUThrottlingRate\`). Trust the per-key script and task time (CDP
  \`Performance.getMetrics\` deltas, median over rounds): it held steady between versions where the longest
  frame of a shared machine did not. Longest frame and frames over 16 / 33 ms are noisy, for reference.
  Frames are gaps between
  \`requestAnimationFrame\` callbacks; input to paint is the Event Timing API's longest event duration.
  On a 60 Hz screen a frame of 16.8 ms is jitter, not a dropped frame: read "over 33 ms" for those.
- Sizes: \`app.asar\` listing (dist only), gzip of the files index.html loads at start, \`du\` of the .app.
`
  return md
}
