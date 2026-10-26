// Spotify on the Mac, through the desktop app's AppleScript dictionary: what is playing, the
// controls, and playlists saved by link. No API key and no Premium needed for this part.
import { execFile } from 'node:child_process'

export type NowPlaying = {
  running: boolean
  state: 'playing' | 'paused' | 'stopped'
  track: string
  artist: string
  album: string
  durationMs: number
  positionMs: number
  artwork: string
  uri: string
  volume: number
}

export type Run = (script: string) => Promise<string>

export const osascript: Run = (script) =>
  new Promise((resolve, reject) =>
    execFile('osascript', ['-e', script], { timeout: 5000 }, (err, stdout, stderr) => (err ? reject(new Error(stderr.trim() || err.message)) : resolve(stdout.trim()))),
  )

const SEP = '|~|'
const NOW = `if application "Spotify" is running then
tell application "Spotify"
set s to player state as string
if s is "stopped" then return "stopped"
set t to current track
return s & "${SEP}" & (name of t) & "${SEP}" & (artist of t) & "${SEP}" & (album of t) & "${SEP}" & (duration of t) & "${SEP}" & (player position) & "${SEP}" & (artwork url of t) & "${SEP}" & (spotify url of t) & "${SEP}" & (sound volume)
end tell
else
return "not running"
end if`

const OFF: NowPlaying = { running: false, state: 'stopped', track: '', artist: '', album: '', durationMs: 0, positionMs: 0, artwork: '', uri: '', volume: 0 }

/** What Spotify is playing, or that it is closed or stopped. */
export async function nowPlaying(run: Run = osascript): Promise<NowPlaying> {
  const out = await run(NOW)
  if (out === 'not running') return OFF
  if (out === 'stopped') return { ...OFF, running: true }
  const [state, track, artist, album, duration, position, artwork, uri, volume] = out.split(SEP)
  return {
    running: true,
    state: state === 'playing' ? 'playing' : 'paused',
    track: track ?? '',
    artist: artist ?? '',
    album: album ?? '',
    durationMs: Number(duration) || 0,
    // the dictionary gives the position in seconds, with decimals
    positionMs: Math.round((Number(String(position).replace(',', '.')) || 0) * 1000),
    artwork: artwork ?? '',
    uri: uri ?? '',
    volume: Number(volume) || 0,
  }
}

/** A Spotify link or URI for a playlist, album, track, artist or show, as a URI; null otherwise. */
export function toUri(input: string): string | null {
  const s = input.trim()
  const uri = s.match(/^spotify:(playlist|album|track|artist|show|episode):([A-Za-z0-9]{10,})$/)
  if (uri) return s
  const url = s.match(/^https?:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(playlist|album|track|artist|show|episode)\/([A-Za-z0-9]{10,})/)
  return url ? `spotify:${url[1]}:${url[2]}` : null
}

export type Command = { kind: 'toggle' } | { kind: 'next' } | { kind: 'previous' } | { kind: 'play'; uri: string } | { kind: 'volume'; value: number } | { kind: 'seek'; seconds: number }

/** The AppleScript for a command; a URI is checked before it is put in the script. */
export function script(c: Command): string {
  const tell = (body: string) => `tell application "Spotify" to ${body}`
  switch (c.kind) {
    case 'toggle':
      return tell('playpause')
    case 'next':
      return tell('next track')
    case 'previous':
      return tell('previous track')
    case 'play': {
      const uri = toUri(c.uri)
      if (!uri) throw new Error('Not a Spotify link.')
      return tell(`play track "${uri}"`)
    }
    case 'volume':
      return tell(`set sound volume to ${Math.max(0, Math.min(100, Math.round(c.value)))}`)
    case 'seek':
      return tell(`set player position to ${Math.max(0, Math.round(c.seconds))}`)
  }
}

export type Saved = { uri: string; title: string; image: string }

/** Title and cover of a Spotify link, from the public oEmbed endpoint (no sign-in). */
export async function describe(link: string, getJson: (url: string) => Promise<unknown>): Promise<Saved> {
  const uri = toUri(link)
  if (!uri) throw new Error('Paste a Spotify link, like https://open.spotify.com/playlist/...')
  const [, kind, id] = uri.split(':')
  try {
    const j = (await getJson(`https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/${kind}/${id}`)}`)) as { title?: string; thumbnail_url?: string }
    return { uri, title: j.title || `${kind} ${id!.slice(0, 6)}`, image: j.thumbnail_url ?? '' }
  } catch {
    return { uri, title: `${kind} ${id!.slice(0, 6)}`, image: '' }
  }
}
