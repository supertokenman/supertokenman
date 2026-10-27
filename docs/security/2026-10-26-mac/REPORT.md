# Mac proof, first run: SuperTokenMan 0.1.3

Run by the owner on macOS 26.6, arm64, 2026-10-26 22:04 UTC, with
`app/scripts/proof-mac.sh --mitm`: the released app from GitHub, its own profile, every
connection of the app and its child processes sampled with `lsof`, and HTTPS read through
mitmproxy.

**Result: partial.** The download checks pass and the decoy secret was not found anywhere. But the
recorded traffic has no Claude Code turn in it, so this run does not show what happens to the vault
while Claude runs a command. A second run is needed for that (below).

## The download

```
SuperTokenMan-arm64.dmg: OK                      (SHA256SUMS)
codesign: valid
SuperTokenMan.app: accepted
source=Notarized Developer ID
origin=Developer ID Application: YUJI ARIMA (6YJ97VWT8V)
```

## Connections (lsof)

| Address | Port | Owner (whois) | Process |
|---|---|---|---|
| 4.228.31.150 | 443 | MSFT (GitHub runs on Azure) | SuperTokenMan |

Loopback is left out, so traffic sent to the proxy on 127.0.0.1 shows only in the mitm list below.

## Requests (mitmproxy)

All four recorded requests, from `mitmdump -nr flows.mitm`:

| Request | Answer | What it is |
|---|---|---|
| GET github.com/supertokenman/supertokenman/releases/... | 302 | update check, `latest-mac.yml` |
| GET github.com/supertokenman/supertokenman/releases/... | 200, 300 B | the same, after the redirect |
| GET github.com/supertokenman/supertokenman/releases/... | 302 | the same |
| GET release-assets.githubusercontent.com/... | 200, 821 B | `latest-mac.yml` itself (821 B, the size of the 0.1.3 file) |

This is the update check listed in `docs/NETWORK.md` ("at launch and every 6 hours"). Nothing else
was sent while the app ran: no telemetry, no server of ours. The recording ends in the run's first
minute (`flows.mitm`, 44 KB, last written 18:53 local time).

## The decoy secret

A value made for this run was put in the vault as DECOY_KEY.

- On disk, in this run's profile and in `~/.claude`, outside `decoy.txt`: not found.
- In the recorded traffic: not found.

## What this run does not show

- **No Claude Code traffic was recorded**: no request to Anthropic at all. Either no message was sent
  in a panel during the run, or Claude Code's traffic did not go through the proxy. In both cases
  the vault "for commands" path was not exercised, so the decoy result above covers only the app at
  rest.
- A sample twice a second can miss a connection that opens and closes in between.
- Traffic that refuses the proxy would show in `lsof` by address only; none did here.

## Next run

`bash app/scripts/proof-mac.sh --mitm --minutes 5` on 0.1.5, and in the app, in this order: add
DECOY_KEY with "for commands" on, open a panel, send "run echo hello and tell me the date", approve
the command. The report should then list api.anthropic.com, and the decoy check covers a real turn.
