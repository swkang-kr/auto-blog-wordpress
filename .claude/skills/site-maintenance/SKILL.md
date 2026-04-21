---
name: site-maintenance
description: >
  auto-blog-wordpress 사이트 유지보수 — 유지보수 스크립트 실행, 저성과 포스트 재작성, noindex 제거,
  인덱싱 요청, SEO 메타 수정, JSON-LD 수정, 깨진 링크 수정, 카테고리 정리, 포스트 재분류,
  코드 버그 수정, 서비스 파일 수정, 컴파일 오류 수정, 스크립트 돌려줘, 고쳐줘 요청 시 반드시 이 스킬 사용.
---

# 사이트 유지보수 스킬

## 사전 규칙

1. 스크립트 실행 전 **항상** 컴파일 검증한다:
   ```bash
   npx tsc --noEmit
   ```
2. 대량 삭제/수정 작업은 실행 전 사용자 확인을 받는다.
3. 코드 수정 후 반드시 컴파일 재검증한다.

## 스크립트 카탈로그

### SEO & 인덱싱
```bash
npx ts-node --esm src/scripts/remove-all-noindex.ts    # noindex 태그 제거
npx ts-node --esm src/scripts/request-indexing.ts       # GSC 인덱싱 요청
npx ts-node --esm src/scripts/request-indexing-all.ts  # 전체 인덱싱 요청
npx ts-node --esm src/scripts/check-indexing-status.ts # 인덱싱 상태 확인
npx ts-node --esm src/scripts/fix-seo-meta.ts          # SEO 메타 수정
npx ts-node --esm src/scripts/fix-titles.ts             # 제목 수정
npx ts-node --esm src/scripts/fix-jsonld.ts             # JSON-LD 수정
```

### 콘텐츠 관리
```bash
npx ts-node --esm src/scripts/refresh-stale-posts.ts         # 오래된 포스트 갱신
npx ts-node --esm src/scripts/rewrite-underperforming.ts     # 저성과 재작성
npx ts-node --esm src/scripts/reschedule-drafts.ts           # 드래프트 재스케줄
npx ts-node --esm src/scripts/recategorize-posts.ts          # 포스트 재분류
npx ts-node --esm src/scripts/cleanup-off-niche-posts.ts     # 니치 외 포스트 정리
npx ts-node --esm src/scripts/noindex-off-topic-posts.ts     # 주제 외 포스트 noindex
```

### 링크 & 사이트 구조
```bash
npx ts-node --esm src/scripts/check-broken-links.ts     # 깨진 링크 점검
npx ts-node --esm src/scripts/check-link-rot.ts         # 링크 부패 확인
npx ts-node --esm src/scripts/cleanup-empty-taxonomies.ts # 빈 분류체계 정리
npx ts-node --esm src/scripts/fix-post-urls.ts          # 포스트 URL 수정
```

### SNS & 배포
```bash
npx ts-node --esm src/scripts/share-social-bulk.ts     # 대량 SNS 공유
npx ts-node --esm src/scripts/backfill-sns.ts          # SNS 백필
npx ts-node --esm src/scripts/backfill-fb-linkedin.ts  # FB/LinkedIn 백필
```

## 코드 수정 컨벤션

수정이 필요한 경우 다음 컨벤션을 준수한다:
- 서비스 파일: `kebab-case.service.ts`, 클래스명은 `PascalCase`
- 타입: `PascalCase`, `src/types/index.ts`에 집중 관리
- 환경변수: `UPPER_SNAKE_CASE`, `src/config/env.ts`에 Zod 스키마로 추가
- ESM 모듈: import 경로에 `.js` 확장자 필수

## 결과 기록

`_workspace/ops-report.md`에 기록:
```markdown
# 운영 작업 보고서 — {날짜}

## 실행한 작업
| 스크립트 | 결과 | 처리 건수 |
|---------|------|---------|
...

## 수정한 코드
{파일명: 수정 내용}

## 잔여 이슈
{미해결 항목}
```
