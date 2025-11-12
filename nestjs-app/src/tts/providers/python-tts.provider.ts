import { Injectable, Logger } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import { TTSProvider, TTSOptions, TTSResult } from '../interfaces/tts.interface';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Python TTS Provider - Bridges to Python-based TTS engines
 * Supports: Coqui TTS, Piper, Bark, and other Python TTS libraries
 */
@Injectable()
export class PythonTTSProvider implements TTSProvider {
  private readonly logger = new Logger(PythonTTSProvider.name);
  readonly name = 'python-tts';
  readonly supportedVoices: string[] = ['default', 'female', 'male'];
  readonly supportedFormats: string[] = ['wav', 'mp3'];

  private pythonPath: string;
  private scriptPath: string;

  constructor() {
    this.pythonPath = process.env.PYTHON_PATH || 'python3';
    this.scriptPath = path.join(__dirname, '..', '..', '..', 'python', 'tts_bridge.py');
  }

  async generateSpeech(text: string, options?: TTSOptions): Promise<TTSResult> {
    const { voice = 'default', speed = 1.0, format = 'wav', language = 'en' } = options || {};

    this.logger.log(`Generating speech for text: "${text.substring(0, 50)}..."`);

    try {
      // Create temporary file for audio output
      const tempFile = path.join(os.tmpdir(), `tts-${Date.now()}.${format}`);

      // Call Python script
      await this.executePythonScript(text, tempFile, { voice, speed, language });

      // Read generated audio
      const audioBuffer = await fs.readFile(tempFile);

      // Clean up temp file
      await fs.unlink(tempFile).catch(() => {
        // Ignore cleanup errors
      });

      return {
        audioBuffer,
        format,
        voice,
      };
    } catch (error) {
      this.logger.error(`Speech generation failed: ${error.message}`);
      throw error;
    }
  }

  private executePythonScript(
    text: string,
    outputPath: string,
    options: { voice: string; speed: number; language: string },
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        this.scriptPath,
        '--text',
        text,
        '--output',
        outputPath,
        '--voice',
        options.voice,
        '--speed',
        options.speed.toString(),
        '--language',
        options.language,
      ];

      const python: ChildProcess = spawn(this.pythonPath, args);

      let stderr = '';

      python.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('error', (error) => {
        this.logger.error(`Failed to spawn Python process: ${error.message}`);
        reject(new Error(`Python process error: ${error.message}`));
      });

      python.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          this.logger.error(`Python script failed with code ${code}: ${stderr}`);
          reject(new Error(`Python script failed: ${stderr}`));
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
    // Estimate - depends on the actual TTS model used
    return 2048; // 2GB estimate
  }
}
