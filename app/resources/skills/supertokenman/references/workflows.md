# Workflow recipes

Each recipe lists steps and a team bundle sketch. Sketches follow `team-bundle.md`. Anything that creates, sends or spends needs the person's yes first.

## 1. New project from a spec

Steps:

1. Read the spec. Pick at most 8 panels, one role and one folder each (see `roles.md`).
2. Write the team file as a draft. Check it against the validation rules in `team-bundle.md`.
3. Call `mcp__stm__team_plan` with the bundle (and `loop`, `capUsd` if wanted). Show the person the plan: panels, links (which wait and which start on their own), the loop and its cap, triggers.
4. Adjust the bundle with their answers and plan again.
5. Call `mcp__stm__team_provision` with the same arguments. The person picks the parent folder and presses Create in the review sheet. It makes the panels, links and triggers (off) and starts the loop with its cap. Terminal alternative: the person runs `stm team import <file>` and starts any loop by hand.
6. Send the spec to the build panel with `stm send` or tell the person to; the first message waits in the composer.
7. The person turns on triggers one at a time under Triggers, after reading each scope.

Bundle sketch:

```
# Team: <project>

Spec: <one line>. Build panels first, then the review loop.

## Panel: api
- folder: api
- persona:

<build instructions>

## Panel: web
- folder: web
- persona:

<build instructions>

## Panel: reviewer
- folder: .
- persona:

<review instructions, APPROVED rule>

## Link: api <-> web
- auto: no
- cap: 2

## Link: api <-> reviewer
- auto: no
- cap: 1
```

## 2. Bug fix with a review loop

Steps:

1. Ask the person which folder has the bug. Use the existing build panel for it, or open one with `mcp__stm__panels_open`.
2. Open a reviewer panel for the same folder with `mcp__stm__panels_open`, and have the bug report sent to the build panel.
3. Call `mcp__stm__loop_start` with `build`, `review`, `rounds` (1 to 10, default 3) and `maxUsd` (above $0, at most $50, default $2). The person approves the card in the panel.
4. Each turn of the build panel goes to the reviewer. The reviewer replies APPROVED on its own line, or lists fixes. The loop stops on APPROVED, at the round limit or at the cap. Each panel gets a note with the reason.
5. Stop early with `stm loop stop <panel>`.
6. Read the last review in the reviewer panel. Decide what to commit yourself.

No bundle is needed for a single fix. Use the bundle only when the person wants the pair saved as a team.

Bundle sketch (optional):

```
# Team: Bug fix pair

Save the pair for reuse. Start the loop by hand after import.

## Panel: fix
- folder: app
- persona:

Fix the bug in the report. Run the tests before you report.

## Panel: reviewer
- folder: app
- persona:

Review the fix. APPROVED on its own line when it is correct; otherwise list fixes, most important first.

## Link: fix <-> reviewer
- auto: no
- cap: 1
```

## 3. Nightly tests trigger

Steps:

1. Confirm the test command with the person. Only commands in the trigger's `commands` line can run under its scope.
2. Write the team file with one panel and one trigger. Keep read and write folders narrow.
3. Plan it with `mcp__stm__team_plan`, then `mcp__stm__team_provision`; the person presses Create. The trigger arrives turned off. For a trigger on a panel that is already open, `mcp__stm__trigger_create` does the same after the person approves its card.
4. The person reads the trigger's scope under Triggers, turns it on, and optionally runs it once with `stm triggers run <id>` to test it.
5. Check the next day's report in the panel.

Bundle sketch:

```
# Team: Nightly tests

One panel that runs the API test suite every night.

## Panel: api
- folder: api
- persona:

Run the test suite. Report each failing test by name with its first error line.

## Trigger: Nightly API tests
- panel: api
- when: Every day at 02:00
- read: api
- write: api
- commands: npm test

Run the API test suite. Report failures. Do not change any file.
```

The `when` wording must match what the app shows under Triggers. If it does not, the trigger comes in with the default schedule, still off.

## 4. Research then build

Steps:

1. The person states the question and the folder for the build.
2. Open a researcher panel and a builder panel (`mcp__stm__team_provision`, or `mcp__stm__panels_open` twice) and link them with `mcp__stm__link`: `auto` false and a small `capUsd`.
3. The researcher writes findings to a shared note: `stm note append <name> "text"`. Each point has a source.
4. The builder reads the note with `stm note get <name>` before it changes code.
5. If the builder needs a fact fast, it asks with `stm ask <researcher> "question"`. Answers come back as its next message.
6. Add a reviewer and start a loop once the builder has a first version.

Bundle sketch:

```
# Team: Research then build

Research writes shared notes. The builder reads them before it changes code.

## Panel: research
- folder: .
- persona:

Research the question in the task. Write findings with stm note append <name> "text", each with its source.
Do not change code.

## Panel: build
- folder: app
- persona:

Read the research note with stm note get <name> before you change code. Build the change. Run the tests before you report.

## Link: research <-> build
- auto: no
- cap: 1
```
