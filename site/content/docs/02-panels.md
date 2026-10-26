---
title: Panels and worktrees
summary: Run several Claude Code sessions side by side without them writing over each other.
slug: panels
---
Each panel is its own Claude Code session, with its chat, its changes, its Git view and a terminal.
`Cmd T` opens a new panel.

## Worktrees

Two panels in the same repository would edit the same files. **New panel in a worktree** (from `Cmd K`)
gives the new panel its own Git worktree on its own branch, so each task stays apart until you merge it.

## Tasks

A task groups the panels that work on one thing, with one budget and one timeline. Close it with the
decision: merged, dropped, or what was learned.
