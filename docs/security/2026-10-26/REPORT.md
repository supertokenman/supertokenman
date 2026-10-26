# Security audit, first round: 2026-10-26

Commit scanned: `4a02ab6` (version 0.1.2), with the full git history (383 commits, all branches).
Run on Linux in a cloud session. The raw reports are next to this file; each one can be reproduced with
the command given under its tool.

These tools find what is already known to look for: leaked secrets, dependencies with published
vulnerabilities, risky code patterns and the classic Electron mistakes. They do not find flaws in the
app's own logic. That still needs our own tests and, before charging money, an outside review.

## Summary

| Area | Tool | Result | Open items |
|---|---|---|---|
| Secrets in code and history | gitleaks 8.21.2 | 12 hits, all fake test keys; 0 real | none |
| Code patterns | Semgrep 1.182.1 (p/javascript, p/typescript, p/nodejsscan, p/secrets; 224 rules, 447 files) | 84 hits: 1 real (medium), 2 low, the rest false positives or by design | 1 medium, 2 low |
| Electron configuration | Electronegativity 1.10.3 (Electron 44.9.3) | 22 hits, all guarded or informational; none of nodeIntegration, contextIsolation off or webSecurity off | none |
| Dependencies with known vulnerabilities | OSV-Scanner 1.9.2 | 16 advisories in 6 packages; 1 package ships in the app (`yaml`), 5 are build and test tools | 1 medium, 5 dev-only |
| Licenses of shipped packages | license-checker-rseidelsohn 4.4.2 (157 production packages) | no GPL, AGPL or SSPL shipped | 1 legal question |
| Bill of materials | CycloneDX npm 1.19.3 | 153 components, `sbom.cdx.json` | none |
| Network at launch | `npm run netwatch:check` | 18 attempts in 60 s, all allowed | 1 gap in coverage |

## Status after the fixes (version 0.1.3)

| # | Finding | Status |
|---|---|---|
| 1 | Postgres TLS without certificate check | Fixed: `pgSsl` in `app/electron/db.ts` verifies by default, `sslmode=require` only when written, plain-words error on a certificate it cannot check; tests in `db.test.ts` |
| 2 | `yaml` 2.6.1 | Fixed: 2.9.1; OSV-Scanner now reports only the dev-only tools |
| 3 | Claude Code's own traffic | Fixed and said: panels get `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` unless the person turns it on in Appearance; `docs/NETWORK.md` and the Security page say what still goes to Anthropic and that child-process traffic is outside the check |
| 4 | Agent SDK license | Open: needs legal reading |
| 5 | `codebox` temp folder | Fixed: `mkdtempSync` |
| 5 | user regex in rules | Open, low |
| 5 | dev-only advisories | Open, low: update with the test tooling |

## Findings that need work

### 1. Postgres TLS without certificate check: medium, real
`app/electron/db.ts:107` and `:417`. When a connection uses SSL (`sslmode=require`, Supabase, Neon),
the client passes `ssl: { rejectUnauthorized: false }`. The link is encrypted, but the server's
certificate is not checked. On a hostile network, a machine in the middle could present its own
certificate and read the database password and data.
Fix: verify certificates by default (Supabase and Neon present public certificates). Allow an
unverified link only when the connection string says `sslmode=require` explicitly, and show that it is
unverified.

### 2. `yaml` 2.6.1 ships in the app: medium, real
GHSA-48c2-rrv3-qjmp (OSV max severity 4.3). `yaml` is a direct runtime dependency.
Fix: update to a patched release and re-run OSV-Scanner.

### 3. Claude Code's own traffic to Anthropic: needs to be said, and is not covered by our check
- The Agent SDK's README says Anthropic collects usage data (code accepted or rejected, conversation
  data, feedback) under its Commercial Terms and Privacy Policy.
- The app does not set `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` for its sessions. It only passes it
  on when the user already has it.
- `netwatch` records that the `claude` process starts, but not where child processes connect. Its
  traffic is outside what our check proves.

Fix:
- Say on the Security page that Claude Code talks to Anthropic under Anthropic's policies, including
  usage data.
