# Token benchmark

Compares the same tasks run under different app variants, recording tokens,
cost and pass rate per run. The variants are the old guide (A), the capability
card (B), terse inter-agent mode (C) and output condensing (D).

Layout:

- `run.mjs`: CLI runner and report printer.
- `tasks/*.json`: fixtures. Each has `id`, `title`, `prompt`, `setup.files`
  (path to content, written into a fresh temp dir) and `check`.
  - `{ "kind": "command", "run": "npm test" }`: passes when the command exits 0 in the task dir.
  - `{ "kind": "contains", "file": "<path>", "text": "<str>" }`: passes when the file contains the text.
    `"file": "@reply"` checks the final text reply of Claude instead of a file.
- `lib/variants.mjs`: the variants and the environment each one sets. `lib/variants.test.mjs` tests it.
- `lib/score.mjs`: pure scoring (`parseRecords`, `aggregate`, `compare`, `buildReport`, `formatReport`). No I/O.
- `lib/score.test.mjs`: unit tests. They never call `claude`.

## Running

Requires the `claude` CLI on PATH and Node 18+.

```sh
# one task or all, for each variant; results are appended to a JSONL file
node bench/run.mjs --variant A --task all --out results.jsonl
node bench/run.mjs --variant B --task all --out results.jsonl

# the variant can also come from the environment
BENCH_VARIANT=C node bench/run.mjs --task all --out results.jsonl

# print the comparison table (A = baseline, B = variant by default)
node bench/run.mjs --report results.jsonl
node bench/run.mjs --report results.jsonl --baseline B --compare C
```

Unit tests (they never call `claude`; there is no package.json here, so run them from the repository root):

```sh
node --test bench/lib/*.test.mjs
```

Options:

- `--task <id>` runs one fixture. `--keep` keeps the temp dir for inspection.
- `--extra-args "<flags>"` is appended to the `claude -p` call, for example to pre-approve tools
  (`--allowedTools "Bash Edit Write"`) if the default permissions block the fixtures.

Each run calls `claude -p <prompt> --output-format stream-json --verbose` with `cwd` set to the
task dir and no shell. The final `result` record supplies the usage fields and cost.
A run passes only when the check passes and a result record was produced.

## Variants

`--variant` (or `BENCH_VARIANT` when the flag is absent) is one of:

| Variant | App state |
| --- | --- |
| A | old guide: the previous system-prompt text for the app and its actions rule |
| B | capability card (the shipped default), terse and condensing off |
| C | B with terse inter-agent mode on |
| D | B with output condensing on |

Each variant differs from B in one thing. The runner sets `BENCH_VARIANT` and three variables in
the child environment, from `lib/variants.mjs`:

- `STM_PROMPT_VARIANT`: `old` or `card`.
- `STM_TERSE`: `1` or `0`, forcing the "Terse replies between agents" setting.
- `STM_CONDENSE`: `1` or `0`, forcing the "Condense long command output" setting.

The app reads them in `app/shared/variant.ts`, only when it is not packaged. A packaged build
ignores them, and with none set it uses the card and the person's own settings (both switches are
on by default). The runner calls `claude -p`, so a run measures the app only when that call goes
through the app's own panel session, for example from a development build. Without the app the
three variables change nothing and the runs are the same variant.

## Scoring

- Total tokens = input + output + cache read + cache write.
- `compare(A, B)` reports the percentage delta for each field and a verdict:
  - `reject`: B's pass rate is lower than A's.
  - `adopt`: B saves at least 10% of total tokens and its pass rate is not lower.
  - `no clear win`: anything else.

## Recorded runs

No numbers are claimed until a run is recorded here. None yet.
