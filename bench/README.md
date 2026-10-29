# Token benchmark

Compares the same tasks run with a feature off (variant A) and on (variant B),
recording tokens, cost and pass rate per run. Examples of features: capability
card vs old guide, terse inter-panel mode, token-kit hooks.

Layout:

- `run.mjs`: CLI runner and report printer.
- `tasks/*.json`: fixtures. Each has `id`, `title`, `prompt`, `setup.files`
  (path to content, written into a fresh temp dir) and `check`.
  - `{ "kind": "command", "run": "npm test" }`: passes when the command exits 0 in the task dir.
  - `{ "kind": "contains", "file": "<path>", "text": "<str>" }`: passes when the file contains the text.
    `"file": "@reply"` checks the final text reply of Claude instead of a file.
- `lib/score.mjs`: pure scoring (`parseRecords`, `aggregate`, `compare`, `buildReport`, `formatReport`). No I/O.
- `lib/score.test.mjs`: unit tests. They never call `claude`.

## Running

Requires the `claude` CLI on PATH and Node 18+.

```sh
# one task or all, for each variant; results are appended to a JSONL file
node bench/run.mjs --variant A --task all --out results.jsonl
node bench/run.mjs --variant B --task all --out results.jsonl

# print the comparison table (A = baseline, B = variant)
node bench/run.mjs --report results.jsonl
```

Options:

- `--task <id>` runs one fixture. `--keep` keeps the temp dir for inspection.
- `--extra-args "<flags>"` is appended to the `claude -p` call, for example to pre-approve tools
  (`--allowedTools "Bash Edit Write"`) if the default permissions block the fixtures.

Each run calls `claude -p <prompt> --output-format stream-json --verbose` with `cwd` set to the
task dir and no shell. The final `result` record supplies the usage fields and cost.
A run passes only when the check passes and a result record was produced.

## Variants

The runner sets `BENCH_VARIANT` to `A` or `B` in the child environment. The
application under test reads this variable to switch the feature:

- `A`: baseline, feature off.
- `B`: variant, feature on.

The hooks are not implemented here. The app must read `BENCH_VARIANT` itself.

## Scoring

- Total tokens = input + output + cache read + cache write.
- `compare(A, B)` reports the percentage delta for each field and a verdict:
  - `reject`: B's pass rate is lower than A's.
  - `adopt`: B saves at least 10% of total tokens and its pass rate is not lower.
  - `no clear win`: anything else.

## Recorded runs

No numbers are claimed until a run is recorded here. None yet.
