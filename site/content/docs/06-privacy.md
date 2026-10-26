---
title: Network and keys
summary: What the app sends, when, and where your keys live.
slug: privacy
---
The app sends nothing on its own except Claude Code itself and the update check. Everything else waits
until you turn it on. The full list, and how it was checked, is on [Security and privacy](/security/).

## The vault

Tokens you save in **Connections** are encrypted on disk with a key macOS keeps in your Keychain.
The app shows their names, never the values.

## Updates

The app checks GitHub Releases at launch and every 6 hours and installs only when you say so. Turn the
check off in **Appearance**, Check for updates automatically.
