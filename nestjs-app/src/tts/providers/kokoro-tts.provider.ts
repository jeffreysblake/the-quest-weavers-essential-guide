import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  TTSProvider,
  TTSOptions,
  TTSResult,
} from '../interfaces/tts.interface';

/**
 * Kokoro TTS Provider - Native Node.js implementation
 * Supports both CPU and GPU (WebGPU/CUDA) acceleration
 * No Python bridge required - runs directly in Node.js
 *
 * Model: 82M parameters, Apache 2.0 license
 * VRAM: 1-2GB (GPU mode), ~500MB RAM (CPU mode)
 * Speed: 35-100x realtime on GPU, acceptable on CPU
 */
@Injectable()
export class KokoroTTSProvider implements TTSProvider, OnModuleInit {
  private readonly logger = new Logger(KokoroTTSProvider.name);
  readonly name = 'kokoro';
  readonly supportedVoices: string[] = [
    'af_bella', // American Female - Bella
    'af_sarah', // American Female - Sarah
    'af_nicole', // American Female - Nicole
    'am_adam', // American Male - Adam
    'am_michael', // American Male - Michael
    'bf_emma', // British Female - Emma
    'bf_isabella', // British Female - Isabella
    'bm_george', // British Male - George
    'bm_lewis', // British Male - Lewis
  ];
  readonly supportedFormats: string[] = ['wav', 'mp3'];

  private tts: any; // KokoroTTS instance
  private isInitialized = false;
  private useGPU: boolean;
  private modelSize: string;

  constructor() {
    this.useGPU = process.env.TTS_KOKORO_GPU === 'true';
    this.modelSize = process.env.TTS_KOKORO_MODEL_SIZE || 'q8'; // q8, q4, fp16
  }

  async onModuleInit() {
    try {
      await this.initialize();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Kokoro TTS initialization failed: ${errorMessage}`);
      this.logger.warn(
        'TTS features will be limited. Install kokoro-js for native TTS support.',
      );
    }
  }

  private async initialize(): Promise<void> {
    try {
      // Dynamically import kokoro-js (optional dependency)
      const kokoroModule = await import('kokoro-js');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      const KokoroTTS = (kokoroModule as any).KokoroTTS || kokoroModule;

      this.logger.log('Initializing Kokoro TTS...');

      // Load the ONNX model with available options
      // Note: kokoro-js API may vary by version
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const options: any = {
        dtype: this.modelSize, // q8 (200MB), q4 (100MB), fp16 (164MB)
      };

      // Add device option if supported
      if (this.useGPU) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        options.device = 'gpu';
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      this.tts = await (KokoroTTS.from_pretrained || KokoroTTS)(
        'onnx-community/Kokoro-82M-v1.0-ONNX',
        options,
      );

      this.isInitialized = true;
      this.logger.log(
        `Kokoro TTS initialized successfully (${this.useGPU ? 'GPU' : 'CPU'} mode, ${this.modelSize} quantization)`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to initialize Kokoro TTS: ${errorMessage}`);
      throw error;
    }
  }

  async generateSpeech(text: string, options?: TTSOptions): Promise<TTSResult> {
    if (!this.isInitialized) {
      throw new Error('Kokoro TTS is not initialized');
    }

    const { voice = 'af_bella', speed = 1.0, format = 'wav' } = options || {};

    // Validate voice
    if (!this.supportedVoices.includes(voice)) {
      throw new Error(
        `Unsupported voice: ${voice}. Available voices: ${this.supportedVoices.join(', ')}`,
      );
    }

    this.logger.log(
      `Generating speech with Kokoro (voice: ${voice}, speed: ${speed})`,
    );

    try {
      const startTime = Date.now();

      // Generate audio
      const audio = await this.tts.generate(text, {
        voice,
        speed,
      });

      const duration = Date.now() - startTime;

      // Convert to Buffer
      const audioBuffer = Buffer.from(audio.data);

      this.logger.log(
        `Speech generated in ${duration}ms (${audioBuffer.length} bytes)`,
      );

      return {
        audioBuffer,
        format: 'wav', // Kokoro outputs WAV by default
        voice,
        duration: audio.duration,
      };
    } catch (error) {
      this.logger.error(`Speech generation failed: ${error.message}`);
      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if kokoro-js is installed
      await import('kokoro-js');
      return true;
    } catch {
      return false;
    }
  }

  getVRAMUsage(): number {
    if (!this.useGPU) {
      return 0; // CPU mode uses RAM, not VRAM
    }

    // Estimate based on model size
    const vramSizes: Record<string, number> = {
      q8: 512, // ~512MB quantized
      q4: 256, // ~256MB heavily quantized
      fp16: 1024, // ~1GB full precision
    };

    return vramSizes[this.modelSize] || 512;
  }

  /**
   * Generate streaming audio (chunked generation)
   * Note: Streaming support depends on kokoro-js version and capabilities
   */
  async *generateStreamingAudio(
    text: string,
    options?: TTSOptions,
  ): AsyncGenerator<Buffer> {
    if (!this.isInitialized) {
      throw new Error('Kokoro TTS is not initialized');
    }

    const { voice = 'af_bella' } = options || {};

    try {
      // Simple chunking strategy - split by sentences
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

      for (const sentence of sentences) {
        if (sentence.trim()) {
          const audio = await this.tts.generate(sentence.trim(), { voice });
          yield Buffer.from(audio.data);
        }
      }
    } catch (error) {
      this.logger.error(`Streaming generation failed: ${error.message}`);
      throw error;
    }
  }
}
