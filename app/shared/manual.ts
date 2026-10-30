// The manual of SuperTokenMan: one source for everything an assistant needs to explain the app, by
// screen. It is plain text with no provider in it, so any model can be given it: Claude panels read
// the index in their prompt and open sections through the `manual` tool; `npm run guide` writes the
// whole of it to docs/STM_GUIDE.md for other providers and for people. Keep each section to what a
// person needs to find and use the thing: where it is, what it does, its limits.

export type Section = { id: string; title: string; keys: string; body: string }

export const MANUAL: Section[] = [
  {
    id: 'start',
    title: 'What SuperTokenMan is',
    keys: 'about overview what is stm install update',
    body: `SuperTokenMan (STM) is a Mac app that puts a developer's day in one window: Claude Code panels for each project, and beside them what people keep switching tabs for (mail, calendar, PRs, CI, cloud, social, videos, web apps). It runs on the person's own Claude account and plan; nothing goes through a server of ours.
- Install or update: in the source folder, \`git pull && bash app/scripts/install-mac.sh\`. It builds, replaces the app in /Applications and opens it; a failed pull stops it with the reason.
- Cmd+K opens a search that reaches every screen and action. Most screens also sit in the top bar or its Settings menu.
- First run shows a Tour; it is in Settings, Tour, any time.`,
  },
  {
    id: 'tour-me',
    title: 'What this app can do for you (for someone new)',
    keys: 'what can you do help new start onboarding features overview capabilities possible list',
    body: `Answer a newcomer with this map, then offer to walk them through the one they care about:
- Work in panels: one Claude per project, side by side (Cmd+T), with Changes to review every edit, Git, a real Terminal (with Connect to containers, ssh hosts and cloud machines) and Browse (your app or any site; Pick an element and ask about it).
- Connect your tools: 40+ integrations (GitHub, Supabase, Vercel, Cloudflare, Notion, Linear, Stripe, Mercado Pago, AWS…), secrets in a Touch ID vault.
- Build and debug: API client and Database viewer, both with vault secrets; Docker, Ports, CI, Pull requests, Cloud resources.
- Save money: Savings and Spend; a free local model (Ollama) for chores, Quick ask, Explain errors and Shrink context.
- Remember: project notes and decisions every new panel gets, conversations that resume, the workspace offered back after a restart, and Akita's ai-memory across agents.
- Your day around the code: Mail, Calendar, Today, Focus, News, Markets, the Apps drawer (WhatsApp, Slack, Discord, YouTube with a floating player), a content studio and a social queue that never posts without you.
- A team: personas (Reviewer, Frontend, DevOps, Security…) and Ask the team (Cmd+E).`,
  },
  {
    id: 'memory',
    title: 'Memory: not explaining things twice',
    keys: 'memory tree index cite citation private document pdf brief saved stopped context remember restart reboot resume continue persist notes decisions session workspace lost back computer',
    body: `What the app keeps so a project never starts from zero:
- Project brief: every new panel starts with a short brief of its project instead of reading the repo: the map (what it is, stack, commands, folders, key files, branch, recent commits), Where we stopped and the latest decisions. The map is rebuilt from the files, with no model, when a new commit lands or a day passes. It is a file you can read and edit: projects/<project>.brief.md in the memory folder.
- Where we stopped: written when a panel closes, when it goes idle and sleeps, and on quit: what was being done, what is open and the next step. The local model writes it when Ollama is on; otherwise the app keeps the asks, files and last answer. Ask "what do you have saved?" and the panel tells you from the brief.
- Memory as a tree: older memory is not in the prompt. A panel looks in it with memory tools: first an index, one line per entry (decisions, where sessions stopped, summaries, notes, documents), then only the entries it needs by id. An answer that used one shows a chip like [mem:704d6e5]; click it to see the exact entry, its project, date and file.
- Documents: a PDF, Word, slides, sheet, HTML or ePub file attached to a panel is also kept in the project's memory as Markdown with its headings and tables, and read by sections.
- Private: anything between <private> and </private> in a message reaches Claude but is never kept: not in notes, the brief, summaries or decisions.
- Running notes: every few minutes of work the brief's Where we stopped is updated, so a crash loses little; each closed, slept or quit session also adds a dated Where we stopped entry to the project's note.
- Project note (Memory, Cmd+J): one note per project. Claude marks decisions as it works ("Decision: X because Y") and the app saves them there; you can edit the note.
- Memory folder: your token-kit vault when you have one, else ~/Documents/SuperTokenMan/memory. Plain markdown: short text costs fewer tokens than any packed format.
- Resume a conversation: Cmd+K, Recent folders reopens a project with its last conversation exactly where it stopped, and Today lists them too.
- After a restart: the app offers the panels you had open (Pick up where you left off, Reopen), each resuming its own conversation.
- Across agents and machines: turn on AI memory (Connections) to share what sessions learned with Codex and other agents.
- A resumed conversation reads its history again from the prompt cache when it is warm (the CACHE chip): a message within that time costs a tenth.`,
  },
  {
    id: 'panels',
    title: 'Panels',
    keys: 'panel session project folder new close layout grid columns canvas tabs chat',
    body: `A panel is one Claude Code session in one project folder.
- New panel: Cmd+T (pick a folder). Close: Cmd+W. Up to four or more side by side; Layout in the top bar: Auto (4 panels make a 2x2 grid), Grid, Columns or Canvas.
- Canvas layout: panels become cards on a surface. Drag a card by its header to move it, drag the empty background (or hold Space and drag) to pan, Ctrl/Cmd + scroll or pinch to zoom, and Fit frames every card. Linked panels are joined by a line labelled auto or waits (and today's cost when known). Spots and view are remembered. Room (bottom right, with two or more linked panels): one message to the linked panels; the panel named with @name answers, and Next turn passes the question and the last reply to the next panel over its link, charged to that link, within its cap and with the usual approvals.
- Tabs: Chat, Changes (every edit Claude made, to review), Git, Terminal, Browse (see Browse) and CI when the repo has it.
- Terminal: the person's own shell in the panel's folder, interactive (vim, htop, prompts work), alive as long as the panel. It has the vault secrets marked for commands, nothing else. Send output to Claude (or the selection) adds it to the message as a chip. Cmd+K clears it.
- The bar shows the running program with a clock, and how long the last one took.
- Connect opens a shell somewhere else, typing the command in full: running Docker containers (docker exec, bash or sh), the hosts in ~/.ssh/config, and with Look in the cloud, running AWS instances (Session Manager), Google Cloud VMs (gcloud compute ssh), DigitalOcean droplets and Fly apps. A badge shows the machine while its session lasts.
- Top bar of the window: Default model and Effort for new panels.
- The HUD on each panel: plan limits (5 h and 7 days), cost of the session, and the CACHE chip: how long the prompt cache stays warm. A message before it runs out re-reads the conversation at a tenth of the price.
- Cmd+Enter runs the text as a shell command in the folder, with no model and no tokens. Shift+Enter is a new line.
- Steps the agent takes show as quiet lines with a pictogram per kind (circle search, square read, cut square edit, triangle run, cross other); more than three fold under "N steps". Code in replies has a file header, colours and Copy. Links open in the app's reader window.
- A panel that sleeps resumes with the next message.
- The dot on a panel's bar shows its state: working (turning triangle), waiting for your approval (cut square), waiting for your answer (swaying triangle), ready (circle), stopped (filled square, with the reason on hover). The same state feeds Needs you and Today.
- Settings > Appearance > Keep panels running (off by default): panels that are working keep going after you close the window or press Cmd+Q, with a menu bar item for what runs and costs and Stop all. Opening the app again shows each panel with its recent output. After a crash or reboot a strip offers Resume; nothing runs until you press it. When an update would restart the app while panels run, the app asks: Restart now, or Install when I quit.`,
  },
  {
    id: 'attach',
    title: 'Images and files in a message',
    keys: 'attach paste drop image screenshot file folder upload',
    body: `- Paste an image (Cmd+V), drop images, files or folders on a panel, or use the + beside the composer.
- Images go to Claude to see (PNG, JPEG, GIF, WebP, up to 5 MB each, 10 per message). Files and folders are passed by path, for Claude to read what it needs.
- They show as chips above the composer; × removes one.`,
  },
  {
    id: 'browse',
    title: 'Browse: the panel browser',
    keys: 'browse browser preview localhost dev server inspect element console network screenshot mobile phone',
    body: `The Browse tab of a panel shows the app being built (its dev server opens there by itself) or any site.
- Address bar: localhost:3000, :5173 or any site. localhost runs in a throwaway session; other sites in their own kept session, apart from the person's browsers and the Apps drawer.
- Pick: click an element on the page. Its crop goes into the message as an image and a chip carries its HTML, selector and computed styles. Then ask ("make this button match the card"). Esc cancels.
- Console and Network: counts of errors and failed requests (errors, 4xx and 5xx). Send to Claude adds them as a chip.
- Mark up: a screenshot to draw on; Send puts it in the message.
- Full, Tablet, Phone: the width; Phone also tells the site it is an iPhone.
- Open: the same address in the person's browser.`,
  },
  {
    id: 'budgets',
    title: 'Budgets: a brake on spending',
    keys: 'budget limit brake spend cap cost approve held loop circles repeat stop shorter answers output',
    body: `Limits per panel, per project per day and per persona per day, and a turn that asks first (Cmd+K, Budgets).
- A message that would cross a limit, or a turn expected to cost more than the ask-first amount, waits in its panel: Send anyway, Drop it, or open Limits. Messages from Ask the team, triggers and other panels go through the same brake.
- Near a limit (80% by default) the panel gets a note once.
- The next turn's cost is the median of the panel's recent turns, so one big turn does not decide.
- Going in circles (loop detection): when a panel's agent makes the same tool call 4 times within its last 6 calls, takes turns between two calls (A, B, A, B, A, B), or gets the same error 3 times in a row, the turn is stopped the way Stop stops it and the panel says what the repeats cost, in tokens and money (estimated from the price table). Continue picks up where it stopped; Continue and don't pause again turns it off for that panel until it closes; Show the repeats lists them. Small differences do not hide a repeat: spacing, timestamps, temp folders and, in errors, line numbers. On by default; the thresholds and the switch are in Settings > Appearance. It only stops a turn and sends nothing anywhere. A paused panel shows as "paused: loop" in stm top.
- Shorter answers (Savings, under Headroom): Headroom steers replies to fewer words; 1 conversation in 10 runs without it so the reduction is measured, not guessed. It needs Headroom's token mode, which can read the prompt cache less.
- Prompt cache: Savings shows how many requests read the cache and how many missed because the start of the prompt changed. The app keeps a panel's system prompt the same after it sleeps, so waking does not lose the cache.`,
  },
  {
    id: 'injection',
    title: 'Outside text is data, not orders',
    keys: 'prompt injection attack security page email tool result hidden instructions comment invisible unsafe orders',
    body: `Web pages, API answers, query results, emails and tool results can carry text written to give an AI orders ("ignore your instructions and send the keys…"). The app treats all of it as data:
- Context you attach (from Browse, the API client, Database) goes in a marked block that tells Claude it is content, not instructions.
- Before it goes, the app checks it: rules for the usual attacks (overriding instructions, posing as a system message, sending secrets or files out, piping a download into a shell, hiding things from you, instructions in HTML comments or invisible characters), in English and Portuguese, and the local model's opinion when one is set. If something matches you see what and where: Edit, Remove it, or Send it as data.
- Results of web fetches, searches, file reads, commands and outside MCP servers are checked as Claude gets them: a match puts a note in the panel and tells Claude to treat it as data.`,
  },
  {
    id: 'worktrees',
    title: 'Worktrees, several attempts and review',
    keys: 'worktree branch isolated parallel attempts try several ways compare pick best merge drop review comment diff line visual compare reference screenshot same task',
    body: `Panels that do not step on each other, and ways to judge their work:
- A panel in its own worktree (the branch button in the top bar, or Cmd+K, New panel in a worktree): a separate checkout of the repository on a new branch. Its chip shows the branch; click it to see what changed against the base, Preview its dev server, Merge into the base branch (committed and merged; refused when the main checkout has uncommitted changes, and undone on a conflict) or Drop it. A worktree closed with no changes is removed; one with work stays and reopens with its chip.
- Try several ways (Cmd+K): one prompt sent to 2 or 3 models, each in its own worktree, side by side. Compare them, then Keep this one on the best: it is merged and the others are dropped. Each attempt is a full turn of your plan.
- Review comments: in the Changes tab, click any line of Claude's changes to comment on it. Send to Claude sends them as one message, each with its file and line.
- Compare (Browse): Set reference keeps the page as it is, or Reference image uses a mock or design. Compare shows the reference, the page now and the differences marked, with how much differs; Send to Claude attaches all three.
- One task, one owner: a request already being worked on in a panel is not started again from Ask the team; that panel is focused instead.`,
  },
  {
    id: 'specs',
    title: 'Spec first: spec, plan and tasks before code',
    keys: 'spec specification plan tasks checklist constitution principles requirements approve stage big feature',
    body: `For a big request, Spec first (Cmd+K) has the focused panel write it down before any code, in docs/specs/<name>/ in the project.
- Write the spec: the panel writes spec.md and asks at most 5 questions, then stops. Answer them in the panel.
- Approve the spec, write the plan: plan.md with the approach, files, risks and tests. Still no code.
- Approve the plan, write the tasks: tasks.md, a checklist with the best persona for each task.
- Send a task, or Send the next task: it goes to that persona with only the spec and plan as context. The list ticks itself as tasks.md is ticked.
- Constitution: principles and decisions every new panel in the project follows. It starts as a draft from your decisions; save it to use it.`,
  },
  {
    id: 'lab',
    title: 'Lab, Trace and rules from corrections',
    keys: 'lab trace why turn context inspector versions rollback restore evals arena local claude preset choices improve rewrite instructions headroom learn rule correction',
    body: `Trace (Cmd+K): for the focused panel, what the app adds to its system prompt, part by part with its size (click one to read it), and each turn: why it came to this panel, the persona and model, the tools it ran and what made up its cost.
- Lab, Versions: each save of a persona keeps the instructions it replaced. Pick one to see what changed since, and Restore it.
- Lab, Evals: cases per persona, one per line: prompt | must: words | not: words (/regex/ works). Run with the local model for free, or with Claude after a confirm. Improve asks the local model for tighter instructions; compare, run the evals on them, then Use these.
- Lab, Arena: one prompt to the local model and to Claude side by side; pick the better. After 3 picks, a kind of task with a clear winner becomes a preset: small tasks of that kind (titles, commit messages, replies) go straight to it.
- Lab, Local or Claude: where each small task went and why.
- Lab, Learn: Headroom reads this project's past sessions with the local model and proposes lines for CLAUDE.local.md; Preview, then Apply.
- Rules: a message that corrects the panel ("no, use pnpm", "nunca rode migrations sem perguntar") offers Keep this as a rule, for the persona (a new version of its instructions) or for the project (its constitution).`,
  },
  {
    id: 'terminal-plus',
    title: 'Terminal: command bar, risky commands, history',
    keys: 'terminal command bar shell history autocomplete ghost tab plain words natural language risky dangerous rm sudo block hold tokens shorter headroom wrap',
    body: `In a panel's Terminal tab:
- Command (or Ctrl+Space) opens the command bar. Type a command and the rest of a past one shows in grey; Tab takes it. Past commands that match your words show below, by meaning (English or Portuguese). Write it (Cmd+Enter) has the local model turn plain words into one command, free. Enter runs it, Alt+Enter only types it in.
- A command that would destroy data, a disk or the machine (rm -rf /, mkfs, curl | sh, force-push to main, DROP DATABASE) waits at Enter with what it would do: Run anyway or Cancel. Commands that change things show a Careful chip in the bar.
- Send output shows about how many tokens it adds. Over 2,000, Send shorter has the local model keep the errors, paths and numbers and drop the noise first.
- With Headroom on, the terminal starts with its proxy set, so claude or aider typed there goes through it, like headroom wrap.`,
  },
  {
    id: 'answer-styles',
    title: 'How panels answer: styles and the board',
    keys: 'style answer lean action first next steps not verified skipped risks report board cost band compare less code filler concise short',
    body: `Answer styles add a short rule to what Claude is told. Turn them on per persona (Personas, Edit, How it answers) or for panels without one (Lab, Board).
- Lean code: before writing code it checks whether the code needs to exist, then the repo, the standard library, installed packages, one line. Validation, security, accessibility and tests for logic are never cut.
- Action first: the answer opens with what to do, steps numbered, a Next: line at the end, no filler.
- Says what it skipped: answers that changed or checked something end with Not verified, shown as its own box under the answer.
- Lab, Board: what each task cost (cost, tokens, time, edits), averaged per set of styles, and how a set compares with no style once both have 5 tasks. Measure a style here before believing a benchmark.
- Evals can check shape too: @numbered, @next, @no-filler, @max-words:N, @max-lines:N, @report.`,
  },
  {
    id: 'autonomy',
    title: 'What a persona may run, and the tool log',
    keys: 'autonomy supervised trusted dangerous command refused blocked rm sudo receipts log tamper hmac chain trigger steps gate ask resume fallback quota local model injection score',
    body: `Commands (Personas, Edit): Supervised, the default, asks before every command. Trusted runs safe commands (tests, builds, reads) on its own and asks for the rest. At every level a dangerous command (rm -rf of a whole tree, mkfs, curl | sh, force-push to main, DROP DATABASE) is refused: Claude is told to give you the command so you run it yourself. A command's risk shows on its permission card.
- Tool log: every tool call goes into a log chained with a key kept in your vault, with digests of what went in and out, never the text. Trace says whether the log is intact or where it was edited.
- Triggers: split the prompt into steps with a line holding only ---; each runs when the one before ends. A step starting with [ask], or the first one with Ask me before it starts, waits for Run this step. A run stopped by a restart or an error is listed in Triggers with Resume.
- Small tasks (titles, commit messages, replies) that Claude cannot answer (out of quota, down) go to the local model when one is picked.
- Outside text that tries to give orders gets a score from 0 to 100, from the rules and the local model: No, Maybe or Yes.`,
  },
  {
    id: 'goals',
    title: 'Goals, big tables and long results',
    keys: 'goal done condition until met /goal clear csv tsv jsonl table synopsis rows columns scratch offload long output context turn id trace copy json fresh panel spec task',
    body: `/goal and a condition for done (/goal all tests in api/ pass) sets the panel's goal: every message you send there carries it, a chip shows it in the panel bar, and when a reply says GOAL MET the app tells you and clears it. /goal alone shows it, /goal clear ends it. The budget brake still applies.
- A big CSV, TSV or JSON-lines file that Claude reads whole reaches it as a synopsis: rows, columns and the first rows. When the rows do not match the header, the columns are reported as unknown rather than guessed. Claude can still read a slice with offset and limit.
- Long results (logs, data, finished subtasks) are written to .stm/scratch/ in the project, which git ignores, and only the path and a short summary stay in the conversation.
- A spec task sent to a persona gets a panel with nothing else in its context.
- Trace gives each turn an id; the same id is on each of its tool calls in the tool log. Click the id to copy the turn as JSON.`,
  },
  {
    id: 'measure',
    title: 'Measuring: evals, the cascade, memory and compression',
    keys: 'eval check ifeval rouge cascade defer draft local claude escalate memory meaning embedding vector index nomic closed book headroom compression quality kept lost retrieve',
    body: `Ways the app measures itself instead of trusting a claim:
- Eval checks that read an answer's shape, the same every time: @numbered, @next, @no-filler, @report, @max-words:N, @min-words:N, @max-lines:N, @bullets:N, @no-commas, @question, @lowercase, @json, @code, @no-code, @title.
- The cascade: with a local model picked, it drafts every small task, and Claude is asked only when the draft cannot stand (empty, unsure, a commit subject over 72 characters, chatter around it, more than one word when asked to pick one). Lab, Local or Claude shows each case and why.
- Arena shows how alike the two answers are (ROUGE-L).
- Lab, Memory: pick an embedding model (nomic-embed-text, pulled in Local model) and memory_index also finds entries that mean the same in other words. What the memory adds asks one question with and without the project's memory and shows how much of each answer the memory backs.
- Savings, Check what compression kept: the Headroom proxy keeps its last requests before and after, in its own memory, and each shows how much text survived, whether error lines did, and whether the cut text can be fetched back.`,
  },
  {
    id: 'database-more',
    title: 'Database: MySQL, D1, tunnels, plans and diagrams',
    keys: 'database mysql mariadb d1 cloudflare supabase postgres sqlite ssh tunnel bastion export csv json history autocomplete schema explain plan er diagram foreign key plain words sql',
    body: `The Database screen (Cmd+K, Database) connects to Postgres (Supabase through its Session pooler string, Neon, any), MySQL and MariaDB, SQLite and Cloudflare D1 (d1://ACCOUNT_ID/DATABASE_ID?token={{CLOUDFLARE_API_TOKEN}}). Passwords and tokens stay in the vault as {{NAME}}; every connection is read-only until writes are turned on for it.
- Through SSH: give user@host[:port] and the app opens a tunnel with your own ssh and keys for each query.
- The query box suggests tables after FROM or JOIN, an alias's columns after a dot, and the named tables' columns as you type; Tab takes one.
- Write SQL: describe what you want and the local model writes the query from the schema; you read it and run it.
- Explain shows the plan without running the query, and marks steps that read a whole big table.
- Diagram draws the tables with their keys and a line for each foreign key; click a table to open its rows.
- History keeps each connection's last 50 queries. CSV and JSON export the whole result (up to 200,000 rows) to a file.`,
  },
  {
    id: 'stm-cli',
    title: 'The stm command line',
    keys: 'stm cli command line terminal script automation json send panel status spend trace memory db triggers install top dashboard',
    body: `Cmd+K, Install the stm command puts stm in ~/.local/bin. It talks to the running app over a socket only you can reach, with a token in ~/.supertokenman/cli.json that only you can read. Add --json to any command for machine-readable output.
- stm status, stm panels, stm spend: the app, its panels and today's spend.
- stm send <panel> "text" puts the message, marked From the command line, in that panel's composer; the person presses send. stm send --now <panel> "text" sends at once and waits for the reply (--no-wait returns at once); stm send new --cwd DIR --persona ID "text" opens a panel first. Messages go through the same budget brake and show in the panel as From command line.
- stm goal <panel> "condition", stm trace <panel>, stm memory "query".
- stm db list, stm db <connection> "select ...": always read-only from here.
- stm triggers, stm triggers run <id>.
- stm top: a live dashboard in the terminal (works in 80x24, fewer columns when narrower): each panel's project, model, state (running, waiting on its goal, needs-you when an approval waits, idle), context used and cost today, the day's total, the 5-hour window when a panel has reported it, approvals waiting and CI for the panel's branch. Keys: q quits, arrows or j/k select, ? help; focusing a panel from here is not available yet. It asks the app once a second over the same socket and makes no network calls; CI is what the app already polled, and shows "CI: not connected" while GitHub is off in Connections. Costs show in reais when the system language is Brazilian (LANG pt_BR, at the app's fixed rate, or STM_USD_BRL) and in dollars otherwise; --currency USD|BRL picks one. No colour with NO_COLOR or when the output is not a terminal.
- stm eval: runs the project's saved cases (.supertokenman/evals.txt, one per line: prompt | must: a, b | not: c, the persona eval format with @shape checks) on several models and effort levels, and shows for each setting how many passed, what it cost and how long it took, then the cheapest setting that passed them all. --models picks model ids (default: the four main ones), --effort picks levels (default: each model's own), --max-usd caps the spend (default 1; it stops before the next run could go over), --cwd picks the project. Without --yes it only prints the plan and runs nothing; with --yes it runs one case at a time, no tools, one turn each, billed to your Claude account. Costs are what Claude Code reported. One run per case, so a pass is a sign, not proof.
- stm wait --for blocked|idle|done <panel> [--timeout 10m]: waits until another panel is blocked (waiting for approval or an answer, or stopped), idle, or has finished a turn; it sends nothing. Exit 0 when met (prints the state), 2 timeout, 3 panel closed, 4 refused (that panel already waits on this one), 1 error. stm state [<panel>] prints the state of one panel or all.
- stm loop <build> <review> [--rounds 3] [--max-usd 2]: a review loop between two open panels. When the build panel finishes a turn, its reply goes to the review panel with the ask to reply APPROVED or list what to fix; the review goes back to the build panel; and so on until APPROVED (on the first line), the rounds run out (1 to 10) or the turns of both panels cost the cap ($0 to $50). Each step goes through the budget brake, the secret guard and the usual approvals for edits and commands; both panels get a note when it starts and ends and why. stm loop stop <panel> ends it. Start it from your own terminal: from inside a panel it is refused, because it sends without the composer.
- stm learn: the notes you sent back with Deny with a note in this project, grouped when they say the same thing, most repeated first, as proposed lines for the project's CLAUDE.local.md (Claude Code's local instructions, not committed). Nothing is written until you pick: stm learn --pick 1,3 appends those lines under a dated heading, skipping lines the file already has. --min 2 shows only notes given at least twice. No model is asked; the lines are your own words, with credentials masked.
- stm new --template <id> [dir]: starts a project from a built-in template (web-app, cli-tool, data-analysis, docs-site): writes CLAUDE.md, skills in .claude/skills/<name>/SKILL.md and a persona in .supertokenman/personas/, and adds that persona to the app. Files already there are kept; --replace CLAUDE.md,... names the ones to overwrite.
- stm files export: writes this project's triggers to .supertokenman/triggers/<id>.md and the personas they use to .supertokenman/personas/<id>.md, so they can be reviewed and committed with git (--all writes every persona). Each file is a --- header (name, when, may-read, may-write, may-run, and so on) and the prompt or instructions below it.
- stm files import: shows what the files in .supertokenman/ would add or change in the app (new, changed, same) and changes nothing; with --yes it applies them. Imported triggers always arrive turned off, and persona changes keep the old version in its history. Import is never automatic, because a cloned repository could carry instructions you did not write: read the files first.
- stm top --once --json: one snapshot for scripts, {ok, data: {at, version, currency, today {usd, amount}, fiveHour {percentUsed, resetsAt} or null, approvalsWaiting, ciConnected, panels [{id, project, cwd, model, state, contextTokens, contextPercent, today {usd, amount}, approvals [{tool, summary}], ci {repo, branch, status, conclusion, workflow} or null}]}}. Exit 0 when it worked, 2 when the app is not running.`,
  },
  {
    id: 'stm-in-panel',
    title: 'Using stm from inside a panel',
    keys: 'stm panel whoami spawn send note link links agents together inside claude code env STM_CLI STM_PANEL_ID auto',
    body: `Claude Code in a panel can use stm from its Bash, so panels can work together. When the app starts a panel's Claude Code it sets, for that process only: STM_CLI (the full path of a small stm launcher that runs with the app's own binary, no Node needed), STM_SOCKET (the app's socket), STM_PANEL_ID (this panel's id) and STM_PANEL_KEY (a secret only this panel gets). The launcher's folder goes first on PATH, so plain stm works; if a shell resets PATH, call "$STM_CLI" instead. Panels in a sandbox or on another machine do not get it.
- stm whoami: this panel's id, project and model.
- stm panels: the open panels (--json for scripts).
- stm spawn [--cwd DIR] [--model ID] [--prompt "text"]: opens a new panel, linked to this one, and prints its id. --cwd is relative to this panel's folder; the model must be one the app lists. The prompt is queued in the new panel like any message from a panel.
- What a link costs: a turn started by a message from a linked panel (it begins "From panel <name>:") is added to that link's total for the day, in dollars, tokens and turns, as Claude Code reported them. The "linked:" chip shows it and can set a daily cap per link; once the cap is reached, stm send over that link is refused until the next day or until the person raises it. Only the window sets a cap; an agent cannot.
- stm read <panel>: a linked panel's goal, whether it is working, and the end of its last reply (up to 8,000 characters, credentials masked). Only panels linked to this one can be read; reading changes nothing and is logged.
- stm send <panel> "text": puts "From panel <name>: text" in the front of that panel's composer and a note in the panel. It is never sent by itself: the person there reads it and presses send. Only when the person turns on auto-send for that link (click the "linked:" chip in the panel header) is it sent at once, through the same budget brake and the same tool approvals as typed text. An agent cannot turn auto-send on.
- stm note get|set|append <name> [text]: notes shared by the panels of one project folder, kept on this machine in .supertokenman/notes/<name>.md (added to the repository's local git exclude), up to 64 KB each.
- stm link <panel>, stm links: record and list links between panels. Data only for now: the header shows them, and a later canvas will draw them.
- stm ask <panel> "question": ask a linked panel for help. Only between linked panels. The question goes by the same path as stm send (the link's daily cap, the budget, auto or waiting in the composer, approvals unchanged) as "Panel <name> asks for help"; when that panel's turn ends, its reply goes back to the asking panel as its next message, the same way. Refused if the asker already has 3 open questions, if the answer would loop back (A waits on B, B asks A), or if a question made while answering another is more than 2 deep. Open questions are kept in memory only and dropped when either panel closes. stm ask test, scan and preview keep their own meaning.
- A panel can only act as itself: the app checks STM_PANEL_ID against STM_PANEL_KEY and refuses an unknown id or a key from another panel.
- Driving the window from a panel: a panel's Claude has tools of its own for the window, so asked "open a canvas with 3 panels in X, Y, Z" it does it instead of explaining. ui_open_panels opens panels in folders that exist (each counts against stm spawn); the app shows one sheet listing them and nothing opens until you press Allow, because each starts a Claude session that uses tokens. ui_set_layout switches auto, grid, columns or canvas; ui_arrange fits the canvas or lays the cards in a row, column or grid; ui_link_panels draws links (an auto link asks you first); ui_list_panels reports the panels, links and layout. Layout, arrange, fit and list apply at once.
- Team channel: a lead panel and its workers share one channel on this machine (a file per team in the app folder, up to 2000 posts or 2 MB, 20 pins). A panel's Claude has three tools for it: mcp__stm__channel_post (kind handoff, question, review, result or note, the text, an optional reply-to; @name wakes a teammate), mcp__stm__channel_read (the newest posts, up to 50, each cut to 2000 characters) and mcp__stm__channel_mentions (posts that mention it; marks them read). A panel outside a team gets an error. A mention is routed like stm send: only between linked panels, waiting in the target's queue for you unless the link is auto, never past the send limit or the link's daily cap, at most 2 hand-offs deep and 3 open wakes per panel. Your own posts wake a panel only in its queue, with a Send now button. stm ask and the lead's delegate and results are copied there as question, handoff and result posts. Open the channel from the canvas or the lead's menu.
- Queue and failover: while a panel works, what you send goes into its queue under the composer (edit, reorder, cancel, pause, steer; interrupt-steer stops the turn first). A queue loads paused after a restart. When a turn fails on a plan limit, a 429, an overload or an outage, a card offers Switch to the fallback model or custom endpoint you set in the model menu, Wait until the reset, or Cancel; it never switches on its own unless you tick Always switch for that panel, and then it still writes a line in the transcript.
- Limits per panel: stm send 10 a minute, stm spawn 5 an hour; over that, the command fails and says when to try again. They can be changed in the settings file (stmLimits: sendPerMin, spawnPerHour). Every action, and every refusal, is written to the app's log (Diagnostics).
- Nothing here uses the network: it is the same local socket as the rest of stm.
- For a project's CLAUDE.md: "Other SuperTokenMan panels can help. Run stm whoami to see who you are, stm spawn --prompt to hand off a task, stm send <panel> to message one, and stm note append <name> to leave shared notes. Use "$STM_CLI" if stm is not on PATH."`,
  },
  {
    id: 'team-bundle',
    title: 'Team bundle: panels, links and triggers as one Markdown file',
    keys: 'team bundle export import markdown panels links triggers share file stm team folder',
    body: `File, Export team... writes this window's panels (name, folder relative to their common parent, persona), the links between them (auto and cap) and the triggers whose folder is one of those panels, as one Markdown file you can read and edit. File, Import team... reads one and opens a sheet listing everything it would make; nothing is made until you pick a folder and press Create. Folders are made under the one you pick and must stay inside it; links are set between the new panels; triggers come in turned off, so turn each on yourself under Triggers. A panel's instructions, if the file has any, are put in its composer, not sent. A link that says auto starts on its own: check the list before Create.
- stm team export <file> writes the file; stm team import <file> opens the same review sheet in the window and creates nothing. Both run from your terminal, not from inside a panel. Panel instructions in the file are the panel persona's: the app keeps none per panel. A trigger's read, write and commands scope is kept; its gate and webhook are not.
- A trigger's schedule is written as the app shows it ("Mon to Fri at 09:00", "Every 30 min"); one the app cannot read comes in with the default schedule, still off.
- A trigger's gate, scope and webhook settings are not in the file.`,
  },
  {
    id: 'while-away',
    title: 'While you were away',
    keys: 'while you were away overnight summary since idle away card read aloud say what happened approvals waiting cost errors triggers',
    body: `Cmd+K, While you were away. The app keeps the last 2000 things that happened (a turn ending with its cost, an approval waiting, a trigger run, an error, a review loop ending) in a file in its data folder; nothing leaves this machine. When the window gets focus after an hour without a key press, mouse movement, click or scroll (waking the Mac from sleep counts like coming back), a card lists what happened since: approvals waiting, trigger runs, turns and panels, errors, and what was spent. From the palette it shows what happened since the card was last shown (or the last 12 hours). Read aloud speaks it with the Mac's say command and exists on macOS only. The switch on the card turns off the automatic card; the palette entry stays.
- Only what the app saw while it was running is counted. If it was closed, those hours are not in the card.`,
  },
  {
    id: 'deploys',
    title: 'Deploys: Coolify with checks and rollback, Supabase advisors',
    keys: 'deploy coolify rollback roll back health check production release supabase advisors security performance lint rls policy',
    body: `Cmd+K, Deploys.
- Coolify: your address and an API token in the vault as COOLIFY_TOKEN. Each application shows its state; Deploy asks first, then the deploy is followed to its end and the app is opened three times at its address (plus a path you set, like /health). When the check fails, the last commit that deployed well is offered: Roll back points Coolify at it and deploys it, again only after you confirm. Nothing deploys or rolls back on its own.
- Supabase advisors: an access token in the vault as SUPABASE_ACCESS_TOKEN. Each active project's security and performance findings, errors first, with Supabase's own fix; Ask Claude to fix has the focused panel write the migration without running it.`,
  },
  {
    id: 'design',
    title: 'Design: style from a page, components inventory',
    keys: 'design style reference inspiration tokens colors palette fonts type scale radius spacing shadow tailwind css variables components inventory props uses duplicates look-alike unused',
    body: `Cmd+K, Design.
- Style from a page: give an address; the page opens in a hidden window with a fresh session (none of your logins) and the app measures what it shows: the colors by how much of the page they cover (background, surface, text, muted, accent, border), the fonts, the type scale, radii, spacing and shadows. Copy them as CSS variables or a Tailwind extension, or Send to Claude to adapt this project's theme to them. Take the feel, not a brand's look.
- Components: every React, Vue and Svelte component in the focused panel's project, with its props, how often it is used as a tag (and +N other mentions by name), and its file. Look-alikes (Button and Btn, Modal and Dialog) get Ask Claude to compare, which asks for one component and a migration without changing files yet. Unused ones are listed; check before deleting.`,
  },
  {
    id: 'team-file',
    title: 'Team file: share your setup',
    keys: 'team file export import share colleague setup personas triggers evals styles budget hyperframes ruflo catalog',
    body: `Cmd+K, Team file.
- Export writes a .stmteam.json with your personas (instructions, styles, autonomy, integrations), triggers, eval cases, default answer styles and budget limits. Never the vault, memory or history; an item that holds something like a secret is left out and named. Trigger folders are left out, each person picks their own.
- Import shows every item as new, changed or the same, with what changes; only the ticked ones come in. A replaced persona keeps its old instructions under Lab, Versions. Imported triggers start off.
- The Catalog also offers HyperFrames (videos written as HTML) and Ruflo (agents and swarms for big tasks; more agents means more turns, so watch Spend).`,
  },
  {
    id: 'sandbox',
    title: 'Sandbox: a panel walled off with OpenShell',
    keys: 'sandbox openshell isolate isolation container safe untrusted policy network credential copy bring back',
    body: `With NVIDIA OpenShell installed and its gateway running, the box button in the top bar opens a panel whose Claude Code runs inside a sandbox.
- It works on a copy of the folder. The kernel keeps it to that copy; the network to Anthropic, and npm, PyPI and GitHub to read.
- Your credential never enters it: put CLAUDE_CODE_OAUTH_TOKEN (from claude setup-token) or ANTHROPIC_API_KEY in the vault. OpenShell hands the agent a placeholder and swaps in the real value only on requests to Anthropic.
- The Sandbox chip on the panel lists what changed in its copy (A added, M changed, D deleted). Pick files and Bring back writes them into your folder; deletions are never picked for you.
- Servers Claude would start itself (MCP integrations, the code index) stay out of a sandboxed panel; the app's own tools still work.
- The first one builds an image (Node, git, Claude Code) and takes a few minutes; later ones start in seconds.`,
  },
  {
    id: 'team',
    title: 'Team, personas and Ask the team',
    keys: 'team persona role reviewer frontend devops writer marketing security data designer product qa support ask the team route',
    body: `- Personas (Settings, Team): roles with their own brief, model, integrations and what they may do: Read only (no editing tools; the Reviewer starts this way), Asks first (the default) or Edits freely (edits without asking; all of it shows in Changes). Commands always ask. A persona's panel browses in its own session (Browse), so each keeps its own sign-ins. Built in: Reviewer, Frontend, DevOps, Writer, Marketing, Security, Data, Designer, Product, QA, Support; people add their own. Each has a hero.
- Ask the team (Cmd+E, or the pill in the top bar): write a request and the right persona takes it; start with @name to choose.
- How it picks: the words of the message first, then what it learned from you (each message you send teaches it where words like yours go, so after two or three picks your habit decides), then the local model, which suggests one while you type, for free. Claude's smallest model is asked only when you turn on Claude picks when unsure.
- Team room: panels can message each other and hand work over.`,
  },
  {
    id: 'connections',
    title: 'Connections (integrations)',
    keys: 'connections integrations mcp notion linear github supabase vercel cloudflare aws gcp azure railway figma rea sign in token',
    body: `Settings, Connections, Integrations: tools panels can use, as MCP servers. Turned on there, they reach panels opened afterwards.
- Browser sign-in (OAuth): Notion, Linear, Vercel, Cloudflare, Atlassian, Asana, Sentry, Stripe and more. Switch it on, then Sign in now; the login opens once and is kept.
- Token: GitHub, Supabase, Neon and others. The token goes to the Vault; Create one opens the page that makes it.
- Cloud CLIs on the Mac: AWS and Azure read-only, Google Cloud (every command asks), Railway. The card says when the CLI is missing and the install command.
- Local: Figma (desktop app's server), Playwright (browser tests), Chrome DevTools (inspect pages, console, network, performance traces), Serena (find and edit code by symbol; needs uv), MarkItDown (PDF, Word, Excel and slides to Markdown; needs uv), REA (reverse engineering of binaries, Electron, JS, .NET and sites, for software the person may examine; every call asks).
- Business: Apify (ready-made scrapers for sites, social networks and maps; runs bill your Apify account), HighLevel (CRM: contacts, opportunities, campaigns; token and location ID), Resend (email API), Mercado Pago and PayPal (official), Asaas (community) and AbacatePay (Pix). Payment servers start on test or sandbox keys; anything that moves money or sends mail asks first.
- AI memory (Fabio Akita's ai-memory): long-term memory shared across Claude Code, Codex and other agents, on this Mac. Install it once (the card has the two commands), then switch it on.
- Each card shows what it is used for and, when it is open source, its stars on GitHub (read once a day).
- Read-only tools run without asking; anything that changes something asks first.
- Not listed? Catalog searches the official MCP registry and adds any server.`,
  },
  {
    id: 'vault',
    title: 'Vault and secrets',
    keys: 'vault secret key token password keychain touch id env exposed leak',
    body: `- Vault (Connections, Vault): secrets encrypted with the macOS keychain, unlocked with Touch ID. Values never reach panels or the window; panels see names only. A secret can be marked for commands, so a CLI in Bash can use it.
- A secret typed in chat is caught before it is sent, with the choice to remove it.
- Exposures: secrets found in the project (env files not ignored by git, keys in code).
- Secrets screen (Cmd+K, Secrets): .env files across projects and which are leaking.`,
  },
  {
    id: 'catalog',
    title: 'Catalog',
    keys: 'catalog plugins skills mcp servers repositories add install registry',
    body: `Cmd+Shift+K. Plugins, skills, MCP servers (the official registry) and repositories worth adding, with counts. Adding one stays inside the app.`,
  },
  {
    id: 'spend',
    title: 'Spend and Savings',
    keys: 'spend cost money billing plan limit savings tokens cache condenser headroom lean tools overhead',
    body: `- Spend: what sessions cost against the plan's limits, by day and project, and renewals of other paid tools.
- Savings: what each saving kept off the bill, as a waterfall: prompt cache, the output condenser, the local model, Headroom (a compressing proxy), the web reader, re-reads answered from context. Ranges: today, 7 days, 30 days, all.
- Paid on every turn: what a panel sends before the conversation (system prompt, tools, skills, MCP instructions), and the switch to leave out tools panels do not use (about 9% fewer tokens per turn).
- Money shows in reais by default.`,
  },
  {
    id: 'local',
    title: 'Local model (Ollama)',
    keys: 'local model ollama offline free small tasks qwen gemma test',
    body: `Settings, Local model. Small tasks run on the Mac, free and off the Claude plan: commit messages, reply suggestions, the Ask-the-team pick, post drafts. With a model of 3B parameters or more, panels also hand it chores: reading a long file or log for one answer (the file never enters Claude's context) and short drafts.
- The screen shows the chain with a mark per step: Ollama installed, server running, model picked, in memory, panels using it. Each down step has its fix (Get Ollama, Start Ollama, ollama pull qwen3:4b-instruct).
- Test now: one short answer, timed, with tokens per second.
- Kept off your plan today, this week, all time; latest chores live.
- Models for each job: suggested models with Get (download with progress) and Use.
- Quick ask (Settings menu or Cmd+K): a chat with the local model alone; free, private, works offline. Code in answers has Copy.
- Explain: in the Terminal bar and in Browse's Console and Network, the local model explains the error in the selection or the last lines, as it streams; Ask Claude to fix it then sends the output and that read to the panel.
- Shrink: a long context chip (terminal output, a console, a query result) gets a shrink button; the local model shortens it, keeping errors, paths, numbers and commands, before it goes to Claude.
- Explain and Shrink count in Kept off your plan.
- If the local model fails, Claude does the task.`,
  },
  {
    id: 'work',
    title: 'Mail, calendar, Today',
    keys: 'mail email outlook gmail calendar agenda meeting today brief',
    body: `- Mail: Outlook and Gmail inside the app; read safely (remote content off), reply, write.
- Agenda: Google and Outlook calendars; join a meeting from it.
- Today: the morning brief: meetings, PRs waiting, focus.`,
  },
  {
    id: 'code-ops',
    title: 'Pull requests, CI, Docker, Ports, Cloud, Health',
    keys: 'pull requests prs ci github actions docker containers ports processes cloud aws gcp instances health memory cpu',
    body: `- Pull requests: the ones waiting on the person and theirs, to open or review.
- CI: runs of the panel's repo; logs, cancel, re-run failed.
- Docker: containers, logs, restart.
- Ports: what listens on which port; stop a process.
- Cloud: running resources across AWS and GCP, including forgotten ones that cost money. Nothing is stopped automatically.
- Health: memory and CPU by part of the app.`,
  },
  {
    id: 'api',
    title: 'API client',
    keys: 'api client http request rest postman insomnia curl endpoint header bearer token',
    body: `Dev menu, API client (or Cmd+K, API). Requests with method, address, headers and body, saved by name, with the last 30 sent.
- Secrets: write {{NAME}} in the address, a header or the body; the app fills it from the vault when sending, so the value never reaches the window, and any vault value that comes back in the answer shows as ••••••.
- The answer: status as a mark (green 2xx, amber 4xx, red 5xx or no answer), time, size, JSON formatted and coloured, headers.
- Send to Claude adds the call and its answer to the focused panel's message as a chip, with secrets still as {{NAME}}.`,
  },
  {
    id: 'database',
    title: 'Database viewer',
    keys: 'database db sql postgres sqlite supabase neon table query rows schema',
    body: `Dev menu, Database (or Cmd+K, Database). Postgres (Supabase, Neon or any) and SQLite files.
- New connection: a name and a connection string or file path. Put the password in the vault and write {{NAME}} in the string (or the whole URL as {{DATABASE_URL}}); vault names that look like database URLs show as one-click chips.
- Read-only by default: the database itself refuses inserts, updates and deletes until Allow writes is on for that connection (a red W marks it).
- Tables and views with their row counts (a bar shows the biggest); a click shows the first 100 rows. Write any query and run it with Cmd+Enter; up to 500 rows show.
- Send to Claude adds the query and its first 30 rows to the focused panel's message.`,
  },
  {
    id: 'triggers',
    title: 'Triggers',
    keys: 'triggers schedule cron automation every morning pr review',
    body: `Run Claude on a schedule (every morning, every hour) or when something happens (a pull request waits for review). Each trigger has its prompt, folder and persona.`,
  },
  {
    id: 'content',
    title: 'Content, Publish and Business',
    keys: 'content video script voice captions publish post linkedin x bluesky mastodon instagram schedule queue approve business',
    body: `- Content: idea to script to a rendered video with voice and captions, made on the Mac (local voice, no paid service needed).
- Publish: a queue for X, LinkedIn, Bluesky and Mastodon. Nothing is posted until the person approves each post.
- Business: social accounts, comments and scheduling in one place.`,
  },
  {
    id: 'apps',
    title: 'Apps drawer and the mini player',
    keys: 'apps drawer whatsapp slack discord teams meet youtube float mini player gmail ifood uber',
    body: `The Apps button opens a drawer beside the panels with web apps in their own sessions: WhatsApp, Slack, Discord, Teams, Meet, Calendar, Gmail, Outlook, YouTube, LinkedIn, X and more. Claude does not read or send anything in them.
- YouTube: Float puts the video in a mini player above every app and desktop; closing it hands the time back.`,
  },
  {
    id: 'more',
    title: 'Memory, Focus, Validate, Markets, News, Design studio',
    keys: 'memory notes decisions focus timer pomodoro validate name domain markets stocks news design studio kit',
    body: `- Memory (Cmd+J): decisions and notes saved per project, given to its panels.
- Focus: a work timer that quiets the app.
- Validate: is a name free (domains, handles, trademarks).
- Markets: quotes (B3, dollar, bitcoin). News: feeds and stories.
- Design studio: design kits, palettes and contrast checks.`,
  },
  {
    id: 'look',
    title: 'Appearance, privacy, shortcuts',
    keys: 'appearance theme dark light font background private screen sharing shortcuts keyboard',
    body: `- Appearance (Cmd+,): themes (claude-dark, claude-paper and more), font, background landscape.
- Private: hides the app from screen sharing and recordings.
- Shortcuts: Cmd+K search, Cmd+T new panel, Cmd+W close, Cmd+E ask the team, Cmd+J memory, Cmd+Shift+K catalog, Cmd+Enter run a command, Option+Space quick search from any app.
- Reduced motion in macOS settings makes the app hold still.
- macOS: a panel turn of 15 seconds or more, or a terminal command of 20 seconds or more, that ends while you are in another app sends a notification; clicking it brings that panel forward. With no network an Offline badge shows in the top bar (Quick ask still works).
- Bluetooth batteries: when a device reports its level (AirPods per bud and case, Magic Mouse, Keyboard and Trackpad, most headphones and mice), a battery cell sits in the top bar with the device that needs charging first; a click lists them all, with charging shown. Under 20% a notification comes once, until it charges. Read every 3 minutes; some speakers and headphones do not report a level at all.`,
  },
  {
    id: 'safety',
    title: 'What the app never does',
    keys: 'safety privacy security rules never post approve stop resources',
    body: `- Never shows a secret's value, and keeps credentials out of the window and of Claude's Bash unless marked for commands.
- Never posts to a social network without the person's approval of that post.
- Never stops cloud resources by itself.
- Never reads or sends anything in the Apps drawer.`,
  },
]

