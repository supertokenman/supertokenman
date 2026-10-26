import { describe, expect, it } from 'vitest'
import { chaptersOf, clock, dlpArgs, exportable, fromApi, fromDlp, isoSeconds, videoIdOf } from './videometa'

describe('video metadata', () => {
  it('reads ids and durations', () => {
    expect(videoIdOf('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3')).toBe('dQw4w9WgXcQ')
    expect(videoIdOf('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(videoIdOf('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(videoIdOf('https://vimeo.com/1')).toBeNull()
    expect(isoSeconds('PT1H2M3S')).toBe(3723)
    expect(isoSeconds('PT45S')).toBe(45)
    expect(clock(3723)).toBe('1:02:03')
    expect(clock(65)).toBe('1:05')
  })
  it('finds chapters only when YouTube would', () => {
    expect(chaptersOf('Intro\n0:00 Warm up\n2:30 Drills\n10:05 - Cool down')).toEqual([{ at: 0, title: 'Warm up' }, { at: 150, title: 'Drills' }, { at: 605, title: 'Cool down' }])
    expect(chaptersOf('1:00 a\n2:00 b\n3:00 c')).toEqual([])
    expect(chaptersOf('0:00 a\n2:00 b')).toEqual([])
  })
  it('maps the API and yt-dlp, never downloads, exports only reviewed', () => {
    const a = fromApi({ id: 'abcdefghijk', snippet: { title: 'T', channelTitle: 'C', channelId: 'UC1', publishedAt: '2026-01-01T00:00:00Z', description: '0:00 a\n1:00 b\n2:00 c' }, contentDetails: { duration: 'PT10M' }, status: { license: 'creativeCommon' } })
    expect([a.seconds, a.license, a.chapters.length, a.revisado]).toEqual([600, 'creativeCommon', 3, false])
    const d = fromDlp({ id: 'abcdefghijk', title: 'T', uploader: 'U', duration: 61.4, upload_date: '20260102', license: 'Creative Commons Attribution license (reuse allowed)' })
    expect([d.channel, d.seconds, d.published, d.license]).toEqual(['U', 61, '2026-01-02', 'creativeCommon'])
    expect(dlpArgs('abcdefghijk')).toContain('--skip-download')
    expect(exportable([a, { ...d, revisado: true }])).toEqual([{ ...d, revisado: true, source: undefined }].map(({ source: _s, ...v }) => v))
  })
})
