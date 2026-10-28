import { useEffect, useState } from 'react'
import { dueCards, newCard, parseCards, planReviewPrompt, PROJECTS, review, tutorPrompt, type Card, type Grade } from '../shared/learn'
import { clean } from './errors'
import { IconAdd, IconClose, IconExternal, IconSend } from './icons'
import { Combobox } from './ui'
import './bridge'

/**
 * Learn by building: start a project with a tutor that hints instead of coding, review flashcards on a
 * spaced schedule, and have a panel review a Spec first plan with the design checklist.
 */
export function LearnSheet(props: { cwd?: string; onTutor: (text: string) => void; onReview: (text: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState<'build' | 'cards' | 'plan'>('build')
  const [cards, setCards] = useState<Card[]>([])
  useEffect(() => void window.stm.learn.cards().then(setCards), [])
  const due = dueCards(cards)
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="sheet config observe ln" role="dialog" aria-label="Learn">
        <header className="sheet-head">
          <div className="sheet-title">Learn by building</div>
          <div className="segmented small" role="tablist">
            <button role="tab" aria-selected={tab === 'build'} onClick={() => setTab('build')}>Build</button>
            <button role="tab" aria-selected={tab === 'cards'} onClick={() => setTab('cards')}>Cards{due.length ? ` · ${due.length} due` : ''}</button>
            <button role="tab" aria-selected={tab === 'plan'} onClick={() => setTab('plan')}>Plan review</button>
          </div>
          <span className="spacer-flex" />
          <button className="icon" aria-label="Close" onClick={props.onClose}><IconClose /></button>
        </header>
        {tab === 'build' ? <Build onTutor={props.onTutor} /> : tab === 'cards' ? <Cards cards={cards} setCards={(c) => void window.stm.learn.save(c).then(setCards)} /> : <Plan cwd={props.cwd} onReview={props.onReview} />}
      </div>
    </div>
  )
}

function Build(props: { onTutor: (t: string) => void }) {
  return (
    <div className="ar-pad">
      <div className="faint">Pick a project. A new panel opens as a tutor: it asks, points at the next small step and gives hints; it does not write the solution for you. Ideas from build-your-own-x (CC0), described in our words.</div>
      <div className="ln-projects">
        {PROJECTS.map((p) => (
          <section key={p.id} className="ln-project">
            <b>{p.title}</b>
            <span>{p.why}</span>
            <ol>{p.steps.map((s) => <li key={s}>{s}</li>)}</ol>
            <div className="ob-row">
              <a className="is-link" href={p.link} onClick={(e) => (e.preventDefault(), void window.stm.openUrl(p.link))}><IconExternal />Guides</a>
              <span className="spacer-flex" />
              <button className="primary small" onClick={() => props.onTutor(tutorPrompt(p))}><IconSend />Start with a tutor</button>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function Cards(props: { cards: Card[]; setCards: (c: Card[]) => void }) {
  const due = dueCards(props.cards)
  const [show, setShow] = useState(false)
  const [text, setText] = useState('')
  const [deck, setDeck] = useState('My cards')
  const [msg, setMsg] = useState('')
  const cur = due[0]
  const grade = (g: Grade) => {
    if (!cur) return
    props.setCards(props.cards.map((c) => (c.id === cur.id ? review(c, g) : c)))
    setShow(false)
  }
  const decks = [...new Set(props.cards.map((c) => c.deck))]
  return (
    <div className="ar-pad">
      {cur ? (
        <div className="ln-card">
          <span className="chart-name">{cur.deck} · {due.length} due</span>
          <div className="ln-front">{cur.front}</div>
          {show ? (
            <>
              <div className="ln-back">{cur.back}</div>
              <div className="ob-row">
                <span className="faint">How well did you know it?</span>
                <span className="spacer-flex" />
                <button className="small" onClick={() => grade(0)}>Again <kbd>1d</kbd></button>
                <button className="small" onClick={() => grade(3)}>Hard</button>
                <button className="small" onClick={() => grade(4)}>Good</button>
                <button className="primary small" onClick={() => grade(5)}>Easy</button>
              </div>
            </>
          ) : <div className="ob-row"><span className="spacer-flex" /><button className="primary small" onClick={() => setShow(true)}>Show the answer</button></div>}
        </div>
      ) : <div className="notice">Nothing due. {props.cards.length} cards in {decks.length} {decks.length === 1 ? 'deck' : 'decks'}; the next comes back {props.cards.length ? new Date(Math.min(...props.cards.map((c) => c.due))).toLocaleDateString() : 'when you add one'}.</div>}
      <div className="fld-grid">
        <label className="fld"><span className="fld-label">Deck</span><Combobox value={deck} onChange={(e) => setDeck(e.target.value)} options={decks} /></label>
        <label className="fld wide"><span className="fld-label">New cards <span className="fld-kind">front :: back, one a line, or Q:/A:</span></span><textarea rows={4} value={text} placeholder={'Why a write-ahead log? :: To recover committed writes after a crash'} onChange={(e) => setText(e.target.value)} /><span className="fld-help">Tutor panels suggest cards in this shape; paste them here.</span></label>
      </div>
      <div className="ob-row">
        {msg && <span className="faint">{msg}</span>}
        <span className="spacer-flex" />
        <button className="small" disabled={!text.trim()} onClick={() => {
          const add = parseCards(text, deck.trim() || 'My cards')
          if (!add.length) return setMsg('No "front :: back" lines found.')
          props.setCards([...props.cards, ...add])
          setText('')
          setMsg(`Added ${add.length}.`)
        }}><IconAdd />Add cards</button>
      </div>
    </div>
  )
}

function Plan(props: { cwd?: string; onReview: (t: string) => void }) {
  const [specs, setSpecs] = useState<Awaited<ReturnType<typeof window.stm.spec.list>>>([])
  const [err, setErr] = useState('')
  useEffect(() => {
    if (props.cwd) void window.stm.spec.list(props.cwd).then(setSpecs)
  }, [props.cwd])
  if (!props.cwd) return <div className="ar-pad faint">Focus a panel on a project first.</div>
  return (
    <div className="ar-pad">
      <div className="faint">A panel reviews a Spec first plan with the architecture checklist: what the plan covers, what it misses, risks and questions before building. It does not edit anything.</div>
      {!specs.some((s) => s.plan) && <div className="notice">No spec with a plan in docs/specs yet. Write one with Spec first.</div>}
      {specs.filter((s) => s.plan).map((s) => (
        <div key={s.slug} className="ob-row ln-spec">
          <b>{s.title}</b><span className="faint">docs/specs/{s.slug}/plan.md</span>
          <span className="spacer-flex" />
          <button className="small" onClick={() => void window.stm.learn.plan(props.cwd!, s.slug).then((plan) => props.onReview(planReviewPrompt(s.title, plan)), (e) => setErr(clean(e)))}><IconSend />Review the plan</button>
        </div>
      ))}
      {err && <div className="notice error">{err}</div>}
    </div>
  )
}
