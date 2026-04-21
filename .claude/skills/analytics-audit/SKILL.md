---
name: analytics-audit
description: >
  auto-blog-wordpress 성과 분석 — GA4/GSC/AdSense 리포트, 저성과 포스트 감지, 콘텐츠 쇠퇴(decay) 분석,
  인덱싱 상태 확인, 트래픽 분석, 수익 분석, 성과가 어때, 어떤 포스트 잘 되고 있어, 저성과 포스트 찾아줘,
  인덱싱 확인해줘, AdSense 수익 확인 요청 시 반드시 이 스킬 사용.
---

# 성과 분석 스킬

## Step 1: 데이터 수집 방법 결정

실제 API 데이터가 필요한 경우 스크립트를 실행한다:

```bash
# 인덱싱 상태 확인
npx ts-node --esm src/scripts/check-indexing-status.ts

# 링크 점검
npx ts-node --esm src/scripts/check-broken-links.ts
npx ts-node --esm src/scripts/check-link-rot.ts
```

API 인증이 안 되면 로컬 데이터(`data/post-history.backup.json`)로 분석한다.

## Step 2: 포스트 성과 분석

`data/post-history.backup.json`에서 다음을 분석한다:

**저성과 기준:**
- `qualityScore` 55 미만
- 발행 후 7일 경과 & 조회수 미미
- 인덱싱 미완료

**콘텐츠 쇠퇴(decay) 기준:**
- 발행 후 90일 이상 경과
- 가격/데이터 등 시간 민감 정보 포함
- 관련 시장 상황 변화

## Step 3: 니치별 성과 비교

4개 니치별로 성과를 비교한다:
- 발행량 (목표: 니치당 주 5회)
- 평균 qualityScore
- 카테고리별 분포

## Step 4: 인덱싱 이슈 감지

다음 패턴의 포스트를 우선 인덱싱 요청 대상으로 선정한다:
- 발행 후 14일 이상 경과 & 미인덱싱
- high RPM 키워드 포함
- 업데이트 후 재인덱싱 필요

## Step 5: 산출물

`_workspace/analytics-report.md`에 기록:

```markdown
# 분석 리포트 — {날짜}

## 요약
- 분석 포스트 수: N개
- 저성과 포스트: N개 (재작성 필요)
- 인덱싱 대기: N개
- 콘텐츠 쇠퇴: N개 (갱신 필요)

## 니치별 성과
| 니치 | 발행 수 | 평균 qualityScore | 조치 |
|------|--------|-----------------|------|
...

## 즉시 조치 필요
{우선순위 높은 포스트 목록 + 권장 조치}
```

조치 목록은 site-maintenance 스킬로 전달한다.
