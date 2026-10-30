/** Two flat strips: the resume offer after a crash or reboot, and the update question when panels are running. Lazy. */
export function ResumeBanner(props: { count: number; onResume: () => void; onDismiss: () => void }) {
  return (
    <div className="rt-banner" role="status" aria-label="Panels were running">
      <span className="rt-banner-text">{props.count === 1 ? '1 panel was running.' : `${props.count} panels were running.`} Nothing runs until you resume.</span>
      <button className="primary small" onClick={props.onResume}>Resume</button>
      <button className="ghost small" onClick={props.onDismiss}>Not now</button>
    </div>
  )
}

export function UpdateConfirm(props: { live: number; canQueue: boolean; onNow: () => void; onLater: () => void }) {
  return (
    <div className="update-bar rt-confirm" role="alertdialog" aria-label="Restart to update">
      <div className="update-text">
        <b>Restart now?</b>
        <span className="faint">Restarting stops {props.live === 1 ? '1 panel' : `${props.live} panels`} that {props.live === 1 ? 'is' : 'are'} still running. {props.canQueue ? 'You can also install when you quit.' : ''}</span>
      </div>
      <div className="rt-actions">
        <button className="primary small" onClick={props.onNow}>Restart now</button>
        <button className="ghost small" onClick={props.onLater}>{props.canQueue ? 'Install when I quit' : 'Not now'}</button>
      </div>
    </div>
  )
}
