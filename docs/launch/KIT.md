# Launch kit

Texts for the day the source opens. Every claim here is one we can back today; each one that depends on
something not done yet is marked **[after: ...]**, and goes out only once that is true.

Rules, from `docs/BRAND.md`: plain words, proof before promise, no hype words ("revolutionary",
"10x", "game-changer"), no Anthropic logo or look, "for Claude Code" but never "Claude's app", and the
line "Not affiliated with Anthropic" wherever there is room.

## Before posting

- [ ] Source public in `supertokenman/supertokenman` under FSL-1.1-ALv2.
- [ ] v0.1.3 published as the latest release, v0.1.0 removed or marked pre-release.
- [ ] supertokenman.com live (DNS), `/support/` live once GitHub Sponsors is approved.
- [ ] Handles reserved: X, Reddit, LinkedIn page, YouTube, Bluesky, Threads. Taken so far:
  `supertokenman_` (2026-10-26; `supertokenman` was not free there). Use the same name everywhere it
  is free, so people find one name.
- [ ] Homebrew tap live (`supertokenman/homebrew-tap` and the `HOMEBREW_TAP_TOKEN` secret, see
  docs/RELEASE.md) and `brew install --cask supertokenman/tap/supertokenman` tried on a Mac; only then
  add that line to the site and README.
- [ ] A 30-second screen recording of the real app (three panels, one approval, the meter).

## Bios

| Where | Text |
|---|---|
| X, Bluesky, Threads (160) | A Mac app for Claude Code: parallel panels, approvals, the cost of every turn. Free, open source, audited. Not affiliated with Anthropic. |
| GitHub org | A Mac app for Claude Code. Free and open source. |
| LinkedIn page, tagline | Your whole dev day in one window. A Mac app for Claude Code. |
| LinkedIn page, about | SuperTokenMan is a free, open-source Mac app for running Claude Code: parallel panels in their own git worktrees, tool calls that wait for your approval, the cost of every turn, and project memory that keeps versions. No telemetry. Every release is signed and notarized, and the security audits are published with their raw reports. Not affiliated with Anthropic. |
| YouTube | Short demos of SuperTokenMan, a free, open-source Mac app for Claude Code. Real screens, no edits that hide anything. |
| Reddit (profile) | I build SuperTokenMan, a free, open-source Mac app for Claude Code. |

## Show HN

Title (80 max):

> Show HN: SuperTokenMan – an open-source Mac app for running Claude Code in parallel

Text:

> I use Claude Code all day and kept losing track of what each session was doing, what it was allowed to
> touch and what it cost. SuperTokenMan is the Mac app I built for that.
>
> - Several Claude Code panels side by side, each in its own git worktree.
> - Tool calls wait in the window for Allow or Deny.
> - The cost of each turn above the chat, and budgets checked before a turn starts.
> - Project memory that keeps versions and who wrote each fact.
>
> It runs Claude Code through the Agent SDK with your own login or API key. Usage is billed by Anthropic
> on your account; the app is free.
>
> Since it holds your code and your keys, I tried to make the safety claims checkable rather than just
> written down:
>
> - The source is public (FSL-1.1, each version becomes Apache 2.0 after two years).
> - Builds are signed with a Developer ID, notarized by Apple, and ship with SHA-256 checksums.
> - Two rounds of audits with open-source tools (gitleaks, Semgrep, Electronegativity, OSV-Scanner,
>   license checks, an SBOM), with the raw reports in the repo, including what they found and what is
>   still open.
> - A script that opens the app with a clean profile and logs everything it reaches for on its own.
>   On Linux it saw only Claude Code starting and local checks.
>
> What is not proven yet: the network check has not run on a packaged Mac build, and it sees where the
> app's own code connects but not where child processes like `claude` or `git` connect. There has been
> no outside security review. All of that is listed on the Security page.
>
> Mac only for now. Not affiliated with Anthropic. Happy to answer anything, especially the hard
> questions about security.
>
> https://supertokenman.com · https://github.com/supertokenman/supertokenman

Post it on a weekday morning, US Eastern time, and stay to answer for the first hours.

## X thread

1. > SuperTokenMan is out: a free, open-source Mac app for Claude Code.
   >
   > Parallel panels, approvals in the window, and the cost of every turn.
   >
   > [video, 30 s]
2. > Each panel runs in its own git worktree, so two tasks never write over each other.
   >
   > Group panels under one task with one budget, and close it with what was decided.
3. > Tool calls wait for Allow or Deny. Or isolate a panel in Docker with only its folder and no network.
4. > It holds your code and your keys, so "trust us" is not enough.
   >
   > The source is public, builds are signed and notarized, and the audit reports are in the repo, with
   > what is still open.
   >
   > [link to docs/security]
5. > Free. Mac, Apple silicon and Intel. Your own Claude login or API key.
   >
   > Not affiliated with Anthropic.
   >
   > supertokenman.com

## Reddit (r/ClaudeAI)

Title:

> I built a free, open-source Mac app to run Claude Code in parallel panels, with the audits published

Text: the Show HN text, starting from "I use Claude Code all day". Follow the subreddit's rules on
self-promotion, answer every comment, and do not cross-post the same day.

## LinkedIn (personal profile, Portuguese, then English)

> Há meses eu passo o dia inteiro com o Claude Code. Perdia a conta do que cada sessão fazia, do que ela
> podia mexer e de quanto custava. Então construí o SuperTokenMan: um app de Mac, grátis e de código
> aberto, que roda o Claude Code em painéis paralelos, pede sua aprovação antes de cada ação e mostra o
> custo de cada resposta.
>
> Como ele mexe no seu código e nas suas chaves, decidi não pedir confiança: o código é público, cada
> versão é assinada e notarizada pela Apple, e os relatórios de auditoria estão no repositório, inclusive
> o que ainda está em aberto.
>
> Não é afiliado à Anthropic.
>
> ---
>
> For months I have spent whole days in Claude Code, losing track of what each session was doing, what it
> could touch and what it cost. So I built SuperTokenMan: a free, open-source Mac app that runs Claude
> Code in parallel panels, asks before each action and shows the cost of every turn.
>
> Since it touches your code and your keys, I did not want to ask for trust: the source is public, every
> build is signed and notarized by Apple, and the audit reports are in the repo, including what is still
> open.
>
> Not affiliated with Anthropic.
>
> supertokenman.com

## Proof posts, for the weeks after

- The two audit rounds, side by side: what round 1 found and what round 2 shows after the fixes.
- `gh attestation verify` on a downloaded dmg **[after: the first release from the public repo]**.
- The network log of a packaged Mac build, child processes included **[after: the Mac run]**.
- A decoy key placed in the vault, and the full traffic log showing it never left the Mac **[after: the
  decoy test]**.
- What went wrong in v0.1.0 (the black window) and how it was fixed.

## Not to say

- "Secure", "private", "safe" as plain adjectives: say what was checked and link it.
- "No data leaves your Mac": Claude Code sends your messages to Anthropic. Say "No telemetry, and no
  server of ours."
- Any number of users, stars or downloads that we have not counted.
- Anything about the Agent SDK license being cleared: it has not been read by a lawyer yet.
