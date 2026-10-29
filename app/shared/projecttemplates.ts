// New project from a template: one persona, a few skills and a CLAUDE.md, written into a folder in one
// step. Files that are already there are kept unless the person picks them to be replaced.

import { cleanPersona, toMarkdown, type Persona } from './personas.js'
import { skillMd } from './skilldraft.js'
import { PERSONA_DIR } from './projectfiles.js'

export type Skill = { name: string; description: string; body: string }
export type ProjectTemplate = { id: string; name: string; what: string; persona: Partial<Persona>; skills: Skill[]; claudeMd: string }
export type TemplateFile = { path: string; text: string }

const sk = (name: string, description: string, ...steps: string[]): Skill => ({ name, description, body: steps.map((s, i) => `${i + 1}. ${s}`).join('\n') })

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'web-app',
    name: 'Web app',
    what: 'A browser front end with an API behind it.',
    persona: { id: 'tpl-web-app', name: 'Web app builder', color: '#4f7cff', instructions: 'You build a web app. Keep components small, check every change in the browser preview, and run the tests before saying a task is done.' },
    skills: [
      sk('add-page', 'Add a page or screen to the web app.', 'Find how existing pages are routed and copy that pattern.', 'Build the page with the components already in the project.', 'Add a test for what the page shows.', 'Run the tests and open the page in the preview.'),
      sk('add-endpoint', 'Add an API endpoint.', 'Find an existing endpoint and follow its layout.', 'Validate the input; return clear errors.', 'Add a test for the success case and one failure.', 'Run the tests.'),
    ],
    claudeMd: '# Project\n\nA web app: front end and API.\n\n## How to work here\n\n- Read the README and package scripts before changing anything.\n- Run the tests after every change; fix what breaks before moving on.\n- Keep secrets out of the code; read them from the environment.\n- Small commits, one change each.\n',
  },
  {
    id: 'cli-tool',
    name: 'CLI tool',
    what: 'A command-line program with flags, help text and exit codes.',
    persona: { id: 'tpl-cli-tool', name: 'CLI builder', color: '#3fae6a', instructions: 'You build a command-line tool. Every command has help text, clear errors and a non-zero exit code on failure. Output is plain text by default and JSON with --json.' },
    skills: [
      sk('add-command', 'Add a subcommand to the CLI.', 'Add the command next to the existing ones, with its usage line in the help.', 'Fail with a short message and exit code 1 on bad input.', 'Add a test that runs the command.', 'Run the tests and the command once by hand.'),
      sk('release-notes', 'Write release notes from the commits since the last tag.', 'List the commits since the last tag with git log.', 'Group them as added, changed, fixed.', 'Write one line each, in plain words.'),
    ],
    claudeMd: '# Project\n\nA command-line tool.\n\n## How to work here\n\n- Keep the help text in sync with what each command does.\n- Errors go to stderr, results to stdout.\n- Run the tests after every change.\n',
  },
  {
    id: 'data-analysis',
    name: 'Data analysis',
    what: 'Notebooks or scripts that load data, check it and report findings.',
    persona: { id: 'tpl-data-analysis', name: 'Data analyst', color: '#e0a526', access: 'ask', instructions: 'You analyze data. Look at the data before drawing conclusions, say how many rows each number comes from, and never change the raw files.' },
    skills: [
      sk('profile-data', 'Profile a dataset before analysis.', 'Count rows and columns.', 'Report empty values, duplicates and odd ranges per column.', 'Write what you found to a short note next to the data.'),
      sk('write-findings', 'Write up the results of an analysis.', 'State the question first.', 'Give each finding with the number it rests on and how it was computed.', 'List what the data cannot tell.'),
    ],
    claudeMd: '# Project\n\nData analysis.\n\n## How to work here\n\n- Raw data is read only; write derived files to a separate folder.\n- Every chart and number says where it came from.\n- Prefer scripts that rerun from scratch over manual steps.\n',
  },
  {
    id: 'docs-site',
    name: 'Docs site',
    what: 'A documentation site written in Markdown.',
    persona: { id: 'tpl-docs-site', name: 'Docs writer', color: '#b05cff', instructions: 'You write documentation. Short sentences, one idea per paragraph, real commands that work. Check every link and code sample you add.' },
    skills: [
      sk('new-page', 'Add a page to the docs.', 'Find where similar pages live and how the navigation lists them.', 'Write the page: what it is for, the steps, an example.', 'Add it to the navigation.', 'Build the site and check the page and its links.'),
      sk('check-links', 'Find broken links in the docs.', 'List every link in the Markdown files.', 'Check that each local target exists.', 'Report the broken ones with file and line.'),
    ],
    claudeMd: '# Project\n\nA documentation site in Markdown.\n\n## How to work here\n\n- Write for someone new to the project.\n- Every code sample must run as written.\n- Build the site before saying a change is done.\n',
  },
]

export const projectTemplateById = (id: string) => PROJECT_TEMPLATES.find((t) => t.id === id) ?? null

export const templatePersona = (t: ProjectTemplate): Persona => cleanPersona(t.persona)

/** The files a template writes, with paths relative to the project folder. */
export function templateFiles(t: ProjectTemplate): TemplateFile[] {
  const p = templatePersona(t)
  return [
    { path: 'CLAUDE.md', text: t.claudeMd },
    ...t.skills.map((s) => ({ path: `.claude/skills/${s.name}/SKILL.md`, text: skillMd(s) })),
    { path: `${PERSONA_DIR}/${p.id}.md`, text: toMarkdown(p) },
  ]
}

/** Which files to write: new ones always, existing ones only when picked to be replaced. */
export function planFiles(files: TemplateFile[], exists: (path: string) => boolean, replace: string[] = []) {
  const write: TemplateFile[] = []
  const skip: string[] = []
  for (const f of files) {
    if (!exists(f.path) || replace.includes(f.path)) write.push(f)
    else skip.push(f.path)
  }
  return { write, skip }
}

export const planSummary = (r: { write: TemplateFile[]; skip: string[] }) =>
  `Wrote ${r.write.length} file${r.write.length === 1 ? '' : 's'}${r.skip.length ? `; kept ${r.skip.length} already there (${r.skip.join(', ')})` : ''}.`
