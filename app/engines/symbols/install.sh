#!/bin/sh
# One-time setup of Token Savior (MIT), the code index the panels can ask for one function, its
# callers or a symbol's place instead of reading whole files: a private Python environment.
# https://github.com/mibayy/token-savior. It needs Python 3.11 or newer; macOS ships 3.9.
set -e
cd "$(dirname "$0")"
PY=""
for p in python3.13 python3.12 python3.11 /opt/homebrew/bin/python3 /usr/local/bin/python3 python3; do
  if command -v "$p" >/dev/null 2>&1 && "$p" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' 2>/dev/null; then PY="$p"; break; fi
done
if [ -z "$PY" ]; then echo "Needs Python 3.11 or newer: brew install python" >&2; exit 1; fi
"$PY" -m venv .venv
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet "token-savior-recall[mcp]==4.24.0"
echo "symbols ready"
