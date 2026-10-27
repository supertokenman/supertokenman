import type { ReactNode } from 'react'

/** One row action: an icon button whose words are its tooltip (src/tips.ts) and its accessible name. */
export function RowAct(props: { label: string; icon: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button type="button" className={`icon ${props.danger ? 'danger' : ''}`} data-tip={props.label} aria-label={props.label} disabled={props.disabled} onClick={props.onClick}>
      {props.icon}
    </button>
  )
}

/** The actions at the end of a table row or list item: always shown, brighter on hover or keyboard focus. */
export function RowActs(props: { children: ReactNode }) {
  return <span className="row-acts">{props.children}</span>
}
