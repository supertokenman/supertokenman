import { useEffect, useState } from 'react'
import { ROUTE_LABEL } from '../shared/transcript'
import type { Result } from '../electron/transcripts'
import { pickPaths } from './FilePicker'
import { clean } from './errors'
import './bridge'
import { Switch } from './ui'

/** Settings row: video transcripts are off until turned on here. */
export function TranscriptToggle() {
  const [on, setOn] = useState<boolean | null>(null)
  useEffect(() => {
    void window.stm.transcript?.enabled().then(setOn, () => setOn(null))
  }, [])
  if (on === null) return null
  return (
    <div className="tid-row" data-tip="Turns video transcripts on: from a subtitle or audio file you give, a transcript you paste, or yt-dlp and whisper.cpp if you installed them. The app itself contacts no site for this. YouTube links are not fetched (YouTube's terms).">
      <span>Video transcripts</span>
      <Switch checked={on} onChange={(e) => void window.stm.transcript.enabled(e.target.checked).then(setOn)} />
    </div>
  )
}

/** A video's transcript as text: try the link, or give a file, or paste it. Shows the route used. */
export function TranscriptPanel(props: { url: string; title?: string; onUse?: (text: string) => void; onClose: () => void }) {
  const [res, setRes] = useState<Result | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [paste, setPaste] = useState('')
  const [stamps, setStamps] = useState(false)
  const get = async (r: { input: string; text?: string }) => {
    setBusy(true)
    setErr('')
    try {
      setRes(await window.stm.transcript.get({ ...r, timestamps: stamps }))
    } catch (e) {
      setErr(clean(e))
    }
    setBusy(false)
  }
  useEffect(() => {
    void get({ input: props.url })
    // once per video
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.url])
  const file = async () => {
    const p = await pickPaths({ title: 'Subtitle, audio or video file', multiple: false, action: 'Transcribe' })
    if (Array.isArray(p) && p[0]) void get({ input: p[0] })
  }
  return (
    <div className="rs-transcript">
      <div className="sp-label">
        Transcript{props.title ? ` · ${props.title}` : ''}
        <button className="btn-ghost" onClick={props.onClose}>Close</button>
      </div>
      {busy && <p className="faint">Working...</p>}
      {res && (
        <>
          <p className="faint">
            {ROUTE_LABEL[res.route]}
            {res.cached ? ' · from the cache' : ''}
            {res.truncated ? ' · cut at 200,000 characters' : ''}
          </p>
          <div className="tid-row">
            <span>Timestamps</span>
            <Switch checked={stamps} onChange={(e) => setStamps(e.target.checked)} />
          </div>
          <pre className="rs-report">{stamps ? res.cues.map((c) => `[${Math.floor(c.start / 60)}:${String(Math.floor(c.start % 60)).padStart(2, '0')}] ${c.text}`).join('\n') : res.text}</pre>
          <div className="row">
            <button onClick={() => void navigator.clipboard.writeText(res.display)}>Copy</button>
            {props.onUse && <button onClick={() => props.onUse!(res.text)}>Use in the draft</button>}
          </div>
        </>
      )}
      {err && !res && (
        <>
          <p className="warn">{err}</p>
          <div className="row">
            <button onClick={() => void file()} disabled={busy}>Use a file...</button>
          </div>
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Or paste the transcript here" rows={6} />
          <div className="row">
            <button onClick={() => void get({ input: props.url, text: paste })} disabled={busy || !paste.trim()}>Use pasted text</button>
          </div>
        </>
      )}
    </div>
  )
}
