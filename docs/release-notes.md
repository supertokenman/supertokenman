Four changes that keep agents from running away with your time, money or keys.

- Loop detection: a panel's agent that repeats the same call 4 times in its last 6, takes turns
  between two calls, or hits the same error 3 times is paused, and the panel says what the repeats
  cost. Continue, or turn it off for that panel. On by default; settings in Settings > Appearance.
- `stm send` from your terminal now puts the message in the panel's composer, marked "From the
  command line", and the person there presses send. `--now` sends at once, as before.
- Secret guard: before a message is sent, the composer also warns when it carries a value saved in
  the vault, not only a pasted key. Auto-send panel links and `stm send --now` refuse a message that
  carries one.
- `stm eval`: runs the cases in `.supertokenman/evals.txt` on several models and effort levels and
  shows passed, cost and time for each, and the cheapest setting that passed them all. It prints the
  plan first and runs only with `--yes`, under a spend cap (`--max-usd`, default $1).

SuperTokenMan for macOS (Apple silicon and Intel), signed with a Developer ID and notarized by Apple.
Check the download:

    shasum -a 256 -c SHA256SUMS --ignore-missing
    gh attestation verify SuperTokenMan-arm64.dmg --repo supertokenman/supertokenman
