// Builds the pages that come from data: /docs/ from content/docs/*.md, and /changelog/ from the
// published releases of supertokenman/supertokenman. Header and footer are taken from index.html so
// every page shares them. Run: npm run build (Cloudflare Pages: build command "cd site && npm ci &&
// npm run build", output directory "site").
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, cpSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { marked } from 'marked'

const root = dirname(fileURLToPath(import.meta.url))
const REPO = 'supertokenman/supertokenman'
const home = readFileSync(join(root, 'index.html'), 'utf8')
const header = home.slice(home.indexOf('<header'), home.indexOf('<main>'))
const footer = home.slice(home.indexOf('<footer'), home.indexOf('</body>'))
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
// raw HTML in Markdown (ours or a release note) is shown as text, never run
marked.use({ renderer: { html: ({ text }) => esc(text) } })

const page = ({ path, title, desc, current, body }) => {
  const nav = header.replace(`href="/${current}/"`, `href="/${current}/" aria-current="page"`)
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="color-scheme" content="light dark">
<link rel="canonical" href="https://supertokenman.com/${path}">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/site.css">
<script>document.documentElement.classList.add('js')</script>
<script src="/assets/site.js" defer></script>
</head>
<body>

${nav}<main class="page">
${body}
</main>

${footer}</body>
</html>
`
  mkdirSync(join(root, path), { recursive: true })
  writeFileSync(join(root, path, 'index.html'), html)
}

const head = (label, h1, lead, extra = '') => `  <section class="page-head">
    <div class="wrap">
      <div class="label">${label}</div>
      <h1 class="display">${h1}</h1>
      ${lead ? `<p class="lead">${lead}</p>` : ''}${extra}
    </div>
  </section>`

// ---- docs
const docs = readdirSync(join(root, 'content/docs')).filter((f) => f.endsWith('.md')).sort().map((f) => {
  const raw = readFileSync(join(root, 'content/docs', f), 'utf8')
  const [, front, md] = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/) ?? [null, '', raw]
  const meta = Object.fromEntries(front.split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()]))
  const slug = meta.slug ?? f.replace(/^\d+-/, '').replace(/\.md$/, '')
  return { slug, title: meta.title ?? slug, summary: meta.summary ?? '', md }
})
rmSync(join(root, 'docs'), { recursive: true, force: true })
const side = (cur) => `<nav class="doc-nav" aria-label="Docs">${docs.map((d) => `<a href="/docs/${d.slug}/"${d.slug === cur ? ' aria-current="page"' : ''}>${esc(d.title)}</a>`).join('')}</nav>`
for (const d of docs) {
  page({ path: `docs/${d.slug}/`, title: `${d.title}, SuperTokenMan docs`, desc: d.summary, current: 'docs', body: `${head('Docs', esc(d.title), esc(d.summary))}
  <section class="doc">
    <div class="wrap doc-grid">
      ${side(d.slug)}
      <article class="prose">${marked.parse(d.md)}</article>
    </div>
  </section>` })
}
page({ path: 'docs/', title: 'Docs, SuperTokenMan', desc: 'How to use SuperTokenMan: panels, approvals, cost, memory and privacy.', current: 'docs', body: `${head('Docs', 'How it works.', 'Short pages, one thing each.')}
  <section class="doc">
    <div class="wrap narrow">
      <div class="grid docs-index">${docs.map((d) => `<a href="/docs/${d.slug}/"><b>${esc(d.title)}</b><span>${esc(d.summary)}</span></a>`).join('')}</div>
    </div>
  </section>` })

// ---- changelog, from the published releases (drafts are not public, so they never show)
let releases = null
try {
  const url = `https://api.github.com/repos/${REPO}/releases?per_page=30`
  const accept = { Accept: 'application/vnd.github+json' }
  let r = await fetch(url, { headers: process.env.GITHUB_TOKEN ? { ...accept, Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : accept })
  // a token that cannot see this repo: the releases are public, so ask again without it
  if (r.status === 401 || r.status === 403) r = await fetch(url, { headers: accept })
  if (!r.ok) throw new Error(`GitHub answered ${r.status}`)
  releases = (await r.json()).filter((x) => !x.draft && !x.prerelease)
} catch (e) {
  console.warn(`changelog: releases not read (${e.message}); the page links to GitHub instead`)
}
const day = (iso) => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
const entries = releases?.length
  ? releases.map((x) => `<article class="release">
        <div class="release-head"><h2>${esc(x.name || x.tag_name)}</h2><span class="label">${esc(x.tag_name)} · ${day(x.published_at)}</span></div>
        <div class="prose">${marked.parse(x.body || 'No notes.')}</div>
        <a class="link" href="${esc(x.html_url)}">Downloads and checksums</a>
      </article>`).join('\n')
  : `<p class="empty">${releases ? 'No release is published yet.' : 'The list could not be read when this page was built.'} Every version is on <a class="link" href="https://github.com/${REPO}/releases">GitHub Releases</a>.</p>`
page({ path: 'changelog/', title: 'Changelog, SuperTokenMan', desc: 'What changed in each version of SuperTokenMan.', current: 'changelog', body: `${head('Changelog', 'What changed.', 'Each version, newest first. The app shows the same notes before it updates.')}
  <section class="doc">
    <div class="wrap narrow">
      ${entries}
    </div>
  </section>` })

// ---- the live demo: built from the app (cd app && npm run build:demo, into site/demo/, committed) and
// served at /docs/demo/, inside a folder the Pages build already copies
if (existsSync(join(root, 'demo/index.html'))) cpSync(join(root, 'demo'), join(root, 'docs/demo'), { recursive: true })

console.log(`built ${docs.length} docs pages and the changelog (${releases?.length ?? 'no'} releases)`)
