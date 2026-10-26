# SuperTokenMan site

Static pages: `index.html` (home), `download/`, `security/`, and `assets/` (`site.css`, `site.js`,
fonts, screenshots). `/docs/` and `/changelog/` are built: `npm ci && npm run build` turns
`content/docs/*.md` into the docs pages and the published releases of `supertokenman/supertokenman`
into the changelog (`build.mjs`). Both folders are generated and not committed. The old landing page is kept as `index.old.html` until
the new one ships. Decisions behind the design and the copy are in `docs/BRAND.md`.

- Preview: `cd site && python3 -m http.server 8765`, then http://localhost:8765 (the inner pages use
  root links, so open them through a server, not as files). Run `npm run build` first for docs and
  changelog.
- Deploy to Cloudflare Pages from Git: build command `cd site && npm ci && npm run build`, output
  directory `site`. Or by hand: `cd site && npm run build && npx wrangler pages deploy . --project-name
  supertokenman` (first time: `npx wrangler login`), then add supertokenman.com in Custom domains and a redirect from
  supertokenman.com.br.

## Before the first deploy

The pages say things that are true only once a release exists. Do not deploy until:

1. Done 2026-10-26 (v0.1.0). A release is published in `supertokenman/supertokenman` with `SuperTokenMan-arm64.dmg`,
   `SuperTokenMan-x64.dmg` and `SHA256SUMS` (the download buttons link to `releases/latest/download/`).
2. `npm run verify:mac` on that build says (the arm64 build of 2026-10-26 already did, on the owner's Mac) `accepted` and `source=Notarized Developer ID` (the
   download page says "notarized by Apple").
3. Private vulnerability reporting is on in that repository (Settings, Code security), so the link on
   the security page works.
4. The pillar screenshots in `assets/screens/` come from `npm run build && node scripts/shots.mjs
   ../site/assets/screens` in `app/` (real app, clean profile, Paper theme, a sample project). Re-run it
   after UI changes.
5. `docs/NETWORK.md` and `security/index.html` agree, with the review date updated.
