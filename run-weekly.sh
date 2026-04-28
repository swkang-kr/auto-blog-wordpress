#!/bin/bash
# run-weekly.sh
# 매주 금요일 장 마감 후 실행: 주간 매매 결산 포스트 생성 (Phase A) → GitHub 커밋 → Phase B (GH Actions) 트리거

set -euo pipefail

export PATH="/home/trendhunt/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

REPO="/home/trendhunt/workspace/auto-blog-wordpress"
DATE=$(TZ=Asia/Seoul date '+%Y-%m-%d')
LOG="$REPO/logs/weekly-${DATE}.log"

mkdir -p "$REPO/logs"
echo "=== $(date '+%Y-%m-%d %H:%M:%S KST') 주간 결산 Phase A 시작 ===" >> "$LOG"

cd "$REPO"
git pull --ff-only >> "$LOG" 2>&1 || true

# Phase A: 주간 포스트 생성 (trade-engine 데이터 기반)
node --env-file=.env --import tsx/esm src/scripts/weekly-post.ts >> "$LOG" 2>&1

WEEKLY_FILE="data/generated/weekly-${DATE}.json"
if [ ! -f "$WEEKLY_FILE" ]; then
  echo "ERROR: $WEEKLY_FILE 없음 — Phase A 실패" >> "$LOG"
  exit 1
fi

echo "Phase A 완료: $WEEKLY_FILE" >> "$LOG"

# 생성된 JSON 커밋 & 푸시
git add "$WEEKLY_FILE" >> "$LOG" 2>&1
git diff --staged --quiet || git commit -m "feat: weekly trading summary ${DATE} [skip ci]" >> "$LOG" 2>&1
git push >> "$LOG" 2>&1 || true

# Phase B: GitHub Actions에서 WordPress 발행
gh workflow run weekly-post.yml \
  --repo swkang-kr/auto-blog-wordpress \
  --field date="${DATE}" >> "$LOG" 2>&1

echo "=== Phase B 트리거 완료 ===" >> "$LOG"
