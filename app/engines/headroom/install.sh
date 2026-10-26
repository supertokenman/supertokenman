#!/bin/sh
# One-time setup of Headroom (Apache-2.0), the context compressor the app can put between its
# panels and Anthropic: a private Python environment with its proxy. https://github.com/headroomlabs-ai/headroom
set -e
cd "$(dirname "$0")"
python3 -m venv .venv
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet "headroom-ai[proxy]"
echo "headroom ready"
