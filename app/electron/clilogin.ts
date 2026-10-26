// Cloud accounts through their own CLIs: AWS, Google Cloud and Azure keep their sign-in on this Mac
// (aws configure or SSO, gcloud auth login, az login). The app never sees a key: it asks the CLI who
// is signed in, and starts the CLI's own sign-in, which opens the provider's page in the browser.
import { spawn } from 'node:child_process'
import type { Run } from './cloud.js'

export type Cli = 'aws' | 'gcloud' | 'az' | 'railway'
export type CliStatus = { cli: Cli; installed: boolean; account?: string; detail?: string; install: string }

const INSTALL: Record<Cli, string> = {
  aws: 'brew install awscli',
  gcloud: 'brew install --cask google-cloud-sdk',
  az: 'brew install azure-cli',
  railway: 'brew install railway',
}

/** Who the CLI is signed in as, or what is missing. */
export async function cliStatus(cli: Cli, run: Run): Promise<CliStatus> {
  const install = INSTALL[cli]
  const has = (await run('/usr/bin/which', [cli]).catch(() => '')).trim()
  if (!has) return { cli, installed: false, install }
  try {
    if (cli === 'aws') {
      const j = JSON.parse(await run('aws', ['sts', 'get-caller-identity', '--output', 'json'])) as { Account?: string; Arn?: string }
      if (j.Account) return { cli, installed: true, account: j.Arn?.split('/').pop() ?? j.Account, detail: `account ${j.Account}`, install }
    } else if (cli === 'gcloud') {
      const account = (await run('gcloud', ['config', 'list', 'account', '--format=value(core.account)'])).trim()
      const project = (await run('gcloud', ['config', 'list', 'project', '--format=value(core.project)'])).trim()
      if (account) return { cli, installed: true, account, detail: project ? `project ${project}` : 'no default project', install }
    } else if (cli === 'railway') {
      // "Logged in as Name (email)"
      const m = /Logged in as (.+?)(?: \((.+)\))?\s*$/m.exec(await run('railway', ['whoami']))
      if (m) return { cli, installed: true, account: m[2] ?? m[1]!, detail: m[2] ? m[1] : undefined, install }
    } else {
      const j = JSON.parse(await run('az', ['account', 'show', '--output', 'json'])) as { user?: { name?: string }; name?: string }
      if (j.user?.name) return { cli, installed: true, account: j.user.name, detail: j.name ? `subscription ${j.name}` : undefined, install }
    }
  } catch {
    // not signed in: the CLI printed an error, not JSON
  }
  return { cli, installed: true, install }
}

/** The CLI's own sign-in; it opens the provider's page in the browser. AWS without SSO needs keys typed in a terminal. */
export function cliLogin(cli: Cli): { started: boolean; hint?: string } {
  const args: Record<Cli, string[]> = { aws: ['sso', 'login'], gcloud: ['auth', 'login', '--update-adc'], az: ['login'], railway: ['login'] }
  // the Railway CLI signs in only from a terminal it can talk to
  if (cli === 'railway') return { started: false, hint: 'In a terminal: railway login, then check again.' }
  if (cli === 'aws' && !process.env.AWS_PROFILE && !process.env.AWS_SSO_SESSION) {
    // SSO needs a profile set up first; without one the CLI asks for keys, which belong in a terminal
    return { started: false, hint: 'In a terminal: aws configure sso (or aws configure for access keys), then come back.' }
  }
  const c = spawn(cli, args[cli], { detached: true, stdio: 'ignore' })
  c.on('error', () => undefined)
  c.unref()
  return { started: true }
}
