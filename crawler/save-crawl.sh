#!/usr/bin/env bash
# Save a crawl's data and state to main. Two crawls of different sites can finish close
# together, so this doesn't rebase: it takes whatever is on main now, lays this run's files
# over it, joins the two runs' counts in data/status.json, and tries again if main moved.
set -euo pipefail

changed=$( { git diff --name-only -- data state; git ls-files -o --exclude-standard -- data state; } | sort -u )
if [ -z "$changed" ]; then echo "No changes"; exit 0; fi

out="${RUNNER_TEMP:-/tmp}/crawl-out-$$"
mkdir -p "$out"
while IFS= read -r f; do mkdir -p "$out/$(dirname "$f")"; cp "$f" "$out/$f"; done <<< "$changed"

for try in 1 2 3 4 5; do
  git fetch -q origin main
  git reset -q --hard origin/main
  git clean -fdq -- data state
  while IFS= read -r f; do
    [ "$f" = "data/status.json" ] && continue
    mkdir -p "$(dirname "$f")"; cp "$out/$f" "$f"
  done <<< "$changed"
  # Another crawl may have saved its counts since this one started: keep both.
  [ -f "$out/data/status.json" ] && node crawler/merge-status.mjs "$out/data/status.json" data/status.json
  git add data state
  if git diff --cached --quiet; then echo "No changes"; exit 0; fi
  git commit -qm "Crawl $(date -u +%Y-%m-%d)"
  if git push -q origin HEAD:main; then echo "Saved on try $try"; exit 0; fi
  echo "main moved while saving; trying again"
  sleep $((try * 5))
done
echo "Couldn't save the crawl after 5 tries"; exit 1
