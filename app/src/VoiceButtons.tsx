import { useEffect, useRef, useState } from 'react'
import { IconMic, IconSpeaker, IconStop } from './icons'
import { spokenText, whisperLang } from '../shared/voicecmd'

const clean = (e: unknown) => String((e as Error)?.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
let ready: Promise<{ ready: boolean; voice: string }> | null = null
const local = () => (ready ??= window.stm.localVoice.get())

/**
 * Dictation: click to record, click again to stop; Whisper turns it into text on this machine and the
 * text goes into the draft. It is never sent by itself, and the recording is deleted once it is text.
 */
export function DictateButton(props: { onText: (text: string) => void; onNote: (note: string) => void }) {
  const [state, setState] = useState<'idle' | 'rec' | 'busy'>('idle')
  const rec = useRef<MediaRecorder | null>(null)
  useEffect(() => () => rec.current?.stream.getTracks().forEach((t) => t.stop()), [])
  const start = async () => {
    const v = await local()
    if (!v.ready) return props.onNote('Voice is not installed. Install it in Content: Install voice (local, about 500 MB).')
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      return props.onNote('No microphone, or access to it was refused.')
    }
    const chunks: Blob[] = []
    const r = new MediaRecorder(stream)
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    r.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop())
      setState('busy')
      try {
        const audio = new Uint8Array(await new Blob(chunks).arrayBuffer())
        const { text } = await window.stm.localVoice.hear(audio, whisperLang(v.voice))
        if (text) props.onText(text)
        else props.onNote('Nothing heard.')
      } catch (e) {
        props.onNote(clean(e))
      } finally {
        setState('idle')
      }
    }
    rec.current = r
    r.start()
    setState('rec')
  }
  return (
    <button
      className={`dictate ${state}`}
      title={state === 'rec' ? 'Stop and turn into text' : state === 'busy' ? 'Turning into text...' : 'Dictate (local, never sent by itself)'}
      aria-label={state === 'rec' ? 'Stop dictation' : 'Dictate'}
      aria-pressed={state === 'rec'}
      disabled={state === 'busy'}
      onClick={() => (state === 'rec' ? rec.current?.stop() : void start())}
    >
      {state === 'rec' ? <IconStop /> : <IconMic />}
    </button>
  )
}

/** Reads a reply aloud with the local Kokoro voice; code, links and markdown are left out. */
export function ReadAloud(props: { text: string; onNote: (note: string) => void }) {
  const [state, setState] = useState<'idle' | 'busy' | 'play'>('idle')
  const audio = useRef<HTMLAudioElement | null>(null)
  useEffect(() => () => audio.current?.pause(), [])
  const play = async () => {
    const v = await local()
    if (!v.ready) return props.onNote('Voice is not installed. Install it in Content: Install voice (local, about 500 MB).')
    setState('busy')
    try {
      const wav = await window.stm.localVoice.speak(spokenText(props.text), v.voice)
      const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(wav), (c) => c.charCodeAt(0))], { type: 'audio/wav' }))
      const a = new Audio(url)
      audio.current = a
      a.onended = () => (URL.revokeObjectURL(url), setState('idle'))
      await a.play()
      setState('play')
    } catch (e) {
      props.onNote(clean(e))
      setState('idle')
    }
  }
  return (
    <button className="ghost small read-aloud" title="Read the reply aloud (local voice)" aria-label={state === 'play' ? 'Stop reading' : 'Read aloud'} disabled={state === 'busy'} onClick={() => (state === 'play' ? (audio.current?.pause(), setState('idle')) : void play())}>
      {state === 'play' ? <IconStop /> : <IconSpeaker />}{state === 'busy' ? 'Reading...' : state === 'play' ? 'Stop' : 'Read'}
    </button>
  )
}
