# Auto Blog WordPress Planning Document

> **Summary**: Google Trends 기반 자동 블로그 포스팅 시스템 (WordPress + Claude + Gemini)
>
> **Project**: auto-blog-wordpress
> **Version**: 0.1.0
> **Author**: snixk
> **Date**: 2026-02-24
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

Google Trends 상위 5개 키워드를 기반으로 매일 자동으로 WordPress 블로그 포스트를 생성하고 발행하는 배치 시스템을 구축한다. 최종적으로 Google AdSense를 적용하여 자동 수익화를 목표로 한다.

### 1.2 Background

- 트렌드 키워드 기반 콘텐츠는 검색 유입이 높아 AdSense 수익화에 유리
- 수동 블로그 운영의 시간/노력 문제를 자동화로 해결
- AI(Claude + Gemini)를 활용하여 고품질 텍스트 + 이미지를 자동 생성

### 1.3 Related Documents

- Design: `docs/02-design/features/auto-blog-wordpress.design.md`
- Google Trends API: https://trends.google.com
- Claude API: https://docs.anthropic.com
- Gemini API: https://ai.google.dev

---

## 2. Scope

### 2.1 In Scope

- [x] Google Trends 한국(KR) 실시간 상위 5개 키워드 수집
- [x] Claude API를 이용한 SEO 최적화 블로그 글 생성 (한국어)
- [x] Gemini API를 이용한 대표 이미지 + 본문 이미지 생성
- [x] WordPress REST API를 이용한 자동 포스트 발행
- [x] 매일 자정(KST) 배치 스케줄링
- [x] 중복 키워드 방지 (이미 포스팅한 키워드 스킵)
- [x] 실행 결과 로깅 및 에러 핸들링

### 2.2 Out of Scope

- WordPress 호스팅 인프라 자동 구축 (수동 셋업)
- 댓글 자동 응답
- SNS 자동 공유 (향후 확장 가능)
- AdSense 자동 승인 (수동 신청)
- 다국어 포스팅 (한국어만)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | Google Trends KR 실시간 상위 5개 키워드 수집 | High | Pending |
| FR-02 | Claude API로 키워드 기반 블로그 글 생성 (1500자+ HTML) | High | Pending |
| FR-03 | Gemini Imagen으로 대표 이미지 생성 (1200x630px) | High | Pending |
| FR-04 | Gemini Imagen으로 본문 삽입 이미지 1~2장 추가 생성 | Medium | Pending |
| FR-05 | WordPress REST API로 이미지 업로드 + 포스트 발행 | High | Pending |
| FR-06 | 이미 포스팅한 키워드 중복 방지 (history 관리) | High | Pending |
| FR-07 | 매일 00:00 KST 자동 실행 (GitHub Actions cron) | High | Pending |
| FR-08 | 카테고리/태그 자동 분류 | Medium | Pending |
| FR-09 | 실행 결과 로깅 (성공/실패/에러 상세) | Medium | Pending |
| FR-10 | SEO 최적화 (메타 디스크립션, H2/H3 구조, 목차) | Medium | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | 5개 포스트 전체 처리 15분 이내 | GitHub Actions 실행 시간 |
| Reliability | 개별 포스트 실패 시 나머지 계속 진행 | 에러 로그 확인 |
| Cost | 월 API 비용 $5 이하 유지 | API 사용량 모니터링 |
| SEO Quality | 글당 1,500자 이상, H2/H3 구조화 | 콘텐츠 분석 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] Google Trends 키워드 5개 정상 수집
- [ ] Claude API로 블로그 글 생성 성공
- [ ] Gemini API로 이미지 생성 성공
- [ ] WordPress에 포스트 자동 발행 성공
- [ ] GitHub Actions cron 정상 동작
- [ ] 중복 키워드 필터링 동작

### 4.2 Quality Criteria

- [ ] TypeScript strict mode 통과
- [ ] ESLint 에러 제로
- [ ] 빌드 성공 (tsc --noEmit)
- [ ] 환경변수 누락 시 명확한 에러 메시지

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Google Trends 비공식 API 차단 | High | Medium | User-Agent 로테이션, 요청 간격 조절, 대체 라이브러리 준비 |
| Gemini API 무료 한도 초과 | Medium | Low | 일 5개 포스트 제한 유지, 한도 모니터링 |
| Claude API 비용 증가 | Medium | Low | Sonnet 모델 사용, 토큰 제한 설정 |
| AdSense 자동 콘텐츠 탐지 → 승인 거부 | High | Medium | 인간적 톤 프롬프트, 고유 관점 포함, 수동 글 병행 |
| WordPress REST API 인증 오류 | Low | Low | Application Password 방식, 재시도 로직 |
| GitHub Actions 무료 한도 초과 | Low | Low | 월 2000분 중 ~450분만 사용 예상 |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| **Starter** | Simple structure (`components/`, `lib/`, `types/`) | Static sites, portfolios, landing pages | ☐ |
| **Dynamic** | Feature-based modules, BaaS integration | Web apps with backend, SaaS MVPs | ☒ |
| **Enterprise** | Strict layer separation, DI, microservices | High-traffic systems, complex architectures | ☐ |

**Selected: Dynamic** - 외부 API 연동 + 서비스 모듈 분리가 필요하지만 마이크로서비스 수준은 불필요

