import { describe, expect, it } from 'vitest'
import { cliStatus } from './clilogin'

const fake = (out: Record<string, string>) => async (cmd: string, args: string[]) => out[[cmd, ...args].join(' ')] ?? ''

describe('cliStatus', () => {
  it('says how to install a missing CLI', async () => {
    expect(await cliStatus('az', fake({}))).toEqual({ cli: 'az', installed: false, install: 'brew install azure-cli' })
  })
  it('reads who is signed in to each CLI', async () => {
    expect(await cliStatus('aws', fake({ '/usr/bin/which aws': '/opt/homebrew/bin/aws', 'aws sts get-caller-identity --output json': '{"Account":"123456789012","Arn":"arn:aws:iam::123456789012:user/yuji"}' }))).toMatchObject({ installed: true, account: 'yuji', detail: 'account 123456789012' })
    expect(await cliStatus('gcloud', fake({ '/usr/bin/which gcloud': '/x/gcloud', 'gcloud config list account --format=value(core.account)': 'me@x.com\n', 'gcloud config list project --format=value(core.project)': 'demo\n' }))).toMatchObject({ account: 'me@x.com', detail: 'project demo' })
    expect(await cliStatus('az', fake({ '/usr/bin/which az': '/x/az', 'az account show --output json': '{"user":{"name":"me@x.com"},"name":"Pay-As-You-Go"}' }))).toMatchObject({ account: 'me@x.com', detail: 'subscription Pay-As-You-Go' })
  })
  it('reads the Railway sign-in', async () => {
    expect(await cliStatus('railway', fake({ '/usr/bin/which railway': '/x/railway', 'railway whoami': 'Logged in as Yuji (yuji@x.com)\n' }))).toMatchObject({ account: 'yuji@x.com', detail: 'Yuji' })
  })
  it('reports installed but signed out when the CLI answers with an error', async () => {
    expect(await cliStatus('aws', fake({ '/usr/bin/which aws': '/x/aws', 'aws sts get-caller-identity --output json': 'Unable to locate credentials' }))).toEqual({ cli: 'aws', installed: true, install: 'brew install awscli' })
  })
})
