---
name: supertokenman
description: Use when the person asks to start a project from a spec, set up several SuperTokenMan panels at once, run a review loop between panels, set up triggers, or asks how to use SuperTokenMan's features from inside a panel.
---

# SuperTokenMan

SuperTokenMan (STM) is a Mac app that runs Claude Code panels, one per project folder. This skill covers planning a set of panels and using the `stm` command from inside a panel. Check the references before you state a command or a limit.

## Workflow: spec to panels

1. Read the spec. List the panels you need: one name, one folder and one role each.
2. Write a draft team file in the format of `references/team-bundle.md`. Writing the file creates nothing in the app.
3. Show the person the plan: panels, links, loops and triggers. Say which items start on their own and which wait. Ask for changes and adjust the file.
4. Ask the person to run `stm team import <file>` in their own terminal, not in a panel. It opens a review sheet in the app window and creates nothing.
5. The person picks the parent folder and presses Create in that sheet. Triggers come in turned off.

There is no `team_plan` or `team_provision` tool. Do not call one. The preview is the import sheet, and the person presses Create.

## Rules

- Anything that creates a panel, sends a message, starts a loop or spends money needs the person's yes first.
- Keep a team to 8 panels or fewer. The app refuses a bundle with more than 12.
- Give each panel one clear role and one folder.
- For code, prefer one build panel and one review panel, linked and run as a loop.
- Triggers come in turned off. Tell the person to read each trigger's scope, then turn it on under Triggers.
- A panel's instructions from a team file are put in its composer on Create. They are not sent.

## Choosing an stm tool inside a panel

- `stm ask <panel> "question"`: a short question to a linked panel. Its answer comes back to you. Use it for a quick check, not for a long job.
- `stm send <panel> "text"`: leaves a message in another panel's composer. The person there presses send, unless auto-send is on for that link.
- `stm note append <name> "text"` and `stm note get <name>`: shared notes for one project folder. Use them to pass results between panels that do not talk directly.
- `stm spawn --prompt "text"`: opens a new panel linked to this one. Use it only with the person's yes.
- `stm loop <build> <review>`: a review loop. Start it from the person's terminal. It is refused inside a panel.

Run `stm whoami` and `stm panels` before you assume a panel exists or what it is called.

## References (load only when needed)

- `references/team-bundle.md`: the team file format, one full example and the validation rules.
- `references/roles.md`: six role recipes with instruction text to paste.
- `references/workflows.md`: four recipes: new project from a spec, bug fix with a review loop, nightly tests trigger, research then build.
