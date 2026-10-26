import { describe, expect, it } from 'vitest'
import { youtubeId } from './video'

describe('youtubeId', () => {
  it('reads every form of a video link', () => {
    for (const u of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s', 'https://youtu.be/dQw4w9WgXcQ?t=3', 'https://m.youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube.com/live/dQw4w9WgXcQ', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ'])
      expect(youtubeId(u)).toBe('dQw4w9WgXcQ')
  })
  it('says no for pages that are not a video', () => {
    for (const u of ['https://www.youtube.com/', 'https://www.youtube.com/@channel', 'https://evil.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=short', 'not a url']) expect(youtubeId(u)).toBeNull()
  })
})
