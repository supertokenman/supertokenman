import { makeProject } from '@revideo/core'
import fontUrl from './fonts/supertoken-display.woff2?url'
import reel from './scenes/reel'
import { SAMPLE } from './data'

// the app's display face, loaded before the first frame
const face = new FontFace('SuperToken Display', `url(${fontUrl})`)
document.fonts.add(face)
await face.load()

export default makeProject({
  scenes: [reel],
  variables: { data: SAMPLE },
  settings: {
    shared: { size: { x: 1080, y: 1920 }, background: '#141413' },
    rendering: { fps: 30, exporter: { name: '@revideo/core/ffmpeg', options: { format: 'mp4' } } },
  },
})
