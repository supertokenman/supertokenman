// The supply-chain scan, the parts with no process: trivy's JSON report read into findings
// (vulnerabilities, misconfigurations, licenses), grouped so each package shows once with the version
// that fixes it, accepted findings with a note and an end date, the gate before a deploy, and the
// message that asks a panel to fix one. trivy (Apache-2.0) runs as its own program.

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN'
export const SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']
export type Finding = {
  key: string
  kind: 'vuln' | 'misconfig' | 'license'
  id: string
  severity: Severity
  title: string
  target: string
  pkg?: string
  installed?: string
  fixed?: string
  line?: number
  resolution?: string
  url?: string
}
export type Kind = 'fs' | 'image' | 'config'

const sev = (s: unknown): Severity => (SEVERITIES.includes(String(s).toUpperCase() as Severity) ? (String(s).toUpperCase() as Severity) : 'UNKNOWN')

/** trivy's --format json report as one flat list of findings, worst first. Secrets are left to phase 40. */
export function findingsOf(report: unknown): Finding[] {
  const out: Finding[] = []
  for (const r of (report as { Results?: Record<string, unknown>[] })?.Results ?? []) {
    const target = String(r.Target ?? '')
    for (const v of (r.Vulnerabilities as Record<string, unknown>[] | undefined) ?? [])
      out.push({ key: `vuln:${v.VulnerabilityID}:${v.PkgName}:${target}`, kind: 'vuln', id: String(v.VulnerabilityID), severity: sev(v.Severity), title: String(v.Title ?? v.Description ?? v.VulnerabilityID).slice(0, 200), target, pkg: String(v.PkgName ?? ''), installed: String(v.InstalledVersion ?? ''), ...(v.FixedVersion ? { fixed: String(v.FixedVersion) } : {}), ...(v.PrimaryURL ? { url: String(v.PrimaryURL) } : {}) })
    for (const m of (r.Misconfigurations as Record<string, unknown>[] | undefined) ?? []) {
      if (m.Status && m.Status !== 'FAIL') continue
      const line = (m.CauseMetadata as { StartLine?: number } | undefined)?.StartLine
      out.push({ key: `misconfig:${m.ID}:${target}:${line ?? ''}`, kind: 'misconfig', id: String(m.ID ?? m.AVDID), severity: sev(m.Severity), title: String(m.Title ?? m.Message ?? m.ID).slice(0, 200), target, ...(line ? { line } : {}), ...(m.Resolution ? { resolution: String(m.Resolution) } : {}), ...(m.PrimaryURL ? { url: String(m.PrimaryURL) } : {}) })
    }
    for (const l of (r.Licenses as Record<string, unknown>[] | undefined) ?? [])
      out.push({ key: `license:${l.Name}:${l.PkgName}:${target}`, kind: 'license', id: String(l.Name), severity: sev(l.Severity), title: `${l.PkgName ? `${l.PkgName}: ` : ''}${l.Name} (${String(l.Category ?? 'unknown').toLowerCase()})`, target, ...(l.PkgName ? { pkg: String(l.PkgName) } : {}) })
  }
  return out.sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id))
}

export const counts = (f: Finding[]) => Object.fromEntries(SEVERITIES.map((s) => [s, f.filter((x) => x.severity === s).length])) as Record<Severity, number>

/** Vulnerabilities by package: the highest version that fixes all of them, and how many have no fix yet. */
export function byPackage(f: Finding[]): { pkg: string; target: string; installed: string; fixTo: string | null; worst: Severity; ids: string[]; unfixed: number }[] {
  const m = new Map<string, Finding[]>()
  for (const x of f.filter((x) => x.kind === 'vuln')) m.set(`${x.target}\u0000${x.pkg}`, [...(m.get(`${x.target}\u0000${x.pkg}`) ?? []), x])
  return [...m.values()]
    .map((l) => {
      const fixes = l.map((x) => x.fixed?.split(',').map((s) => s.trim()).sort(cmpVer).at(-1)).filter((x): x is string => !!x)
      return { pkg: l[0]!.pkg!, target: l[0]!.target, installed: l[0]!.installed ?? '', fixTo: fixes.sort(cmpVer).at(-1) ?? null, worst: l.map((x) => x.severity).sort((a, b) => SEVERITIES.indexOf(a) - SEVERITIES.indexOf(b))[0]!, ids: l.map((x) => x.id), unfixed: l.filter((x) => !x.fixed).length }
    })
    .sort((a, b) => SEVERITIES.indexOf(a.worst) - SEVERITIES.indexOf(b.worst) || b.ids.length - a.ids.length)
}

