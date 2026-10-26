import { describe, expect, it } from 'vitest'
import { byPackage, cmpVer, counts, findingsOf, fixMessage, gate, scanArgs } from './trivy'

export const REPORT = {
  SchemaVersion: 2,
  Results: [
    {
      Target: 'package-lock.json',
      Class: 'lang-pkgs',
      Type: 'npm',
      Vulnerabilities: [
        { VulnerabilityID: 'CVE-2024-4068', PkgName: 'braces', InstalledVersion: '3.0.2', FixedVersion: '3.0.3', Severity: 'HIGH', Title: 'braces: fails to limit the number of characters', PrimaryURL: 'https://avd.aquasec.com/nvd/cve-2024-4068' },
        { VulnerabilityID: 'CVE-2022-24999', PkgName: 'qs', InstalledVersion: '6.5.2', FixedVersion: '6.2.4, 6.5.3, 6.10.3', Severity: 'CRITICAL', Title: 'express: "qs" prototype poisoning' },
        { VulnerabilityID: 'CVE-2024-0001', PkgName: 'qs', InstalledVersion: '6.5.2', Severity: 'MEDIUM', Title: 'no fix yet' },
      ],
      Licenses: [{ Severity: 'HIGH', Category: 'restricted', PkgName: 'gpl-thing', Name: 'GPL-3.0' }],
    },
    { Target: 'Dockerfile', Class: 'config', Type: 'dockerfile', Misconfigurations: [{ ID: 'DS002', Title: 'Image user should not be root', Severity: 'HIGH', Status: 'FAIL', Resolution: 'Add USER with a non-root user', CauseMetadata: { StartLine: 1 } }, { ID: 'DS026', Title: 'No HEALTHCHECK', Severity: 'LOW', Status: 'PASS' }] },
  ],
}

describe('trivy', () => {
  it('reads the report, worst first', () => {
    const f = findingsOf(REPORT)
    expect(f.map((x) => [x.kind, x.id, x.severity])).toEqual([['vuln', 'CVE-2022-24999', 'CRITICAL'], ['license', 'GPL-3.0', 'HIGH'], ['misconfig', 'DS002', 'HIGH'], ['vuln', 'CVE-2024-4068', 'HIGH'], ['vuln', 'CVE-2024-0001', 'MEDIUM']])
    expect(counts(f)).toEqual({ CRITICAL: 1, HIGH: 3, MEDIUM: 1, LOW: 0, UNKNOWN: 0 })
    expect(f.find((x) => x.id === 'DS002')).toMatchObject({ line: 1, target: 'Dockerfile' })
    expect(findingsOf(null)).toEqual([])
  })

  it('groups by package with the version that fixes it', () => {
    const p = byPackage(findingsOf(REPORT))
    expect(p[0]).toMatchObject({ pkg: 'qs', fixTo: '6.10.3', worst: 'CRITICAL', unfixed: 1 })
    expect(p[1]).toMatchObject({ pkg: 'braces', fixTo: '3.0.3' })
    expect(cmpVer('6.10.3', '6.5.3')).toBeGreaterThan(0)
    expect(cmpVer('1.2.0-rc1', '1.2.0')).toBeLessThan(0)
  })

  it('gates a deploy on critical findings not accepted', () => {
    const f = findingsOf(REPORT)
    expect(gate(f, [], 1, 2)).toMatchObject({ ok: false, reason: expect.stringContaining('CVE-2022-24999 in qs') })
    const acc = [{ key: f[0]!.key, note: 'not reachable', until: 10, at: 1 }]
    expect(gate(f, acc, 1, 2)).toEqual({ ok: true })
    expect(gate(f, acc, 1, 11).ok).toBe(false)
    expect(gate(null, [], null, 2)).toMatchObject({ ok: true, warn: expect.stringMatching(/No scan/) })
    expect(gate(f, acc, 0, 8 * 86_400_000).ok).toBe(false)
  })

  it('writes a fix message and safe arguments', () => {
    const f = findingsOf(REPORT)
    expect(fixMessage(f[0]!)).toMatch(/Upgrade qs to 6\.2\.4 or later/)
    expect(fixMessage(f.find((x) => x.id === 'DS002')!)).toMatch(/Dockerfile line 1.*Add USER/s)
    expect(scanArgs('fs', '/p')).toEqual(['fs', '--quiet', '--format', 'json', '--scanners', 'vuln,misconfig,license', '--skip-dirs', 'node_modules/.cache', '/p'])
    expect(scanArgs('fs', '/p', 'cyclonedx')).toEqual(['fs', '--quiet', '--format', 'cyclonedx', '--skip-dirs', 'node_modules/.cache', '/p'])
    expect(() => scanArgs('image', 'x; rm -rf /')).toThrow(/image/)
  })
})
