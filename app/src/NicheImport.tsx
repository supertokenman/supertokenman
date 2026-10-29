import { useMemo, useState } from 'react'
import { BUILTIN_FORMATS } from '../shared/hookfmt'
import { parseCsv, parseJson, parsePasted, summarize, type NicheRow } from '../shared/nichenotes'
import { chooseFiles } from './FilePicker'
import { clean } from './errors'
import { Radio, RadioGroup } from './ui'

/**
 * Niche import: paste captions, or pick a CSV or JSON export, and see counts per hook format,
 * the median of the views the person gave, and the links as labels. Nothing here fetches a link.
 */

type Mode = 'lines' | 'csv' | 'json'
const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'lines', label: 'Lines', hint: 'One caption per line.' },
  { id: 'csv', label: 'CSV', hint: 'A header row with a caption column. date and views are optional.' },
  { id: 'json', label: 'JSON', hint: 'An array of captions, or of objects with caption, and optionally date and views.' },
]
const SAMPLE_NOTICE = 'Pages in a study like this are the ones that succeeded; pages that failed are not in the sample.'
const FILE_NOT_READY = 'Reading a picked file is not available yet. Paste the text instead.'

function parse(text: string, mode: Mode): { rows: NicheRow[]; error?: string } {
  if (text.trim() === '') return { rows: [] }
  try {
    const rows = mode === 'csv' ? parseCsv(text) : mode === 'json' ? parseJson(text) : parsePasted(text)
    return { rows }
  } catch (e) {
    return { rows: [], error: clean(e) }
  }
}

const fmtMedian = (v: number) => (Number.isInteger(v) ? v.toLocaleString() : v.toFixed(1))

export default function NicheImport() {
  const [mode, setMode] = useState<Mode>('lines')
  const [text, setText] = useState('')
  const [fileMsg, setFileMsg] = useState('')
  const parsed = useMemo(() => parse(text, mode), [text, mode])
  const summary = useMemo(() => summarize(parsed.rows), [parsed.rows])
  const links = useMemo(() => {
    const seen = new Map<string, number>()
    for (const r of parsed.rows) for (const l of r.links) seen.set(l, (seen.get(l) ?? 0) + 1)
    return [...seen.entries()]
  }, [parsed.rows])
  const hint = MODES.find((m) => m.id === mode)?.hint ?? ''

  const pickFile = () =>
    void chooseFiles({ title: 'A CSV or JSON export', accept: ['csv', 'json'], action: 'Use' }).then(
      (chosen) => {
        if (chosen && chosen.length) setFileMsg(FILE_NOT_READY)
      },
      (e) => setFileMsg(clean(e)),
    )

  return (
    <section style={{ display: 'grid', gap: 12 }}>
      <div className="chart-name">Niche import</div>
      <div className="faint">Bring in captions from a niche you study. Counts come from what you import, not from the app.</div>

      <RadioGroup label="Import format" className="ob-row">
        {MODES.map((m) => (
          <label key={m.id} className="ca-toggle">
            <Radio name="niche-mode" checked={mode === m.id} onChange={() => setMode(m.id)} />
            <span>{m.label}</span>
          </label>
        ))}
      </RadioGroup>
      <div className="faint">{hint}</div>

      <textarea
        spellCheck={false}
        aria-label="Captions to import"
        placeholder={mode === 'lines' ? 'Paste one caption per line' : mode === 'csv' ? 'caption,date,views' : '["caption", {"caption": "...", "views": 1200}]'}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="ob-row">
        <button className="ghost small" onClick={pickFile}>Choose a CSV or JSON file...</button>
        {fileMsg && <span className="faint">{fileMsg}</span>}
      </div>
      {parsed.error && <div className="error">{parsed.error}</div>}

      {summary.total === 0 ? (
        <div className="faint">No captions yet. Not enough data yet.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 4 }}>
            <div className="chart-name">Captions per format · {summary.total}</div>
            {BUILTIN_FORMATS.map((f) => (
              <div key={f.id} className="ob-row">
                <span style={{ minWidth: 200 }}>{f.label}</span>
                <span>{summary.counts[f.id]}</span>
              </div>
            ))}
            <div className="ob-row">
              <span style={{ minWidth: 200 }} className="faint">No format match</span>
              <span>{summary.counts.none}</span>
            </div>
          </div>

          <div className="ob-row">
            <span className="chart-name">Median views</span>
            <span>{summary.median.kind === 'median' ? fmtMedian(summary.median.value) : 'No views given'}</span>
          </div>

          <div style={{ display: 'grid', gap: 4 }}>
            <div className="chart-name">Links · labels only, not opened</div>
            {links.length === 0 && <div className="faint">No links in these captions.</div>}
            {links.map(([label, n]) => (
              <div key={label} className="ob-row">
                <span style={{ wordBreak: 'break-all' }}>{label}</span>
                <span className="faint">{n} {n === 1 ? 'caption' : 'captions'}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="faint">{SAMPLE_NOTICE}</div>
    </section>
  )
}
