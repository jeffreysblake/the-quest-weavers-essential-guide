import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { STTProvider, STTOptions, STTResult } from './interfaces/stt.interface';

@Injectable()
export class STTService implements OnModuleInit {
  private readonly logger = new Logger(STTService.name);
  private providers = new Map<string, STTProvider>();
  private primaryProvider: string | null = null;
  private isInitialized = false;
  private totalTranscriptions = 0;
  private totalAudioDuration = 0;

  async onModuleInit() {
    this.logger.log('STT Service initializing...');
    await this.checkProviderAvailability();
  }

  /**
   * Register an STT provider
   */
  registerProvider(provider: STTProvider, isPrimary = false): void {
    this.providers.set(provider.name, provider);
    if (isPrimary) {
      this.primaryProvider = provider.name;
    }
    this.logger.log(
      `Registered STT provider: ${provider.name}${isPrimary ? ' (primary)' : ''}`,
    );
  }

  /**
   * Check which providers are available
   */
  private async checkProviderAvailability(): Promise<void> {
    const availableProviders: string[] = [];

    for (const [name, provider] of this.providers.entries()) {
      try {
        const available = await provider.isAvailable();
        if (available) {
          availableProviders.push(name);
          this.logger.log(`STT provider "${name}" is available`);
        } else {
          this.logger.warn(`STT provider "${name}" is not available`);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to check STT provider "${name}": ${error.message}`,
        );
      }
    }

    if (availableProviders.length === 0) {
      this.logger.warn('No STT providers are available');
    } else {
      // If primary provider is not available, use first available
      if (
        !this.primaryProvider ||
        !availableProviders.includes(this.primaryProvider)
      ) {
        this.primaryProvider = availableProviders[0];
        this.logger.log(
          `Using "${this.primaryProvider}" as primary STT provider`,
        );
      }
      this.isInitialized = true;
    }
  }

  /**
   * Transcribe audio buffer
   */
  async transcribe(
    audioBuffer: Buffer,
    options?: STTOptions,
    providerName?: string,
  ): Promise<STTResult> {
    if (!this.isInitialized) {
      throw new Error(
        'STT service is not initialized - no providers available',
      );
    }

    // Determine which provider to use
    const targetProvider = providerName || this.primaryProvider;
    if (!targetProvider) {
      throw new Error('No STT provider available');
    }

    const provider = this.providers.get(targetProvider);
    if (!provider) {
      throw new Error(`STT provider "${targetProvider}" not found`);
    }

    this.logger.log(
      `Transcribing audio using provider: ${targetProvider} (${audioBuffer.length} bytes)`,
    );

    try {
      const startTime = Date.now();
      const result = await provider.transcribe(audioBuffer, options);
      const duration = Date.now() - startTime;

      this.totalTranscriptions++;
      if (result.duration) {
        this.totalAudioDuration += result.duration;
      }

      this.logger.log(
        `Transcription completed in ${duration}ms: "${result.text.substring(0, 100)}..."`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Transcription failed with ${targetProvider}: ${error.message}`,
      );

      // Try fallback to another provider
      if (providerName === undefined && this.providers.size > 1) {
        this.logger.log('Attempting fallback to another provider...');
        const fallbackProvider = Array.from(this.providers.keys()).find(
          (name) => name !== targetProvider,
        );
        if (fallbackProvider) {
          return this.transcribe(audioBuffer, options, fallbackProvider);
        }
      }

      throw error;
    }
  }

  /**
   * Transcribe audio file
   */
  async transcribeFile(
    filePath: string,
    options?: STTOptions,
    providerName?: string,
  ): Promise<STTResult> {
    if (!this.isInitialized) {
      throw new Error(
        'STT service is not initialized - no providers available',
      );
    }

    const targetProvider = providerName || this.primaryProvider;
    if (!targetProvider) {
      throw new Error('No STT provider available');
    }

    const provider = this.providers.get(targetProvider);
    if (!provider) {
      throw new Error(`STT provider "${targetProvider}" not found`);
    }

    this.logger.log(`Transcribing file using provider: ${targetProvider}`);

    try {
      const result = await provider.transcribeFile(filePath, options);
      this.totalTranscriptions++;
      if (result.duration) {
        this.totalAudioDuration += result.duration;
      }
      return result;
    } catch (error) {
      this.logger.error(`File transcription failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get list of supported languages
   */
  getSupportedLanguages(): Array<{ language: string; provider: string }> {
    const languages: Array<{ language: string; provider: string }> = [];

    for (const [providerName, provider] of this.providers.entries()) {
      for (const language of provider.supportedLanguages) {
        languages.push({ language, provider: providerName });
      }
    }

    return languages;
  }

  /**
   * Get list of supported models
   */
  getSupportedModels(): Array<{
    model: string;
    provider: string;
    vramUsage?: number;
  }> {
    const models: Array<{
      model: string;
      provider: string;
      vramUsage?: number;
    }> = [];

    for (const [providerName, provider] of this.providers.entries()) {
      for (const model of provider.supportedModels) {
        models.push({
          model,
          provider: providerName,
          vramUsage: provider.getVRAMUsage?.(),
        });
      }
    }

    return models;
  }

  /**
   * Get list of registered providers
   */
  getProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if STT service is available
   */
  isAvailable(): boolean {
    return this.isInitialized && this.primaryProvider !== null;
  }

  /**
   * Get service statistics
   */
  getStats(): {
    initialized: boolean;
    primaryProvider: string | null;
    availableProviders: number;
    totalTranscriptions: number;
    totalAudioDuration: number;
  } {
    return {
      initialized: this.isInitialized,
      primaryProvider: this.primaryProvider,
      availableProviders: this.providers.size,
      totalTranscriptions: this.totalTranscriptions,
      totalAudioDuration: this.totalAudioDuration,
    };
  }

  /**
   * Estimate total VRAM usage
   */
  getTotalVRAMUsage(): number {
    let total = 0;
    for (const provider of this.providers.values()) {
      if (provider.getVRAMUsage) {
        total += provider.getVRAMUsage();
      }
    }
    return total;
  }
}
