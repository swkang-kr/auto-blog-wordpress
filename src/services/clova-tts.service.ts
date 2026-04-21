import axios from 'axios';
import fs from 'node:fs/promises';
import path from 'node:path';

export class ClovaTtsService {
  private clientId: string;
  private clientSecret: string;

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  async synthesize(text: string, outputPath: string, options: {
    speaker?: string;
    speed?: number;
    volume?: number;
    pitch?: number;
  } = {}): Promise<void> {
    const {
      speaker = 'nara_call', // 뉴스 내레이션 최적화 성우
      speed = -1,            // 약간 느리게 (명확한 발음)
      volume = 5,
      pitch = 0,
    } = options;

    const params = new URLSearchParams({
      speaker,
      text: text.slice(0, 2000), // CLOVA 최대 2000자
      speed: String(speed),
      volume: String(volume),
      pitch: String(pitch),
      format: 'mp3',
    });

    const response = await axios.post(
      'https://naveropenapi.apigw.ntruss.com/tts-premium/v1/tts',
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-NCP-APIGW-API-KEY-ID': this.clientId,
          'X-NCP-APIGW-API-KEY': this.clientSecret,
        },
        responseType: 'arraybuffer',
        timeout: 30_000,
      },
    );

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, response.data);
  }
}
