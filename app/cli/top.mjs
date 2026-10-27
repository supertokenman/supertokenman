// stm top: a live terminal dashboard of the app's panels, costs, approvals waiting and CI. Reads only:
// it asks the running app for a snapshot over the local socket once a second (the socket answers one
// request at a time, there is no event stream) and never reaches the network. Raw ANSI, no dependency.

/** The currency to show: BRL on a machine set to Brazil (as the window does), else USD. */
export function currencyOf(env = process.env, flag) {
  const pick = String(flag ?? env.STM_CURRENCY ?? '').toUpperCase()
  if (pick === 'BRL' || pick === 'USD') return pick
  const lang = env.LC_ALL || env.LC_MONETARY || env.LANG || ''
  return /[-_]BR\b/i.test(lang) ? 'BRL' : 'USD'
}

/** The fixed rate the app ships with (src/rates.ts); STM_USD_BRL overrides it. */
export const FIXED_USD_BRL = 5.05

export function moneyFn(code, usdToBrl = FIXED_USD_BRL) {
  const rate = code === 'BRL' ? usdToBrl : 1
  const fmt = new Intl.NumberFormat(code === 'BRL' ? 'pt-BR' : 'en-US', { style: 'currency', currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return (usd) => fmt.format(Number(usd ?? 0) * rate).replace(/ /g, ' ')
}

const fiveHourOf = (limits) => (limits ?? []).find((w) => /five|5h|5_hour/i.test(w.kind)) ?? null

/** The snapshot for scripts (`stm top --once --json`): stable field names, documented in the README. */
export function toJson(snap, code, usdToBrl = FIXED_USD_BRL) {
  const rate = code === 'BRL' ? usdToBrl : 1
  const five = fiveHourOf(snap.limits)
  return {
    at: new Date(snap.at).toISOString(),
    version: snap.version,
    currency: code,
    today: { usd: round(snap.todayUsd), amount: round(snap.todayUsd * rate) },
    fiveHour: five ? { percentUsed: Math.round(five.percentUsed), resetsAt: five.resetsAt } : null,
    approvalsWaiting: snap.panels.reduce((n, p) => n + p.approvals.length, 0),
    ciConnected: Boolean(snap.githubOn),
    panels: snap.panels.map((p) => ({
      id: p.id,
      project: p.project,
      cwd: p.cwd,
      model: p.model,
      state: p.state,
      contextTokens: p.contextTokens,
      contextPercent: p.contextTokens === null ? null : Math.round((p.contextTokens / p.contextWindow) * 100),
      today: { usd: round(p.todayUsd), amount: round(p.todayUsd * rate) },
      approvals: p.approvals,
      ci: p.ci && snap.githubOn ? { repo: p.ci.repo, branch: p.ci.branch, status: p.ci.status, conclusion: p.ci.conclusion, workflow: p.ci.workflow } : null,
    })),
  }
}
const round = (n) => Math.round(Number(n ?? 0) * 1e6) / 1e6

const ESC = '\x1b['
const paint = (on) => (code, s) => (on ? `${ESC}${code}m${s}${ESC}0m` : s)
const STATE_COLOR = { running: '32', 'needs-you': '33;1', waiting: '36', idle: '2' }

/** Cuts or pads to exactly n visible columns (input is plain text). */
export function fit(s, n) {
  s = String(s ?? '')
  if (n <= 0) return ''
  if (s.length > n) return n === 1 ? '…' : `${s.slice(0, n - 1)}…`
  return s.padEnd(n)
}

export function ciText(p, githubOn) {
  if (!githubOn) return 'not connected'
  if (!p.ci) return 'no repo'
  if (!p.ci.status) return 'no runs'
  return p.ci.status === 'completed' ? (p.ci.conclusion ?? 'done') : p.ci.status
}

const tokens = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n))

/**
 * The screen as text, pure: same snapshot and options give the same output. `width` and `height` are
 * the terminal's; below 60 columns the model and CI columns go, below 40 only state and project stay.
 */
