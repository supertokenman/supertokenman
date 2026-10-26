import { useEffect, useState } from 'react'
import { IconClose } from './icons'
import { pixelDiff, type PixelDiff, type Pixels } from '../shared/pixeldiff'
import { StateMark } from './StateMark'

const pixelsOf = (src: string) =>
  new Promise<Pixels & { url: string }>((ok, fail) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const g = c.getContext('2d')!
      g.drawImage(img, 0, 0)
      ok({ width: c.width, height: c.height, data: g.getImageData(0, 0, c.width, c.height).data, url: src })
    }
    img.onerror = () => fail(new Error('That image could not be read.'))
    img.src = src
  })

const toPng = (p: { width: number; height: number; data: Uint8ClampedArray }) => {
  const c = document.createElement('canvas')
  c.width = p.width
  c.height = p.height
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0)
  return c.toDataURL('image/png')
}

/**
 * The page now against its reference: both side by side and a third picture with what changed in the
 * accent color, the share of the page that differs and where. Send to Claude takes all three with
 * that note, so it can bring the page closer to the reference.
 */
export function CompareView(props: { reference: string; now: string; page: string; onClose: () => void; onSend: (images: { name: string; png: string }[], note: string) => void; onNewReference: () => void }) {
  const [diff, setDiff] = useState<{ d: PixelDiff; png: string } | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let live = true
    Promise.all([pixelsOf(props.reference), pixelsOf(props.now)]).then(
      ([a, b]) => {
        const d = pixelDiff(a, b)
        if (live) setDiff({ d, png: toPng({ width: Math.max(a.width, b.width), height: Math.max(a.height, b.height), data: d.mask }) })
      },
      (e: Error) => live && setErr(e.message),
    )
    return () => {
      live = false
    }
  }, [props.reference, props.now])
  const note = diff
    ? diff.d.changed === 0
      ? `The page ${props.page} matches its reference.`
      : `The page ${props.page} differs from its reference in ${diff.d.percent}% of its pixels${diff.d.box ? `, inside the area from (${diff.d.box.x}, ${diff.d.box.y}) of ${diff.d.box.w} by ${diff.d.box.h} pixels` : ''}. The images are the reference, the page now, and the differences marked in color. Bring the page closer to the reference, then say what you changed.`
    : ''
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet compare" role="dialog" aria-label="Compare with the reference">
        <header className="sheet-head">
          <div className="sheet-title">Compare</div>
          <span className="faint">{diff ? (diff.d.changed ? `${diff.d.percent}% of the page differs` : 'Matches the reference') : err || 'Comparing…'}</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}>
            <IconClose />
          </button>
        </header>
        <div className="cmp-grid">
          <figure>
            <img src={props.reference} alt="The reference" />
            <figcaption>Reference</figcaption>
          </figure>
          <figure>
            <img src={props.now} alt="The page now" />
            <figcaption>Now</figcaption>
          </figure>
          <figure>
            {diff ? <img src={diff.png} alt="What changed" /> : <div className="cmp-wait">{err || <StateMark state="busy" label="Comparing" />}</div>}
            <figcaption>What changed</figcaption>
          </figure>
        </div>
        <div className="sbx-actions cmp-actions">
          <button className="ghost small" onClick={props.onNewReference}>Use now as the reference</button>
          <button className="primary small" disabled={!diff || diff.d.changed === 0} onClick={() => diff && props.onSend([{ name: 'reference.png', png: props.reference }, { name: 'now.png', png: props.now }, { name: 'differences.png', png: diff.png }], note)}>Send to Claude</button>
        </div>
      </div>
    </div>
  )
}
