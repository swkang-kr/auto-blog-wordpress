# Auto Blog WordPress Design Document

> **Summary**: Google Trends 기반 WordPress 자동 블로그 포스팅 배치 시스템 설계
>
> **Project**: auto-blog-wordpress
> **Version**: 0.1.0
> **Author**: snixk
> **Date**: 2026-02-24
> **Status**: Draft
> **Planning Doc**: [auto-blog-wordpress.plan.md](../../01-plan/features/auto-blog-wordpress.plan.md)

---

## 1. Overview

### 1.1 Design Goals

- 매일 자정 자동 실행되는 안정적인 배치 파이프라인 구축
- 서비스 간 독립성 보장 (개별 실패가 전체 파이프라인을 중단하지 않음)
- 환경변수 기반의 유연한 설정 관리
- 포스팅 이력 관리를 통한 중복 방지

### 1.2 Design Principles

- **Single Responsibility**: 각 서비스는 하나의 외부 API만 담당
- **Fail-Safe**: 개별 포스트 실패 시 나머지 포스트 계속 처리
- **Idempotent**: 동일 키워드 재실행 시 중복 포스팅 방지
- **Observable**: 모든 단계에서 상세 로깅

---

## 2. Architecture

### 2.1 System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    GitHub Actions (Cron: 0 15 * * *)             │
│                    = 매일 00:00 KST (UTC+9)                      │
└───────────────────────────┬──────────────────────────────────────┘
                            │ trigger
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                     Main Orchestrator                             │
│                     src/index.ts                                  │
│                                                                   │
│  ┌─────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │ Config      │  │ PostHistory     │  │ Logger              │  │
│  │ (env.ts)    │  │ (history.ts)    │  │ (logger.ts)         │  │
│  └─────────────┘  └─────────────────┘  └─────────────────────┘  │
│                                                                   │
│  Pipeline (for each keyword):                                     │
│  ┌──────────┐  ┌───────────────┐  ┌──────────────┐  ┌────────┐ │
│  │ Google   │→│ Content Gen   │→│ Image Gen    │→│ WP     │ │
│  │ Trends   │  │ (Claude API)  │  │ (Gemini API) │  │ Post   │ │
│  │ Service  │  │ Service       │  │ Service      │  │Service │ │
│  └──────────┘  └───────────────┘  └──────────────┘  └────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

```
[Cron Trigger]
    │
    ▼
[Load Config & History]
    │
    ▼
[Google Trends] ──→ keywords: string[] (top 5)
    │
    ▼
[Filter Duplicates] ──→ history.json 확인 → 새 키워드만 통과
    │
    ▼
[For Each Keyword] ─────────────────────────────────────┐
    │                                                     │
    ▼                                                     │
[Claude API] ──→ BlogContent {title, html, excerpt,     │
    │              tags, category, metaDescription}       │
    ▼                                                     │
[Gemini API] ──→ ImageResult {featured: Buffer,          │
    │              inline: Buffer[]}                      │
    ▼                                                     │
[WordPress API] ──→ Upload images → Create post          │
    │                 → Set featured image                │
    ▼                                                     │
[Update History] ──→ keyword + postId + date 기록        │
    │                                                     │
    └─────────────────────── (next keyword) ──────────────┘
    │
    ▼
[Log Summary] ──→ 성공/실패 카운트, 에러 상세
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| Orchestrator (index.ts) | All Services, Config, Logger | 파이프라인 조율 |
| GoogleTrendsService | google-trends-api | 트렌드 키워드 수집 |
| ContentGeneratorService | @anthropic-ai/sdk | 블로그 텍스트 생성 |
| ImageGeneratorService | @google/generative-ai | 이미지 생성 |
| WordPressService | axios | WP REST API 통신 |
| Config (env.ts) | dotenv, zod | 환경변수 검증 |
| Logger | winston | 로그 출력 |
| PostHistory | fs (Node built-in) | JSON 파일 읽기/쓰기 |

---

## 3. Data Model

### 3.1 Core Types

```typescript
// src/types/index.ts

/** Google Trends에서 수집한 트렌드 키워드 */
interface TrendKeyword {
  title: string;          // 트렌드 키워드 (예: "삼성 갤럭시")
  description: string;    // 트렌드 설명/요약
  source: string;         // 출처 URL
  traffic: string;        // 검색량 (예: "100K+")
}

