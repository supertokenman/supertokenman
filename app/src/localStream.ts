import { useEffect, useRef, useState } from 'react'

type Msg = { role: 'system' | 'user' | 'assistant'; content: string }

/** One streamed answer from the local model: its text as it grows, whether it is running, and a stop. */
export function useLocalStream() {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const id = useRef('')
  useEffect(() => window.stm.local.onDelta((who, d) => who === id.current && setText((t) => t + d)), [])
  const run = async (messages: Msg[], kind: 'chat' | 'explain' | 'shrink') => {
    id.current = `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    setText('')
    setError('')
    setBusy(true)
    const r = await window.stm.local.chat(id.current, messages, kind)
    setBusy(false)
    if (r.error) setError(r.error)
    return r
  }
  const stop = () => void window.stm.local.stop(id.current)
  return { text, busy, error, run, stop, setText }
}

export const EXPLAIN = 'You explain errors to a developer. Read the output, find the error that matters, and answer in at most 5 short lines: what failed, the most likely cause, and the next thing to try (a command or a change). If nothing failed, say so in one line. No preamble.'
export const SHRINK = 'Shorten the text below for another AI that will act on it. Keep every error line, file path, line number, name, number and command exactly as written; drop repetition, progress bars, timestamps and noise. Answer with the shortened text only.'

/** One whole answer from the local model, for a job with no live view (Shrink). */
export async function askOnce(system: string, input: string, kind: 'explain' | 'shrink') {
  const id = `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  let out = ''
  const off = window.stm.local.onDelta((who, d) => who === id && (out += d))
  try {
    const r = await window.stm.local.chat(id, [{ role: 'system', content: system }, { role: 'user', content: input }], kind)
    if (r.error) throw new Error(r.error)
    return out.trim()
  } finally {
    off()
  }
}
