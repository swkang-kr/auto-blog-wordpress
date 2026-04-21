---
name: auto-blog-orchestrator
description: >
  auto-blog-wordpress 통합 오케스트레이터 — 콘텐츠 생성 + SEO 분석 + 사이트 운영을 에이전트 팀으로 처리.
  다음 상황에서 반드시 이 스킬 사용: 전체 워크플로우 실행, 오늘 블로그 작업 해줘, 전체 점검해줘,
  종합 리포트 만들어줘, 블로그 운영 자동화, 성과 분석 + 유지보수 함께, 배치 + 분석 함께,
  무엇부터 해야 해, 오늘 할 일, 다시 실행, 이전 결과 기반으로.
  단일 작업(배치 실행만, 분석만, 스크립트만)은 개별 스킬(run-pipeline, analytics-audit, site-maintenance) 사용.
---

# auto-blog-wordpress 통합 오케스트레이터

4개 전문 에이전트(pipeline-runner, content-strategist, analytics-monitor, site-ops)를 조율하여 블로그 운영 워크플로우를 실행한다.

## Phase 0: 컨텍스트 확인

`_workspace/` 디렉토리 존재 여부를 확인한다:

```
_workspace/ 없음           → 초기 실행
_workspace/ 있음 + 부분 요청 → 부분 재실행 (해당 에이전트만 재호출)
_workspace/ 있음 + 새 지시  → 새 실행 (_workspace를 _workspace_prev/로 이동)
```

## Phase 1: 전략 분석 (content-strategist)

content-strategist 에이전트를 실행하여 오늘의 콘텐츠 방향을 결정한다.

**에이전트 호출:**
```
Agent(
  description: "콘텐츠 전략 분석",
  subagent_type: "general-purpose",
  model: "opus",
  prompt: """
    .claude/agents/content-strategist.md를 읽고 역할을 수행한다.
    content-strategy 스킬(.claude/skills/content-strategy/SKILL.md)을 읽고 절차를 따른다.
    오늘 날짜: {날짜}
    결과를 _workspace/content-strategy.md에 저장한다.
  """
)
```

산출물: `_workspace/content-strategy.md`

## Phase 2: 파이프라인 실행 (pipeline-runner)

Phase 1 결과를 반영하여 콘텐츠를 생성하고 발행한다.

**에이전트 호출:**
```
Agent(
  description: "콘텐츠 파이프라인 실행",
  subagent_type: "general-purpose",
  model: "opus",
  prompt: """
    .claude/agents/pipeline-runner.md를 읽고 역할을 수행한다.
    run-pipeline 스킬(.claude/skills/run-pipeline/SKILL.md)을 읽고 절차를 따른다.
    _workspace/content-strategy.md의 우선순위를 참조한다.
    결과를 _workspace/pipeline-result.json에 저장한다.
  """
)
```

산출물: `_workspace/pipeline-result.json`

## Phase 3: 성과 분석 (analytics-monitor)

Phase 2 결과 + 기존 데이터를 분석하여 성과를 평가한다.

**에이전트 호출:**
```
Agent(
  description: "성과 분석",
  subagent_type: "general-purpose",
  model: "opus",
  prompt: """
    .claude/agents/analytics-monitor.md를 읽고 역할을 수행한다.
    analytics-audit 스킬(.claude/skills/analytics-audit/SKILL.md)을 읽고 절차를 따른다.
    _workspace/pipeline-result.json을 입력으로 활용한다.
    결과를 _workspace/analytics-report.md에 저장한다.
  """
)
```

산출물: `_workspace/analytics-report.md`

## Phase 4: 유지보수 작업 (site-ops)

Phase 3에서 식별된 이슈를 처리한다.

**에이전트 호출:**
```
Agent(
  description: "사이트 유지보수",
  subagent_type: "general-purpose",
  model: "opus",
  prompt: """
    .claude/agents/site-ops.md를 읽고 역할을 수행한다.
    site-maintenance 스킬(.claude/skills/site-maintenance/SKILL.md)을 읽고 절차를 따른다.
    _workspace/analytics-report.md의 "즉시 조치 필요" 섹션을 처리한다.
    결과를 _workspace/ops-report.md에 저장한다.
  """
)
```

산출물: `_workspace/ops-report.md`

## Phase 5: 종합 보고

4개 산출물을 종합하여 사용자에게 요약 보고한다:

```markdown
# 오늘의 블로그 운영 결과 — {날짜}

## 콘텐츠 생성
- 발행된 포스트: N개 (니치별 분포)
- 주요 키워드: ...

## 성과 분석
- 저성과 포스트: N개 처리
- 인덱싱 요청: N개

## 유지보수
- 실행된 스크립트: ...
- 수정된 이슈: ...

## 다음 권장 작업
- ...
```

## 에러 핸들링

| 에러 상황 | 처리 방식 |
|---------|---------|
| Phase 1 실패 | Phase 2를 기본 우선순위로 진행 |
| Phase 2 실패 | Phase 3 분석은 기존 데이터로 진행 |
| Phase 3 API 인증 실패 | 로컬 데이터로 분석 |
| Phase 4 스크립트 실패 | 실패 내용 보고, 수동 처리 권고 |

실패가 있어도 가능한 Phase까지 진행하고, 최종 보고서에 누락 사항을 명시한다.

## 테스트 시나리오

### 정상 흐름
1. "오늘 블로그 작업 전체 해줘" → 4개 Phase 순차 실행 → 종합 보고서 출력
2. "전체 점검하고 저성과 포스트 처리해줘" → Phase 1 스킵 → Phase 3-4 집중 실행

### 에러 흐름
1. Phase 2 (파이프라인) API 오류 → 오류 기록 후 Phase 3으로 계속 진행
2. WordPress 인증 실패 → site-ops에 인증 점검 요청, 나머지는 계속