/** Claude API가 생성한 블로그 콘텐츠 */
interface BlogContent {
  title: string;             // 포스트 제목 (SEO 최적화)
  html: string;              // 본문 HTML (H2/H3 구조, 목차 포함)
  excerpt: string;           // 요약문 (메타 디스크립션용, 160자 이내)
  tags: string[];            // 태그 목록 (5~10개)
  category: string;          // 카테고리 (1개)
  imagePrompts: string[];    // 이미지 생성용 프롬프트 (대표 1 + 본문 1~2)
}

/** Gemini API가 생성한 이미지 결과 */
interface ImageResult {
  featured: Buffer;          // 대표 이미지 (1200x630)
  inline: Buffer[];          // 본문 삽입 이미지 (0~2장)
}

/** WordPress에 발행된 포스트 정보 */
interface PublishedPost {
  postId: number;            // WordPress 포스트 ID
  url: string;               // 포스트 URL
  title: string;             // 포스트 제목
  featuredImageId: number;   // Featured Image Media ID
}

/** 포스팅 이력 (중복 방지용) */
interface PostHistoryEntry {
  keyword: string;           // 원본 트렌드 키워드
  postId: number;            // WordPress 포스트 ID
  postUrl: string;           // 포스트 URL
  publishedAt: string;       // 발행 일시 (ISO 8601)
}

/** 전체 포스팅 이력 파일 구조 */
interface PostHistoryData {
  entries: PostHistoryEntry[];
  lastRunAt: string;         // 마지막 실행 일시
  totalPosts: number;        // 누적 포스트 수
}

/** 개별 포스트 처리 결과 */
interface PostResult {
  keyword: string;
  success: boolean;
  postId?: number;
  postUrl?: string;
  error?: string;
  duration: number;          // 처리 시간 (ms)
}

/** 배치 실행 전체 결과 */
interface BatchResult {
  startedAt: string;
  completedAt: string;
  totalKeywords: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;      // 중복으로 스킵된 수
  results: PostResult[];
}

/** 환경변수 설정 */
interface AppConfig {
  anthropicApiKey: string;
  geminiApiKey: string;
  wpUrl: string;
  wpUsername: string;
  wpAppPassword: string;
  trendsCountry: string;     // default: "KR"
  postCount: number;         // default: 5
  logLevel: string;          // default: "info"
}
```

---

## 4. Service Specifications

### 4.1 GoogleTrendsService

**파일**: `src/services/google-trends.service.ts`

```typescript
class GoogleTrendsService {
  /**
   * Google Trends에서 실시간 트렌드 상위 N개 키워드 수집
   * @param country - 국가 코드 (default: "KR")
   * @param count - 가져올 키워드 수 (default: 5)
   * @returns TrendKeyword[] - 트렌드 키워드 배열
   * @throws GoogleTrendsError - API 호출 실패 시
   */
  async fetchTrendingKeywords(country: string, count: number): Promise<TrendKeyword[]>
}
```

**외부 API**: `google-trends-api` npm 패키지 (`dailyTrends` 메서드)

**에러 처리**:
- API 호출 실패 → 1회 재시도 후 에러 throw
- 빈 결과 → 빈 배열 반환 + 경고 로그

---

### 4.2 ContentGeneratorService

**파일**: `src/services/content-generator.service.ts`

```typescript
class ContentGeneratorService {
  private client: Anthropic;

  /**
   * Claude API를 이용하여 트렌드 키워드 기반 블로그 콘텐츠 생성
   * @param keyword - TrendKeyword 객체
   * @returns BlogContent - 생성된 블로그 콘텐츠
   * @throws ContentGenerationError - API 호출 또는 파싱 실패 시
   */
  async generateContent(keyword: TrendKeyword): Promise<BlogContent>
}
```

**외부 API**: Anthropic Claude API (`claude-sonnet-4-6`)

**프롬프트 전략**:
```
System: 당신은 한국어 SEO 전문 블로그 작가입니다.
        다음 규칙을 따라 블로그 글을 작성하세요:
        1. 제목: 검색 유입을 높이는 매력적인 제목 (60자 이내)
        2. 본문: 1,500자 이상의 HTML (H2/H3 구조)
        3. 목차를 포함하고, 각 섹션은 구체적인 정보를 담을 것
        4. 자연스러운 한국어, 전문가적 톤
        5. 메타 디스크립션: 160자 이내 요약
        6. 태그: 관련 키워드 5~10개
        7. 카테고리: 가장 적합한 1개
        8. 이미지 생성을 위한 영문 프롬프트 3개 (대표 1 + 본문 2)

User: 키워드: "{keyword.title}"
      설명: "{keyword.description}"

