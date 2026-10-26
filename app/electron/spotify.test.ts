import { describe as group, expect, it } from 'vitest'
import { describe, nowPlaying, script, toUri } from './spotify'

group('spotify', () => {
  it('reads what is playing, closed or stopped', async () => {
    expect(await nowPlaying(async () => 'not running')).toMatchObject({ running: false })
    expect(await nowPlaying(async () => 'stopped')).toMatchObject({ running: true, state: 'stopped' })
    const np = await nowPlaying(async () => ['playing', 'Strobe', 'deadmau5', 'For Lack of a Better Name', '637000', '81,532', 'https://i.scdn.co/image/ab', 'spotify:track:4xHWH1jxXtM', '70'].join('|~|'))
    expect(np).toEqual({ running: true, state: 'playing', track: 'Strobe', artist: 'deadmau5', album: 'For Lack of a Better Name', durationMs: 637000, positionMs: 81532, artwork: 'https://i.scdn.co/image/ab', uri: 'spotify:track:4xHWH1jxXtM', volume: 70 })
  })

  it('turns links into URIs and refuses anything else', () => {
    expect(toUri('https://open.spotify.com/playlist/37i9dQZF1DX8Uebhn9wzrS?si=abc')).toBe('spotify:playlist:37i9dQZF1DX8Uebhn9wzrS')
    expect(toUri('https://open.spotify.com/intl-pt/album/1ATL5GLyefJaxhQzSPVrLX')).toBe('spotify:album:1ATL5GLyefJaxhQzSPVrLX')
    expect(toUri('spotify:playlist:37i9dQZF1DX8Uebhn9wzrS')).toBe('spotify:playlist:37i9dQZF1DX8Uebhn9wzrS')
    expect(toUri('https://evil.com/playlist/37i9dQZF1DX8Uebhn9wzrS')).toBeNull()
    expect(toUri('spotify:playlist:x" & do shell script "rm')).toBeNull()
  })

  it('writes the scripts, never with an unchecked string inside', () => {
    expect(script({ kind: 'toggle' })).toBe('tell application "Spotify" to playpause')
    expect(script({ kind: 'play', uri: 'https://open.spotify.com/playlist/37i9dQZF1DX8Uebhn9wzrS' })).toBe('tell application "Spotify" to play track "spotify:playlist:37i9dQZF1DX8Uebhn9wzrS"')
    expect(() => script({ kind: 'play', uri: '" & do shell script "rm -rf ~' })).toThrow('Not a Spotify link')
    expect(script({ kind: 'volume', value: 140 })).toBe('tell application "Spotify" to set sound volume to 100')
  })

  it('names a saved link from oEmbed, with a fallback', async () => {
    const ok = await describe('https://open.spotify.com/playlist/37i9dQZF1DX8Uebhn9wzrS', async () => ({ title: 'Deep Focus', thumbnail_url: 'https://image-cdn.spotifycdn.com/x' }))
    expect(ok).toEqual({ uri: 'spotify:playlist:37i9dQZF1DX8Uebhn9wzrS', title: 'Deep Focus', image: 'https://image-cdn.spotifycdn.com/x' })
    const offline = await describe('spotify:album:1ATL5GLyefJaxhQzSPVrLX', async () => { throw new Error('offline') })
    expect(offline.title).toBe('album 1ATL5G')
    await expect(describe('hello', async () => ({}))).rejects.toThrow('Paste a Spotify link')
  })
})
