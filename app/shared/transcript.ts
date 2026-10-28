// Video transcripts: the pure parts. Route choice, video ids and caption parsing (WebVTT, SRT, the
// JSON whisper.cpp writes), shared by the main process, the renderer and the tests.
// Decision and its sources: docs/BRAND.md, "Video transcripts" (2026-10-28).

export type Route = 'paste' | 'subtitle-file' | 'whisper' | 'yt-dlp'
export type Cue = { start: number; text: string }
export type Transcript = { id: string; source: string; route: Route; text: string; cues: Cue[]; truncated: boolean; at: number }

export const ROUTE_LABEL: Record<Route, string> = { paste: 'Pasted by you', 'subtitle-file': 'Your subtitle file', whisper: 'whisper.cpp on this Mac', 'yt-dlp': 'Your yt-dlp' }

/** Longest transcript kept, in characters; the rest is cut and marked. */
export const MAX_TEXT = 200_000
const SUBS = /\.(vtt|srt)$/i
const MEDIA = /\.(wav|mp3|m4a|ogg|flac|mp4|mov|mkv|webm|aac)$/i

export function youtubeId(input: string): string | null {
  try {
    const u = new URL(input)
    const h = u.hostname.replace(/^(www\.|m\.|music\.)/, '')
    if (h === 'youtu.be') return /^[\w-]{11}$/.test(u.pathname.slice(1)) ? u.pathname.slice(1) : null
    if (h !== 'youtube.com' && h !== 'youtube-nocookie.com') return null
    const v = u.searchParams.get('v') ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/)?.[1] ?? null
    return v && /^[\w-]{11}$/.test(v) ? v : null
  } catch {
    return null
  }
}

export const isYoutube = (input: string) => /^https?:\/\/([\w-]+\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)(\/|$)/i.test(input)

export type Pick = { route: Route } | { refuse: string }

/**
 * Which route serves an input. YouTube links are refused for automated fetching: YouTube's terms forbid
 * automated access and downloads without its permission, so the app neither fetches them nor runs a tool
 * on them. A file the person has, a pasted transcript, or a non-YouTube link with their own yt-dlp.
 */
export function pickRoute(input: string, tools: { ytdlp: boolean; whisper: boolean }): Pick {
  const s = input.trim()
  if (!s) return { refuse: 'Give a video link, a file, or paste the transcript.' }
  if (/^https?:\/\//i.test(s)) {
    if (isYoutube(s)) return { refuse: "YouTube's terms do not allow automated downloads, so the app does not fetch YouTube captions. Paste the transcript (YouTube shows it under the video: ... > Show transcript), or use a file you have the rights to." }
    if (!tools.ytdlp) return { refuse: 'Links need yt-dlp, installed by you (the app does not ship it). Or paste the transcript.' }
    return { route: 'yt-dlp' }
  }
  if (SUBS.test(s)) return { route: 'subtitle-file' }
  if (MEDIA.test(s)) return tools.whisper ? { route: 'whisper' } : { refuse: 'Audio and video files need whisper.cpp (whisper-cli) installed by you, with a model. Or paste the transcript.' }
  return { refuse: 'Not a link, a .vtt/.srt file, or an audio or video file.' }
}

const clock = (t: string): number => {
  const p = t.trim().replace(',', '.').split(':').map(Number)
  return p.reduce((a, n) => a * 60 + n, 0)
}

const strip = (l: string) =>
  l
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .trim()

/** WebVTT or SRT to cues. Auto captions repeat the previous line as they roll; repeats are dropped. */
export function parseSubs(raw: string): Cue[] {
  const out: Cue[] = []
  const blocks = raw.replace(/\r/g, '').replace(/^﻿/, '').split(/\n\s*\n/)
  let last = ''
  for (const b of blocks) {
    const lines = b.split('\n')
    const i = lines.findIndex((l) => l.includes('-->'))
    if (i < 0) continue
    const start = clock(lines[i].split('-->')[0])
    for (const l of lines.slice(i + 1).map(strip).filter(Boolean)) {
      if (l === last) continue
      last = l
      out.push({ start, text: l })
    }
  }
  return out
}

/** whisper.cpp's -oj output: { transcription: [{ offsets: { from: ms }, text }] } */
export function parseWhisperJson(raw: string): Cue[] {
  const j = JSON.parse(raw) as { transcription?: { offsets?: { from?: number }; text?: string }[] }
  return (j.transcription ?? []).map((s) => ({ start: (s.offsets?.from ?? 0) / 1000, text: (s.text ?? '').trim() })).filter((c) => c.text)
}

const stamp = (s: number) => {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(sec).padStart(2, '0')}`
}

/** Plain text; with timestamps each line starts [m:ss]. */
export function toText(cues: Cue[], timestamps = false): string {
  if (timestamps) return cues.map((c) => `[${stamp(c.start)}] ${c.text}`).join('\n')
  return cues
    .map((c) => c.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Cut at the cap; says so. */
export function cap(text: string, max = MAX_TEXT): { text: string; truncated: boolean } {
  return text.length <= max ? { text, truncated: false } : { text: text.slice(0, max), truncated: true }
}
