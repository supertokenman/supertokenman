# Releasing the Mac app (signed and notarized)

Phase 77. The everyday build (`npm run dist:mac`) stays ad-hoc signed for your own machine. A build
for other people is signed with your Developer ID and notarized by Apple, so Gatekeeper opens it
without warnings.

## What you need once

1. **Developer ID Application certificate.** In Xcode (Settings > Accounts > Manage Certificates) or at
   developer.apple.com, create a "Developer ID Application" certificate. Export it from Keychain Access
   as a `.p12` with a password.
2. **App Store Connect API key** for notarization: App Store Connect > Users and Access > Integrations >
   App Store Connect API > generate a key with the Developer role. Download the `.p8` (only once), and
   note the Key ID and the Issuer ID.

## On your Mac

```bash
cd app
export APPLE_API_KEY=~/keys/AuthKey_XXXXXXXXXX.p8   # path to the .p8, outside the repo
export APPLE_API_KEY_ID=XXXXXXXXXX
export APPLE_API_ISSUER=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
npm run dist:mac:signed          # finds the Developer ID in your keychain, signs, notarizes, staples
npm run verify:mac -- release/mac-arm64/SuperTokenMan.app
```

`verify:mac` runs `codesign --verify --deep --strict`, `spctl -a -vv`, `xcrun stapler validate` and
reads the Electron fuses back.

## In GitHub Actions (optional)

The workflow `.github/workflows/release-mac.yml` runs only when started by hand from `main` (Actions >
release-mac > Run workflow), in the public repository `supertokenman/supertokenman`.

The secrets go into an **environment**, not into the repository's secrets, so that no other workflow can
read them and each run waits for an approval:

1. Settings > Environments > New environment, named `release`.
2. Required reviewers: yourself. Turn on "Prevent self-review" only once there is a second person.
3. Deployment branches and tags: "Selected branches and tags", only `main`.
4. Environment secrets:

| Secret | What |
|---|---|
| `MAC_CERT_P12_BASE64` | `base64 -i DeveloperID.p12` |
| `MAC_CERT_PASSWORD` | the .p12 password |
| `APPLE_API_KEY_P8` | the text of the .p8 file |
| `APPLE_API_KEY_ID` | Key ID |
| `APPLE_API_ISSUER` | Issuer ID |

What else holds them in:
- Pull requests from forks never receive secrets. Settings > Actions > General: "Require approval for
  all external contributors", and Workflow permissions "Read repository contents".
- A ruleset on `main` (Settings > Rules): restrict deletions, block force pushes, require a pull
  request (0 approvals), with Repository admin on the bypass list.
  Turn on "Require review from Code Owners" (`.github/CODEOWNERS`: `.github/`, `app/build/`,
  `app/scripts/`) only once there is a second maintainer: nobody can approve their own pull request.
- Actions are pinned to commits, the checkout keeps no credentials, and the run uses no dependency
  cache.
- The App Store Connect key needs only the Developer role. Store the .p12 and the .p8 in a password
  manager, delete loose copies, and rotate both at once if there is any doubt: revoke the key in App
  Store Connect and the certificate in the Apple Developer site.
- No personal token: the release is created with the run's own `GITHUB_TOKEN`, which exists only for
  that run.

The build is kept as a run artifact for 7 days, with `SHA256SUMS` and `latest-mac.yml`.

## Publishing a release

1. Bump `version` in `app/package.json` (the tag is `v<version>`; an existing tag stops the run).
2. Actions > release-mac > Run workflow, with **publish** on, then approve the `release` environment.
3. The run creates a **draft** release, with `docs/release-notes.md` as its text, with the dmg and zip
   for arm64 and Intel, their blockmaps, `latest-mac.yml` (read by the in-app updater), `SHA256SUMS`
   and a build attestation for the dmg and zip files.
4. Read the draft, write the notes (the in-app update prompt shows their first lines), and publish it.
   Installed copies see it at their next check.

Anyone can check that a download was built by this workflow from a given commit:

```bash
gh attestation verify SuperTokenMan-arm64.dmg --repo supertokenman/supertokenman
```

Not verified yet: the first run of this workflow in the public repository.

## Homebrew tap

The cask lives in `packaging/homebrew/supertokenman.rb`, written by `packaging/homebrew/gen-cask.sh`
from a release's `SHA256SUMS` (test: `bash packaging/homebrew/test-gen-cask.sh`, also run in CI). When a
release is published, `.github/workflows/homebrew-tap.yml` regenerates it and pushes it to
`supertokenman/homebrew-tap` as `Casks/supertokenman.rb`. Until the setup below exists, that job logs
"HOMEBREW_TAP_TOKEN is not set" and ends green.

Once:

1. Create the tap repository: in the `supertokenman` org, a new **public** repository named exactly
   `homebrew-tap`, created **empty** (no README, license or .gitignore). Then push a first commit with the
   current cask as `Casks/supertokenman.rb` (copy `packaging/homebrew/supertokenman.rb`), or publish the
   next release and let the workflow do it.
2. Create the token: GitHub > Settings > Developer settings > Fine-grained tokens > Generate. Resource
   owner `supertokenman`, repository access **Only select repositories** > `homebrew-tap`, permission
   **Contents: Read and write** (nothing else). Pick an expiry and put a reminder to renew it.
3. In `supertokenman/supertokenman` > Settings > Secrets and variables > Actions, add it as
   `HOMEBREW_TAP_TOKEN`.
4. Check: `brew install --cask supertokenman/tap/supertokenman` on a Mac, then `brew audit --cask
   supertokenman/tap/supertokenman`. Only after that does the install line go on the site and README.

