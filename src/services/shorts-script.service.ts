import { spawnSync } from 'child_process';
import { logger } from '../utils/logger.js';

export interface ShortsScript {
  title: string;       // 쇼츠 제목 (100자 이내)
  narration: string;   // TTS 낭독 텍스트 (60초 분량, 약 200자)
  scenes: Scene[];     // 화면 장면 구성
  hashtags: string[];  // YouTube 태그
}

export interface Scene {
  startSec: number;
  endSec: number;
  text: string;         // 자막 텍스트
  highlight?: string;   // 강조 숫자/키워드
  imagePrompt?: string; // fal.ai 배경 이미지 프롬프트 (영문)
  imageSrc?: string;    // 생성된 이미지 base64 data URL (런타임 주입)
}

export class ShortsScriptService {
  generateScript(postTitle: string, postExcerpt: string, keyword: string): ShortsScript {
    const claudeBin = process.env.CLAUDE_BIN || 'claude';

    const prompt = `당신은 한국 주식 유튜브 쇼츠 전문 스크립트 작가입니다. 조회수 10만+ 영상의 공식을 따릅니다.

블로그 포스트:
제목: ${postTitle}
요약: ${postExcerpt}
키워드: ${keyword}

【필수 규칙】
1. title: 클릭 유도 공식 → "[충격 수치/결과] + [종목명] + [행동 촉구]" (60자 이내)
   예) "4,280원 → 5,500원? 한온시스템 지금 담아야 하는 이유"
2. narration: 첫 문장은 반드시 충격적인 수치나 결론부터 시작. 100자 이내. 자연스러운 구어체.
3. scenes: 정확히 5개, 각 5~6초 (총 0~28초)
   - scene[0]: 훅 — 충격 수치 or 핵심 결론을 먼저 공개. highlight 필수 (숫자 우선).
   - scene[1]: 강력매수해야 할 이유 — 가장 핵심적인 매수 근거 1가지를 임팩트 있게. highlight 필수 (이유 키워드, 예: "RSI 과매도!" / "기관 3일 연속 매수").
   - scene[2]: 기술적 시그널 — RSI·MACD·볼린저밴드 중 가장 강한 시그널 1개와 수치. highlight 필수 (지표 수치, 예: "RSI 28").
   - scene[3]: 진입가격 & 손절가격 — 구체적 숫자 필수. "X원 진입, Y원 손절" 형태로 명시. highlight 필수 (진입가 숫자).
   - scene[4]: CTA — "구독하면 매일 종목 분석!" 또는 "내일 장 시작 전 확인하세요!" (highlight 없음)
4. text: 자연스러운 한국어 문장으로 작성. 2줄 이내, 줄 구분은 \n 사용. 규칙:
   - 완전한 문장으로 끝맺음 (~다, ~요, ~네요, ~군요, ~세요)
   - 구어체, 친근한 말투 (뉴스 앵커X, 유튜버 말투O)
   - 숫자/데이터가 있으면 문장에 자연스럽게 포함
   - 예시: "지금 볼린저밴드가\n심하게 수축 중이에요" / "4,280원에서 진입하고\n4,000원 손절이면 R:R 2배네요"
   - 금지: 단어 나열("볼린저밴드 수축"), 조사 생략("현재가 4280"), 영어 남발
5. highlight: 핵심 숫자(예: "4,280원") 또는 임팩트 단어(예: "스퀴즈 돌파!"). 숫자 우선.
6. hashtags: 종목명/기법/투자 관련 10개. #진입가격 #손절가격 #강력매수 반드시 포함.
7. imagePrompt: 각 장면 배경 이미지용 영문 프롬프트 (30단어 이내). 장면마다 완전히 다른 시각적 스타일 사용.
   - scene[0] 훅: WIDE SHOT stock exchange trading floor, red LED ticker boards, dramatic overhead lighting, ultra-wide lens, photorealistic
   - scene[1] 강력매수 이유: CLOSE-UP glowing financial dashboard monitors, cyan data streams, dark office, bokeh background, photorealistic
   - scene[2] 기술적 시그널: ABSTRACT purple neural network visualization, floating holographic graphs, deep space background, digital art, cinematic
   - scene[3] 진입가·손절가: AERIAL NIGHT VIEW Seoul financial district, green upward arrows overlay, wet streets reflecting neon, cinematic drone shot
   - scene[4] CTA: MACRO smartphone screen with subscription bell notification, golden hour rim light, shallow depth of field, product photography

순수 JSON만 응답. 마크다운 코드블록 금지.
{"title":"","narration":"","scenes":[{"startSec":0,"endSec":6,"text":"","highlight":"","imagePrompt":""},{"startSec":6,"endSec":12,"text":"","highlight":"","imagePrompt":""},{"startSec":12,"endSec":18,"text":"","highlight":"","imagePrompt":""},{"startSec":18,"endSec":24,"text":"","highlight":"","imagePrompt":""},{"startSec":24,"endSec":28,"text":"","highlight":"","imagePrompt":""}],"hashtags":["#주식"]}`;

    const { ANTHROPIC_API_KEY: _unused, ...safeEnv } = process.env;
    const result = spawnSync(claudeBin, ['-p', prompt, '--model', 'opus'], {
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
      env: safeEnv,
    });

    if (result.status !== 0) {
      throw new Error(`Shorts script generation failed: ${result.stderr?.slice(0, 300)}`);
    }

    const raw = result.stdout?.trim() ?? '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in shorts script response');

    // 문자열 값 내 제어문자(실제 개행 등) 제거
    const sanitized = jsonMatch[0].replace(/("(?:[^"\\]|\\.)*")/g, (m) =>
      m.replace(/\n/g, '\\n').replace(/\r/g, '').replace(/\t/g, '\\t')
    );
    const parsed = JSON.parse(sanitized) as ShortsScript;

    // 고볼륨 기본 태그 병합 (Claude 생성 태그 + 고정 태그, 최대 15개)
    const HIGH_VOLUME_TAGS = [
      '#주식', '#주식쇼츠', '#오늘의주식', '#종목분석', '#주식투자',
      '#한국주식', '#코스피', '#재테크', '#투자', '#주식초보',
    ];
    const merged = [...new Set([...parsed.hashtags, ...HIGH_VOLUME_TAGS])].slice(0, 15);
    parsed.hashtags = merged;

    logger.info(`Shorts script generated: "${parsed.title}" (${parsed.scenes.length} scenes, ${merged.length} hashtags)`);
    return parsed;
  }
}
