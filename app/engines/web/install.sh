#!/bin/sh
# One-time setup of the web reader: a private Python environment with Crawl4AI and its browser
# (about 450 MB). Crawl4AI is Apache-2.0: https://github.com/unclecode/crawl4ai
set -e
cd "$(dirname "$0")"
python3 -m venv .venv
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -r requirements.txt
.venv/bin/crawl4ai-setup
echo "web reader ready"
