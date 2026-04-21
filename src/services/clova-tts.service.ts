import { spawnSync } from 'child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

export class ClovaTtsService {
  private voice: string;

  constructor(_clientId: string, _clientSecret: string) {
    this.voice = process.env.TTS_VOICE || 'ko-KR-SunHiNeural';
  }

  async synthesize(text: string, outputPath: string): Promise<void> {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    const result = spawnSync('edge-tts', [
      '--voice', this.voice,
      '--text', text.slice(0, 2000),
      '--write-media', outputPath,
    ], {
      encoding: 'utf8',
      timeout: 30_000,
    });

    if (result.status !== 0) {
      throw new Error(`edge-tts failed (exit ${result.status}): ${result.stderr?.slice(0, 300)}`);
    }
  }
}