### 6.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| Runtime | Node.js / Python / Deno | **Node.js + TypeScript** | 사용자 선택, npm 생태계 풍부 |
| Trends API | google-trends-api / 직접 scraping | **google-trends-api** | 안정적인 npm 패키지 |
| Text Generation | Claude API / Gemini / OpenAI | **Claude API (Sonnet)** | 한국어 품질 우수, 구조화된 출력 |
| Image Generation | Gemini Imagen / DALL-E / Midjourney | **Gemini API (Imagen 3)** | 사용자 선택, 무료 한도 |
| Blog Platform | WordPress / Ghost / Medium | **WordPress (Self-hosted)** | 사용자 선택, AdSense 호환 |
| WP Integration | REST API / XML-RPC / WP-CLI | **REST API + Application Password** | 표준 방식, 보안성 |
| Scheduler | GitHub Actions / cron / Lambda | **GitHub Actions** | 무료, 설정 간편 |
| Logger | winston / pino / console | **winston** | 파일/콘솔 동시 출력, 레벨 관리 |
| HTTP Client | fetch / axios / got | **axios** | 인터셉터, 재시도 편리 |
| Config | dotenv / env-var | **dotenv + zod validation** | 타입 안전한 환경변수 검증 |

### 6.3 Clean Architecture Approach

```
Selected Level: Dynamic

Folder Structure:
┌─────────────────────────────────────────────────────┐
│ auto-blog-wordpress/                                │
│ ├── src/                                            │
│ │   ├── index.ts              # Entry point         │
│ │   ├── config/                                     │
│ │   │   └── env.ts            # Env validation      │
│ │   ├── services/                                   │
│ │   │   ├── google-trends.service.ts                │
│ │   │   ├── content-generator.service.ts  (Claude)  │
│ │   │   ├── image-generator.service.ts    (Gemini)  │
│ │   │   └── wordpress.service.ts          (WP API)  │
│ │   ├── types/                                      │
│ │   │   └── index.ts                                │
│ │   └── utils/                                      │
│ │       ├── logger.ts                               │
│ │       ├── retry.ts                                │
│ │       └── history.ts        # 중복 방지 히스토리   │
│ ├── data/                                           │
│ │   └── post-history.json     # 포스팅 이력          │
│ ├── .env.example                                    │
│ ├── .github/workflows/                              │
│ │   └── daily-post.yml        # Cron schedule       │
│ ├── package.json                                    │
│ └── tsconfig.json                                   │
└─────────────────────────────────────────────────────┘
```

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [ ] `CLAUDE.md` has coding conventions section
- [ ] `docs/01-plan/conventions.md` exists
- [ ] ESLint configuration (`.eslintrc.*`)
- [ ] Prettier configuration (`.prettierrc`)
- [x] TypeScript configuration (`tsconfig.json`) - to be created

### 7.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| **Naming** | missing | camelCase 함수, PascalCase 타입, kebab-case 파일 | High |
| **Folder structure** | missing | services/, types/, utils/, config/ | High |
| **Import order** | missing | node > external > internal > types | Medium |
| **Environment variables** | missing | UPPER_SNAKE_CASE, zod validation | High |
| **Error handling** | missing | 서비스별 try-catch, 개별 실패 허용 | Medium |

### 7.3 Environment Variables Needed

| Variable | Purpose | Scope | To Be Created |
|----------|---------|-------|:-------------:|
| `ANTHROPIC_API_KEY` | Claude API 인증 | Server | ☒ |
| `GEMINI_API_KEY` | Gemini API 인증 | Server | ☒ |
| `WP_URL` | WordPress 사이트 URL | Server | ☒ |
| `WP_USERNAME` | WordPress 사용자명 | Server | ☒ |
| `WP_APP_PASSWORD` | WordPress Application Password | Server | ☒ |
| `TRENDS_COUNTRY` | Google Trends 국가 (기본: KR) | Server | ☒ |
| `POST_COUNT` | 일일 포스트 수 (기본: 5) | Server | ☐ |

---

## 8. API Cost Estimation

### 8.1 Daily Usage (5 Posts)

| API | Model | Usage | Est. Cost/Day |
|-----|-------|-------|--------------|
| Claude | claude-sonnet-4-6 | ~5 req x 2K output tokens | ~$0.05-0.10 |
| Gemini | Imagen 3 | ~10-15 images | Free tier |
| **Total** | | | **~$0.05-0.10** |

### 8.2 Monthly Projection

| Item | Cost |
|------|------|
| Claude API | ~$1.5-3.0 |
| Gemini API | Free (within limits) |
| WordPress Hosting (VPS) | ~$5-12 |
| Domain | ~$1/month (annual) |
| **Total** | **~$7.5-16/month** |

---

## 9. AdSense Readiness Checklist

| Requirement | Status | Action |
|-------------|--------|--------|
| 고유 도메인 | ☐ | 도메인 구매 및 연결 |
| About 페이지 | ☐ | WordPress 페이지 수동 작성 |
| Contact 페이지 | ☐ | WordPress 페이지 수동 작성 |
| 개인정보처리방침 | ☐ | WordPress 페이지 수동 작성 |
| 20+ 양질의 글 | ☐ | 자동 포스팅 2~4주 운영 |
| 반응형 테마 | ☐ | AdSense 호환 무료 테마 적용 |
| SEO 플러그인 | ☐ | Yoast SEO 또는 Rank Math 설치 |
| Sitemap 생성 | ☐ | SEO 플러그인으로 자동 생성 |
| 사이트 1~3개월 운영 | ☐ | 시간 경과 필요 |

---

## 10. Next Steps

1. [ ] Write design document (`auto-blog-wordpress.design.md`)
2. [ ] WordPress 호스팅 셋업 (VPS + 도메인)
3. [ ] API 키 발급 (Anthropic + Google AI Studio)
4. [ ] 프로젝트 초기화 및 구현 시작

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-02-24 | Initial draft | snixk |