Users then install with:

```bash
brew install --cask supertokenman/tap/supertokenman
```

The app updates itself (electron-updater), so the cask says `auto_updates true` and `brew upgrade`
leaves it alone unless run with `--greedy`. The official `homebrew/cask` comes later, once the app meets
its notability rules.

## The proof after each release

`.github/workflows/proof-mac.yml` runs by itself when a release is published, and by hand from the
Actions tab (with a tag, or empty for the latest). On a macOS runner it downloads the released dmg,
checks it (SHA256SUMS, the build attestation, `codesign`, `spctl`), opens it with its own profile through
mitmproxy in `--names` mode, and drives it with nobody at the keyboard (`app/scripts/proof-drive.mjs`,
over Chromium's debugging port on loopback): DECOY_KEY in the vault with "Commands can read it", a
panel, "run echo hello and tell me the date", the command allowed. Then it writes REPORT.md.

It fails when the decoy shows up in any file of the run, or when the app's own processes reach a host
not written in `docs/NETWORK.md`. Claude Code and its MCP servers are listed, not judged. The report and
the raw logs are kept as the `proof-mac` artifact for 30 days; after a release, the report is also
attached to it as `proof-mac-<version>.md`.

Claude Code needs an Anthropic API to talk to. Two modes:

- **Mock, the default.** With no key set, the run starts a local stand-in of the Anthropic Messages API
  on loopback (`app/scripts/proof-mock-api.mjs`) and points Claude Code at it with
  `ANTHROPIC_BASE_URL` and the fake key `proof-mock-key`. It asks for the Bash tool once
  (`echo hello && date`), then answers in text, so the whole turn runs, the command included, for free.
  Every request Claude Code sends, with its full body, is kept in `mock-requests.jsonl`, and the decoy is
  searched there like in every other file of the run. This shows every byte the app and Claude Code
  send; it does not exercise Anthropic's real service.
- **Real, optional.** Settings > Environments > `proof` (no required reviewers: the run must start by
  itself), with the secret `ANTHROPIC_API_KEY`. A key of its own with a small monthly spend limit is
  enough (console.anthropic.com > Settings > Limits): one run is one short turn. Then the turn goes to
  Anthropic, through the proxy in `--names` mode: the host names are logged, the content is not read.
  The key goes to the app's process only; the run checks that no log carries it before uploading.

The workflow names the `proof` environment either way; GitHub creates it empty on the first run, and an
empty one means mock mode.

To run the proof on your own Mac instead, with your own Claude login: `bash app/scripts/proof-mac.sh
--names`.

## What changes in a signed build

- In CI the workflow builds its own keychain from `MAC_CERT_P12_BASE64` and `MAC_CERT_PASSWORD`
  (electron-builder's temporary keychain failed to unlock on the macOS runner), imports Apple's Developer
  ID G2 intermediate, and deletes the keychain at the end.
- `build/signed.cjs`: Developer ID identity, hardened runtime, notarization, dmg and zip for arm64
  and Intel.
- `build/entitlements.signed.plist`: drops `disable-library-validation` (every bundled binary is now
  signed by the same team); keeps JIT, camera, microphone and Apple Events.
- The fuses from phase 76 are flipped before signing.

## Verified

- 2026-10-26, on the owner's Mac (Apple silicon): `npm run dist:mac:signed` signed the arm64 app with the
  Developer ID, Apple notarized it, and `verify:mac` reported `accepted`, `source=Notarized Developer ID`,
  a stapled ticket, and the fuses as set in `build/fuses.cjs`. The x64 notarization of that run stopped
  when the Mac lost its connection; it was not retried there, since releases come from the workflow.
- 2026-10-26, release-mac run 40318580638 on `main` (ac61675): both arm64 and x64 signed, notarized
  and `verify:mac` accepted on the macOS runner. With **publish** on, the next run made the draft
  v0.1.0 in `supertokenman/supertokenman` with all 10 files; published by hand. Downloading
  `releases/latest/download/SuperTokenMan-arm64.dmg` and `SHA256SUMS` and running
  `shasum -a 256 -c SHA256SUMS --ignore-missing` gave `OK`.
- CI lesson: the run with **publish** off is green too; the draft step only shows as skipped. Tick it.
- v0.1.0 opened with a black window: with the `GrantFileProtocolExtraPrivileges` fuse off, `file://`
  cannot read inside `app.asar`, so `loadFile(dist/index.html)` failed with `ERR_FILE_NOT_FOUND`. No
  packaged build with the fuses had been opened before. Fixed in 0.1.1 by serving the window from
  `stmui://app/` (`uiFile` in `electron/hardening.ts`), keeping the fuse off; IPC and permissions now
  trust only `stmui://app/index.html`. Reproduced and checked on a Linux package with the same fuses.
  Before a release, open the packaged app once (`npx electron-builder --linux dir` is enough to see it).
  v0.1.0 cannot update itself (its window never loads): its users download 0.1.1 again.
- First-run lessons: `identity: null` skips signing in electron-builder 26 (fixed in `signed.cjs`); a key
  imported from the Terminal needs `security set-key-partition-list -S apple-tool:,apple:,codesign: -s`
  or codesign prompts for every file; the first notarizations of a new account took about 10 minutes.

## Not verified here

Signing, notarization and Gatekeeper need a Mac; this session runs on Linux. The config is covered
by a test (`build/signed.test.ts`); the first real signed build should be checked with `verify:mac`.
If a bundled binary fails library validation, the error names it.
