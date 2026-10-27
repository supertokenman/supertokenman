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
  the "Commands can read it" path was not exercised, so the decoy result above covers only the app at
  rest.
- A sample twice a second can miss a connection that opens and closes in between.
- Traffic that refuses the proxy would show in `lsof` by address only; none did here.

## Second run: 0.1.5, 2026-10-27 11:17 UTC

Same script with `--mitm`, five minutes. DECOY_KEY was added in Connections > Vault with "Commands
can read it" ticked, and a panel was asked "run echo hello and tell me the date".

- Download: SHA256SUMS OK, codesign valid, notarization accepted (same Developer ID).
- Connections outside loopback (lsof): **none**. Every connection of the app and its processes went
  to the local proxy; nothing went around it.
- Requests read through mitmproxy: the update check only (four GETs to github.com releases, one to
  release-assets.githubusercontent.com).
- The Claude turn **failed**: the panel showed "SSL certificate verification failed
  (UNABLE_TO_VERIFY_LEAF_SIGNATURE)". The bundled Claude Code refused the proxy's certificate,
  although the script passed it in `NODE_EXTRA_CA_CERTS`. Its request was sent to the proxy and
  went no further, so no message reached Anthropic and the command never ran.
- Decoy: not found on disk, not found in the recorded traffic.

So the vault path for commands is still not exercised. Why the bundled Claude Code does not take the
extra certificate is open: being checked by running it alone through the proxy.

## Third run: 0.1.5 without the proxy, 2026-10-27 11:25 UTC

The same script without `--mitm`, so Claude Code worked (a panel answered). Destinations come from
`lsof`; content was not read.

| Address | Owner (whois) | Process | What it is |
|---|---|---|---|
| 160.79.104.10 | AP-2440 | claude | Anthropic's API range |
| 2607:6bc0::10 (claude.ai) | ANTHROPIC-V6 | claude | Anthropic |
| 104.18.24.159, 104.18.25.159, 2606:4700::6812:199f | Cloudflare | claude | not identified yet |
| 98.91.39.95 | Amazon EC2 | claude | not identified yet |
| 185.199.108.133 | GitHub | SuperTokenMan | update download host |
| 4.228.31.150 | Microsoft (GitHub) | SuperTokenMan | update check |

- The app itself (SuperTokenMan) connected to GitHub only: the update check in `docs/NETWORK.md`.
- Everything else was Claude Code. Two of its destinations are Anthropic. Four addresses, on
  Cloudflare and Amazon, have no name here: `lsof` shows addresses, not the host names asked for.
  They are not claimed as Anthropic until their names are known.
- Decoy: not found on disk. Traffic content was not read in this run.

## Fourth run: 0.1.5 with `--names`, 2026-10-27 11:35 UTC

Traffic through mitmproxy without opening TLS, so Claude Code kept working and each host name was
logged. lsof outside loopback: none, so nothing went around the proxy.

| Host | Connections | Whose | Why |
|---|---|---|---|
| api.anthropic.com | 2 | Anthropic | Claude Code: the messages |
| mcp-proxy.anthropic.com | 5 | Anthropic | Claude Code: MCP connectors of the claude.ai account it is signed in with |
| mcp.context7.com | 3 | Context7 | an MCP server the app turned on by default (see the correction below) |
| docs.mcp.cloudflare.com | 3 | Cloudflare | an MCP server the app turned on by default (see the correction below) |
| registry.npmjs.org | 1 | npm | `npx` starting one of those MCP servers |
| github.com, release-assets.githubusercontent.com | 2 | GitHub | the app's update check |
| play.googleapis.com | 2 | Google | **not identified**: two connections of about 0.13 s each at 08:33:46 local time, too short for the lsof sample; not called by the app's code |

This names the Cloudflare and Amazon addresses of the third run: the Context7 and Cloudflare docs MCP
servers, and Anthropic's MCP proxy.

**Correction (2026-10-27).** This run first put Context7 and Cloudflare docs down to the owner's own
Claude Code settings. That was wrong. The first CI proof (0.1.6, a clean runner with a fresh Claude
Code config) connected to both, too: the app turned these two integrations on by default for a new
profile, while `docs/NETWORK.md` said integrations reach the network only once turned on in
Connections. They are off by default from 0.1.7 on; a profile that already has them keeps its choice.

Decoy: this time the panel ran `echo hello` with DECOY_KEY readable by commands, and the value was
not found on disk afterwards. Content was not readable in this mode.

To tell whether play.googleapis.com comes from the window (Chromium) or from a process it starts, the
script now also records Chromium's net log (`--log-net-log`) and lists the hosts in it: a host there
is the window's; a host only in the proxy log is a child process's.

## Next run

To name the four addresses: `bash app/scripts/proof-mac.sh --names --minutes 5`, which sends traffic through mitmproxy without opening TLS, so Claude Code keeps working and every host name is logged. To read content too, once the certificate question is answered: `bash app/scripts/proof-mac.sh --mitm --minutes 5`. Or, to
exercise a real turn now, without reading its content: the same without `--mitm` (destinations from
lsof only). The script now also lists the hosts that refused the proxy's certificate. In the app, in this order: add
DECOY_KEY in Connections > Vault with "Commands can read it" ticked, open a panel, send "run echo hello and tell me the date", approve
the command. The report should then list api.anthropic.com, and the decoy check covers a real turn.
