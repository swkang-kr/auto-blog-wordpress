#!/bin/bash
# run-daily.sh
# Phase A (콘텐츠 생성) 로컬 실행 → JSON 커밋 → Phase B (워드프레스 발행) GitHub Actions 트리거
# WP REST API 호출이 없으므로 IP 차단 없음.

set -euo pipefail

export PATH="/home/trendhunt/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
export GH_TOKEN="$(grep '^GH_TOKEN=' /home/trendhunt/workspace/auto-blog-wordpress/.env 2>/dev/null | cut -d= -f2-)"

REPO="/home/trendhunt/workspace/auto-blog-wordpress"
DATE=$(TZ=Asia/Seoul date '+%Y-%m-%d')
LOG="$REPO/logs/generate-${DATE}.log"

mkdir -p "$REPO/logs"
echo "=== $(date '+%Y-%m-%d %H:%M:%S KST') Phase A 시작 ===" >> "$LOG"

cd "$REPO"
git pull --ff-only >> "$LOG" 2>&1 || true

# Phase A: 콘텐츠 생성만 (GENERATE_ONLY=true → WP API 호출 없음)
GENERATE_ONLY=true node --env-file=.env --import tsx/esm src/index.ts >> "$LOG" 2>&1

GENERATED_FILE="data/generated/${DATE}.json"
if [ ! -f "$GENERATED_FILE" ]; then
  echo "ERROR: $GENERATED_FILE 없음 — Phase A 실패" >> "$LOG"
  exit 1
fi

echo "Phase A 완료: $GENERATED_FILE" >> "$LOG"

# 생성된 JSON + Shorts MP4 커밋 & 푸시
git add "$GENERATED_FILE" >> "$LOG" 2>&1
git add output/shorts/ >> "$LOG" 2>&1 || true
git diff --staged --quiet || git commit -m "feat: generated content + shorts ${DATE} [skip ci]" >> "$LOG" 2>&1
git push >> "$LOG" 2>&1 || true

# Phase B: GitHub Actions에서 워드프레스 발행 (rate limit 초과 시 최대 5회 재시도)
MAX_RETRY=5
RETRY_DELAY=120  # 2분 대기 후 재시도

for i in $(seq 1 $MAX_RETRY); do
  # set -e를 일시 해제: gh 명령 실패 시 스크립트 즉시 종료 방지
  set +e
  ERROR=$(gh workflow run publish-content.yml \
    --repo swkang-kr/auto-blog-wordpress \
    --field date="${DATE}" 2>&1)
  EXIT_CODE=$?
  set -e

  if [ $EXIT_CODE -eq 0 ]; then
    echo "=== Phase B 트리거 완료 (시도 ${i}/${MAX_RETRY}) ===" >> "$LOG"
    break
  fi

  echo "[WARN] Phase B 트리거 실패 (시도 ${i}/${MAX_RETRY}): $ERROR" >> "$LOG"

  if [ $i -eq $MAX_RETRY ]; then
    echo "[ERROR] Phase B 트리거 최종 실패 — 수동 실행 필요: gh workflow run publish-content.yml --field date=${DATE}" >> "$LOG"
    exit 1
  fi

  echo "[INFO] ${RETRY_DELAY}초 후 재시도..." >> "$LOG"
  sleep $RETRY_DELAY
done
