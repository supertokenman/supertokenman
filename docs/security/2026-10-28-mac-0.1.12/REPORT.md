# Mac proof of 0.1.12 failed: the update check went out direct (2026-10-28)

Run: proof-mac 40679328413, signed and notarized v0.1.12 on macOS 26.6.2 arm64, fresh profile, nobody at
the keyboard. Result: **FAILED**: "an app process connected to 172.182.252.133:443 (no name), which is
not in docs/NETWORK.md".

## What happened

- `processes.log`: the connecting process (pid 1677) is `SuperTokenMan Helper`, Chromium's network
  service, under the app (pid 1625). It is not Claude Code and not the stm CLI.
- `netlog.json`: 172.182.252.133 is github.com (the DNS answer). The connection carried electron-updater's
  first request, `GET https://github.com/supertokenman/supertokenman/releases.atom`. That request ran in
  the updater's own partition (`electron-updater`), which had just been created. Its proxy service
  resolved **DIRECT** from a `from_system` config, 2 ms before the `--proxy-server=127.0.0.1:8899` config
  reached it. Every later request (releases/latest, the tag page, latest-mac.yml, release-assets) went
  through the proxy.
- 0.1.11's proof (run 40605986334) ran the same update check: 28 github.com and 10 release-assets requests
  in the net log, all through the proxy. The same race was there and was won that time.
- `app.log` for both runs: "Checking for update", then "Update for version 0.1.x is not available".

No new feature reached the network. The update check did: it was on by default and ran at launch, and
this time one of its requests went around the proxy. github.com is listed in docs/NETWORK.md, but the
report saw only the bare address and could not match it to a listed host.

## Why CI did not catch it

The release check runs only in a packaged darwin build that carries `app-update.yml`. netwatch runs the
unpackaged app on Linux, so that path never ran in CI (docs/NETWORK.md said so).

## Fix (branch claude/fix-0.1.12-network)

- The automatic check is now opt-in: an unset `updateCheck` means off (`electron/updategate.ts`,
  `checkAllowed`). A fresh profile makes no GitHub request unless Appearance > Check for updates
  automatically is turned on, or the person presses Update.
- When it is on, the check waits 60 s after the window asks for it and reads the setting again. It never
  runs during launch.
- Before the check, the updater's partition reloads and resolves its proxy config. The first request
  should then follow the configured proxy; this is not yet confirmed on a Mac.
- netwatch now forces the release path (`STM_UPDATE_RELEASE_MODE=1`, 2 s wait). The app runs unpackaged
  there, so it makes the updater's first request itself with `net.fetch`. With the old default, netwatch
  fails on `net https://github.com/supertokenman/supertokenman/releases.atom`. With the fix it reports 0
  not allowed.
- `electron/updategate.test.ts` covers the opt-in, the wait and the gate in main.ts.

## Only a new Mac proof can confirm

- that the signed build makes no github.com request and no direct connection in the proof run;
- that, with the check turned on, its first request goes through the configured proxy.
