import { useEffect, useRef, useState } from 'react'
import { encodeWav, PILL_TEXT, resample16k, type PillState } from '../shared/dictation'
import './bridge'

const MAX_SECONDS = 120

/**
 * The small floating pill of Dictate anywhere. It lives in its own window that never takes focus, so the
 * app being typed into keeps it. It also records: the main process says record or stop, and the audio goes
 * back as a 16 kHz WAV, to be turned into text on this Mac.
 */
export function DictationPill() {
  const [st, setSt] = useState<{ state: PillState; detail: string }>({ state: 'listening', detail: '' })
  const [level, setLevel] = useState(0)
  const rec = useRef<{ stop: () => void } | null>(null)
  useEffect(() => {
    document.documentElement.classList.add('dpill-root')
    const d = window.stm.dictation
    const off = [
      d.onState(setSt),
      d.onRecord(() => void start()),
      d.onStop(() => rec.current?.stop()),
    ]
    async function start() {
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      } catch {
        return void d.micFailed('No microphone, or access to it was refused.')
      }
      const ctx = new AudioContext()
      const src = ctx.createMediaStreamSource(stream)
      const node = ctx.createScriptProcessor(4096, 1, 1)
      const chunks: Float32Array[] = []
      let done = false
      node.onaudioprocess = (e) => {
        const a = new Float32Array(e.inputBuffer.getChannelData(0))
        chunks.push(a)
        let s = 0
        for (let i = 0; i < a.length; i += 8) s += a[i] * a[i]
        setLevel(Math.min(1, Math.sqrt(s / (a.length / 8)) * 6))
        if (chunks.length * 4096 > ctx.sampleRate * MAX_SECONDS) stop()
      }
      src.connect(node)
      node.connect(ctx.destination)
      function stop() {
        if (done) return
        done = true
        rec.current = null
        node.disconnect()
        src.disconnect()
        stream.getTracks().forEach((t) => t.stop())
        const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0))
        let o = 0
        for (const c of chunks) (all.set(c, o), (o += c.length))
        const rate = ctx.sampleRate
        void ctx.close()
        setLevel(0)
        void d.audio(encodeWav(resample16k(all, rate), Math.min(rate, 16000)))
      }
      rec.current = { stop }
    }
    return () => off.forEach((f) => f())
  }, [])
  const bars = [0.5, 0.8, 1, 0.8, 0.5]
  return (
    <div className={`dpill ${st.state}`} role="status" aria-live="polite">
      <div className="dpill-in">
        {st.state === 'listening' ? (
          <span className="dpill-bars" aria-hidden="true">
            {bars.map((b, i) => (
              <i key={i} style={{ transform: `scaleY(${0.18 + level * b})` }} />
            ))}
          </span>
        ) : (
          <span className="dpill-dot" aria-hidden="true" />
        )}
        <span className="dpill-text">
          {st.state === 'error' || st.state === 'setup' || st.state === 'copied' ? st.detail || PILL_TEXT[st.state] : PILL_TEXT[st.state]}
        </span>
      </div>
    </div>
  )
}
