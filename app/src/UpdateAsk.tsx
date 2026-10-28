import { useEffect, useState } from 'react'

// The one-time first-run question about the update check (2026-10-28). Since 0.1.13 the automatic check
// is opt-in and unset means off, so someone who never opens Settings would never hear of a new version.
// This card asks once, after launch, the splash and the Tour. Showing it reaches no network: only
// "Check for updates" turns on the existing gated check (update:auto, see electron/updategate.ts).

export const UPDATE_ASK = {
  title: 'Check for updates on GitHub?',
  body: 'A minute after launch and then every 6 hours, the app asks github.com whether a new version is out and tells you. Nothing downloads until you choose Install.',
  where: 'You can change this in Settings > Appearance.',
  yes: 'Check for updates',
  no: 'Not now',
}

type Stm = { updateAsked: () => Promise<boolean>; updateAuto: (on?: boolean) => Promise<boolean> }

/** Should the card show? Only once the app is up and only while the setting is unset. */
export async function shouldAsk(stm: Stm | undefined, ready: boolean): Promise<boolean> {
  if (!ready || !stm?.updateAsked) return false
  return !(await stm.updateAsked().catch(() => true))
}

/** Save the answer: true turns the check on, false keeps it off; either way the question never comes back. */
export async function answer(stm: Stm, yes: boolean): Promise<boolean> {
  const on = await stm.updateAuto(yes)
  if (on) window.dispatchEvent(new Event('stm:update-enabled'))
  return on
}

export function UpdateAskCard(props: { onYes: () => void; onNo: () => void }) {
  return (
    <div className="update-ask" role="region" aria-label="Update check">
      <div className="update-ask-title">{UPDATE_ASK.title}</div>
      <p>{UPDATE_ASK.body}</p>
      <p className="update-ask-where">{UPDATE_ASK.where}</p>
      <div className="update-ask-row">
        <button type="button" className="primary" onClick={props.onYes}>{UPDATE_ASK.yes}</button>
        <button type="button" onClick={props.onNo}>{UPDATE_ASK.no}</button>
      </div>
    </div>
  )
}

/** Never takes focus: the composer keeps it while the card sits in the corner. */
export function UpdateAsk({ ready }: { ready: boolean }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!ready) return
    let live = true
    // a moment after the app settles, so it never lands on the launch path
    const t = setTimeout(() => void shouldAsk(window.stm, true).then((s) => live && setShow(s)), 1500)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [ready])
  if (!show) return null
  const pick = (yes: boolean) => {
    setShow(false)
    void answer(window.stm, yes).catch(() => undefined)
  }
  return <UpdateAskCard onYes={() => pick(true)} onNo={() => pick(false)} />
}
