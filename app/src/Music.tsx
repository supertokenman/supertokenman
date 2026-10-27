import { useEffect, useRef, useState } from 'react'
import { IconClose } from './icons'
import { friendly } from './errors'
import type { NowPlaying, Saved } from '../electron/spotify'

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`

/** What Spotify plays, polled; the position runs on locally between polls. */
export function useSpotify(open: boolean) {
  const [np, setNp] = useState<NowPlaying | null>(null)
  const [at, setAt] = useState(Date.now())
  const poll = useRef<() => void>(() => {})
  poll.current = () =>
    void window.stm.spotifyNow().then((n) => {
      setNp(n)
      setAt(Date.now())
    })
  useEffect(() => {
    poll.current()
    // no one sees the player while the window is hidden: ask again the moment it shows
    const t = setInterval(() => !document.hidden && poll.current(), open ? 1500 : 8000)
    const show = () => !document.hidden && poll.current()
    document.addEventListener('visibilitychange', show)
    return () => (clearInterval(t), document.removeEventListener('visibilitychange', show))
  }, [open])
  const [, tick] = useState(0)
  useEffect(() => {
    if (np?.state !== 'playing') return
    const t = setInterval(() => !document.hidden && tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [np?.state])
  const position = np ? Math.min(np.durationMs, np.positionMs + (np.state === 'playing' ? Date.now() - at : 0)) : 0
  return { np, position, refresh: () => poll.current() }
}

/** The chip in the top bar: cover and title while something plays. */
export function MusicChip({ np, onClick }: { np: NowPlaying; onClick: () => void }) {
  return (
    <button className="music-chip" onClick={onClick} title={`${np.track} · ${np.artist}`}>
      {np.artwork ? <img src={np.artwork} alt="" /> : <span className="music-dot" />}
      <span className="music-eq" data-on={np.state === 'playing'}>
        <i /><i /><i />
      </span>
      <span className="music-title">{np.track}</span>
    </button>
  )
}

const Btn = ({ d, label, onClick, big }: { d: string; label: string; onClick: () => void; big?: boolean }) => (
  <button className={`music-btn ${big ? 'big' : ''}`} aria-label={label} title={label} onClick={onClick}>
    <svg width={big ? 18 : 14} height={big ? 18 : 14} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  </button>
)

/** The player: cover, track, seekable progress, controls, volume and saved playlists. */
export function MusicSheet(props: { np: NowPlaying | null; position: number; refresh: () => void; onClose: () => void }) {
  const { np, position } = props
  const [saved, setSaved] = useState<Saved[]>([])
  const [link, setLink] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => void window.stm.spotifySaved().then(setSaved), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props])

  const cmd = async (c: Parameters<typeof window.stm.spotifyCmd>[0]) => {
    await window.stm.spotifyCmd(c).catch((e: Error) => setError(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')))
    setTimeout(props.refresh, 250)
  }
  const add = async () => {
    setError('')
    setBusy(true)
    try {
      setSaved(await window.stm.spotifyAdd(link))
      setLink('')
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet music" role="dialog" aria-label="Music">
        <div className="music-now" style={np?.artwork ? { ['--cover' as string]: `url(${np.artwork})` } : undefined}>
          <div className="music-backdrop" />
          {np === null ? (
            <div className="music-empty">Spotify control needs the Spotify app on macOS.</div>
          ) : !np.running ? (
            <div className="music-empty">
              Spotify is closed.
              <button className="primary small" onClick={() => void cmd({ kind: 'toggle' })}>Open and play</button>
            </div>
          ) : (
            <>
              {np.artwork ? <img className="music-cover" src={np.artwork} alt="" /> : <div className="music-cover blank" />}
              <div className="music-info">
                <div className="music-track">{np.track || 'Nothing playing'}</div>
                <div className="music-artist">{np.artist}{np.album ? ` · ${np.album}` : ''}</div>
                <div
                  className="music-progress"
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect()
                    void cmd({ kind: 'seek', seconds: ((e.clientX - r.left) / r.width) * (np.durationMs / 1000) })
                  }}
                >
                  <span style={{ width: `${np.durationMs ? (position / np.durationMs) * 100 : 0}%` }} />
                </div>
                <div className="music-times">
                  <span>{mmss(position)}</span>
                  <span>{mmss(np.durationMs)}</span>
                </div>
                <div className="music-controls">
                  <Btn label="Previous" d="M3 3h2v10H3zM13 3v10L6 8z" onClick={() => void cmd({ kind: 'previous' })} />
                  <Btn big label={np.state === 'playing' ? 'Pause' : 'Play'} d={np.state === 'playing' ? 'M4 3h3v10H4zM9 3h3v10H9z' : 'M4 2.5v11L13 8z'} onClick={() => void cmd({ kind: 'toggle' })} />
                  <Btn label="Next" d="M11 3h2v10h-2zM3 3v10l7-5z" onClick={() => void cmd({ kind: 'next' })} />
                  <input className="music-volume" type="range" min={0} max={100} defaultValue={np.volume} onChange={(e) => void cmd({ kind: 'volume', value: Number(e.target.value) })} aria-label="Volume" />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="sheet-body">
          <div className="group">Your playlists</div>
          <div className="music-add">
            <input placeholder="Paste a Spotify playlist or album link" value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} spellCheck={false} />
            <button className="small" disabled={!link.trim() || busy} onClick={() => void add()}>{busy ? 'Adding...' : 'Add'}</button>
          </div>
          {error && <div className="notice error">{friendly(error)}</div>}
          <div className="playlists">
            {saved.length === 0 && <div className="faint">Paste the link of a playlist you play while you work (Share, Copy link in Spotify).</div>}
            {saved.map((p) => (
              <div key={p.uri} className={`playlist ${np?.uri && p.uri.split(':')[2] && np.uri.includes(p.uri.split(':')[2]!) ? 'on' : ''}`}>
                <button className="playlist-cover" onClick={() => void cmd({ kind: 'play', uri: p.uri })} title={`Play ${p.title}`}>
                  {p.image ? <img src={p.image} alt="" /> : <span className="blank" />}
                  <span className="playlist-play">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.5v11L13 8z" /></svg>
                  </span>
                </button>
                <div className="playlist-name" title={p.title}>{p.title}</div>
                <button className="playlist-x" aria-label={`Remove ${p.title}`} onClick={async () => setSaved(await window.stm.spotifyRemove(p.uri))}>
                  <IconClose />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
