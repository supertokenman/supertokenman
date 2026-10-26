// Content pieces: one video or post followed from the idea to the queue, with what it cost. The
// stages are fixed so every project feels the same; the engine (how a script becomes media) depends
// on the project.

import { LOCAL_VOICES } from '../../shared/voices.js'

export type Stage = 'idea' | 'script' | 'render' | 'check' | 'review' | 'queued'
export const STAGES: Stage[] = ['idea', 'script', 'render', 'check', 'review', 'queued']
export type Format = 'reel' | 'carousel' | 'post'
export type EngineId = 'bzcorrida' | 'revideo' | 'text'

export type Usage = { inputTokens: number; outputTokens: number; cacheRead: number; cacheWrite: number; costUsd: number; turns: number; window5hStart?: number; window5hNow?: number }
export type Check = { name: string; ok: boolean; detail: string; warn?: boolean }

export type Piece = {
  id: string
  project: string
  title: string
  format: Format
  engine: EngineId
  stage: Stage
  idea: string
  /** where the script lives (bzcorrida: the roteiro JSON) */
  scriptPath?: string
  outputs: string[]
  caption: string
  checks: Check[]
  /** a contact sheet of key frames, for review at a glance */
  sheet?: string
  usage: Usage
  createdAt: number
  queueId?: string
  /** a music file the person has the rights to, mixed at -14 LUFS */
  music?: string
  /** where the music license is, kept with the piece */
  musicLicense?: string
  /** Local Kokoro voice for the narration (its language follows), 'eleven:<voice id>' for ElevenLabs, or 'none' */
  voice?: string
  /** ElevenLabs characters the last render spent */
  voiceChars?: number
  voiceSpeed?: number
}

export const emptyUsage = (): Usage => ({ inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, turns: 0 })

export function cleanPiece(p: Partial<Piece>, now = Date.now()): Piece {
  const title = String(p.title ?? '').trim().slice(0, 120) || 'Untitled'
  const slug = title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32) || 'peca'
  return {
    id: p.id && /^[a-z0-9_]{2,60}$/.test(p.id) ? p.id : `c${now.toString(36)}_${slug}`,
    project: String(p.project ?? ''),
    title,
    format: p.format === 'carousel' || p.format === 'post' ? p.format : 'reel',
    engine: p.engine === 'bzcorrida' || p.engine === 'revideo' ? p.engine : 'text',
    stage: STAGES.includes(p.stage as Stage) ? (p.stage as Stage) : 'idea',
    idea: String(p.idea ?? '').slice(0, 4000),
    scriptPath: p.scriptPath,
    outputs: Array.isArray(p.outputs) ? p.outputs.map(String) : [],
    caption: String(p.caption ?? '').slice(0, 5000),
    checks: Array.isArray(p.checks) ? p.checks : [],
    sheet: p.sheet,
    usage: { ...emptyUsage(), ...(p.usage ?? {}) },
    createdAt: p.createdAt ?? now,
    queueId: p.queueId,
    music: p.music ? String(p.music) : undefined,
    musicLicense: p.musicLicense ? String(p.musicLicense).slice(0, 500) : undefined,
    voice: [...LOCAL_VOICES, 'none'].includes(String(p.voice)) || /^eleven:[A-Za-z0-9]{8,40}$/.test(String(p.voice)) ? String(p.voice) : undefined,
    voiceChars: typeof p.voiceChars === 'number' && p.voiceChars >= 0 ? Math.round(p.voiceChars) : undefined,
    voiceSpeed: typeof p.voiceSpeed === 'number' ? Math.min(1.4, Math.max(0.8, p.voiceSpeed)) : undefined,
  }
}

/** A turn of a panel working on the piece, added to its meter; the 5-hour window is read before and after. */
export function addTurn(u: Usage, t: { inputTokens: number; outputTokens: number; cacheRead: number; cacheWrite: number; costUsd: number }, window5h?: number): Usage {
  return {
    inputTokens: u.inputTokens + t.inputTokens,
    outputTokens: u.outputTokens + t.outputTokens,
    cacheRead: u.cacheRead + t.cacheRead,
    cacheWrite: u.cacheWrite + t.cacheWrite,
    costUsd: u.costUsd + t.costUsd,
    turns: u.turns + 1,
    window5hStart: u.window5hStart ?? window5h,
    window5hNow: window5h ?? u.window5hNow,
  }
}

/** Roughly how much of the plan's 5-hour window the piece took (other panels share it, so it is an upper bound). */
export const windowShare = (u: Usage) => (u.window5hStart != null && u.window5hNow != null ? Math.max(0, u.window5hNow - u.window5hStart) : null)

/** The quality bar for social video, from ffprobe's JSON and the measured loudness. */
export function videoChecks(probe: { streams?: { codec_type?: string; width?: number; height?: number; avg_frame_rate?: string; codec_name?: string }[]; format?: { duration?: string; bit_rate?: string } }, lufs: number | null, format: Format): Check[] {
  const v = probe.streams?.find((s) => s.codec_type === 'video')
  const a = probe.streams?.find((s) => s.codec_type === 'audio')
  const [n, d] = (v?.avg_frame_rate ?? '0/1').split('/').map(Number)
  const fps = d ? n! / d : 0
  const dur = Number(probe.format?.duration ?? 0)
  const mbps = Number(probe.format?.bit_rate ?? 0) / 1e6
  const out: Check[] = []
  const w = v?.width ?? 0
  const h = v?.height ?? 0
  out.push({ name: 'Size', ok: w === 1080 && h === 1920, warn: w > 0 && h / w > 1.7 && !(w === 1080 && h === 1920), detail: `${w}×${h}${w === 1080 && h === 1920 ? ', 9:16 full HD' : ', platforms expect 1080×1920'}` })
  out.push({ name: 'Frame rate', ok: fps >= 29.9, warn: fps >= 23.9 && fps < 29.9, detail: `${fps ? Math.round(fps * 100) / 100 : '?'} fps` })
  out.push({ name: 'Length', ok: format !== 'reel' || (dur >= 3 && dur <= 90), detail: `${dur.toFixed(1)} s${format === 'reel' && dur > 90 ? ', Reels over 90 s lose reach' : ''}` })
  out.push({ name: 'Codec', ok: v?.codec_name === 'h264', detail: `${v?.codec_name ?? '?'}${v?.codec_name === 'h264' ? '' : ', H.264 plays everywhere'}` })
  out.push({ name: 'Bitrate', ok: mbps >= 5, warn: mbps >= 2.5 && mbps < 5, detail: `${mbps.toFixed(1)} Mb/s${mbps < 5 ? ', 5 Mb/s or more keeps detail after upload' : ''}` })
  if (!a) out.push({ name: 'Audio', ok: false, warn: true, detail: 'No audio track: silent videos reach fewer people' })
  else out.push({ name: 'Loudness', ok: lufs != null && lufs >= -16 && lufs <= -12, warn: lufs != null && lufs >= -20 && lufs <= -10, detail: lufs == null ? 'not measured' : `${lufs.toFixed(1)} LUFS, target −14` })
  return out
}

/** The integrated loudness from ffmpeg's ebur128 summary. */
export function parseLufs(stderr: string): number | null {
  const m = /Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+)\s*LUFS/.exec(stderr)
  return m ? Number(m[1]) : null
}

export const passed = (cs: Check[]) => cs.every((c) => c.ok || c.warn)
