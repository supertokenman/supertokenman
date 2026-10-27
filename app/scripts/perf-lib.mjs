// The pure part of the Mac performance run (perf-mac.mjs): medians, the process tree from `ps`, the
// start-up chunks named in index.html, the comparison with the previous release, and PERF.md.
// Tested in perf-lib.test.ts.

export const median = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
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

/** Every number in both runs' results, with the change, marked when it moved more than `limit`. */
export function compare(prev, cur, limit = 0.1) {
  const a = flatten(prev?.results)
  const b = flatten(cur?.results)
  return Object.keys(b).filter((k) => k in a).map((k) => {
    const change = a[k] === 0 ? (b[k] === 0 ? 0 : Infinity) : (b[k] - a[k]) / Math.abs(a[k])
    return { key: k, before: a[k], after: b[k], change, marked: Math.abs(change) > limit && Math.abs(b[k] - a[k]) > 1e-9 }
  })
}

const f = (x, d = 1) => (x === null || x === undefined ? '-' : Number(x).toFixed(d))
const pct = (c) => (c === Infinity ? 'new' : `${c >= 0 ? '+' : ''}${(c * 100).toFixed(0)}%`)

/** PERF.md from perf.json, with the comparison when there is one. */
export function render(p, cmp, prevVersion) {
  const r = p.results
  const rows = [
    ['Launch to window shown (median of ' + r.launch.runs + ')', `${f(r.launch.windowMs, 0)} ms`],
    ['Launch to composer usable (median)', `${f(r.launch.composerMs, 0)} ms`],
    ['Idle, 1 panel: layouts / style recalcs per s', `${f(r.idle.one.layoutsPerS, 2)} / ${f(r.idle.one.recalcsPerS, 2)}`],
    ['Idle, 1 panel: CPU of the process tree', `${f(r.idle.one.cpu)} %`],
    ['Idle, 1 panel: memory of the process tree', `${f(r.idle.one.rssMb, 0)} MB`],
    ['Idle, 4 panels: layouts / style recalcs per s', `${f(r.idle.four.layoutsPerS, 2)} / ${f(r.idle.four.recalcsPerS, 2)}`],
    ['Idle, 4 panels: CPU of the process tree', `${f(r.idle.four.cpu)} %`],
    ['Idle, 4 panels: memory of the process tree', `${f(r.idle.four.rssMb, 0)} MB`],
    ['Memory per added panel', `${f(r.idle.perPanelMb, 0)} MB`],
    ['Typing 200 characters: longest frame', `${f(r.typing.longestFrameMs, 0)} ms`],
    ['Typing: frames over 16 ms', `${r.typing.framesOver16 ?? '-'}`],
    ['Typing: frames over 33 ms (a frame or more dropped)', `${r.typing.framesOver33 ?? '-'}`],
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

Changes over 10% are marked.

| What | ${prevVersion} | ${p.version} | Change |
|---|---|---|---|
${cmp.map((c) => `| ${c.marked ? '**' + c.key + '**' : c.key} | ${f(c.before, 2)} | ${f(c.after, 2)} | ${c.marked ? '**' + pct(c.change) + '**' : pct(c.change)} |`).join('\n')}
`
  } else md += '\nNo perf.json on the previous release to compare with.\n'
  md += `
## How

- Launch: wall clock from process spawn to the window's document being visible, and to the composer
  textarea being enabled and taking focus, polled every 50 ms over Chromium's debugging port.
- Idle: 30 s after a 10 s settle. Layouts and style recalcs are deltas of CDP \`Performance.getMetrics\`;
  CPU and memory are \`ps\` samples of the app and every process under it, once a second, averaged.
- Typing: 200 characters typed into the composer, 30 ms apart. Frames are gaps between
  \`requestAnimationFrame\` callbacks; input to paint is the Event Timing API's longest event duration.
  On a 60 Hz screen a frame of 16.8 ms is jitter, not a dropped frame: read "over 33 ms" for those.
- Sizes: \`app.asar\` listing (dist only), gzip of the files index.html loads at start, \`du\` of the .app.
`
  return md
}
