<!-- token-kit:start -->
## Context economy (token-kit)

- Locate before reading: Grep/Glob first, then Read with offset/limit. Do not re-read files that have not changed.
- Output marked `[token-kit] condensed output ... Full output: <file>` already keeps the errors and the summary; for details, grep/sed that file. To get raw output, end the command with `# tk:raw`.
- Prefer quiet flags (`-q`, `--silent`, `--reporter=dot`) and filters (`| tail`, `| grep`) on verbose commands.
- In replies, cite `file:line` instead of pasting long excerpts; do not repeat code you just wrote.
- Use a subagent only for large, independent work; give it an exact scope and files.
<!-- token-kit:end -->
