# SuperTokenMan site

Static pages: `index.html` (home), `download/`, `security/`, and `assets/` (`site.css`, `site.js`,
fonts, screenshots). `/docs/` and `/changelog/` are built: `npm ci && npm run build` turns
`content/docs/*.md` into the docs pages and the published releases of `supertokenman/supertokenman`
into the changelog (`build.mjs`). Both folders are generated and not committed. The old landing page is kept as `index.old.html` until
the new one ships. Decisions behind the design and the copy are in `docs/BRAND.md`.

- Preview: `cd site && python3 -m http.server 8765`, then http://localhost:8765 (the inner pages use
  root links, so open them through a server, not as files). Run `npm run build` first for docs and
  changelog.
- Deploy: Cloudflare Pages from Git. Build command `cd site && npm ci && npm run build && mkdir -p
  ../dist && cp -r index.html 404.html assets changelog docs download security support ../dist/`,
  output directory `dist`. A new top-level page or folder has to be added to that `cp` list in the
  Pages settings. `404.html` is served for any path that does not exist.

## Live demo

`/docs/demo/` is the real app interface in the browser with a fake `window.stm`: three sample panels,
a scripted turn, a `npm test` approval to Allow, a diff and the cost moving. Sample data only; it makes
no network request (its CSP has `connect-src 'none'`). Source: `app/demo.html` and `app/src/demo/`,
never part of the Electron build. Rebuild it after UI changes with `cd app && npm run build:demo`,
which writes `site/demo/` (committed); `npm run build` here copies it to `docs/demo/`, a folder the
Pages build command already copies, so the Pages settings do not change. `?autoplay=1`
(`app/src/demo/autoplay.ts`) plays the turn by itself in a loop for the home page's hero, which embeds it
in a sandboxed frame; the feature pictures `assets/feature-*.webp` and `assets/hero-demo.webp` are
screenshots of the demo with sample data.

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