export function render(snap, o) {
  const { width = 80, height = 24, color = false, selected = 0, help = false, money, note = '' } = o
  const c = paint(color)
  const W = Math.max(20, width)
  const lines = []
  const five = fiveHourOf(snap.limits)
  const waiting = snap.panels.reduce((n, p) => n + p.approvals.length, 0)
  lines.push(c('1', fit(`stm top  SuperTokenMan ${snap.version}`, W)))
  const totals = [`Today ${money(snap.todayUsd)}`, `5h window ${five ? `${Math.round(five.percentUsed)}%` : 'n/a'}`, `Approvals ${waiting}`, snap.githubOn ? 'CI: GitHub' : 'CI: not connected']
  if (W >= 60) lines.push(fit(totals.join('  '), W))
  else lines.push(fit(totals.slice(0, 2).join('  '), W), fit(totals.slice(2).join('  '), W))
  lines.push('')
  if (help) {
    for (const h of ['q        quit', 'up/down  select a panel (also j / k)', 'Enter    focus the panel in the app: not available,', '         the app has no command for it yet', '?        this help (any key closes it)', '', 'Refreshes every second from the app on this computer.', 'No network: everything comes from the running app.', 'CI shows what the app already polled; "not connected"', 'means GitHub is off in the app\'s Connections.']) lines.push(fit(h, W))
    while (lines.length < height - 1) lines.push('')
    lines.push(c('2', fit('any key: back', W)))
    return lines.slice(0, height).join('\n')
  }
  const wide = W >= 60
  const narrow = W < 40
  // columns: marker 2, state 10, project, model 12, ctx 6, cost 11, ci 12
  const fixed = narrow ? 2 + 10 : 2 + 10 + 6 + 11 + (wide ? 12 + 14 : 0)
  const proj = Math.max(6, W - fixed - 1)
  const head = narrow ? `  ${fit('STATE', 10)}${fit('PROJECT', proj)}` : `  ${fit('STATE', 10)}${fit('PROJECT', proj)}${wide ? fit('MODEL', 12) + ' ' : ''}${fit('CTX', 6)}${fit('TODAY', 11)}${wide ? fit('CI', 13) : ''}`
  lines.push(c('2', fit(head, W)))
  if (!snap.panels.length) lines.push(fit('  No panels open. Open one in the app.', W))
  const room = Math.max(1, height - lines.length - 4)
  const start = Math.min(Math.max(0, selected - room + 1), Math.max(0, snap.panels.length - room))
  snap.panels.slice(start, start + room).forEach((p, i) => {
    const sel = start + i === selected
    const ctx = p.contextTokens === null ? '-' : `${Math.round((p.contextTokens / p.contextWindow) * 100)}%`
    const state = c(STATE_COLOR[p.state] ?? '0', fit(p.state, 10))
    const rest = narrow ? fit(p.project || p.id, proj) : `${fit(p.project || p.id, proj)}${wide ? fit(p.modelLabel ?? p.model ?? '-', 12) + ' ' : ''}${fit(ctx, 6)}${fit(money(p.todayUsd), 11)}${wide ? fit(ciText(p, snap.githubOn), 13) : ''}`
    const row = `${sel ? '> ' : '  '}${state}${rest}`
    lines.push(sel ? c('7', row) : row)
  })
  if (snap.panels.length > room) lines.push(c('2', fit(`  ${snap.panels.length - room} more, use arrows`, W)))
  const p = snap.panels[selected]
  lines.push('')
  if (p) {
    lines.push(fit(`${p.id} ${p.cwd}${p.goal ? `  goal: ${p.goal}` : ''}`, W))
    if (p.approvals.length) lines.push(c('33', fit(`Waits for you: ${p.approvals.map((a) => `${a.tool} ${a.summary}`).join('; ')}`, W)))
    else if (!wide) lines.push(fit(`CI ${ciText(p, snap.githubOn)}  model ${p.modelLabel ?? p.model ?? '-'}`, W))
  }
  while (lines.length < height - 1) lines.push('')
  lines.length = Math.min(lines.length, height - 1)
  lines.push(c('2', fit(note || 'q quit  j/k select  ? help', W)))
  return lines.join('\n')
}

/** The live loop. `call` asks the app; returns the exit code. */
export async function runTop(call, { json, once, currency, out = process.stdout, input = process.stdin, env = process.env }) {
  const code = currencyOf(env, currency)
  const usdToBrl = Number(env.STM_USD_BRL) > 0 ? Number(env.STM_USD_BRL) : FIXED_USD_BRL
  const money = moneyFn(code, usdToBrl)
  if (once || json || !out.isTTY) {
    const snap = await call('top', {})
    if (json) out.write(`${JSON.stringify({ ok: true, data: toJson(snap, code, usdToBrl) })}\n`)
    else out.write(`${render(snap, { width: out.columns ?? 80, height: Math.max(8, snap.panels.length + 10), color: false, money })}\n`)
    return 0
  }
  const color = !('NO_COLOR' in env)
  let snap = null
  let selected = 0
  let help = false
  let note = ''
  let stopped = false
  const draw = () => {
    if (!snap) return
    selected = Math.max(0, Math.min(selected, snap.panels.length - 1))
    out.write(`${ESC}H${ESC}2J${render(snap, { width: out.columns ?? 80, height: out.rows ?? 24, color, selected, help, money, note })}`)
  }
  return new Promise((done) => {
    const finish = (code) => {
      if (stopped) return
      stopped = true
      clearInterval(timer)
      if (input.isTTY) input.setRawMode(false)
      input.pause()
      out.write(`${ESC}?25h${ESC}?1049l`)
      done(code)
    }
    const tick = async () => {
      try {
        snap = await call('top', {})
        draw()
      } catch (e) {
        finish(2)
        process.stderr.write(`stm: ${e.message}\n`)
      }
    }
    out.write(`${ESC}?1049h${ESC}?25l`)
    if (input.isTTY) input.setRawMode(true)
    input.setEncoding('utf8')
    input.on('data', (k) => {
      if (help) return (help = false), draw()
      note = ''
      if (k === 'q' || k === '\x03') return finish(0)
      if (k === '?') help = true
      else if (k === 'j' || k === `${ESC}B`) selected++
      else if (k === 'k' || k === `${ESC}A`) selected--
      else if (k === '\r' || k === '\n') note = 'Focusing a panel from the command line is not available yet; switch to it in the app.'
      draw()
    })
    out.on?.('resize', draw)
    const timer = setInterval(tick, 1000)
    void tick()
  })
}