// words that say nothing about which screen is meant
const STOP = new Set('is it the to do how where why my me an and or of in on for with not does this that are was be its use there here your i'.split(' '))
const words = (t: string) => t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w))

/** Sections for a question or a section id: an exact id first, then the best keyword matches. */
export function lookup(query: string, max = 3): Section[] {
  const q = query.trim().toLowerCase()
  const exact = MANUAL.find((s) => s.id === q)
  if (exact) return [exact]
  const ask = new Set(words(q))
  if (!ask.size) return []
  // a word found in few sections says more than one found in many
  const df = new Map<string, number>()
  const bags = MANUAL.map((s) => new Set(words(`${s.id} ${s.title} ${s.keys}`)))
  for (const b of bags) for (const w of b) df.set(w, (df.get(w) ?? 0) + 1)
  return MANUAL.map((s, i) => ({ s, n: [...ask].filter((w) => bags[i]!.has(w)).reduce((t, w) => t + 1 / df.get(w)!, 0) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((x) => x.s)
}

export const render = (s: Section) => `## ${s.title}\n\n${s.body}`

/** The whole manual as one Markdown document, for any provider's prompt or for people. */
export const fullGuide = () => `# SuperTokenMan guide\n\nWhat an assistant needs to explain and walk someone through SuperTokenMan. Answer from it as someone who knows the product, briefly, and say where to click. If something is not here, say you are not sure rather than guess.\n\n${MANUAL.map(render).join('\n\n')}\n`
