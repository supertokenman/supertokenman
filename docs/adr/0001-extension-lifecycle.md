# ADR 0001: Lifecycle for the app's own extensions

Status: accepted (design and interface only), phase 89.

## Context

The main process has grown to many features that start listeners, timers, child processes and IPC
handlers at load time and never release them. Turning a feature off today means restarting the app,
and a feature that half-starts can leave a timer or a process running.

## Decision

- An extension is `{ id, activate(scope), deactivate?() }` (`app/shared/extension.ts`).
- Everything it starts goes through its `Scope`: `on` (listeners), `every` / `after` (timers),
  `own(release)` (IPC handlers, processes, watchers, servers). The scope records how to release each one.
- `dispose` releases everything newest first, keeps going when one release throws, and reports which
  failed. A disposed scope refuses new work.
- An extension that throws while starting is disposed at once, so a half start leaves nothing.
- `Extensions.list()` shows what each extension still holds, for the Diagnostics screen later.

## Not decided here

- No third-party code. Loading outside extensions would need a sandbox (worker or utility process)
  and the typed IPC contract from phase 81; that is a separate decision.
- No marketplace, no settings UI. Existing features move to this shape one at a time, when touched.

## Consequences

- A leak test is cheap: count `held` before and after `dispose` (see `extension.test.ts`).
- Features that move here can be switched off without a restart.