Response format: JSON
```

**Claude API 호출 설정**:
- Model: `claude-sonnet-4-6`
- Max tokens: 4096
- Temperature: 0.7 (다양성 확보)
- Response: JSON 형식 강제 (system prompt에서 지정)

---

### 4.3 ImageGeneratorService

**파일**: `src/services/image-generator.service.ts`

```typescript
class ImageGeneratorService {
  private client: GoogleGenerativeAI;

  /**
   * Gemini API를 이용하여 블로그 이미지 생성
   * @param prompts - 이미지 프롬프트 배열 (영문)
   * @returns ImageResult - 생성된 이미지 버퍼 (featured + inline)
   * @throws ImageGenerationError - API 호출 실패 시
   */
  async generateImages(prompts: string[]): Promise<ImageResult>
}
```

**외부 API**: Google Gemini API (`gemini-2.0-flash-exp` 또는 Imagen 3)

**이미지 생성 전략**:
- 첫 번째 프롬프트 → featured image (1200x630, 소셜 최적화)
- 나머지 프롬프트 → inline images (800x450, 본문 삽입)
- 각 프롬프트에 스타일 접미사 추가: "professional blog illustration, clean modern style"

**에러 처리**:
- 이미지 생성 실패 → 해당 이미지 스킵 (null 반환), 텍스트만으로 포스팅 가능
- Rate limit → 이미지 간 2초 대기

---

### 4.4 WordPressService

**파일**: `src/services/wordpress.service.ts`

```typescript
class WordPressService {
  private axios: AxiosInstance;

  /**
   * WordPress 미디어 라이브러리에 이미지 업로드
   * @param imageBuffer - 이미지 Buffer
   * @param filename - 파일명
   * @returns number - Media ID
   */
  async uploadMedia(imageBuffer: Buffer, filename: string): Promise<number>

  /**
   * WordPress 포스트 생성 및 발행
   * @param content - BlogContent
   * @param featuredImageId - Featured Image Media ID (optional)
   * @param inlineImageIds - 본문 이미지 Media ID 배열
   * @returns PublishedPost
   */
  async createPost(
    content: BlogContent,
    featuredImageId?: number,
    inlineImageIds?: number[]
  ): Promise<PublishedPost>

  /**
   * 카테고리 ID 조회 (없으면 생성)
   * @param name - 카테고리 이름
   * @returns number - Category ID
   */
  async getOrCreateCategory(name: string): Promise<number>

  /**
   * 태그 ID 조회 (없으면 생성)
   * @param names - 태그 이름 배열
   * @returns number[] - Tag ID 배열
   */
  async getOrCreateTags(names: string[]): Promise<number[]>
}
```

**외부 API**: WordPress REST API v2

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/wp-json/wp/v2/media` | 이미지 업로드 |
| POST | `/wp-json/wp/v2/posts` | 포스트 생성 |
| GET | `/wp-json/wp/v2/categories?search={name}` | 카테고리 검색 |
| POST | `/wp-json/wp/v2/categories` | 카테고리 생성 |
| GET | `/wp-json/wp/v2/tags?search={name}` | 태그 검색 |
| POST | `/wp-json/wp/v2/tags` | 태그 생성 |

**인증**: Basic Auth (username + Application Password, Base64 인코딩)

**포스트 생성 Payload**:
```json
{
  "title": "SEO 최적화된 제목",
  "content": "<html>본문</html>",
  "excerpt": "메타 디스크립션",
  "status": "publish",
  "categories": [categoryId],
  "tags": [tagId1, tagId2],
  "featured_media": mediaId
}
```

---

## 5. Utility Modules

### 5.1 Config (env.ts)

```typescript
// src/config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  WP_URL: z.string().url(),
  WP_USERNAME: z.string().min(1),
  WP_APP_PASSWORD: z.string().min(1),
  TRENDS_COUNTRY: z.string().default('KR'),
  POST_COUNT: z.coerce.number().min(1).max(10).default(5),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type AppConfig = z.infer<typeof envSchema>;
export function loadConfig(): AppConfig;  // throws on validation failure
```

### 5.2 PostHistory (history.ts)

```typescript
// src/utils/history.ts

class PostHistory {
  private filePath: string;  // data/post-history.json

  /** 이력 파일 로드 (없으면 빈 이력 생성) */
  async load(): Promise<PostHistoryData>

  /** 키워드가 이미 포스팅되었는지 확인 */
  isPosted(keyword: string): boolean

  /** 새 포스팅 이력 추가 */
  async addEntry(entry: PostHistoryEntry): Promise<void>

  /** 마지막 실행 시간 업데이트 */
  async updateLastRun(): Promise<void>
}
```

