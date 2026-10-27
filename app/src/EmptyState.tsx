import type { ReactNode } from 'react'

/** The one empty state: a short title, one line, and the button that fills it. */
export function EmptyState(props: { title: string; text?: ReactNode; icon?: ReactNode; children?: ReactNode }) {
  return (
    <div className="empty-state" role="status">
      {props.icon && <span className="es-mark">{props.icon}</span>}
      <div className="es-title">{props.title}</div>
      {props.text && <div className="es-text">{props.text}</div>}
      {props.children && <div className="es-act">{props.children}</div>}
    </div>
  )
}
