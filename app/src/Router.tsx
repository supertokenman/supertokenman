import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconClose } from './icons'
import { RoleHero } from './RoleHero'
import { createPortal } from 'react-dom'
import type { Persona } from '../shared/personas'
import { learn, route, stripMention, type Learned } from '../shared/router'
import { Checkbox } from './ui'

const ASK_KEY = 'stm.routerAsk'
const LEARNED_KEY = 'stm.routerLearned'
const loadLearned = (): Learned => {
  try {
    return JSON.parse(localStorage.getItem(LEARNED_KEY) || '{}') as Learned
  } catch {
    return {}
  }
}

/**
 * One box for the whole team: type what you need, the router picks the persona (an @mention, the words
 * of the message, or what it learned from earlier picks), and the message goes to that persona's open
 * panel or to a new one. When the words do not decide, the local model suggests one while you type, for free.
 */
export function RouterBox(props: { onSend: (persona: Persona | null, text: string, why?: string) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [personas, setPersonas] = useState<Persona[]>([])
  const [pick, setPick] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [ask, setAsk] = useState(() => {
    try {
      return localStorage.getItem(ASK_KEY) === '1'
    } catch {
      return false
    }
  })
  const [learned, setLearned] = useState<Learned>(loadLearned)
  // the local model's suggestion, for the text it was asked about
  const [local, setLocal] = useState<{ text: string; id: string | null; busy: boolean } | null>(null)
  const [hasLocal, setHasLocal] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  const close = useCallback(() => {
    setOpen(false)
    setNote('')
  }, [])

  useEffect(() => {
    if (!open) return
    void window.stm.personas.list().then(setPersonas)
    void window.stm.small.get().then((m) => setHasLocal(Boolean(m.model)), () => setHasLocal(false))
    setTimeout(() => box.current?.focus(), 30)
  }, [open])
  // Cmd+E opens the box from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        setOpen((o) => !o)
      }
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const r = useMemo(() => route(text, personas, learned), [text, personas, learned])
  const asked = text.trim()
  const suggested = local && local.text === asked && local.id ? (personas.find((p) => p.id === local.id) ?? null) : null
  const chosen = pick ? (personas.find((p) => p.id === pick) ?? null) : r.sure ? r.persona : (suggested ?? r.persona)

  // the words do not decide: the local model is asked after a pause in typing
  useEffect(() => {
    if (!open || !hasLocal || pick || r.sure || asked.length < 12) return
    if (local?.text === asked) return
    const t = setTimeout(() => {
      setLocal({ text: asked, id: null, busy: true })
      window.stm.routerAsk(asked, true).then(
        (a) => setLocal((cur) => (cur?.text === asked ? { text: asked, id: a.id, busy: false } : cur)),
        () => setLocal((cur) => (cur?.text === asked ? { text: asked, id: null, busy: false } : cur)),
      )
    }, 700)
    return () => clearTimeout(t)
  }, [open, hasLocal, pick, r.sure, asked, local?.text])

  const send = async () => {
    const t = stripMention(text, r).trim()
    if (!t || busy) return
    setBusy(true)
    setNote('')
    let who = chosen
    let why = pick ? 'You picked the persona' : r.mention ? `Mentioned: ${r.why.join(', ')}` : !r.sure && suggested ? 'The local model suggested it' : r.why.length ? `Router words: ${r.why.join(', ')}` : ''
    // neither the words nor the local model decided: Claude picks, if the person allowed it
    if (!pick && !r.sure && !suggested && ask) {
      setNote('Asking Claude who should take it...')
      try {
        const a = await window.stm.routerAsk(t)
        who = personas.find((p) => p.id === a.id) ?? who
        if (a.id) why = `Claude picked it (${a.where})`
      } catch {
        // keep the words' guess
      }
    }
    if (!who && !pick) {
      setBusy(false)
      setNote('Nobody stands out. Pick who takes it below, or start with @name.')
      return
    }
    await props.onSend(who, t, why || undefined)
    // where it went teaches the router, above all when the person picked against the guess
    if (who) {
      const next = learn(learned, t, who.id)
      setLearned(next)
      try {
        localStorage.setItem(LEARNED_KEY, JSON.stringify(next))
      } catch {
        // just this session
      }
    }
    setLocal(null)
    setBusy(false)
    setText('')
    setPick(null)
    setNote('')
    setOpen(false)
  }

  return (
    <>
      <button className="router-pill" onClick={() => setOpen(true)} data-tip="Ask the team (Cmd+E)">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <circle cx="3" cy="8" r="1.75" />
          <path d="M4.75 8h3.5M8.25 8 12 4M8.25 8 12 12" />
          <circle cx="13.25" cy="3.25" r="1.25" />
          <circle cx="13.25" cy="12.75" r="1.25" />
        </svg>
        <span className="router-label">Ask the team</span>
        <kbd>⌘E</kbd>
      </button>
      {open &&
        createPortal(
          // drawn on the body: inside the top bar it would sit in the window's drag area, where clicks are swallowed
          <div className="tm-scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
            <div className="tm" role="dialog" aria-modal="true" aria-labelledby="tm-title">
              <header className="tm-head">
                <span className="tm-ico" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="3" cy="8" r="1.75" /><path d="M4.75 8h3.5M8.25 8 12 4M8.25 8 12 12" /><circle cx="13.25" cy="3.25" r="1.25" /><circle cx="13.25" cy="12.75" r="1.25" /></svg>
                </span>
                <div className="tm-titles">
                  <div id="tm-title" className="tm-title">Ask the team</div>
                  <div className="tm-sub">Say what you need. The right persona takes it in its own panel.</div>
                </div>
                <kbd className="tm-esc">esc</kbd>
                <button className="icon tm-x" aria-label="Close" onClick={close}>
                  <IconClose />
                </button>
              </header>
              <textarea
                ref={box}
                className="tm-input"
                value={text}
                rows={3}
                placeholder="Check my last commit for bugs, or @writer draft the changelog"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send()
                  }
                }}
              />
              <div className="tm-label">Who takes it</div>
              <div className="tm-people" role="radiogroup" aria-label="Persona">
                <button role="radio" aria-checked={!pick} className={`tm-person auto ${!pick ? 'on' : ''}`} onClick={() => setPick(null)}>
                  <span className="tm-av" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M8 2v3M8 11v3M2 8h3M11 8h3M4 4l2 2M10 10l2 2M12 4l-2 2M6 10l-2 2" /></svg>
                  </span>
                  <span className="tm-name">Auto</span>
                  <span className="tm-role" data-tip={!pick && suggested ? 'Suggested by the local model' : undefined}>{!pick && chosen ? `${r.sure || suggested ? '→' : '→ maybe'} ${chosen.name}` : 'From your words'}</span>
                </button>
                {personas.map((p) => (
                  <button key={p.id} role="radio" aria-checked={pick === p.id} className={`tm-person ${pick === p.id ? 'on' : ''} ${!pick && chosen?.id === p.id ? 'guess' : ''}`} style={{ '--pc': p.color } as React.CSSProperties} onClick={() => setPick(pick === p.id ? null : p.id)}>
                    <span className="tm-av hero"><RoleHero p={p} size={40} /></span>
                    <span className="tm-name">{p.name}</span>
                    <span className="tm-role">{p.instructions.split(/[.\n]/)[0]?.trim() || 'Persona'}</span>
                  </button>
                ))}
              </div>
              <footer className="tm-foot">
                <span className="tm-why">
                  {note ||
                    (pick
                      ? `${chosen?.name ?? 'This persona'} takes it.`
                      : r.mention
                        ? `From the @mention: ${r.persona?.name ?? ''}.`
                        : r.sure && r.persona
                          ? `Matched on ${r.why.join(', ')}.`
                          : local?.busy && local.text === asked
                            ? 'The local model is reading it...'
                            : suggested
                              ? `Local model: ${suggested.name}. Pick another and it learns.`
                              : r.persona
                          ? `Best guess on ${r.why.join(', ')}.`
                          : text.trim()
                            ? ask
                              ? 'Claude picks when you send.'
                              : 'Nobody stands out yet: pick someone.'
                            : 'Your words, an @mention or a click decide.')}
                </span>
                <label className="tm-ask" data-tip="When the words do not decide, one short call to the smallest model picks the persona">
                  <span className="switch">
                    <Checkbox
                      checked={ask}
                      onChange={(e) => {
                        setAsk(e.target.checked)
                        try {
                          localStorage.setItem(ASK_KEY, e.target.checked ? '1' : '0')
                        } catch {
                          // just this session
                        }
                      }}
                    />
                    <span />
                  </span>
                  Claude picks when unsure
                </label>
                <button className="primary tm-send" disabled={!text.trim() || busy} onClick={() => void send()}>
                  {busy ? <span className="spinner" /> : 'Send'}
                </button>
              </footer>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