**저장 경로**: `data/post-history.json`
**GitHub Actions 환경**: history 파일은 Git 커밋으로 영속화하거나, GitHub Actions artifacts 활용

### 5.3 Logger (logger.ts)

```typescript
// src/utils/logger.ts
import winston from 'winston';

// 출력 형식: [2026-02-24 00:00:05] [INFO] 메시지
// 레벨: debug, info, warn, error
export const logger: winston.Logger;
```

### 5.4 Retry (retry.ts)

```typescript
// src/utils/retry.ts

/**
 * 재시도 래퍼 함수
 * @param fn - 실행할 async 함수
 * @param maxRetries - 최대 재시도 횟수 (default: 2)
 * @param delayMs - 재시도 간 대기 시간 (default: 3000)
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries?: number,
  delayMs?: number
): Promise<T>
```

---

## 6. Error Handling

### 6.1 Error Types

```typescript
// src/types/errors.ts

class AppError extends Error {
  constructor(message: string, public code: string, public cause?: unknown) {
    super(message);
  }
}

class GoogleTrendsError extends AppError {}    // code: "TRENDS_*"
class ContentGenerationError extends AppError {} // code: "CONTENT_*"
class ImageGenerationError extends AppError {}   // code: "IMAGE_*"
class WordPressError extends AppError {}         // code: "WP_*"
class ConfigError extends AppError {}            // code: "CONFIG_*"
```

### 6.2 Error Handling Strategy

| Error Level | Strategy | Action |
|------------|----------|--------|
| **Config Error** | Fatal | 프로세스 즉시 종료 (exit code 1) |
| **Trends Error** | Fatal | 키워드 수집 불가 → 전체 중단 |
| **Content Error** | Per-keyword | 해당 키워드 스킵, 다음 키워드 진행 |
| **Image Error** | Graceful | 이미지 없이 텍스트만 포스팅 |
| **WP Error** | Per-keyword | 해당 키워드 스킵, 에러 로깅 |

### 6.3 Main Pipeline Error Flow

```typescript
// src/index.ts - 핵심 로직 의사코드
async function main() {
  // 1. Config 로드 (실패 시 Fatal)
  const config = loadConfig();

  // 2. History 로드
  const history = new PostHistory();
  await history.load();

  // 3. 트렌드 수집 (실패 시 Fatal)
  const keywords = await trendsService.fetchTrendingKeywords(
    config.trendsCountry,
    config.postCount
  );

  // 4. 중복 필터링
  const newKeywords = keywords.filter(k => !history.isPosted(k.title));

  // 5. 키워드별 처리 (개별 실패 허용)
  const results: PostResult[] = [];
  for (const keyword of newKeywords) {
    try {
      // 5a. 콘텐츠 생성
      const content = await contentService.generateContent(keyword);

      // 5b. 이미지 생성 (실패해도 계속)
      let images: ImageResult | null = null;
      try {
        images = await imageService.generateImages(content.imagePrompts);
      } catch (e) {
        logger.warn(`Image generation failed for "${keyword.title}", posting without images`);
      }

      // 5c. WordPress 발행
      const post = await wpService.createPost(content, images);

      // 5d. 이력 기록
      await history.addEntry({ keyword: keyword.title, postId: post.postId, ... });

      results.push({ keyword: keyword.title, success: true, postId: post.postId });
    } catch (error) {
      results.push({ keyword: keyword.title, success: false, error: error.message });
    }
  }

  // 6. 결과 요약 로깅
  logBatchSummary(results);
}
```

---

## 7. Security Considerations

- [x] API 키는 환경변수로만 관리 (코드에 하드코딩 금지)
- [x] `.env` 파일은 `.gitignore`에 포함
- [x] GitHub Actions에서는 Secrets로 API 키 관리
- [x] WordPress Application Password 사용 (실제 비밀번호 미노출)
- [x] WordPress REST API는 HTTPS 필수
- [ ] Rate limiting 준수 (Google Trends, Gemini API)

---

## 8. GitHub Actions Workflow

### 8.1 Workflow 설계

**파일**: `.github/workflows/daily-post.yml`

```yaml
name: Daily Blog Post
on:
  schedule:
    - cron: '0 15 * * *'    # UTC 15:00 = KST 00:00
  workflow_dispatch:          # 수동 실행 가능

jobs:
  post:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run start
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
          WP_URL: ${{ secrets.WP_URL }}
          WP_USERNAME: ${{ secrets.WP_USERNAME }}
          WP_APP_PASSWORD: ${{ secrets.WP_APP_PASSWORD }}
      - name: Commit post history
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data/post-history.json
          git diff --staged --quiet || git commit -m "chore: update post history [skip ci]"
          git push
```

