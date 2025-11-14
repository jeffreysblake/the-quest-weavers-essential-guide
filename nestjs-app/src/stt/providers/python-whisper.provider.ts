import { Injectable, Logger } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import {
  STTProvider,
  STTOptions,
  STTResult,
} from '../interfaces/stt.interface';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Python Whisper Provider - Bridges to OpenAI Whisper or faster-whisper
 */
@Injectable()
export class PythonWhisperProvider implements STTProvider {
  private readonly logger = new Logger(PythonWhisperProvider.name);
  readonly name = 'python-whisper';
  readonly supportedLanguages: string[] = [
    'en',
    'es',
    'fr',
    'de',
    'it',
    'pt',
    'ru',
    'zh',
    'ja',
    'ko',
    'ar',
    // Whisper supports 99 languages total
  ];
  readonly supportedModels: string[] = [
    'tiny',
    'tiny.en',
    'base',
    'base.en',
    'small',
    'small.en',
    'medium',
    'medium.en',
    'large-v2',
    'large-v3',
  ];

  private pythonPath: string;
  private scriptPath: string;
  private modelPath?: string;

  constructor() {
    this.pythonPath = process.env.PYTHON_PATH || 'python3';
    this.scriptPath = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'python',
      'whisper_bridge.py',
    );
    this.modelPath = process.env.WHISPER_MODEL_PATH;
  }

  async transcribe(
    audioBuffer: Buffer,
    options?: STTOptions,
  ): Promise<STTResult> {
    // Write buffer to temporary file
    const tempFile = path.join(os.tmpdir(), `stt-${Date.now()}.wav`);

    try {
      await fs.writeFile(tempFile, audioBuffer);
      const result = await this.transcribeFile(tempFile, options);

      // Clean up temp file
      await fs.unlink(tempFile).catch(() => {
        // Ignore cleanup errors
      });

      return result;
    } catch (error) {
      this.logger.error(`Transcription failed: ${error.message}`);
      throw error;
    }
  }

  async transcribeFile(
    filePath: string,
    options?: STTOptions,
  ): Promise<STTResult> {
    const {
      language = 'en',
      model = 'base.en',
      wordTimestamps = false,
      temperature = 0,
    } = options || {};

    this.logger.log(
      `Transcribing audio file: ${filePath} with model: ${model}`,
    );

    try {
      // Check if file exists
      await fs.access(filePath);

      const result = await this.executePythonScript(filePath, {
        language,
        model,
        wordTimestamps,
        temperature,
      });

      this.logger.log(
        `Transcription completed: "${result.text.substring(0, 100)}..."`,
      );

      return result;
    } catch (error) {
      this.logger.error(`File transcription failed: ${error.message}`);
      throw error;
    }
  }

  private executePythonScript(
    audioPath: string,
    options: {
      language: string;
      model: string;
      wordTimestamps: boolean;
      temperature: number;
    },
  ): Promise<STTResult> {
    return new Promise((resolve, reject) => {
      const args = [
        this.scriptPath,
        '--audio',
        audioPath,
        '--model',
        options.model,
        '--language',
        options.language,
        '--temperature',
        options.temperature.toString(),
      ];

      if (options.wordTimestamps) {
        args.push('--word-timestamps');
      }

      if (this.modelPath) {
        args.push('--model-path', this.modelPath);
      }

      const python: ChildProcess = spawn(this.pythonPath, args);

      let stdout = '';
      let stderr = '';

      python.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('error', (error) => {
        this.logger.error(`Failed to spawn Python process: ${error.message}`);
        reject(new Error(`Python process error: ${error.message}`));
      });

      python.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch (e) {
            reject(new Error(`Failed to parse Python output: ${e.message}`));
          }
        } else {
          this.logger.error(
            `Python script failed with code ${code}: ${stderr}`,
          );
          reject(new Error(`Transcription failed: ${stderr}`));
        }
      });
    });
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if Python script exists
      await fs.access(this.scriptPath);

      // Check if Python is available
      return new Promise((resolve) => {
        const python = spawn(this.pythonPath, ['--version']);
        python.on('error', () => resolve(false));
        python.on('close', (code) => resolve(code === 0));
      });
    } catch {
      return false;
    }
  }

  getVRAMUsage(): number {
    // Estimate based on model size
    const modelSizes: Record<string, number> = {
      tiny: 1024, // 1GB
      'tiny.en': 1024,
      base: 1024,
      'base.en': 1024,
      small: 2048, // 2GB
      'small.en': 2048,
      medium: 5120, // 5GB
      'medium.en': 5120,
      'large-v2': 10240, // 10GB
      'large-v3': 10240,
    };

    const defaultModel = process.env.STT_MODEL || 'base.en';
    return modelSizes[defaultModel] || 2048;
  }
}
