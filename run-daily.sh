#!/bin/bash
# run-daily.sh — GitHub Actions 트리거 전용
# 실제 파이프라인(WP API 호출)은 GH Actions에서 실행됩니다.
# IP 차단 방지: 모든 WordPress REST API 요청은 GH Actions IP에서 처리.

set -euo pipefail

export PATH="/home/trendhunt/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

REPO="/home/trendhunt/workspace/auto-blog-wordpress"
LOG="$REPO/logs/daily-post-$(date '+%Y-%m-%d').log"

mkdir -p "$REPO/logs"
echo "=== $(date '+%Y-%m-%d %H:%M:%S KST') ===" >> "$LOG"

cd "$REPO"

# Pull latest (trade-engine data + code)
git pull --ff-only >> "$LOG" 2>&1 || true

# GitHub Actions 워크플로우 트리거
gh workflow run daily-post.yml --repo swkang-kr/auto-blog-wordpress >> "$LOG" 2>&1
echo "daily-post.yml triggered via gh CLI" >> "$LOG"

echo "=== done ===" >> "$LOG"
