import { makeProject } from '@revideo/core'
import fontUrl from './fonts/supertoken-display.woff2?url'
import tour from './scenes/tour'

// the app's display face, loaded before the first frame
const face = new FontFace('SuperToken Display', `url(${fontUrl})`)
document.fonts.add(face)
await face.load()

export default makeProject({
  scenes: [tour],
  variables: { tour: null },
  settings: {
    shared: { size: { x: 1920, y: 1080 }, background: '#141413' },
    rendering: { fps: 30, exporter: { name: '@revideo/core/ffmpeg', options: { format: 'mp4' } } },
  },
})
