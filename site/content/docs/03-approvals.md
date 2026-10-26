---
title: Approvals and isolation
summary: Decide what Claude may run, and keep a panel away from the network and your keys.
slug: approvals
---
## Approvals

Before a tool runs, the panel shows a card with the tool and what it will do, for example the command
for Bash or the diff for an edit. Choose **Allow** or **Deny**.

A persona can be allowed to run safe commands alone. Anything else still asks.

## Isolation

**Isolate** in the panel header moves Claude's commands into a Docker container that sees only the
panel's folder, with no network and none of the app's keys. Files it changes are changed in the folder
too. It needs Docker on your Mac.

## Trim tools

**Trim tools**, next to Isolate, turns off the tools a task does not need, so Claude cannot reach them.
