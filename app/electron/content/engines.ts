// Engines: how a project turns a script into media. bzcorrida's studio (roteiro JSON to Reel or
// carousel) is found in the project; Revideo is the default engine for other projects; text needs no render.
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { langOf } from '../../shared/voices.js'
import type { EngineId, Format, Piece } from './pieces.js'

export type Found = { id: EngineId; root?: string; label: string; ready: boolean; note: string }

/** Where the app's own Revideo engine lives, and where pieces keep their files; set by the main process. */
export const paths = { revideo: '', voice: '', pieces: '' }

export const voiceReady = () => Boolean(paths.voice) && existsSync(join(paths.voice, 'models', 'kokoro-v1.0.onnx')) && existsSync(join(paths.voice, '.venv'))

export function detect(project: string, format: Format = 'reel'): Found {
  if (format === 'post') return { id: 'text', label: 'Text post', ready: true, note: 'No render: a caption and an optional image link.' }
  for (const root of [join(project, 'studio'), project])
    if (existsSync(join(root, 'bz', 'gerar.py'))) return { id: 'bzcorrida', root, label: 'Bia & Zé studio', ready: true, note: 'Roteiro JSON to Reel or carousel, rendered on this Mac.' }
  const ready = Boolean(paths.revideo) && existsSync(join(paths.revideo, 'node_modules', '@revideo', 'renderer'))
  return { id: 'revideo', root: paths.revideo, label: 'Revideo', ready, note: ready ? 'Motion templates rendered on this Mac (MIT, free).' : 'Install the video engine once (about 300 MB, from npm).' }
}

/** The fields a Revideo template takes; Claude fills these, never animation code. */
export const REVIDEO_SCHEMA = `{
  "id": "<piece id>",
  "caption": "the post caption: hook line, short paragraphs, one call to action, at most 5 hashtags",
  "data": {
    "template": "explainer" (teach 3 to 5 steps), "launch" (a product or feature), "stat" (one number that carries the message) or "quote" (a line from a person),
    "brand": { "bg", "surface", "text", "muted", "accent", "onAccent", "accent2": hex colors; "font": CSS font stack; "display": "SuperToken Display" or a system font; "upper": true or false },
    "hook": "6 words max, the promise or the question; wrap 1 or 2 key words in *asterisks* for the accent color",
    "kicker": "topic · length, small line above the hook",
    "points": [ { "title": "2 to 4 words", "body": "one short line", "value": "optional short number or tag", "say": "what the voice says on this screen, one short spoken sentence" } ],
    "cta": "4 to 6 words",
    "handle": "@account",
    "product": { "name": "...", "tagline": "...", "say": "..." } (launch only),
    "stat": { "value": "73%", "label": "what the number means, 6 words max", "source": "where it comes from (required)", "say": "..." } (stat only; never invent a number: use a real, cited one or do not use this template),
    "quote": { "text": "the quote, 25 words max", "author": "who said it", "role": "optional", "say": "..." } (quote only; real quotes only, with their author),
    "say": { "hook": "spoken version of the hook", "cta": "spoken call to action" },
    "pace": seconds per point, 2.4 to 3.4
  }
}`

/** What the panel is asked to write for the piece, in the engine's own format. */
export function scriptPrompt(p: Piece, e: Found): string {
  if (e.id === 'bzcorrida')
    return [
      `Write a new roteiro for the studio: "${p.title}" (${p.format}).`,
      `Idea: ${p.idea || p.title}`,
      '',
      `Save it as ${join(e.root!, 'bz', 'roteiros', `${p.id}.json`)} with "id": "${p.id}" and "tipo": "${p.format === 'carousel' ? 'carrossel' : 'reel'}".`,
      'Read two existing files in bz/roteiros first and follow their format exactly (cenas, dur, titulo, sub, ciclo, legenda, nivel, fonte, fontes_links). Use only poses and cycles that exist in the studio.',
      'Follow the project rules in CLAUDE.md: evidence level, a visible source, the health notice, no promises.',
      'Hook in the first 1.5 s; total 15 to 30 s for a Reel. Do not render; just write the file and say its path.',
    ].join('\n')
  if (e.id === 'revideo')
    return [
      `Write the video script for "${p.title}" as JSON for the app's Revideo template.`,
      `Idea: ${p.idea || p.title}`,
      '',
      `Save it as ${p.scriptPath} with this shape (JSON only, no comments):`,
      REVIDEO_SCHEMA.replace('<piece id>', p.id),
      '',
      'Use the project’s own brand colors and tone if it has them (look for design tokens, a Tailwind theme, a brand file or the landing page); otherwise keep the default brand: bg #141413, surface #1f1e1b, text #f4efe6, muted #b0aea5, accent #d97757, onAccent #141413, accent2 #9fc48a, font Inter/system, display SuperToken Display, upper true.',
      'Text must read in 1.5 seconds per screen: short words, no sentences in titles. The "say" lines are spoken: natural, in the language of the audience, one sentence each, numbers written as words. Total 12 to 30 seconds. Do not render; write the file and say its path.',
      ...(langOf(p.voice ?? '') ? [`The narration voice speaks ${langOf(p.voice!)!.name}: write every "say" line, and the on-screen text, in that language.`] : []),
    ].join('\n')
  return [`Write the post "${p.title}" for ${p.format === 'carousel' ? 'a carousel' : 'social media'}.`, `Idea: ${p.idea || p.title}`, '', 'Give the caption only: a strong first line, short paragraphs, one call to action, at most 5 hashtags.'].join('\n')
}

/** The render command for the engine; null when the engine renders nothing. */
export function renderCommand(p: Piece, e: Found): { cmd: string; args: string[]; cwd: string; outDir: string } | null {
  if (!p.scriptPath) return null
  if (e.id === 'revideo') {
    const outDir = join(dirname(p.scriptPath), 'out')
    return { cmd: 'node', args: [join(e.root!, 'render.mjs'), p.scriptPath, outDir, ...(p.music ? ['--music', p.music] : []), ...(p.voice ? ['--voice', p.voice] : []), ...(p.voiceSpeed ? ['--speed', String(p.voiceSpeed)] : [])], cwd: e.root!, outDir }
  }
  if (e.id !== 'bzcorrida') return null
  const outDir = join(e.root!, 'out', 'content')
  return { cmd: 'python3', args: ['bz/gerar.py', p.scriptPath, outDir], cwd: e.root!, outDir }
}

export const isVideo = (f: string) => /\.(mp4|mov|webm)$/i.test(f)
export const isImage = (f: string) => /\.(png|jpe?g|webp)$/i.test(f)
export const formatOf = (outputs: string[]): Format => (outputs.some(isVideo) ? 'reel' : outputs.some(isImage) ? 'carousel' : 'post')
