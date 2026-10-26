// Integrations: MCP servers a panel can use, with their credentials read from the vault.
// Each one says how it authenticates: a token from the vault, a browser login (OAuth, through
// mcp-remote), or nothing. Versions are pinned.
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk'
import { webReaderServer } from './web/reader.js'

export type Group = 'Code' | 'Cloud & data' | 'Docs' | 'Work' | 'Design' | 'Business'

export type Integration = {
  id: string
  name: string
  what: string
  group: Group
  auth: { kind: 'token'; secret: string; hint: string; createAt: string } | { kind: 'oauth' } | { kind: 'none' } | { kind: 'cli'; cli: 'aws' | 'gcloud' | 'az' | 'railway' }
  /** tools a panel may call without asking, because the server itself only reads */
  allow?: string[]
  /** what keeps it to reading, said on its card */
  guard?: string
  /** extra credential commands can use (wrangler reads CLOUDFLARE_API_TOKEN) */
  commandSecret?: { secret: string; hint: string; createAt: string }
  config: (token?: string) => McpServerConfig
  /** a local engine the app installs once (engines/<name>) before the integration works */
  engine?: 'web'
  /** what people use it for, in one or two words, shown on its card */
  tag?: string
  /** its GitHub repository (owner/name), for the stars on its card */
  repo?: string
  /** a guided setup: console pages opened in the app's setup window, in order */
  steps?: { label: string; url: string }[]
}

const remote = (url: string): McpServerConfig => ({ type: 'stdio', command: 'npx', args: ['-y', 'mcp-remote@0.15.2', url] })
// Google has no dynamic client registration: mcp-remote uses the person's own OAuth client, read from
// the environment (its ${VAR} placeholders), so the secret is not on a command line other processes see
const GOOGLE_CLIENT = { secret: 'GOOGLE_OAUTH_CLIENT', hint: 'client ID and client secret, separated by a space', createAt: 'https://console.cloud.google.com/auth/clients/create' }
export function googleClient(token?: string): Record<string, string> {
  const [id = '', secret = ''] = (token ?? '').trim().split(/[\s:]+/)
  return { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret }
}
const google = (url: string, scope: string) => (token?: string): McpServerConfig => ({
  type: 'stdio',
  command: 'npx',
  args: ['-y', 'mcp-remote@0.15.2', url, '--static-oauth-client-info', '{"client_id":"${GOOGLE_CLIENT_ID}","client_secret":"${GOOGLE_CLIENT_SECRET}"}', '--static-oauth-client-metadata', JSON.stringify({ scope })],
  env: googleClient(token),
})
const googleSteps = (api: string) => [
  { label: 'Create a Google Cloud project (free)', url: 'https://console.cloud.google.com/projectcreate' },
  { label: `Enable the ${api === 'gmail' ? 'Gmail' : 'Drive'} API`, url: `https://console.cloud.google.com/apis/library/${api}.googleapis.com` },
  { label: `Enable the ${api === 'gmail' ? 'Gmail' : 'Drive'} MCP API`, url: `https://console.cloud.google.com/apis/library/${api}mcp.googleapis.com` },
  { label: 'Consent screen: External, add yourself as a test user', url: 'https://console.cloud.google.com/auth/audience' },
  { label: 'Create an OAuth client of type Desktop app', url: 'https://console.cloud.google.com/auth/clients/create' },
]

const bearer = (url: string, token?: string): McpServerConfig => ({ type: 'http', url, headers: token ? { Authorization: `Bearer ${token}` } : {} })

/** n8n: the instance-level MCP server, its URL (from Settings, Instance-level MCP, Connection details) and token. */
export function n8nServer(token?: string): McpServerConfig {
  const [url = '', key = ''] = (token ?? '').trim().split(/\s+/)
  if (!/^https:\/\/[^\s]+$/.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) return { type: 'http', url: 'https://invalid.n8n.url', headers: {} }
  return bearer(url, key)
}

/** Activepieces on your own server, or an older one: the project's MCP URL (Settings, MCP Server) and token. */
export function activepiecesServer(token?: string): McpServerConfig {
  const [url = '', key = ''] = (token ?? '').trim().split(/\s+/)
  if (!/^https:\/\/[^\s]+$/.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) return { type: 'http', url: 'https://invalid.activepieces.url', headers: {} }
  return bearer(url, key)
}

