// Video metadata only: title, channel, duration, chapters and license, from the YouTube Data API first
// and yt-dlp's JSON dump as a fallback (never a download: --skip-download). Nothing is used until it is
// marked reviewed (revisado: true), the rule the bzcorrida engine follows for its YouTube curation.

export type Chapter = { at: number; title: string }
export type VideoMeta = { id: string; url: string; title: string; channel: string; channelId: string; seconds: number; published: string; license: 'youtube' | 'creativeCommon' | 'unknown'; chapters: Chapter[]; source: 'api' | 'yt-dlp'; revisado: boolean }

/** The 11-character video id of a YouTube link, or null. */
export function videoIdOf(url: string): string | null {
  const s = url.trim()
  if (/^[\w-]{11}$/.test(s)) return s
  const m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/.exec(s)
  return m ? m[1]! : null
}

/** PT1H2M3S -> 3723. */
export function isoSeconds(d: string): number {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d)
  return m ? Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0) : 0
}

/** Chapters written as timestamps in a description (YouTube's own rule: the first one at 0:00, at least three). */
export function chaptersOf(description: string): Chapter[] {
  const out: Chapter[] = []
  for (const line of description.split('\n')) {
    const m = /^\s*(?:[-•*]\s*)?\(?((?:\d{1,2}:)?\d{1,2}:\d{2})\)?\s*[-–—:]?\s*(.+?)\s*$/.exec(line)
    if (!m) continue
    const parts = m[1]!.split(':').map(Number)
    const at = parts.reduce((s, x) => s * 60 + x, 0)
    out.push({ at, title: m[2]!.slice(0, 120) })
  }
  return out.length >= 3 && out[0]!.at === 0 && out.every((c, i) => i === 0 || c.at > out[i - 1]!.at) ? out : []
}

export const clock = (s: number) => `${s >= 3600 ? `${Math.floor(s / 3600)}:` : ''}${String(Math.floor((s % 3600) / 60)).padStart(s >= 3600 ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`

type ApiItem = { id: string; snippet: { title: string; channelTitle: string; channelId: string; publishedAt: string; description: string }; contentDetails: { duration: string }; status?: { license?: string } }
export const fromApi = (v: ApiItem): VideoMeta => ({
  id: v.id, url: `https://www.youtube.com/watch?v=${v.id}`, title: v.snippet.title, channel: v.snippet.channelTitle, channelId: v.snippet.channelId,
  seconds: isoSeconds(v.contentDetails.duration), published: v.snippet.publishedAt, license: v.status?.license === 'creativeCommon' ? 'creativeCommon' : v.status?.license === 'youtube' ? 'youtube' : 'unknown',
  chapters: chaptersOf(v.snippet.description ?? ''), source: 'api', revisado: false,
})

type DlpJson = { id: string; title: string; channel?: string; uploader?: string; channel_id?: string; duration?: number; upload_date?: string; license?: string; chapters?: { start_time: number; title: string }[]; description?: string }
export const fromDlp = (j: DlpJson): VideoMeta => ({
  id: j.id, url: `https://www.youtube.com/watch?v=${j.id}`, title: j.title, channel: j.channel ?? j.uploader ?? '', channelId: j.channel_id ?? '',
  seconds: Math.round(j.duration ?? 0), published: j.upload_date ? `${j.upload_date.slice(0, 4)}-${j.upload_date.slice(4, 6)}-${j.upload_date.slice(6, 8)}` : '',
  license: /creative commons/i.test(j.license ?? '') ? 'creativeCommon' : j.license ? 'youtube' : 'unknown',
  chapters: j.chapters?.length ? j.chapters.map((c) => ({ at: Math.round(c.start_time), title: c.title })) : chaptersOf(j.description ?? ''), source: 'yt-dlp', revisado: false,
})

/** The yt-dlp arguments: metadata of one video, nothing downloaded. */
export const dlpArgs = (id: string) => ['--dump-single-json', '--skip-download', '--no-playlist', '--no-warnings', '--no-write-subs', '--no-write-auto-subs', '--', `https://www.youtube.com/watch?v=${id}`]

/** What may be exported: only reviewed entries, as the engine expects them. */
export const exportable = (list: VideoMeta[]) => list.filter((v) => v.revisado).map(({ source: _s, ...v }) => v)