/** Compares dotted versions number by number; a suffix after a dash sorts before the bare version. */
export function cmpVer(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split(/[.+-]/)
  const pb = b.replace(/^v/, '').split(/[.+-]/)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i]
    const y = pb[i]
    if (x == null) return y != null && /^\d/.test(y) ? -1 : 1
    if (y == null) return /^\d/.test(x) ? 1 : -1
    const nx = Number(x)
    const ny = Number(y)
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) {
      if (nx !== ny) return nx - ny
    } else if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

export type Accepted = { key: string; note: string; until: number; at: number }
export const isAccepted = (f: Finding, acc: Accepted[], now: number) => acc.some((a) => a.key === f.key && a.until > now)

/** Before a deploy: critical findings that are not accepted stop it; an old scan is a warning, not a stop. */
export function gate(f: Finding[] | null, acc: Accepted[], scannedAt: number | null, now: number): { ok: boolean; reason?: string; warn?: string } {
  if (!f || scannedAt == null) return { ok: true, warn: 'No scan of this project yet.' }
  const open = f.filter((x) => x.severity === 'CRITICAL' && !isAccepted(x, acc, now))
  if (open.length) return { ok: false, reason: `${open.length} critical ${open.length === 1 ? 'finding' : 'findings'} from the last scan: ${open.slice(0, 3).map((x) => x.pkg ? `${x.id} in ${x.pkg}` : x.id).join(', ')}${open.length > 3 ? '…' : ''}. Fix or accept them in Security.` }
  return now - scannedAt > 7 * 86_400_000 ? { ok: true, warn: 'The last scan is more than a week old.' } : { ok: true }
}

/** What a panel is asked to do about a finding. */
export function fixMessage(f: Finding): string {
  if (f.kind === 'vuln')
    return `Security scan: ${f.id} (${f.severity}) in ${f.pkg} ${f.installed}, found in ${f.target}. ${f.title}.\n${f.fixed ? `Upgrade ${f.pkg} to ${f.fixed.split(',')[0]!.trim()} or later` : 'No fixed version yet: find a way to remove or replace it, or say why it is not reachable'}, then run the tests and say what changed.${f.url ? `\nAdvisory: ${f.url}` : ''}`
  if (f.kind === 'misconfig') return `Security scan: ${f.id} (${f.severity}) in ${f.target}${f.line ? ` line ${f.line}` : ''}: ${f.title}.${f.resolution ? `\nSuggested fix: ${f.resolution}` : ''}\nChange the file, keep the rest as it is, and say what changed.`
  return `License check: ${f.title} in ${f.target}. Say whether this license fits the project and what to replace it with if not; change nothing yet.`
}

/** The trivy command line for a scan; a target is a folder or an image name, never a shell string. */
export function scanArgs(kind: Kind, target: string, out: 'json' | 'cyclonedx' | 'spdx-json' = 'json'): string[] {
  if (kind === 'image' && !/^[\w./:@-]{1,200}$/.test(target)) throw new Error('An image looks like name:tag or registry/name@sha256:…')
  const scanners = kind === 'config' ? ['--scanners', 'misconfig'] : kind === 'image' ? ['--scanners', 'vuln,misconfig'] : ['--scanners', 'vuln,misconfig,license']
  const sbom = out !== 'json'
  return [kind === 'config' ? 'config' : kind, '--quiet', '--format', out, ...(sbom ? [] : kind === 'config' ? [] : scanners), ...(kind === 'fs' ? ['--skip-dirs', 'node_modules/.cache'] : []), target]
}
