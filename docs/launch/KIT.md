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

- [ ] An `awesome-supertokenman` list repo (community personas, skills, setups, videos), linked from the
  README, so what people make has a home from day one.

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

## Channels (added 2026-10-27)

How each one takes a submission, and a ready text. "Checked" means the rule was read on the channel's own
page on 2026-10-27; "not confirmed" means it was not, and must be read before posting. Every text ends
with or keeps "Not affiliated with Anthropic" where the form allows it.

### Facts the texts may cite, and where each one is proven

| Fact | Source in the repo |
|---|---|
| Signed with a Developer ID, notarized, SHA-256 checksums; the 0.1.3 dmg passed `shasum`, `codesign`, `spctl` on a Mac | `docs/security/2026-10-26-mac/REPORT.md` |
| On that Mac run the decoy secret was not found in the recorded traffic; the only remote connection was GitHub (update check) | same report (result: **partial**, no Claude Code turn was recorded) |
| Two audit rounds: gitleaks no leaks, Semgrep 0 real findings, OSV 0 shipped vulnerable packages, no GPL/AGPL/SSPL in 157 shipped packages, 153-component SBOM | `docs/security/2026-10-26-round2/REPORT.md` (raw files next to it) |
| At launch with a clean profile: 16 network attempts, all on the allowed list (Linux run) | same report; `docs/NETWORK.md` |
| No telemetry, no server of ours; Claude Code traffic goes to Anthropic on the user's own login or key | `docs/NETWORK.md` |
| Idle style recalcs ~120/s to 0, layouts ~60/s to 0, start-up renderer bundle 1.74 MB to 1.27 MB (Linux, Xvfb, software rendering) | `docs/PERFORMANCE.md` |
| Live demo in the browser with sample data and no network (`connect-src 'none'`) | `site/README.md`; https://supertokenman.com/docs/demo/ |
| License FSL-1.1-ALv2, each version Apache 2.0 after two years | `LICENSE.md` |

### Not verified: never cite as fact

- A Mac network run that includes a Claude Code turn (the Mac proof was partial).
- Where child processes (`claude`, `git`, `docker`) connect: recorded when they start, not where they go.
- Performance numbers on a Mac with a GPU: all numbers above are Linux/Xvfb.
- Any outside security review: there has been none.
- Any count of users, stars or downloads.
- The Agent SDK license reading by a lawyer.

### Short texts

One line (lists, forms with a short field, no emoji, no address to the reader):

> SuperTokenMan: a Mac app that runs Claude Code in parallel panels, each in its own git worktree, with tool approvals in the window and the cost of every turn. FSL-1.1-ALv2. Not affiliated with Anthropic.

Paragraph (newsletters, Product Hunt description):

> SuperTokenMan is a free, source-available Mac app for Claude Code. Several panels run side by side, each
> in its own git worktree; tool calls wait for Allow or Deny; a meter shows what each turn costs and
> what was kept out of the context. It runs Claude Code through the Agent SDK with your own login or API
> key, and has no server of its own and no telemetry. Builds are signed and notarized, and the audit
> reports (gitleaks, Semgrep, OSV, SBOM) are in the repo with what is still open. A live demo with sample
> data runs in the browser: https://supertokenman.com/docs/demo/. Not affiliated with Anthropic.

Note on "open source": the license is FSL-1.1-ALv2, which the OSI does not list as open source until each
version turns Apache 2.0. Lists that require an OSI license may refuse it; say "source-available" there.

### awesome-claude-code (hesreallyhim) — checked

- Link: https://github.com/hesreallyhim/awesome-claude-code/issues/new?template=recommend-resource.yml
- Rules (from its CONTRIBUTING.md): web issue form only, filled by a human, not a PR and not `gh`; one
  resource at a time; the repo must be at least 14 days old (first commit) with activity after the first
  day, or have 100 stars; one-line description, no emoji, no sales pitch, no "you".
- Earliest date: our first commit is 2026-10-25, so **2026-11-08** unless 100 stars come first.
- Text: the one-line text above. Category: the closest of its tooling categories at the time.

### Other curated lists — not confirmed

- awesome-mac (jaywcjlove/awesome-mac): pull request; it keeps an English and a Chinese README, so the
  entry likely goes in both. Read its contributing rules first.
- awesome-electron (sindresorhus/awesome-electron): pull request; it tends to want apps with traction.
  Read its contributing rules first.
- Text: the one-line text.

### HelloGitHub — checked (link), language not confirmed

- Link: https://hellogithub.com/periodical (self-nomination is allowed, per its README).
- Language: its rules were not found in English; the site and monthly issue are in Chinese, so send the
  Chinese text and the English one together.
- Chinese text:

> SuperTokenMan：一个运行 Claude Code 的 Mac 应用。多个面板并排运行，每个面板在自己的 git worktree 中；工具调用在窗口里等待你允许或拒绝；每一轮对话的花费都会显示出来。使用你自己的 Claude 登录或 API key，没有我们的服务器，没有遥测。安装包经过签名和苹果公证，安全审计报告（gitleaks、Semgrep、OSV、SBOM）都在仓库里。可在浏览器中试用演示（示例数据，无网络）：https://supertokenman.com/docs/demo/ 。与 Anthropic 无关联。

  The Chinese was written by an AI, not by a native speaker: have it read by one before posting.

### GitHubDaily — checked (link), language not confirmed

- Link: https://github.com/GitHubDaily/GitHubDaily/issues/new (its README invites recommending or
  self-nominating projects in the issues).
- Language: no rule found; the README is in Chinese. Post the Chinese text above, then the English
  paragraph, with the repo link as the title: `[自荐] SuperTokenMan - a Mac app for Claude Code`.

### Product Hunt — checked

- Link: https://www.producthunt.com/launch (guide); submit from Submit > New Product while logged in.
- Rules: a personal account (company accounts are not allowed); do not ask anyone to upvote, ask them to
  visit and comment; makers may hunt their own product; 12:01 am Pacific is the usual start.
- Tagline (60 characters max, not confirmed): `Claude Code in parallel panels on your Mac`
- Description: the paragraph text. First comment: the Show HN text above.
- Media: `site/assets/screens/*.png`, `site/assets/og.png`, and the 30-second recording once it exists.

### TLDR — not confirmed

- No submission page found (2026-10-27); only https://advertise.tldr.tech/ (paid). Do not pay for a
  placement presented as editorial. If a "submit" or contact link appears, send the paragraph text.

### Console.dev — not confirmed

- No free submission form found; https://console.dev/advertise is the paid route and its reviews are
  chosen by the editors. If a suggestion address is found on their site, send the paragraph text; do not
  invent one.

### Changelog News — checked

- Link: https://changelog.com/news/submit (sign-in required). Fields: URL, title, "What's interesting
  about it?". It does not want commercial products or how-tos.
- URL: https://github.com/supertokenman/supertokenman
- Title: `SuperTokenMan: a source-available Mac app for running Claude Code in parallel`
- What's interesting: the paragraph text, plus "The network behaviour is written down in
  docs/NETWORK.md and checked by a script and a Mac workflow on each release."
