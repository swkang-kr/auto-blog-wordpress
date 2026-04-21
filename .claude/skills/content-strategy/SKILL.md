---
name: content-strategy
description: >
  auto-blog-wordpress 콘텐츠 전략 분석 — 키워드 기회 발굴, 콘텐츠 갭 분석, 니치별 성과 비교, 콘텐츠 캘린더 수립,
  어떤 주제로 쓸까, 이번 주 콘텐츠 전략, 키워드 추천, 니치 분석, 트렌드 주제 찾기, 콘텐츠 아이디어
  요청 시 반드시 이 스킬 사용. 단, 실제 포스트 생성은 run-pipeline 스킬 사용.
---

# 콘텐츠 전략 분석 스킬

## Step 1: 시장 현황 파악

Trade Engine 데이터를 읽어 현재 시장 상황을 파악한다:

```
data/trade-engine/
├── market_overview.json   — 시장 개요 (코스피/코스닥)
├── themes.json            — 활성 테마 목록
├── sectors.json           — 업종별 동향
├── top_movers.json        — 상승/하락 상위 종목
├── ai_picks.json          — AI 추천 종목
├── signals.json           — 매매 시그널
└── watchlist.json         — 워치리스트
```

## Step 2: 기발행 콘텐츠 분석

`data/post-history.backup.json`을 읽어 다음을 파악한다:
- 최근 30일 기발행 키워드
- 니치별 발행 빈도
- 중복 위험 키워드

## Step 3: 기회 발굴

### 콘텐츠 갭 분석
`src/config/niches.ts`의 `seedKeywords`와 기발행 포스트를 비교하여 아직 커버되지 않은 키워드를 찾는다.

### 계절성/이벤트 반영
현재 날짜 기준으로 관련 이벤트를 확인한다:
- 실적 시즌 (1월/4월/7월/10월) → 시장분석/업종분석 우선
- FOMC 회의 주 → 시장분석 긴급 키워드
- MSCI 리밸런싱 → 업종분석 기회
- 주요 종목 DART 공시 → 종목분석 기회

### 트렌드 테마 식별
`data/trade-engine/themes.json`에서 급상승 테마를 찾아 테마분석 키워드로 연결한다.

## Step 4: 우선순위 결정

다음 기준으로 콘텐츠 우선순위를 매긴다:
1. 검색 볼륨 (seedKeywords의 difficulty 낮은 것 우선)
2. 시장 이벤트 적시성
3. 기발행 여부 (중복 제외)
4. AdSense RPM (high RPM 니치 우선)

## Step 5: 산출물

`_workspace/content-strategy.md`에 기록:

```markdown
# 콘텐츠 전략 보고서 — {날짜}

## 시장 현황
{Trade Engine 데이터 요약}

## 우선 키워드 (니치별)
| 키워드 | 니치 | 이유 | 난이도 |
|--------|------|------|--------|
...

## 콘텐츠 갭
{아직 미발행 주요 키워드}

## 이번 주 캘린더 제안
{요일별 포스트 제안}
```
