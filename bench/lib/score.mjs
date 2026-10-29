// Pure scoring helpers for the token benchmark. No I/O, no dependencies.

export const ADOPT_SAVING_PCT = 10;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// Total tokens = input + output + cache read + cache write.
export function totalTokens(m) {
  return num(m.inputTokens) + num(m.outputTokens) + num(m.cacheRead) + num(m.cacheWrite);
}

// Explicit totalTokens wins when present; otherwise computed from the parts.
const totalOf = (m) => (typeof m.totalTokens === 'number' ? m.totalTokens : totalTokens(m));

// Accepts a JSONL string or an array of parsed stream-json records.
// Uses the last record with type "result".
export function parseRecords(input) {
  let records = [];
  if (typeof input === 'string') {
    for (const line of input.split('\n')) {
      if (!line.trim()) continue;
      try {
        records.push(JSON.parse(line));
      } catch {
        // ignore non-JSON lines (stderr noise, progress text)
      }
    }
  } else if (Array.isArray(input)) {
    records = input;
  }

  let result = null;
  for (const r of records) if (r && r.type === 'result') result = r;

  const usage = result?.usage ?? {};
  const metrics = {
    inputTokens: num(usage.input_tokens),
    outputTokens: num(usage.output_tokens),
    cacheRead: num(usage.cache_read_input_tokens),
    cacheWrite: num(usage.cache_creation_input_tokens),
    costUsd: num(result?.total_cost_usd),
    turns: num(result?.num_turns),
  };
  return {
    ...metrics,
    totalTokens: totalTokens(metrics),
    found: result !== null,
    resultText: typeof result?.result === 'string' ? result.result : '',
  };
}

// Sums metric fields over run lines of the form { pass, metrics }.
export function aggregate(runs) {
  const sums = { inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, turns: 0 };
  let passes = 0;
  for (const run of runs) {
    const m = run.metrics ?? {};
    for (const k of Object.keys(sums)) sums[k] += num(m[k]);
    if (run.pass) passes += 1;
  }
  const n = runs.length;
  return { ...sums, totalTokens: totalTokens(sums), passRate: n ? passes / n : 0, n };
}

const METRIC_FIELDS = ['inputTokens', 'outputTokens', 'cacheRead', 'cacheWrite', 'totalTokens', 'costUsd', 'turns'];

function deltaPct(a, b) {
  if (a === 0) return b === 0 ? 0 : null;
  return ((b - a) / a) * 100;
}

function passRateOf(x) {
  if (typeof x.passRate === 'number') return x.passRate;
  if (typeof x.pass === 'boolean') return x.pass ? 1 : 0;
  return 0;
}

// a = baseline (feature off), b = variant (feature on).
// Verdict: "reject" if b's pass rate is lower; "adopt" if b saves >= 10% total
// tokens with pass rate not lower; otherwise "no clear win".
export function compare(a, b) {
  const deltas = {};
  for (const f of METRIC_FIELDS) {
    const av = f === 'totalTokens' ? totalOf(a) : num(a[f]);
    const bv = f === 'totalTokens' ? totalOf(b) : num(b[f]);
    deltas[f] = deltaPct(av, bv);
  }

  const passA = passRateOf(a);
  const passB = passRateOf(b);
  const tokA = totalOf(a);
  const tokB = totalOf(b);

  let verdict;
  if (passB < passA) {
    verdict = 'reject';
  } else if (tokA > 0 && ((tokA - tokB) / tokA) * 100 >= ADOPT_SAVING_PCT) {
    verdict = 'adopt';
  } else {
    verdict = 'no clear win';
  }
  return { deltaPct: deltas, passA, passB, verdict };
}

// Lines: { task, variant: "A"|"B", pass, metrics }. A is the baseline, B the variant.
export function buildReport(lines, { baseline = 'A', variant = 'B' } = {}) {
  const byTask = new Map();
  for (const line of lines) {
    if (!line || !line.task || !line.variant) continue;
    if (!byTask.has(line.task)) byTask.set(line.task, { [baseline]: [], [variant]: [] });
    const slot = byTask.get(line.task);
    if (slot[line.variant]) slot[line.variant].push(line);
  }

  const rows = [];
  const pairedA = [];
  const pairedB = [];
  for (const [task, slot] of [...byTask.entries()].sort(([x], [y]) => x.localeCompare(y))) {
    const a = aggregate(slot[baseline]);
    const b = aggregate(slot[variant]);
    const paired = a.n > 0 && b.n > 0;
    rows.push({ task, a, b, comparison: paired ? compare(a, b) : null });
    if (paired) {
      pairedA.push(...slot[baseline]);
      pairedB.push(...slot[variant]);
    }
  }
  const overall = pairedA.length ? compare(aggregate(pairedA), aggregate(pairedB)) : null;
  return { rows, overall };
}

const int = (v) => String(Math.round(v));
const pct = (v) => `${Math.round(v * 100)}%`;
const signed = (v) => (v === null ? 'n/a' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`);

export function formatReport(report) {
  if (!report.rows.length) return 'no results';
  const header = ['task', 'tokens A', 'tokens B', 'delta', 'pass A', 'pass B', 'verdict'];
  const body = report.rows.map((r) => {
    if (!r.comparison) {
      return [r.task, r.a.n ? int(r.a.totalTokens) : '-', r.b.n ? int(r.b.totalTokens) : '-', '-', '-', '-', 'incomplete'];
    }
    const c = r.comparison;
    return [r.task, int(r.a.totalTokens), int(r.b.totalTokens), signed(c.deltaPct.totalTokens), pct(c.passA), pct(c.passB), c.verdict];
  });
  if (report.overall) {
    const o = report.overall;
    body.push(['OVERALL', '', '', signed(o.deltaPct.totalTokens), pct(o.passA), pct(o.passB), o.verdict]);
  }
  const all = [header, ...body];
  const widths = header.map((_, i) => Math.max(...all.map((row) => String(row[i]).length)));
  const line = (row) => row.map((c, i) => String(c).padEnd(widths[i])).join('  ').trimEnd();
  return [line(header), widths.map((w) => '-'.repeat(w)).join('  '), ...body.map(line)].join('\n');
}
