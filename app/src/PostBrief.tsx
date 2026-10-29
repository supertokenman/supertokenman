import { useState } from 'react'
import { IconClose } from './icons'
import { imageTypeOf, IMAGE_TYPES, MAX_IMAGE_BYTES, type Attachment } from '../shared/attach'
import { briefPrompt, linkOf, networkName, networkOf, parseBrief } from '../shared/postbrief'

type Image = Extract<Attachment, { kind: 'image' }>
const readImage = (f: File) => new Promise<Image>((res, rej) => {
  const type = (IMAGE_TYPES as readonly string[]).includes(f.type) ? (f.type as Image['mediaType']) : imageTypeOf(f.name)
  if (!type) return rej(new Error('Use a PNG, JPEG, GIF or WebP image.'))
  if (f.size > MAX_IMAGE_BYTES) return rej(new Error('The image is over 5 MB.'))
  const r = new FileReader()
  r.onload = () => res({ kind: 'image', name: f.name || 'screenshot', mediaType: type, data: String(r.result).split(',')[1] ?? '' })
  r.onerror = () => rej(new Error('Could not read the image.'))
  r.readAsDataURL(f)
})

/**
 * Brief a post: a link or a screenshot goes to a new panel, which reads it (its own browser keeps your
 * sign-ins) and replies with a summary and the one prompt to go deeper; that prompt can start a panel.
 */
export function PostBriefSheet(props: {
  /** the brief's panel: its last reply and whether it is still working */
  run: { busy: boolean; reply: string } | null
  onBrief: (text: string, images: Image[]) => Promise<void>
  onOpen: (prompt: string) => void
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const [image, setImage] = useState<Image | null>(null)
  const [err, setErr] = useState('')
  const [sending, setSending] = useState(false)
  const url = linkOf(text)
  const take = (f?: File | null) => f && void readImage(f).then((i) => (setImage(i), setErr('')), (e: Error) => setErr(e.message))
  const brief = () => {
    if (!url && !image) return setErr('Paste a link or drop a screenshot.')
    setSending(true)
    setErr('')
    void props.onBrief(briefPrompt({ url: url ?? undefined, image: !!image }), image ? [image] : []).catch((e: Error) => setErr(e.message)).finally(() => setSending(false))
  }
  const b = props.run && !props.run.busy && props.run.reply ? parseBrief(props.run.reply) : null
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div
        className="sheet config"
        role="dialog"
        aria-label="Brief a post"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => (e.preventDefault(), take(e.dataTransfer.files[0]))}
        onPaste={(e) => {
          const f = Array.from(e.clipboardData.files).find((x) => x.type.startsWith('image/'))
          if (f) (e.preventDefault(), take(f))
        }}
      >
        <header className="sheet-head">
          <div className="sheet-title">Brief a post</div>
          <span className="faint">a summary and the best prompt to go deeper</span>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        <div className="ob-row">
          <input
            autoFocus
            value={text}
            placeholder="Paste a link to a post or article, or drop a screenshot here"
            spellCheck={false}
            style={{ flex: 1 }}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && brief()}
          />
          <button className="primary" disabled={sending || (!url && !image)} onClick={brief}>Brief</button>
        </div>
        <div className="faint">
          {url ? `${networkName(networkOf(url))} link. ` : ''}
          {image ? <>Screenshot: {image.name} <button className="ghost small" onClick={() => setImage(null)}>Remove</button></> : 'Drop or paste a screenshot to include one.'}
          {' '}A new panel reads the post; a sign-in it needs is yours, in that panel's browser.
        </div>
        {err && <div className="mi-warn">{err}</div>}
        {props.run?.busy && <div className="faint">Reading the post in its panel...</div>}
        {b && (
          <section>
            <div className="chart-name">Summary</div>
            <p style={{ whiteSpace: 'pre-wrap' }}>{b.summary}</p>
            {b.prompt ? (
              <>
                <div className="chart-name">Best prompt</div>
                <textarea value={b.prompt} rows={5} readOnly />
                {b.why && <div className="faint">Why: {b.why}</div>}
                <div className="ob-row">
                  <span className="spacer-flex" />
                  <button className="ghost small" onClick={() => void navigator.clipboard.writeText(b.prompt)}>Copy</button>
                  <button className="primary" onClick={() => props.onOpen(b.prompt)}>Open in a new panel</button>
                </div>
              </>
            ) : <div className="faint">The reply was not in the expected format; see its panel.</div>}
          </section>
        )}
      </div>
    </div>
  )
}
