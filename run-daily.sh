#!/bin/bash
set -euo pipefail

export PATH="/home/trendhunt/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

REPO="/home/trendhunt/workspace/auto-blog-wordpress"
LOG="$REPO/logs/daily-post-$(date '+%Y-%m-%d').log"

mkdir -p "$REPO/logs"

echo "=== $(date '+%Y-%m-%d %H:%M:%S KST') ===" >> "$LOG"

cd "$REPO"

# Pull latest code
git pull --ff-only >> "$LOG" 2>&1 || true

# Run pipeline
node --env-file=.env --import tsx/esm src/index.ts >> "$LOG" 2>&1

# Commit updated post history
git add data/post-history.json .cache/ 2>/dev/null || true
git diff --staged --quiet || git commit -m "chore: update post history [skip ci]" >> "$LOG" 2>&1
git push >> "$LOG" 2>&1 || true

echo "=== done ===" >> "$LOG"
