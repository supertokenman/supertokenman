// Voice for panels, all on this machine: dictation into the composer (Whisper) and replies read aloud
// (Kokoro). These are the parts with no microphone or speaker: what to read, and where dictation goes.

/** A reply as it should sound: code blocks, links and markdown marks are not read out. */
export function spokenText(md: string, max = 2000): string {
  let t = md
    .replace(/```[\s\S]*?(```|(?![\s\S]))/g, ' (code block) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '(link)')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\|.*\|\s*$/gm, '')
    .replace(/[*_~>]+/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
  if (t.length > max) t = `${t.slice(0, t.lastIndexOf(' ', max) > 0 ? t.lastIndexOf(' ', max) : max)}. The rest is on screen.`
  return t
}

/** Dictated text into the draft at the cursor, with a space where words would touch. Never sent by itself. */
export function insertDictation(draft: string, at: number, heard: string): { draft: string; cursor: number } {
  const text = heard.trim()
  if (!text) return { draft, cursor: at }
  const before = draft.slice(0, at)
  const after = draft.slice(at)
  const lead = before && !/\s$/.test(before) ? ' ' : ''
  const tail = after && !/^\s/.test(after) ? ' ' : ''
  const piece = `${lead}${text}${tail}`
  return { draft: before + piece + after, cursor: before.length + piece.length - tail.length }
}

/** The Kokoro voice for a language the person picked, or the Whisper language for a Kokoro voice. */
export const whisperLang = (voice: string) => ({ a: 'en', b: 'en', e: 'es', f: 'fr', i: 'it', p: 'pt', z: 'zh', h: 'hi' } as Record<string, string>)[voice[0] ?? ''] ?? ''
