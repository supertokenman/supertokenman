# SuperTokenMan

English · [Português (Brasil)](README.pt-BR.md) · [Español](README.es.md)

A Mac app around Claude Code: several panels side by side, tool approvals in the window, and a meter that
shows what a session costs and what the app kept out of the context. It runs Claude Code through the
Agent SDK with your own login, settings, plugins and hooks.

Site: https://supertokenman.com

## Download

Signed and notarized builds for Apple silicon and Intel are on
[Releases](https://github.com/supertokenman/supertokenman/releases), each with a `SHA256SUMS`. To check a download:

```bash
shasum -a 256 -c SHA256SUMS --ignore-missing
codesign --verify --deep --strict --verbose=2 /Applications/SuperTokenMan.app
spctl -a -vv /Applications/SuperTokenMan.app      # "source=Notarized Developer ID"
```

## Build from source

```bash
cd app && npm install && npm start
```

Details, tests and the Mac install script: [app/README.md](app/README.md).

## What is in this repository

| Folder | What |
|---|---|
| `app/` | The Electron app (React, Vite, the Claude Agent SDK). |
| `token-kit/` | `tk`: the shell hooks and condenser the app uses to keep long output out of the context. |
| `site/` | The landing page (static). |
| `docs/` | Brand and design notes, release steps, what was left out of each phase and why. |

## Privacy and safety, in short

- Your Claude login, API keys and passwords stay on your Mac, in the system keychain; panels get only
  the names you mark for commands.
- Nothing posts, sends, deploys or publishes without your click and a confirm.
- No telemetry. On its own the app reaches only Claude Code's endpoint and the update check; everything
  else waits until you turn it on. The list: [docs/NETWORK.md](docs/NETWORK.md).

Reporting a security problem: [SECURITY.md](SECURITY.md).

## License

[FSL-1.1-ALv2](LICENSE.md), © 2026 Yuji Miguel Arima. You may read, audit, build, change and use the
code for anything except a competing commercial product. Each version becomes Apache 2.0 two years after
its release.
