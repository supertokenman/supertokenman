#!/usr/bin/env bash
# Installs token-kit into this machine's ~/.claude. Passes options through to `tk install`, e.g. ./install.sh --claude-md
set -euo pipefail
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Requires Node 18+ on PATH." >&2; exit 1; }
node bin/tk.mjs install "$@"
