import { lazy, Suspense } from 'react'

const RulesSheet = lazy(() => import('./RulesSheet').then((m) => ({ default: m.RulesSheet })))
const AuditSheet = lazy(() => import('./AuditSheet').then((m) => ({ default: m.AuditSheet })))

/** Opens one of the Control sheets; the window raises `stm:control` (Settings, the command palette). */
export type ControlView = { view: 'rules' | 'audit'; cwd?: string; panel?: string }
export default function ControlHost(props: ControlView & { onClose: () => void }) {
  return <Suspense fallback={null}>{props.view === 'rules' ? <RulesSheet cwd={props.cwd} onClose={props.onClose} /> : <AuditSheet panel={props.panel} onClose={props.onClose} />}</Suspense>
}
