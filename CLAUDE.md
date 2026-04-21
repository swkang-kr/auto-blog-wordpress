# auto-blog-wordpress — 프로젝트 가이드

## 프로젝트 개요

한국 주식시장 특화 AI 자동 블로그 시스템. Trade Engine DB 데이터 기반으로 매일 4개 니치(시장분석/업종분석/테마분석/종목분석) 포스트를 자동 생성하여 WordPress에 발행하고 SNS에 배포한다.

- **스택**: TypeScript (ESM), Node.js, WordPress REST API, Claude API, Gemini API
- **실행**: GitHub Actions (`daily-post.yml`) — 매일 자동 실행
- **니치**: 시장분석 / 업종분석 / 테마분석 / 종목분석 (각 niches.ts 참조)

## 코딩 컨벤션

- 서비스 파일: `kebab-case.service.ts`, 클래스명 `PascalCase`
- 타입: `PascalCase`, `src/types/index.ts`에 집중 관리
- 환경변수: `UPPER_SNAKE_CASE`, `src/config/env.ts`에 Zod 스키마로 검증
- ESM import: 경로에 `.js` 확장자 필수
- 코드 변경 후 항상 `npx tsc --noEmit` 실행

## 사용자 선호 사항

- commit, push, 배치 실행 등은 묻지 않고 자동으로 진행한다

---

## 하네스: auto-blog-wordpress

**목표:** 콘텐츠 생성 파이프라인 + SEO 성과 분석 + 사이트 유지보수를 에이전트 팀으로 자동화

**에이전트 팀:**
| 에이전트 | 역할 |
|---------|------|
| `pipeline-runner` | 콘텐츠 파이프라인 실행 (키워드→생성→발행→SNS) |
| `content-strategist` | 니치 분석, 키워드 기회, Trade Engine 데이터 기반 전략 |
| `analytics-monitor` | GA4/GSC/AdSense 성과 분석, 저성과/쇠퇴 감지 |
| `site-ops` | 유지보수 스크립트 실행, 코드 수정, 배치 작업 |

**스킬:**
| 스킬 | 용도 | 트리거 상황 |
|------|------|-----------|
| `auto-blog-orchestrator` | 전체 워크플로우 조율 | "전체 작업", "오늘 할 일", 복합 작업 요청 |
| `run-pipeline` | 배치/파이프라인 실행 | "배치 실행", "포스트 생성", "npm start" |
| `content-strategy` | 콘텐츠 전략 분석 | "키워드 추천", "어떤 주제", "콘텐츠 아이디어" |
| `analytics-audit` | 성과 분석 리포트 | "성과 분석", "저성과 포스트", "트래픽 확인" |
| `site-maintenance` | 유지보수 스크립트 | "스크립트 실행", "코드 수정", "고쳐줘" |

**실행 규칙:**
- 복합 작업(생성+분석, 분석+유지보수 등) → `auto-blog-orchestrator` 스킬로 에이전트 팀 처리
- 단일 작업 → 해당 개별 스킬 직접 사용
- 단순 질문/확인은 에이전트 팀 없이 직접 응답
- 모든 에이전트는 `model: "opus"` 사용
- 중간 산출물: `_workspace/` 디렉토리

**디렉토리 구조:**
```
.claude/
├── agents/
│   ├── pipeline-runner.md
│   ├── content-strategist.md
│   ├── analytics-monitor.md
│   └── site-ops.md
└── skills/
    ├── auto-blog-orchestrator/SKILL.md
    ├── run-pipeline/SKILL.md
    ├── content-strategy/SKILL.md
    ├── analytics-audit/SKILL.md
    └── site-maintenance/SKILL.md
```

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-04-08 | 초기 구성 | 전체 | 전체 통합 하네스 신규 구축 |
