# Team bundle format

A team bundle is one Markdown file. It lists panels, the links between them and the triggers that start them. The app reads it with `stm team import <file>` (run from the person's terminal) and shows a review sheet. Nothing is created until the person presses Create.

## Layout

```
# Team: <name>

<description, any prose up to the first ## section>

## Panel: <name>
- folder: <relative folder, default .>
- persona: <optional persona id>

<instructions: prose, up to 8000 characters>

## Link: <panel A> <-> <panel B>
- auto: yes | no
- cap: <optional dollar amount, for example 2 or $2>

## Trigger: <name>
- panel: <panel name>
- when: <schedule, as the app shows it>
- read: <relative folder>      (repeat the line for each folder)
- write: <relative folder>
- commands: <command>          (repeat the line for each command)

<prompt the trigger sends>
```

Metadata lines are the `- key: value` lines directly under a section heading. They end at the first blank line. Everything after that is prose.

## Example: web app

```
# Team: Shop web app

Three panels for a small web shop: an API, a storefront and a reviewer.
The API and the storefront are built by their own panels. The reviewer checks what they report.
After Create, start the review loop from your own terminal:
  stm loop api reviewer --rounds 3 --max-usd 2
The loop is not in this file. It is started by hand.

## Panel: api
- folder: api
- persona:

Build the REST API in this folder. Keep handlers small. Run the tests before you report.
Report what changed and which tests passed.

## Panel: web
- folder: web
- persona:

Build the storefront. It calls only the routes the API panel documents.
Do not edit files in the api folder.

## Panel: reviewer
- folder: .
- persona:

Review the work the api and web panels report. If it is done and correct, put APPROVED on its own line.
Otherwise list the fixes, most important first, and nothing else.

## Link: api <-> web
- auto: no
- cap: 2

## Link: api <-> reviewer
- auto: no
- cap: 1

## Trigger: Nightly API tests
- panel: api
- when: Every day at 02:00
- read: api
- write: api
- commands: npm test

Run the API test suite. Report each failing test by name with its first error line.
Do not change any file.
```

What the import sheet will show for this file: three panels, two links that wait (auto is no), and one trigger that comes in turned off with its scope kept.

## Validation rules

The import reads the file and refuses it with a plain message when a rule fails.

- The file needs a `# Team: <name>` heading and a non-empty name.
- Only `## Panel:`, `## Link:` and `## Trigger:` sections are allowed. Any other `## ` heading is an error.
- Panel names must be unique. A panel needs a name.
- A panel folder must be relative. It may not start with `/`, `~` or a drive letter, and it may not contain `..`. An empty folder means `.`.
- A panel needs at least one section. The team may hold at most 12 panels.
- A panel's instructions are cut to 8000 characters on import, without a warning. Keep them shorter.
- A link needs two panel names separated by `<->`. Both must exist in the team and must differ.
- A link's `auto` is `yes` or `no`. Empty means `no`. `auto: yes` starts that link on its own, so check it on the sheet.
- A link's `cap` is a dollar amount of zero or more, with an optional leading `$`. Empty means no cap.
- A trigger needs a name and a `panel` that exists in the team.
- Trigger `read` and `write` folders follow the same relative-path rule as panel folders.
- Trigger `when` is free text. The app reads the schedule in its own wording. If it cannot read it, the trigger comes in with its default schedule, still turned off.
- A trigger's gate and webhook settings are not in the file. Set them in the app if needed.
- Escaping: a prose line that starts with `# ` or `## ` is written with a backslash in front. On import the backslash is removed. To keep a literal heading-looking line, write it with one extra backslash.
- Triggers always come in turned off.
