// Leaked secrets, the parts with no process: trufflehog's JSON lines read into findings that never keep
// the secret itself (only a masked hint and a fingerprint), where each kind of key is rotated, and the
// steps to take a key out of git history. trufflehog (AGPL-3.0) runs as its own program; no code from it.

export type Leak = {
  /** sha256 of the secret: the same key found twice is one leak; the secret itself is never kept */
  fp: string
  detector: string
  verified: boolean | null
  hint: string
  file: string
  line?: number
  commit?: string
  author?: string
  when?: string
  source: 'git' | 'filesystem'
  count: number
}

/** The first characters and the length, never the whole value. */
export const maskSecret = (s: string) => (s.length <= 8 ? `${'•'.repeat(s.length)} (${s.length})` : `${s.slice(0, 4)}${'•'.repeat(6)} (${s.length} chars)`)

/**
 * trufflehog --json output (one object per line) to leaks, merged by fingerprint. `hash` is given so this
 * runs the same in the main process and in tests. Without verification, Verified is unknown, not false.
 */
export function leaksOf(jsonl: string, hash: (s: string) => string, verifying: boolean): Leak[] {
  const by = new Map<string, Leak>()
  for (const line of jsonl.split('\n')) {
    if (!line.trim().startsWith('{')) continue
    let j: Record<string, unknown>
    try {
      j = JSON.parse(line)
    } catch {
      continue
    }
    const raw = String(j.Raw ?? j.RawV2 ?? '')
    if (!raw || !j.DetectorName) continue
    const data = ((j.SourceMetadata as { Data?: Record<string, Record<string, unknown>> } | undefined)?.Data ?? {}) as Record<string, Record<string, unknown>>
    const git = data.Git
    const fsd = data.Filesystem
    const m = git ?? fsd ?? {}
    const fp = hash(`${j.DetectorName}\u0000${raw}`)
    const prev = by.get(fp)
    if (prev) {
      prev.count++
      continue
    }
    by.set(fp, {
      fp,
      detector: String(j.DetectorName),
      verified: verifying ? Boolean(j.Verified) : null,
      hint: maskSecret(raw),
      file: String(m.file ?? ''),
      ...(m.line ? { line: Number(m.line) } : {}),
      ...(git?.commit ? { commit: String(git.commit).slice(0, 12) } : {}),
      ...(git?.email ? { author: String(git.email).replace(/<|>/g, '') } : {}),
      ...(git?.timestamp ? { when: String(git.timestamp) } : {}),
      source: git ? 'git' : 'filesystem',
      count: 1,
    })
  }
  return [...by.values()].sort((a, b) => Number(b.verified === true) - Number(a.verified === true) || a.detector.localeCompare(b.detector))
}

/** Where to revoke and make a new key, for the detectors seen most. */
const ROTATE: Record<string, string> = {
  aws: 'https://console.aws.amazon.com/iam/home#/security_credentials',
  github: 'https://github.com/settings/tokens',
  githuboauth2: 'https://github.com/settings/developers',
  gitlab: 'https://gitlab.com/-/user_settings/personal_access_tokens',
  stripe: 'https://dashboard.stripe.com/apikeys',
  slack: 'https://api.slack.com/apps',
  slackwebhook: 'https://api.slack.com/apps',
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  gcp: 'https://console.cloud.google.com/iam-admin/serviceaccounts',
  googleapikey: 'https://console.cloud.google.com/apis/credentials',
  twilio: 'https://console.twilio.com/us1/account/keys-credentials/api-keys',
  sendgrid: 'https://app.sendgrid.com/settings/api_keys',
  cloudflareapitoken: 'https://dash.cloudflare.com/profile/api-tokens',
  npmtoken: 'https://www.npmjs.com/settings/~/tokens',
  supabasetoken: 'https://supabase.com/dashboard/account/tokens',
  resend: 'https://resend.com/api-keys',
  mailgun: 'https://app.mailgun.com/settings/api_security',
  postgres: '',
  uri: '',
}
export const rotateUrl = (detector: string) => ROTATE[detector.toLowerCase().replace(/[^a-z0-9]/g, '')] || null

/** What to do, in order; the history rewrite is shown, never run by the app. */
export function steps(l: Leak, vaultName: string): string[] {
  const out = [
    `Revoke the key now${rotateUrl(l.detector) ? ` at ${rotateUrl(l.detector)}` : ` where ${l.detector} keys are managed`}, and make a new one. A key that reached git is leaked even if the repo is private.`,
    `Put the new key in the app's vault as ${vaultName} and read it from the environment; remove it from ${l.file || 'the file'}${l.line ? ` line ${l.line}` : ''}.`,
  ]
  if (l.source === 'git')
    out.push(
      `Take it out of history with git filter-repo (pip install git-filter-repo): write the old value on one line of a file outside the repo, then run: git filter-repo --replace-text <that file>. Every clone must re-clone, and a force push is needed: agree on it with whoever shares the repo.`,
      `If the repo is on GitHub, ask GitHub support to clear cached views of old commits, and check forks.`,
    )
  return out
}

/** A vault name from the detector: GITHUB_TOKEN, STRIPE_API_KEY. */
export const vaultNameFor = (detector: string) => `${detector.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}_${/token/i.test(detector) ? '' : 'API_KEY'}`.replace(/_+$/, '').replace(/__+/g, '_') || 'LEAKED_KEY'

/** trufflehog's command line: a repo's history from a commit, or plain files; verification only when asked. */
export function leakArgs(source: 'git' | 'filesystem', path: string, verify: boolean, since?: string): string[] {
  if (since && !/^[0-9a-f]{7,40}$/.test(since)) throw new Error('Since is a commit id.')
  return [source, source === 'git' ? `file://${path}` : path, '--json', '--no-update', ...(verify ? [] : ['--no-verification']), ...(since && source === 'git' ? ['--since-commit', since] : [])]
}

/** A pre-push hook that runs the scan on what is about to be pushed and stops on a find. */
export const prePushHook = (bin: string) => `#!/bin/sh
# Added by SuperTokenMan: stops a push that carries a secret. Remove this file to turn it off.
"${bin.replace(/"/g, '')}" git file://. --since-commit HEAD~20 --no-verification --no-update --fail --json >/dev/null 2>&1
code=$?
if [ "$code" = "183" ]; then echo "Push stopped: a secret was found in the last commits. Open Security in the app to see it." >&2; exit 1; fi
exit 0
`
