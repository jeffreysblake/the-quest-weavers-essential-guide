import { Injectable, Logger } from '@nestjs/common';
import { TTSProvider, TTSOptions, TTSResult } from '../interfaces/tts.interface';
import axios from 'axios';

/**
 * HTTP TTS Provider - Connects to external TTS services
 * Supports: OpenAI TTS, ElevenLabs, or any HTTP-based TTS API
 */
@Injectable()
export class HttpTTSProvider implements TTSProvider {
  private readonly logger = new Logger(HttpTTSProvider.name);
  readonly name = 'http-tts';
  readonly supportedVoices: string[] = [];
  readonly supportedFormats: string[] = ['mp3', 'wav', 'opus'];

  private apiUrl: string;
  private apiKey?: string;

  constructor() {
    this.apiUrl = process.env.TTS_API_URL || 'http://localhost:5000/tts';
    this.apiKey = process.env.TTS_API_KEY;
  }

  async generateSpeech(text: string, options?: TTSOptions): Promise<TTSResult> {
    const { voice = 'default', speed = 1.0, format = 'mp3', language = 'en' } = options || {};

    this.logger.log(`Generating speech via HTTP API: "${text.substring(0, 50)}..."`);

    try {
      const response = await axios.post(
        this.apiUrl,
        {
          text,
          voice,
          speed,
          format,
          language,
        },
        {
          headers: this.apiKey
            ? {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
              }
            : { 'Content-Type': 'application/json' },
          responseType: 'arraybuffer',
          timeout: 30000,
        },
      );

      return {
        audioBuffer: Buffer.from(response.data),
        format,
        voice,
      };
    } catch (error) {
      this.logger.error(`HTTP TTS request failed: ${error.message}`);
      throw new Error(`TTS generation failed: ${error.message}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const healthUrl = this.apiUrl.replace(/\/tts$/, '/health');
      const response = await axios.get(healthUrl, { timeout: 5000 });
      return response.status === 200;
    } catch {
      return false;
    }
  }
}