export const CATALOG: Integration[] = [
  {
    id: 'web-reader',
    group: 'Docs',
    name: 'Web reader',
    what: 'Read any page as clean text, on this Mac: free, no key, pages that need JavaScript too (Crawl4AI). Installs once, about 450 MB.',
    auth: { kind: 'none' },
    engine: 'web',
    config: () => webReaderServer(),
  },
  {
    id: 'activepieces',
    group: 'Work',
    name: 'Activepieces',
    what: 'Your flows and about 280 pieces (Gmail, Sheets, Slack, HubSpot...) as tools. Activepieces Cloud, signs in through the browser.',
    auth: { kind: 'oauth' },
    config: () => remote('https://cloud.activepieces.com/mcp'),
  },
  {
    id: 'activepieces-self',
    group: 'Work',
    name: 'Activepieces (your server)',
    what: 'A self-hosted Activepieces: turn on Settings, MCP Server, then paste its URL and token.',
    auth: { kind: 'token', secret: 'ACTIVEPIECES_MCP', hint: 'the server URL and the token, separated by a space', createAt: 'https://www.activepieces.com/docs/mcp/overview' },
    config: activepiecesServer,
  },
  {
    id: 'firecrawl',
    tag: 'Web scraping',
    group: 'Docs',
    name: 'Firecrawl',
    what: 'Read any web page as clean text, crawl a site, search the web. Official remote server.',
    auth: { kind: 'token', secret: 'FIRECRAWL_API_KEY', hint: 'an API key, fc-', createAt: 'https://www.firecrawl.dev/app/api-keys' },
    config: (token) => bearer('https://mcp.firecrawl.dev/v2/mcp', token),
  },
  {
    id: 'n8n',
    tag: 'Automation',
    group: 'Work',
    name: 'n8n',
    what: 'Your n8n workflows: list, run and build them. Turn on Instance-level MCP in n8n (owner or admin) first.',
    auth: { kind: 'token', secret: 'N8N_MCP', hint: 'the server URL and the access token, separated by a space', createAt: 'https://docs.n8n.io/advanced-ai/accessing-n8n-mcp-server/' },
    config: n8nServer,
  },
  {
    id: 'supabase',
    tag: 'Database',
    group: 'Cloud & data',
    name: 'Supabase',
    what: 'Projects, tables, SQL, migrations, edge functions, logs. Read-only by default.',
    auth: { kind: 'token', secret: 'SUPABASE_ACCESS_TOKEN', hint: 'starts with sbp_', createAt: 'https://supabase.com/dashboard/account/tokens' },
    config: (token) => ({ type: 'stdio', command: 'npx', args: ['-y', '@supabase/mcp-server-supabase@0.14.0', '--read-only'], env: token ? { SUPABASE_ACCESS_TOKEN: token } : ({} as Record<string, string>) }),
  },
  {
    id: 'neon',
    tag: 'Database',
    group: 'Cloud & data',
    name: 'Neon',
    what: 'Postgres projects and branches, SQL, schema diffs and migrations on a branch.',
    auth: { kind: 'token', secret: 'NEON_API_KEY', hint: 'an API key from the Neon console', createAt: 'https://console.neon.tech/app/settings/api-keys' },
    config: (token) => bearer('https://mcp.neon.tech/mcp', token),
  },
  {
    id: 'cloudflare',
    tag: 'Deploy',
    group: 'Cloud & data',
    name: 'Cloudflare',
    what: 'Workers, KV, R2, D1 and Hyperdrive on your account. Signs in through the browser.',
    auth: { kind: 'oauth' },
    commandSecret: { secret: 'CLOUDFLARE_API_TOKEN', hint: 'for wrangler in commands', createAt: 'https://dash.cloudflare.com/profile/api-tokens' },
    config: () => remote('https://bindings.mcp.cloudflare.com/mcp'),
  },
  {
    id: 'cloudflare-docs',
    tag: 'Docs',
    group: 'Docs',
    name: 'Cloudflare docs',
    what: 'Searches the current Cloudflare documentation. No account needed.',
    auth: { kind: 'none' },
    config: () => ({ type: 'http', url: 'https://docs.mcp.cloudflare.com/mcp' }),
  },
  {
    id: 'github',
    tag: 'Repos & PRs',
    repo: 'github/github-mcp-server',
    group: 'Code',
    name: 'GitHub',
    what: 'Issues, pull requests, reviews, Actions and code search.',
    auth: { kind: 'token', secret: 'GITHUB_PERSONAL_ACCESS_TOKEN', hint: 'a fine-grained token, github_pat_', createAt: 'https://github.com/settings/personal-access-tokens' },
    config: (token) => bearer('https://api.githubcopilot.com/mcp/', token),
  },
  {
    id: 'context7',
    tag: 'Library docs',
    repo: 'upstash/context7',
    group: 'Docs',
    name: 'Context7',
    what: 'Current docs and examples for libraries and frameworks, instead of what the model remembers.',
    auth: { kind: 'none' },
    config: () => ({ type: 'http', url: 'https://mcp.context7.com/mcp' }),
  },
  {
    id: 'playwright',
    tag: 'Browser tests',
    repo: 'microsoft/playwright-mcp',
    group: 'Code',
    name: 'Playwright browser',
    what: 'A real Chromium window you can watch while Claude browses, clicks and fills forms.',
    auth: { kind: 'none' },
    config: () => ({ type: 'stdio', command: 'npx', args: ['-y', '@playwright/mcp@0.0.83'] }),
  },
  {
    id: 'chrome-devtools',
    group: 'Code',
    name: 'Chrome DevTools',
    what: 'Chrome with its DevTools for Claude: inspect pages, read the console and network, record a performance trace and get its insights.',
    auth: { kind: 'none' },
    tag: 'Debug',
    repo: 'ChromeDevTools/chrome-devtools-mcp',
    guard: 'It drives a Chrome window of its own; every action asks first.',
    // Google (Apache-2.0)
    config: () => ({ type: 'stdio', command: 'npx', args: ['-y', 'chrome-devtools-mcp@1.10.1', '--isolated'] }),
  },
  {
    id: 'serena',
    group: 'Code',
    name: 'Serena',
    what: 'Finds and edits code by symbol (functions, classes, references) through language servers, so Claude reads less of each file. Needs uv (brew install uv).',
    auth: { kind: 'none' },
    tag: 'Code search',
    repo: 'oraios/serena',
    guard: 'Its edits ask first; finding symbols only reads.',
    // Oraios (MIT); the ide-assistant context leaves file and shell tools to Claude Code
    config: () => ({ type: 'stdio', command: 'uvx', args: ['--from', 'serena-agent==1.7.0', 'serena', 'start-mcp-server', '--context', 'ide-assistant'] }),
  },
  {
    id: 'markitdown',
    group: 'Docs',
    name: 'MarkItDown',
    what: 'Turns PDF, Word, Excel, PowerPoint, HTML and images into Markdown Claude can read, without filling the context with the raw file. Needs uv (brew install uv).',
    auth: { kind: 'none' },
    tag: 'Documents',
    repo: 'microsoft/markitdown',
    allow: ['mcp__markitdown'],
    // Microsoft (MIT); one tool, convert_to_markdown, which only reads
    config: () => ({ type: 'stdio', command: 'uvx', args: ['markitdown-mcp==0.0.1a7'] }),
  },
  {
    id: 'stripe',
    tag: 'Payments',
    group: 'Business',
    name: 'Stripe',
    what: 'Customers, products, payments and docs. Use a restricted key.',
    auth: { kind: 'token', secret: 'STRIPE_SECRET_KEY', hint: 'a restricted key, rk_', createAt: 'https://dashboard.stripe.com/apikeys' },
    config: (token) => bearer('https://mcp.stripe.com', token),
  },
  {
    id: 'sentry',
    tag: 'Errors',
    group: 'Code',
    name: 'Sentry',
    what: 'Issues, events and releases. Signs in through the browser.',
    auth: { kind: 'oauth' },
    config: () => remote('https://mcp.sentry.dev/mcp'),
  },
  {
    id: 'rea',
    tag: 'Reverse eng.',
    repo: 'morluto/rea',
    group: 'Code',
    name: 'REA',
    what: 'Reverse engineering: how a binary, an Electron or JavaScript app, a .NET assembly or a website works, with the evidence. Runs on this Mac; native analysis uses Hopper, Ghidra or IDA if you have one.',
    auth: { kind: 'none' },
    guard: 'Only for software you own or may examine. Every call asks you first.',
    // morluto/rea (MIT), its MCP server over stdio; nothing allowed without asking
    config: () => ({ type: 'stdio', command: 'npx', args: ['-y', 'rea-agents@6.7.0', 'mcp'] }),
  },
  {
    id: 'ai-memory',
    group: 'Code',
    name: 'AI memory',
    tag: 'Agent memory',
    repo: 'akitaonrails/ai-memory',
    what: "Fabio Akita's long-term memory for coding agents: what each session learned, failed and left open, shared across Claude Code, Codex and other agents, in plain markdown on this Mac. Install it once: curl -fsSL https://github.com/akitaonrails/ai-memory/releases/latest/download/install.sh | sh, then ai-memory setup.",
    auth: { kind: 'none' },
    guard: 'Runs on this Mac; nothing leaves it unless you point it at a server.',
    allow: ['mcp__ai-memory'],
    // MIT; its own stdio bridge reads the server address and token that setup wrote
    config: () => ({ type: 'stdio', command: [join(homedir(), '.local', 'bin', 'ai-memory'), '/opt/homebrew/bin/ai-memory', '/usr/local/bin/ai-memory'].find((p) => existsSync(p)) ?? 'ai-memory', args: ['mcp-bridge', '--no-session-id'] }),
  },
  {
    id: 'resend',
    group: 'Business',
    name: 'Resend',
    tag: 'Email API',
    repo: 'resend/resend-mcp',
    what: 'Emails sent and their status, domains, audiences and contacts; send an email or a broadcast when you ask.',
    auth: { kind: 'token', secret: 'RESEND_API_KEY', hint: 'starts with re_', createAt: 'https://resend.com/api-keys' },
    guard: 'Sending asks you first. A key with sending access only keeps it to that.',
    config: (token) => ({ type: 'stdio', command: 'npx', args: ['-y', 'resend-mcp@2.25.0'], env: token ? { RESEND_API_KEY: token } : ({} as Record<string, string>) }),
  },
  {
    id: 'mercadopago',
    group: 'Business',
    name: 'Mercado Pago',
    tag: 'Payments',
    what: "Mercado Pago's official server: search its docs, check your integration, webhooks and test users. Uses your access token (test or production).",
    auth: { kind: 'token', secret: 'MERCADOPAGO_ACCESS_TOKEN', hint: 'APP_USR-… or TEST-…', createAt: 'https://www.mercadopago.com.br/developers/panel/app' },
    guard: 'Changes ask you first. Use a TEST- token while building.',
    // the remote server takes the token as a bearer header; mcp-remote reads it from the environment, off the command line
    config: (token) => ({ type: 'stdio', command: 'npx', args: ['-y', 'mcp-remote@0.15.2', 'https://mcp.mercadopago.com/mcp', '--header', 'Authorization:Bearer ${MERCADOPAGO_ACCESS_TOKEN}'], env: token ? { MERCADOPAGO_ACCESS_TOKEN: token } : ({} as Record<string, string>) }),
  },
  {
    id: 'paypal',
    group: 'Business',
    name: 'PayPal',
    tag: 'Payments',
    what: "PayPal's official server: invoices, orders, payments, disputes, subscriptions and reports. Starts in the sandbox.",
    auth: { kind: 'token', secret: 'PAYPAL_ACCESS_TOKEN', hint: 'an access token from your app (sandbox first)', createAt: 'https://developer.paypal.com/dashboard/applications/sandbox' },
    guard: 'Sandbox by default; anything that moves money asks you first.',
    config: (token) => ({ type: 'stdio', command: 'npx', args: ['-y', '@paypal/mcp@1.8.1', '--tools=all'], env: { PAYPAL_ENVIRONMENT: 'SANDBOX', ...(token ? { PAYPAL_ACCESS_TOKEN: token } : {}) } }),
  },
  {
    id: 'asaas',
    group: 'Business',
    name: 'Asaas',
    tag: 'Payments BR',
    repo: 'rafaelasantosfeitosa/asaas-mcp',
    what: 'Charges (Pix, boleto, card), customers, subscriptions and balance at Asaas. A community server, not made by Asaas.',
    auth: { kind: 'token', secret: 'ASAAS_API_KEY', hint: 'starts with $aact_', createAt: 'https://www.asaas.com/customerApiAccessToken/index' },
    guard: 'Community-made: changes ask you first. Starts on the sandbox; set ASAAS_BASE_URL for production.',
    config: (token) => ({ type: 'stdio', command: 'npx', args: ['-y', 'asaas-mcp@0.4.0'], env: { ASAAS_BASE_URL: process.env.ASAAS_BASE_URL ?? 'https://api-sandbox.asaas.com/v3', ...(token ? { ASAAS_API_KEY: token } : {}) } }),
  },
  {
    id: 'abacatepay',
    group: 'Business',
    name: 'AbacatePay',
    tag: 'Pix',
    repo: 'AbacatePay/abacatepay-mcp',
    what: "AbacatePay's server: Pix charges and QR codes, customers, coupons and withdrawals.",
    auth: { kind: 'token', secret: 'ABACATE_PAY_API_KEY', hint: 'from the dashboard, dev mode first', createAt: 'https://www.abacatepay.com/app' },
    guard: 'Creating charges asks you first. Use a dev-mode key while building.',
    config: (token) => ({ type: 'stdio', command: 'npx', args: ['-y', 'abacatepay-mcp@1.0.8'], env: token ? { ABACATE_PAY_API_KEY: token } : ({} as Record<string, string>) }),
  },
  {
    id: 'apify',
    group: 'Business',
    name: 'Apify',
    tag: 'Scraping',
    repo: 'apify/actors-mcp-server',
    what: 'Thousands of ready-made scrapers (Actors) for sites, social networks and maps: find leads, research a topic, compare prices. Signs in through the browser; runs bill your Apify account.',
    auth: { kind: 'oauth' },
    guard: 'Running an Actor asks you first; it can cost Apify credits.',
    config: () => remote('https://mcp.apify.com'),
  },
  {
    id: 'highlevel',
    group: 'Business',
    name: 'HighLevel',
    tag: 'CRM',
    what: "HighLevel's (GoHighLevel) official server: contacts, opportunities, conversations, calendars and campaigns of one sub-account. Tools follow the scopes you give the token.",
    auth: { kind: 'token', secret: 'HIGHLEVEL_TOKEN', hint: 'private integration token and location ID, separated by a space', createAt: 'https://app.gohighlevel.com/' },
    guard: 'Changes ask you first. Give the private integration only the scopes it needs.',
    // the token and the sub-account go as headers; mcp-remote reads them from the environment, off the command line
    config: (token) => {
      const [pit = '', location = ''] = (token ?? '').trim().split(/\s+/)
      return { type: 'stdio', command: 'npx', args: ['-y', 'mcp-remote@0.15.2', 'https://services.leadconnectorhq.com/mcp/', '--header', 'Authorization:Bearer ${HL_PIT}', ...(location ? ['--header', 'locationId:${HL_LOCATION}'] : [])], env: { HL_PIT: pit, ...(location ? { HL_LOCATION: location } : {}) } }
    },
  },
  {
    id: 'aws',
    tag: 'Cloud',
    group: 'Cloud & data',
    name: 'AWS',
    what: 'Read your AWS account: resources, costs, logs and settings, through the AWS CLI sign-in on this Mac.',
    auth: { kind: 'cli', cli: 'aws' },
    guard: 'Read-only: the server refuses any call that changes something.',
    allow: ['mcp__aws'],
    // AWS Labs (Apache-2.0); READ_OPERATIONS_ONLY makes the server itself refuse anything but reads
    config: () => ({ type: 'stdio', command: 'uvx', args: ['awslabs.aws-api-mcp-server@1.5.6'], env: { READ_OPERATIONS_ONLY: 'true', AWS_API_MCP_PROFILE_NAME: process.env.AWS_PROFILE ?? 'default', ...(process.env.AWS_REGION ? { AWS_REGION: process.env.AWS_REGION } : {}), PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' } }),
  },
  {
    id: 'gcp',
    tag: 'Cloud',
    group: 'Cloud & data',
    name: 'Google Cloud',
    what: 'Read your Google Cloud projects through the gcloud sign-in on this Mac.',
    auth: { kind: 'cli', cli: 'gcloud' },
    guard: 'It has no read-only mode: every gcloud command asks you first. For reading only, sign in with a Viewer account.',
    // Google (Apache-2.0); one tool, run_gcloud_command, never allowed without asking
    config: () => ({ type: 'stdio', command: 'npx', args: ['-y', '@google-cloud/gcloud-mcp@0.5.3'] }),
  },
  {
    id: 'azure',
    tag: 'Cloud',
    group: 'Cloud & data',
    name: 'Azure',
    what: 'Read your Azure subscriptions: resources, monitor, costs and more, through the az sign-in on this Mac.',
    auth: { kind: 'cli', cli: 'az' },
    guard: 'Read-only: started with --read-only, the server offers no tool that changes something.',
    allow: ['mcp__azure'],
    // Microsoft (MIT), last stable release; --read-only drops every tool that writes
    config: () => ({ type: 'stdio', command: 'npx', args: ['-y', '@azure/mcp@3.0.0', 'server', 'start', '--read-only'] }),
  },
  {
    id: 'vercel',
    tag: 'Deploy',
    group: 'Cloud & data',
    name: 'Vercel',
    what: 'Projects, deployments and logs. Signs in through the browser.',
    auth: { kind: 'oauth' },
    config: () => remote('https://mcp.vercel.com'),
  },
  {
    id: 'gmail',
    tag: 'Email',
    group: 'Work',
    name: 'Gmail',
    what: 'Search and read mail, write drafts. Google official server (preview); sending stays with you.',
    auth: { kind: 'token', ...GOOGLE_CLIENT },
    steps: googleSteps('gmail'),
    config: google('https://gmailmcp.googleapis.com/mcp/v1', 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose'),
  },
  {
    id: 'google-drive',
    tag: 'Files',
    group: 'Work',
    name: 'Google Drive',
    what: 'Search, read and list files; create files the app made. Google official server (preview).',
    auth: { kind: 'token', ...GOOGLE_CLIENT },
    steps: googleSteps('drive'),
    config: google('https://drivemcp.googleapis.com/mcp/v1', 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file'),
  },
  // official remote servers; the OAuth ones sign in through the browser the first time
  { id: 'linear', tag: 'Issues', group: 'Work', name: 'Linear', what: 'Issues, projects and cycles.', auth: { kind: 'oauth' }, config: () => remote('https://mcp.linear.app/mcp') },
  { id: 'notion', tag: 'Notes', group: 'Work', name: 'Notion', what: 'Pages and databases: search, read, create and update.', auth: { kind: 'oauth' }, config: () => remote('https://mcp.notion.com/mcp') },
  { id: 'atlassian', tag: 'Issues', group: 'Work', name: 'Jira & Confluence', what: 'Jira issues and Confluence pages (Atlassian Cloud).', auth: { kind: 'oauth' }, config: () => remote('https://mcp.atlassian.com/v1/sse') },
  { id: 'asana', tag: 'Tasks', group: 'Work', name: 'Asana', what: 'Tasks, projects and comments.', auth: { kind: 'oauth' }, config: () => remote('https://mcp.asana.com/sse') },
  { id: 'monday', tag: 'Tasks', group: 'Work', name: 'monday.com', what: 'Boards, items and updates.', auth: { kind: 'oauth' }, config: () => remote('https://mcp.monday.com/mcp') },
  { id: 'clickup', tag: 'Tasks', group: 'Work', name: 'ClickUp', what: 'Tasks, lists and docs.', auth: { kind: 'oauth' }, config: () => remote('https://mcp.clickup.com/mcp') },
  { id: 'airtable', tag: 'Tables', group: 'Work', name: 'Airtable', what: 'Bases, tables and records.', auth: { kind: 'oauth' }, config: () => remote('https://mcp.airtable.com/mcp') },
  { id: 'netlify', tag: 'Deploy', group: 'Cloud & data', name: 'Netlify', what: 'Sites, deploys and environment variables.', auth: { kind: 'oauth' }, config: () => remote('https://mcp.netlify.com/mcp') },
  // Railway's hosted server refuses clients it has not registered; its MCP now ships inside the Railway CLI
  { id: 'railway', tag: 'Deploy', group: 'Cloud & data', name: 'Railway', what: 'Projects, services, deploys and logs, through the Railway CLI sign-in on this Mac.', auth: { kind: 'cli', cli: 'railway' }, guard: 'It can deploy and change services: every Railway action asks you first.', config: () => ({ type: 'stdio', command: 'railway', args: ['mcp'] }) },
  { id: 'prisma', tag: 'Database', group: 'Cloud & data', name: 'Prisma Postgres', what: 'Prisma Postgres databases, migrations and SQL.', auth: { kind: 'oauth' }, config: () => remote('https://mcp.prisma.io/mcp') },
  { id: 'posthog', tag: 'Analytics', group: 'Business', name: 'PostHog', what: 'Product analytics, feature flags and errors.', auth: { kind: 'oauth' }, config: () => remote('https://mcp.posthog.com/mcp') },
  // Figma's hosted server only takes clients Figma approved; its desktop app serves the same tools on this Mac
  { id: 'figma', tag: 'Design', group: 'Design', name: 'Figma', what: 'Designs and their code-ready details, from the Figma desktop app: in Preferences, turn on the Dev Mode MCP server (needs a plan with Dev Mode).', auth: { kind: 'none' }, config: () => ({ type: 'http', url: 'http://127.0.0.1:3845/mcp' }) },
  { id: 'canva', tag: 'Design', group: 'Design', name: 'Canva', what: 'Designs: search, create and export.', auth: { kind: 'oauth' }, config: () => remote('https://mcp.canva.com/mcp') },
  { id: 'miro', tag: 'Whiteboard', group: 'Design', name: 'Miro', what: 'Boards: read and add diagrams and notes.', auth: { kind: 'oauth' }, config: () => remote('https://mcp.miro.com/') },
  { id: 'huggingface', tag: 'AI models', group: 'Docs', name: 'Hugging Face', what: 'Models, datasets, Spaces and papers. No account needed.', auth: { kind: 'none' }, config: () => ({ type: 'http', url: 'https://huggingface.co/mcp' }) },
  { id: 'aws-knowledge', tag: 'Docs', group: 'Docs', name: 'AWS docs', what: 'Current AWS documentation and regional availability. No account needed.', auth: { kind: 'none' }, config: () => ({ type: 'http', url: 'https://knowledge-mcp.global.api.aws' }) },
  { id: 'ms-learn', tag: 'Docs', group: 'Docs', name: 'Microsoft Learn', what: 'Microsoft and Azure documentation. No account needed.', auth: { kind: 'none' }, config: () => ({ type: 'http', url: 'https://learn.microsoft.com/api/mcp' }) },
  { id: 'deepwiki', tag: 'Repo docs', group: 'Docs', name: 'DeepWiki', what: 'Ask about any public GitHub repository. No account needed.', auth: { kind: 'none' }, config: () => ({ type: 'http', url: 'https://mcp.deepwiki.com/mcp' }) },
]

/** The MCP servers for the enabled integrations whose credentials are in place, and why the rest are left out. */
export function serversFor(enabled: string[], secret: (name: string) => string | undefined) {
  const servers: Record<string, McpServerConfig> = {}
  const missing: { id: string; secret: string }[] = []
  const allow: string[] = []
  for (const it of CATALOG) {
    if (!enabled.includes(it.id)) continue
    allow.push(...(it.allow ?? []))
    if (it.auth.kind === 'token') {
      const token = secret(it.auth.secret)
      if (!token) {
        missing.push({ id: it.id, secret: it.auth.secret })
        continue
      }
      servers[it.id] = it.config(token)
    } else servers[it.id] = it.config()
  }
  return { servers, missing, allow }
}

/** The `open` the login helpers find first on PATH: it hands web links to the app instead of the default browser. */
export const OPEN_SHIM = `#!/bin/sh
for a in "$@"; do
  case "$a" in
    http://*|https://*) printf '%s\\n' "$a" > "$STM_AUTH_DIR/$(date +%s)-$$.url" && exit 0 ;;
  esac
done
exec /usr/bin/open "$@"
`

/** Points the mcp-remote servers' browser logins at the app: the shim first on PATH, and where to drop links. */
export function routeLogins(servers: Record<string, McpServerConfig>, shimDir: string, authDir: string, path = process.env.PATH ?? '') {
  for (const s of Object.values(servers))
    if (s.type === 'stdio' && s.args?.some((a) => a.startsWith('mcp-remote@'))) s.env = { ...s.env, PATH: `${shimDir}:${path}`, STM_AUTH_DIR: authDir }
  return servers
}
