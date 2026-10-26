import { makeProject } from '@revideo/core'
import fontUrl from './fonts/supertoken-display.woff2?url'
import ask from './scenes/ask'

const face = new FontFace('SuperToken Display', `url(${fontUrl})`)
document.fonts.add(face)
await face.load()

export default makeProject({
  scenes: [ask],
  variables: { beat: null },
  settings: {
    shared: { size: { x: 1920, y: 1080 }, background: '#141413' },
    rendering: { fps: 30, exporter: { name: '@revideo/core/ffmpeg', options: { format: 'mp4' } } },
  },
})
