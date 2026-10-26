import { Component, type ReactNode } from 'react'

/** A render error shows itself, with a way back, instead of leaving an empty window. */
export class Crash extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    const e = this.state.error
    if (!e) return this.props.children
    const text = `${e.message}\n\n${e.stack ?? ''}`
    return (
      <div className="crash">
        <div className="crash-title">Something broke while drawing the window.</div>
        <div className="faint">Your panels keep running behind it. Reload to get the window back, and send this to fix the cause:</div>
        <pre className="crash-text">{text}</pre>
        <div className="crash-actions">
          <button className="primary small" onClick={() => location.reload()}>Reload</button>
          <button className="ghost small" onClick={() => void navigator.clipboard.writeText(text)}>Copy error</button>
        </div>
      </div>
    )
  }
}
