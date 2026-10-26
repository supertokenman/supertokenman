#!/bin/sh
# Copies the source at a commit of this private repo into the public repo supertokenman/supertokenman
# as one new commit, leaving out the internal notes. The private history never leaves this machine.
#   sh app/scripts/publish-public.sh [ref]      (default: origin/main)
set -eu

ref="${1:-origin/main}"
here="$(git rev-parse --show-toplevel)"
out="$(mktemp -d)/supertokenman"

git -C "$here" fetch -q origin main
git clone -q https://github.com/supertokenman/supertokenman.git "$out"
# replace the public tree with this one, keeping the public repo's .git
find "$out" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
git -C "$here" archive "$ref" | tar -x -C "$out" \
  --exclude research_notes --exclude reports --exclude site/index.old.html

for p in research_notes reports site/index.old.html; do
  if [ -e "$out/$p" ]; then echo "left in by mistake: $p" >&2; exit 1; fi
done

cd "$out"
git add -A
if git diff --cached --quiet; then echo "nothing new to publish"; exit 0; fi
git commit -q -m "Source as of $(git -C "$here" rev-parse --short "$ref")"
echo "Ready in $out:"
git show --stat --oneline HEAD | tail -3
printf 'Push to supertokenman/supertokenman now? [y/N] '
read -r ok
[ "$ok" = y ] && git push -q origin HEAD:main && echo "pushed"