### 8.2 History 영속화 전략

- 배치 실행 후 `data/post-history.json`을 Git에 자동 커밋
- `[skip ci]` 태그로 무한 루프 방지
- 수동 실행(`workflow_dispatch`)도 동일 플로우

---

## 9. Coding Conventions

### 9.1 Naming Conventions

| Target | Rule | Example |
|--------|------|---------|
| Services | PascalCase + Service 접미사 | `GoogleTrendsService` |
| Service files | kebab-case + .service.ts | `google-trends.service.ts` |
| Types/Interfaces | PascalCase | `TrendKeyword`, `BlogContent` |
| Utility files | kebab-case.ts | `logger.ts`, `retry.ts` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| Functions | camelCase | `fetchTrendingKeywords()` |
| Env vars | UPPER_SNAKE_CASE | `ANTHROPIC_API_KEY` |

### 9.2 Import Order

```typescript
// 1. Node.js built-in
import path from 'node:path';
import fs from 'node:fs/promises';

// 2. External packages
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

// 3. Internal modules
import { loadConfig } from './config/env.js';
import { GoogleTrendsService } from './services/google-trends.service.js';

// 4. Type imports
import type { TrendKeyword, BlogContent } from './types/index.js';
```

### 9.3 This Feature's Conventions

| Item | Convention Applied |
|------|-------------------|
| Module system | ESM (`"type": "module"` in package.json) |
| File organization | services/, types/, utils/, config/ |
| Error handling | Custom Error classes + per-keyword try-catch |
| Logging | winston (info/warn/error levels) |
| Config validation | zod schema |

---

## 10. Package Dependencies

### 10.1 Production Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@anthropic-ai/sdk` | ^0.39 | Claude API 클라이언트 |
| `@google/generative-ai` | ^0.21 | Gemini API 클라이언트 |
| `google-trends-api` | ^4.9 | Google Trends 데이터 수집 |
| `axios` | ^1.7 | WordPress REST API HTTP 클라이언트 |
| `dotenv` | ^16.4 | 환경변수 로드 |
| `zod` | ^3.23 | 환경변수 스키마 검증 |
| `winston` | ^3.17 | 로깅 |

### 10.2 Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^5.7 | TypeScript 컴파일러 |
| `tsx` | ^4.19 | TypeScript 직접 실행 |
| `@types/node` | ^22 | Node.js 타입 정의 |
| `eslint` | ^9 | 린트 |

---

## 11. Implementation Order

### 11.1 Phase 1: 프로젝트 초기화

- [x] 1-1. `package.json` 생성 (ESM, TypeScript)
- [x] 1-2. `tsconfig.json` 설정
- [x] 1-3. `.env.example` 생성
- [x] 1-4. `.gitignore` 설정
- [x] 1-5. 패키지 설치

### 11.2 Phase 2: Core Utilities

- [ ] 2-1. `src/config/env.ts` - 환경변수 로드 + zod 검증
- [ ] 2-2. `src/utils/logger.ts` - winston 로거 설정
- [ ] 2-3. `src/utils/retry.ts` - 재시도 유틸리티
- [ ] 2-4. `src/utils/history.ts` - 포스팅 이력 관리
- [ ] 2-5. `src/types/index.ts` - 타입 정의

### 11.3 Phase 3: Service 구현

- [ ] 3-1. `src/services/google-trends.service.ts` - 트렌드 수집
- [ ] 3-2. `src/services/content-generator.service.ts` - Claude 콘텐츠 생성
- [ ] 3-3. `src/services/image-generator.service.ts` - Gemini 이미지 생성
- [ ] 3-4. `src/services/wordpress.service.ts` - WP 포스트 발행

### 11.4 Phase 4: Orchestrator & Scheduling

- [ ] 4-1. `src/index.ts` - 메인 파이프라인 조율
- [ ] 4-2. `.github/workflows/daily-post.yml` - GitHub Actions cron
- [ ] 4-3. `data/post-history.json` - 초기 히스토리 파일

### 11.5 Phase 5: 테스트 & 안정화

- [ ] 5-1. 로컬 수동 실행 테스트 (단일 키워드)
- [ ] 5-2. 전체 파이프라인 E2E 테스트
- [ ] 5-3. GitHub Actions 테스트 실행
- [ ] 5-4. 에러 시나리오 검증

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-02-24 | Initial draft | snixk |