- Decide whether the app turns off Claude Code's non-essential traffic by default, with a switch.
- Write the child-process gap into `docs/NETWORK.md`.

### 4. The Claude Agent SDK license: legal question, not verified
The SDK, and the `claude` binary the app bundles inside the dmg, are "© Anthropic PBC. All rights
reserved. Use is subject to the Legal Agreements" (code.claude.com/docs/en/legal-and-compliance).
Bundling it in a commercial app needs those terms read by someone qualified. Not checked here.

### 5. Low
- `app/electron/codebox.ts:42`: the temp folder name for run_code is guessable
  (`pid + time + Math.random`). Use `mkdtempSync`, which creates it atomically.
- `app/shared/docrules.ts:16`, `app/shared/evals.ts:43`: a regex the user writes in their own rules is
  run as is. A bad pattern can only stall the user's own app. Consider a length or time limit.
- Dev-only advisories in vite 5.4.21, vitest 2.1.9, @vitest/mocker, esbuild 0.21.5 and tinypool 1.1.1
  (up to 9.8). They affect a developer's machine, for example the dev server, not the shipped app.
  Update when the test tooling moves.

## Reviewed and not a problem

- **gitleaks, 12 hits:** fake keys in tests that prove the detectors work, such as
  `ghp_abcdefghij…` and `sk_live_51Habcdefghij…`. The same 12 are in the history, so no real key was
  ever committed. They are listed by fingerprint in `/.gitleaksignore`, so a real key in a test still
  fails.
- **Semgrep `node_password`:** `passkey.ts:4` is a constant named `stm:passkey`.
- **Semgrep `node_sha1` and `node_md5`, 6 hits:** used to name files and index content, not for
  security.
- **Semgrep `node_insecure_random_generator`, 9 hits:** ids, colors and timer jitter. Every token that
  must be secret uses `crypto`: the CLI server, the gateway, phone pairing, OAuth PKCE, team invites
  and receipts.
- **Semgrep `react-dangerouslysetinnerhtml`, 3 hits:** SVG drawn by the app. Text values are escaped
  (`esc` in `hudMini.ts`).
- **Semgrep `wildcard-postmessage-configuration`:** the MCP app frame is
  `sandbox="allow-scripts"` without `allow-same-origin`, so its origin is opaque and `'*'` is the only
  target that reaches it.
- **Semgrep `regex_dos`, 62 hits:** fixed patterns in code. The one built from other text
  (`projgraph.ts:58`) escapes it.
- **Electronegativity:**
  - `OPEN_EXTERNAL`: every call is gated to `https?:` or `mailto:`.
  - `PRELOAD`: windows use `contextIsolation: true` and `sandbox: true`.
  - `insertCSS`: fixed app CSS.
  - `PROTOCOL_HANDLER`: `supertokenman://` links ask before acting (phase 82).
  - `HTTP_RESOURCES`: the dev server only.

## How to reproduce

```bash
gitleaks git . --log-opts="--all" --redact
gitleaks dir . --redact
semgrep scan --config p/javascript --config p/typescript --config p/nodejsscan --config p/secrets \
  --metrics=off --exclude node_modules --exclude dist --exclude dist-electron --exclude '*.test.ts' \
  --exclude engines app/electron app/src app/shared site
osv-scanner scan --lockfile app/package-lock.json --lockfile site/package-lock.json
npx @doyensec/electronegativity@1.10.3 -i app/electron -e 44.9.3
cd app && npx license-checker-rseidelsohn@4.4.2 --production --json
cd app && npx @cyclonedx/cyclonedx-npm@1.19.3 --omit dev --output-format JSON
cd app && npm run netwatch:check
```

## Not covered in this round

- The packaged Mac app and the Mac-only code paths.
- Where child processes (`claude`, `git`, `docker`, cloud CLIs) connect.
- Grype and Trivy over the dmg: their databases could not be fetched from this environment.
- CodeQL and the OpenSSF Scorecard: both need the repository to be public.
- Logic flaws: for example, whether a page in a webview can reach the vault through some path the
  tests do not try. That is for the threat model and an outside review.
