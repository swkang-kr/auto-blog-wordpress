---
name: run-pipeline
description: >
  auto-blog-wordpress 콘텐츠 파이프라인 실행 — 배치 실행, 포스트 생성, 특정 니치 실행, 파이프라인 재실행, 파이프라인 부분 실행,
  npm start, 콘텐츠 생성 시작, 배치 돌려줘, 오늘 포스트 생성, 니치별 실행 요청 시 반드시 이 스킬 사용.
  단, analytics-audit(성과 분석)이나 site-maintenance(스크립트 실행)만 요청하면 해당 스킬 사용.
---

# 콘텐츠 파이프라인 실행 스킬

파이프라인을 실행하기 전 다음 순서로 진행한다.

## Step 1: 사전 검증

```bash
# 컴파일 오류 확인
npx tsc --noEmit

# 현재 배치 상태 확인
cat data/batch-sla.json
```

오류가 있으면 site-maintenance 스킬로 수정하고 다시 시작한다.

## Step 2: 실행 모드 결정

| 요청 유형 | 실행 명령 |
|----------|---------|
| 전체 배치 | `npm start` |
| 특정 니치만 | 코드에서 `NICHES` 배열 임시 수정 후 실행 |
| 단일 포스트 테스트 | `npx ts-node --esm src/index.ts` (1개 니치만 활성화) |

## Step 3: 실행 및 모니터링

실행 중 로그에서 다음 항목을 모니터링한다:
- `[ERROR]` — 즉시 기록, 가능하면 재시도
- `[WARN]` — 기록하고 계속 진행
- 포스트 ID — 성공적으로 발행된 포스트

## Step 4: 결과 기록

`_workspace/pipeline-result.json`에 다음 형식으로 기록한다:

```json
{
  "executedAt": "ISO-8601",
  "niches": ["market-analysis", "sector-analysis"],
  "posts": [
    { "nicheId": "market-analysis", "postId": 123, "title": "...", "status": "published" }
  ],
  "errors": [
    { "nicheId": "theme-analysis", "error": "API timeout", "step": "content-generation" }
  ],
  "duration": "12m 34s"
}
```

## 자주 발생하는 문제

**Claude API 429 (Rate Limit)**: 자동 재시도 로직이 있으므로 대기한다.

**WordPress 중복 감지**: 정상 동작이다. 해당 포스트를 스킵하고 다음으로 진행한다.

**이미지 생성 실패**: 기본 이미지 URL로 폴백되므로 포스트 발행은 계속된다.
