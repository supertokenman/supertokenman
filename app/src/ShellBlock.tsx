import type { Line } from './state'

type Run = Extract<Line, { kind: 'shell' }>

const MAX_TO_CLAUDE = 8000

/** The text sent to Claude for a run: the command, the exit code and the output, cut at the end. */
export function forClaude(r: Run) {
  const out = r.out.length > MAX_TO_CLAUDE ? `${r.out.slice(0, MAX_TO_CLAUDE / 2)}\n... ${r.out.length - MAX_TO_CLAUDE} characters cut ...\n${r.out.slice(-MAX_TO_CLAUDE / 2)}` : r.out
  return `I ran this in the panel's folder:\n\n\`\`\`sh\n$ ${r.command}\n\`\`\`\n\nExit code ${r.code ?? 'none'}. Output:\n\n\`\`\`\n${out.trimEnd() || '(no output)'}\n\`\`\``
}

/** A command the person ran: prompt line, live output, status, and a way to hand it to Claude. */
export function ShellBlock({ r, onStop, onSend }: { r: Run; onStop: () => void; onSend: () => void }) {
  const failed = !r.running && r.code !== 0
  return (
    <div className={`shell-run ${failed ? 'failed' : ''}`}>
      <div className="shell-head">
        <span className="shell-prompt">$</span>
        <span className="shell-cmd">{r.command}</span>
        <span className="shell-status">
          {r.running ? <span className="spinner" /> : <span className={failed ? 'bad' : 'good'}>{failed ? `exit ${r.code ?? '?'}` : 'done'}</span>}
          {!r.running && <span className="faint">{r.ms < 1000 ? `${r.ms} ms` : `${(r.ms / 1000).toFixed(1)} s`}</span>}
        </span>
        {r.running ? (
          <button className="ghost small" onClick={onStop}>Stop</button>
        ) : (
          <button className="ghost small" onClick={onSend} title="Send the command and its output to Claude">Send to Claude</button>
        )}
      </div>
      {r.out && <pre className="shell-out">{r.out}</pre>}
    </div>
  )
}
