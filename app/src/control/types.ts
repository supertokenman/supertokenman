import type { AuditRow } from '../../shared/auditlog'
import type { Plan } from '../../shared/planview'
import type { RuleError } from '../../shared/policyrules'

export type Caps = { minEvery: number; maxEnabled: number; maxFailures: number }
export type CapsInfo = { caps: Caps; enabled: number }
export type PolicyFile = { path: string; text: string; errors: RuleError[]; unreadable?: string }
export type PolicyState = { global: PolicyFile; project: PolicyFile | null }
export type TestResult = { decision: 'allow' | 'ask' | 'deny'; by: string; rule: string | null; existing: string; why: string | null }
export type AuditQuery = { from: number; to: number; panel?: string; tool?: string; decision?: AuditRow['decision']; text?: string; limit?: number }
export type CheckpointInfo = { turn: number; ref: string; at: number; sessionId: string; messageUuid: string }
export type FileChange = { path: string; change: 'A' | 'M' | 'D' }
export type Preview = { files: FileChange[]; notes: string[] }
export type Restored = Preview & { resume: { sessionId: string; messageUuid: string; forkSession: true } }
export type Breakpoint = { kind: 'before' | 'afterPlan'; tool?: string }

/** The window API `window.stm.control` (electron/preload.cjs). */
export type ControlApi = {
  policyRead: (cwd?: string) => Promise<PolicyState>
  policyWrite: (scope: 'global' | 'project', cwd: string, text: string) => Promise<{ errors: RuleError[] }>
  policyTest: (tool: string, input: Record<string, unknown>, cwd?: string) => Promise<TestResult>
  auditQuery: (q: AuditQuery) => Promise<AuditRow[]>
  auditDays: () => Promise<string[]>
  planGet: (sid: string) => Promise<Plan | null>
  checkpointList: (sid: string) => Promise<CheckpointInfo[]>
  checkpointPreview: (sid: string, turn: number) => Promise<Preview>
  checkpointRestore: (sid: string, turn: number) => Promise<Restored>
  breakpointSet: (sid: string, list: Breakpoint[]) => Promise<Breakpoint[]>
}
