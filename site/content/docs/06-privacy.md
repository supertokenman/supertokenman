---
title: Network and keys
summary: What the app sends, when, and where your keys live.
slug: privacy
---
The app sends nothing on its own except Claude Code itself. Everything else, the update check included,
waits until you turn it on or ask. The full list, and how it was checked, is on [Security and privacy](/security/).

## The vault

Tokens you save in **Connections** are encrypted on disk with a key macOS keeps in your Keychain.
The app shows their names, never the values.

## Updates

The app checks GitHub Releases when you press Update. Since 0.1.13 the automatic check is off on a new
install; turn it on in **Appearance**, Check for updates automatically, and it runs a minute after launch
and every 6 hours. It installs only when you say so.
