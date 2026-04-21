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
  text: string;        // 자막 텍스트
  highlight?: string;  // 강조 숫자/키워드
}

export class ShortsScriptService {
  generateScript(postTitle: string, postExcerpt: string, keyword: string): ShortsScript {
    const claudeBin = process.env.CLAUDE_BIN || 'claude';

    const prompt = `당신은 한국 주식 투자 유튜브 쇼츠 스크립트 작가입니다.

아래 블로그 포스트를 60초 쇼츠로 변환하세요.

제목: ${postTitle}
요약: ${postExcerpt}
키워드: ${keyword}

요구사항:
- narration: TTS 낭독용 200자 내외 한국어 텍스트. 자연스러운 말투. 숫자/데이터 강조.
- scenes: 5~6개 장면, startSec/endSec으로 타이밍 지정 (총 0~58초)
- 각 scene의 text는 화면에 표시할 자막 (20자 이내, 핵심만)
- highlight: 해당 장면의 핵심 숫자나 단어 (없으면 생략)
- hashtags: 관련 해시태그 10개 (# 포함)
- title: 유튜브 쇼츠 제목 (클릭 유도, 60자 이내)

순수 JSON만 응답. 마크다운 금지.
{"title":"","narration":"","scenes":[{"startSec":0,"endSec":10,"text":"","highlight":""}],"hashtags":["#주식"]}`;

    const result = spawnSync(claudeBin, ['-p', prompt, '--model', 'opus'], {
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
    });

    if (result.status !== 0) {
      throw new Error(`Shorts script generation failed: ${result.stderr?.slice(0, 300)}`);
    }

    const raw = result.stdout?.trim() ?? '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in shorts script response');

    const parsed = JSON.parse(jsonMatch[0]) as ShortsScript;
    logger.info(`Shorts script generated: "${parsed.title}" (${parsed.scenes.length} scenes)`);
    return parsed;
  }
}
