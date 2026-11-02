// The gate, the audit and the asks of the agent browser. One Guard holds the session state of every panel
// (shared/browsersession.ts) and is the only place that decides whether a page may open:
//  - every main-frame request (first load, link, redirect hop, popup) calls `navigate`
//  - the decision comes from the policy rules through shared/browserhost.ts (this file only imports
//    electron/policy.ts types and electron/audit.ts, it does not change them)
//  - a host that needs the person becomes a card; the answer is once, always (writes the host rule) or deny
//  - every decision and every action is a row in the audit log, arguments redacted by the log itself
import { randomUUID } from 'node:crypto'
import type { AuditBy, AuditDecision } from '../../shared/auditlog.js'
import type { BudgetLimits } from '../../shared/browserbudget.js'
import { admit, admitByRule, gateNavigation, newSession, type Answer, type Session } from '../../shared/browsersession.js'
import type { Ctx, ScopedRule } from '../../shared/policygate.js'

export type CardKind = 'host' | 'download' | 'upload'
export type Card = { id: string; panel: string; kind: CardKind; detail: { host?: string; name?: string; size?: number; always: boolean; /** upload: the agent named no file, the person picks one */ pick?: boolean } }

export type GuardDeps = {
  now: () => number
  rules: (panel: string) => ScopedRule[]
  ctx: (panel: string) => Ctx
  previewPanel: (panel: string) => boolean
  limits: () => Partial<BudgetLimits>
  /** shows the card; resolves with the person's answer, deny when nobody answers */
  ask: (card: Card) => Promise<Answer>
  /** writes `allow ... when host is "x"` to the project rules file */
  writeRule: (panel: string, text: string) => void
  audit: (panel: string, row: { tool: string; args: string; decision: AuditDecision; by: AuditBy; rule?: string }) => void
}

export class Guard {
  private sessions = new Map<string, Session>()
  private pending = new Map<string, Promise<boolean>>()
  private cards = new Map<string, { card: Card; resolve: (a: Answer) => void }>()
  constructor(private d: GuardDeps) {}

  session(panel: string): Session {
    let s = this.sessions.get(panel)
    if (!s) this.sessions.set(panel, (s = newSession(this.d.now(), this.d.limits())))
    return s
  }
  set(panel: string, s: Session) {
    this.sessions.set(panel, s)
  }
  update(panel: string, f: (s: Session) => Session): Session {
    const s = f(this.session(panel))
    this.sessions.set(panel, s)
    return s
  }
  forget(panel: string) {
    this.sessions.delete(panel)
  }

  audit(panel: string, tool: string, args: unknown, decision: AuditDecision, by: AuditBy, rule?: string) {
    this.d.audit(panel, { tool, args: typeof args === 'string' ? args : JSON.stringify(args), decision, by, ...(rule ? { rule } : {}) })
  }

  /** The cards waiting for an answer (the window shows them; tests answer them). */
  waiting(): Card[] {
    return [...this.cards.values()].map((c) => c.card)
  }

  /** The person's answer, from abrowser:answer. False when the card is not waiting any more. */
  answer(id: string, answer: Answer): boolean {
    const c = this.cards.get(id)
    if (!c) return false
    this.cards.delete(id)
    c.resolve(answer)
    return true
  }

  card(panel: string, kind: CardKind, detail: Card['detail']): Promise<Answer> {
    const card: Card = { id: randomUUID(), panel, kind, detail }
    return new Promise<Answer>((resolve) => {
      this.cards.set(card.id, { card, resolve })
      this.d.ask(card).then((a) => this.answer(card.id, a), () => this.answer(card.id, 'deny'))
    })
  }

  /**
   * One main-frame URL. True lets the request go. Two requests for the same host at once share one card.
   * The reason for a refusal is kept for the tool to tell the model (`lastRefusal`).
   */
  navigate(panel: string, url: string): Promise<boolean> {
    const s = this.session(panel)
    const g = gateNavigation(s, url, { rules: this.d.rules(panel), ctx: this.d.ctx(panel), previewPanel: this.d.previewPanel(panel) })
    const tool = 'mcp__stm__browser_open'
    if (g.kind === 'deny') {
      this.refusal.set(panel, `${g.host ?? 'that address'}: ${g.reason}`)
      this.audit(panel, tool, { url, host: g.host }, 'deny', g.reason.startsWith('a policy rule') ? 'rule' : 'app')
      return Promise.resolve(false)
    }
    if (g.kind === 'go') {
      const a = g.newHost ? admitByRule(s, g.host, this.d.now()) : { ok: true as const, session: s }
      this.sessions.set(panel, a.session)
      if (!a.ok) {
        this.refusal.set(panel, a.message)
        this.audit(panel, tool, { url, host: g.host }, 'deny', 'app')
        return Promise.resolve(false)
      }
      this.audit(panel, tool, { url, host: g.host }, 'allow', g.rule ? 'rule' : 'app', g.rule)
      return Promise.resolve(true)
    }
    const key = `${panel}\n${g.host}`
    const open = this.pending.get(key)
    if (open) return open
    this.audit(panel, tool, { url, host: g.host }, 'ask', 'app')
    const p = (async () => {
      const answer = await this.card(panel, 'host', { host: g.host, always: g.alwaysOffered })
      const a = admit(this.session(panel), g.host, answer, this.d.now())
      this.sessions.set(panel, a.session)
      if (!a.ok) {
        this.refusal.set(panel, a.message)
        this.audit(panel, tool, { url, host: g.host }, 'refused', 'person')
        return false
      }
      if (a.writeRule) {
        try {
          this.d.writeRule(panel, a.writeRule)
        } catch (e) {
          this.refusal.set(panel, `the rule could not be saved: ${(e as Error).message}`)
        }
      }
      this.audit(panel, tool, { url, host: g.host, answer }, 'approved', 'person')
      return true
    })().finally(() => this.pending.delete(key))
    this.pending.set(key, p)
    return p
  }

  private refusal = new Map<string, string>()
  lastRefusal(panel: string): string | undefined {
    const r = this.refusal.get(panel)
    this.refusal.delete(panel)
    return r
  }

  /** A download: only an answer from the person keeps it. */
  async download(panel: string, info: { name: string; size: number; host: string }): Promise<boolean> {
    this.audit(panel, 'mcp__stm__browser_download', info, 'ask', 'app')
    const card = await this.card(panel, 'download', { host: info.host, name: info.name, size: info.size, always: false })
    const ok = card === 'once' || card === 'always'
    this.audit(panel, 'mcp__stm__browser_download', info, ok ? 'approved' : 'refused', 'person')
    return ok
  }

  /** An upload: only an answer from the person lets a file go to a page. `once` is the only yes. */
  async upload(panel: string, info: { name: string; size: number; host: string; pick: boolean }): Promise<boolean> {
    const row = { host: info.host, ...(info.pick ? {} : { name: info.name, size: info.size }) }
    this.audit(panel, 'mcp__stm__browser_upload', row, 'ask', 'app')
    const card = await this.card(panel, 'upload', { host: info.host, ...(info.pick ? { pick: true } : { name: info.name, size: info.size }), always: false })
    const ok = card === 'once' || card === 'always'
    this.audit(panel, 'mcp__stm__browser_upload', row, ok ? 'approved' : 'refused', 'person')
    return ok
  }
}
