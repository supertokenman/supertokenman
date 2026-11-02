Fixes from 0.1.26, a clearer tray, and an optional browser for the panel agent.

- Fixed: the message box in a new panel was not usable until Claude Code finished setting up. You
  can type at once again; the message is sent as soon as it is ready.
- Fixed: a lead panel's messages to its workers now show in the worker panels, and fail within
  seconds with a clear error instead of hanging.
- Fixed: a panel could appear twice when the app started.
- The tray is easier to read, and costs are shown in US dollars by default. You can change the
  currency in Settings.
- New, off by default: a browser pane the panel agent can drive, with a project's own profile.
  It asks before visiting each new site, and you can take over at any time. Turn it on in Settings.

SuperTokenMan for macOS (Apple silicon and Intel), signed with a Developer ID and notarized by Apple.
Check the download:

    shasum -a 256 -c SHA256SUMS --ignore-missing
    gh attestation verify SuperTokenMan-arm64.dmg --repo supertokenman/supertokenman
