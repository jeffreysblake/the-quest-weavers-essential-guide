import { Injectable, Logger } from '@nestjs/common';
import {
  STTProvider,
  STTOptions,
  STTResult,
} from '../interfaces/stt.interface';
import axios from 'axios';
import FormData from 'form-data';

/**
 * HTTP Whisper Provider - Connects to whisper.cpp server or similar HTTP API
 */
@Injectable()
export class HttpWhisperProvider implements STTProvider {
  private readonly logger = new Logger(HttpWhisperProvider.name);
  readonly name = 'http-whisper';
  readonly supportedLanguages: string[] = [
    'auto',
    'en',
    'es',
    'fr',
    'de',
    'it',
    'pt',
    'ru',
    'zh',
    'ja',
  ];
  readonly supportedModels: string[] = ['base', 'small', 'medium', 'large'];

  private apiUrl: string;
  private apiKey?: string;

  constructor() {
    this.apiUrl = process.env.STT_API_URL || 'http://localhost:8080/inference';
    this.apiKey = process.env.STT_API_KEY;
  }

  async transcribe(
    audioBuffer: Buffer,
    options?: STTOptions,
  ): Promise<STTResult> {
    const {
      language = 'en',
      wordTimestamps = false,
      temperature = 0,
    } = options || {};

    this.logger.log(`Transcribing audio buffer (${audioBuffer.length} bytes)`);

    try {
      const formData = new FormData();
      formData.append('file', audioBuffer, {
        filename: 'audio.wav',
        contentType: 'audio/wav',
      });
      formData.append('language', language);
      formData.append('temperature', temperature.toString());
      formData.append('response-format', 'json');

      if (wordTimestamps) {
        formData.append('word_timestamps', 'true');
      }

      const response = await axios.post(this.apiUrl, formData, {
        headers: this.apiKey
          ? {
              Authorization: `Bearer ${this.apiKey}`,
              ...formData.getHeaders(),
            }
          : formData.getHeaders(),
        timeout: 60000, // 60 seconds
      });

      // Parse response based on whisper.cpp format
      const result = this.parseWhisperResponse(response.data);

      this.logger.log(
        `Transcription completed: "${result.text.substring(0, 100)}..."`,
      );

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`HTTP transcription failed: ${errorMessage}`);
      throw new Error(`Transcription failed: ${errorMessage}`);
    }
  }

  async transcribeFile(
    filePath: string,
    options?: STTOptions,
  ): Promise<STTResult> {
    const fs = await import('fs');
    const fileBuffer = await fs.promises.readFile(filePath);
    return this.transcribe(fileBuffer, options);
  }

  private parseWhisperResponse(data: any): STTResult {
    // Handle different response formats
    if (data.text) {
      return {
        text: data.text,
        language: data.language || 'unknown',
        languageProbability: data.language_probability,
        segments: data.segments,
      };
    }

    // Fallback for other formats
    return {
      text: JSON.stringify(data),
      language: 'unknown',
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Try to reach the health endpoint or root
      const healthUrl = this.apiUrl.replace(/\/inference$/, '/health');
      const response = await axios.get(healthUrl, { timeout: 5000 });
      return response.status === 200;
    } catch {
      // Try the main endpoint
      try {
        await axios.get(this.apiUrl, { timeout: 5000 });
        return true;
      } catch {
        return false;
      }
    }
  }
}
