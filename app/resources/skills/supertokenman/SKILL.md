---
name: supertokenman
description: Use when the person asks to start a project from a spec, set up several SuperTokenMan panels at once, run a review loop between panels, set up triggers, or asks how to use SuperTokenMan's features from inside a panel.
---

# SuperTokenMan

SuperTokenMan (STM) is a Mac app that runs Claude Code panels, one per project folder. This skill covers planning a set of panels and using the `stm` command from inside a panel. Check the references before you state a command or a limit. When this skill is not loaded, `mcp__stm__manual` with topic `provision` returns it.

## Workflow: spec to panels

1. Read the spec. List the panels you need: one name, one folder and one role each.
2. Write a team bundle in the format of `references/team-bundle.md`. Writing it creates nothing.
3. Call `mcp__stm__team_plan` with the bundle as Markdown. Add `loop` (`build`, `review`, `rounds`, `maxUsd`) if the person wants a review loop, and `capUsd` for a spend cap other than the default US$5 (at most US$50). It returns the preview lines and a summary. Creates nothing.
4. Show the person the plan in your own words: panels, links, the loop and its cap, triggers. Say which items start on their own and which wait. Adjust the bundle with their answers and call `mcp__stm__team_plan` again.
5. Call `mcp__stm__team_provision` with the same arguments. It opens the app's review sheet with the plan. Only when the person picks the parent folder and presses Create are the panels, links and triggers made (triggers turned off) and the loop started with its cap. It returns what was made, or that the person cancelled.
6. If they cancelled, ask what to change. Do not call it again unprompted.

Terminal alternative: write the bundle to a file and ask the person to run `stm team import <file>` in their own terminal. It opens the same sheet without the loop line.

## Single actions

When one step is enough, call it directly. Each asks the person in the panel first and shows its cap:

- `mcp__stm__panels_open` (`folder`, `persona?`, `goal?`): open a panel. It is not linked and has no task.
- `mcp__stm__link` (`a`, `b`, `auto?`, `capUsd?`): link two panels by name or id. A link that starts on its own gets a US$5 daily cap unless you set one.
- `mcp__stm__loop_start` (`build`, `review`, `rounds?`, `maxUsd?`): a review loop. Defaults: 3 rounds, US$2.
- `mcp__stm__trigger_create` (`name`, `panel`, `when`, `prompt`, `read?`, `write?`, `commands?`): created turned off.

A denied call is final for the turn. Do not retry it or look for another way around it.

## Rules

- Anything that creates a panel, sends a message, starts a loop or spends money needs the person's yes first.
- Keep a team to 8 panels or fewer. The app refuses a bundle with more than 12.
- Give each panel one clear role and one folder.
- For code, prefer one build panel and one review panel, linked and run as a loop.
- Triggers come in turned off. Tell the person to read each trigger's scope, then turn it on under Triggers.
- Messages to other panels are short by default. Answer other panels in facts, file paths and the next step; in replies to the person write normally.
- A panel's instructions from a team file are put in its composer on Create. They are not sent.

## Choosing an stm tool inside a panel

- `stm ask <panel> "question"`: a short question to a linked panel. Its answer comes back to you. Use it for a quick check, not for a long job.
- `stm send <panel> "text"`: leaves a message in another panel's composer. The person there presses send, unless auto-send is on for that link.
- `stm note append <name> "text"` and `stm note get <name>`: shared notes for one project folder. Use them to pass results between panels that do not talk directly.
- `stm spawn --prompt "text"`: opens a new panel linked to this one. Use it only with the person's yes.
- `stm loop <build> <review>`: a review loop. The command is refused inside a panel; use `mcp__stm__loop_start` or `mcp__stm__team_provision` instead.

Run `stm whoami` and `stm panels` before you assume a panel exists or what it is called.

## References (load only when needed)

- `references/team-bundle.md`: the team file format, one full example and the validation rules.
- `references/roles.md`: six role recipes with instruction text to paste.
- `references/workflows.md`: four recipes: new project from a spec, bug fix with a review loop, nightly tests trigger, research then build.
