# Security audit, second round: 2026-10-26

Commit scanned: `02139d9` (version 0.1.3, after the fixes from the [first round](../2026-10-26/REPORT.md)),
with the full git history. Same tools, versions and commands as the first round, on Linux in a cloud
session. The raw reports are next to this file.

## Summary

| Area | Tool | Round 1 (0.1.2) | Round 2 (0.1.3) |
|---|---|---|---|
| Secrets in code and history | gitleaks 8.21.2 | 12 fake test keys, 0 real | no leaks found (the 12 fake keys are listed in `.gitleaksignore`) |
| Code patterns | Semgrep 1.182.1, same rule sets | 84 hits, 1 real medium | 82 hits, 0 real (see below) |
| Electron configuration | Electronegativity 1.10.3 | 22, all guarded or informational | 22, the same ones |
| Dependencies with known vulnerabilities | OSV-Scanner 1.9.2 | 6 packages, 1 shipped (`yaml`) | 5 packages, 0 shipped: vite, vitest, @vitest/mocker, esbuild, tinypool (dev and test only) |
| Licenses of shipped packages | license-checker-rseidelsohn 4.4.2 | 157, no GPL, AGPL or SSPL | 157, the same |
| Bill of materials | CycloneDX npm 1.19.3 | 153 components | 153 components |
| Network at launch | `npm run netwatch:check` | 18 attempts, all allowed | 16 attempts, all allowed |
| Unit tests | Vitest | 925 passed, 1 known failure | 925 passed, 1 known failure (`docs.test.ts`) |

## What changed in Semgrep

- `bypass-tls-verification` at `app/electron/db.ts:26`: this is the `pgSsl` fix itself. It returns
  `rejectUnauthorized: false` only when the connection string says `sslmode=require`, `prefer` or
  `no-verify`, which is libpq's meaning of those modes. Without an sslmode, Supabase and Neon are
  verified. By design, and tested in `db.test.ts`.
- `node_insecure_random_generator` went from 9 to 8 and `node_sha1` from 6 to 5: the guessable
  `codebox` temp folder is gone (`mkdtempSync`).
- The other hits are the same false positives reviewed in round 1.

## Still open

- The Claude Agent SDK license: legal reading needed before selling. Not verified.
- A regex the user writes in their own rules runs as is: low.
- Dev-only advisories in the test tooling: low, update when vitest moves to a new major.

## Not covered

The same as round 1: the packaged Mac app, where child processes connect, Grype and Trivy over the dmg,
CodeQL and Scorecard (need a public repository), and logic flaws. The setting that turns off Claude
Code's usage data is checked by reading the code, not by watching the `claude` process's traffic.
