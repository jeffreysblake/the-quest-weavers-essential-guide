import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TTSProvider, TTSOptions, TTSResult } from './interfaces/tts.interface';

@Injectable()
export class TTSService implements OnModuleInit {
  private readonly logger = new Logger(TTSService.name);
  private providers = new Map<string, TTSProvider>();
  private primaryProvider: string | null = null;
  private isInitialized = false;

  async onModuleInit() {
    this.logger.log('TTS Service initializing...');
    await this.checkProviderAvailability();
  }

  /**
   * Register a TTS provider
   */
  registerProvider(provider: TTSProvider, isPrimary = false): void {
    this.providers.set(provider.name, provider);
    if (isPrimary) {
      this.primaryProvider = provider.name;
    }
    this.logger.log(
      `Registered TTS provider: ${provider.name}${isPrimary ? ' (primary)' : ''}`,
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
          this.logger.log(`TTS provider "${name}" is available`);
        } else {
          this.logger.warn(`TTS provider "${name}" is not available`);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to check TTS provider "${name}": ${error.message}`,
        );
      }
    }

    if (availableProviders.length === 0) {
      this.logger.warn('No TTS providers are available');
    } else {
      // If primary provider is not available, use first available
      if (
        !this.primaryProvider ||
        !availableProviders.includes(this.primaryProvider)
      ) {
        this.primaryProvider = availableProviders[0];
        this.logger.log(
          `Using "${this.primaryProvider}" as primary TTS provider`,
        );
      }
      this.isInitialized = true;
    }
  }

  /**
   * Generate speech from text
   */
  async generateSpeech(
    text: string,
    options?: TTSOptions,
    providerName?: string,
  ): Promise<TTSResult> {
    if (!this.isInitialized) {
      throw new Error(
        'TTS service is not initialized - no providers available',
      );
    }

    // Determine which provider to use
    const targetProvider = providerName || this.primaryProvider;
    if (!targetProvider) {
      throw new Error('No TTS provider available');
    }

    const provider = this.providers.get(targetProvider);
    if (!provider) {
      throw new Error(`TTS provider "${targetProvider}" not found`);
    }

    this.logger.log(`Generating speech using provider: ${targetProvider}`);

    try {
      const result = await provider.generateSpeech(text, options);
      this.logger.log(
        `Speech generated successfully (${result.audioBuffer.length} bytes)`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `Speech generation failed with ${targetProvider}: ${error.message}`,
      );

      // Try fallback to another provider
      if (providerName === undefined && this.providers.size > 1) {
        this.logger.log('Attempting fallback to another provider...');
        const fallbackProvider = Array.from(this.providers.keys()).find(
          (name) => name !== targetProvider,
        );
        if (fallbackProvider) {
          return this.generateSpeech(text, options, fallbackProvider);
        }
      }

      throw error;
    }
  }

  /**
   * Get list of available voices across all providers
   */
  getAvailableVoices(): Array<{ voice: string; provider: string }> {
    const voices: Array<{ voice: string; provider: string }> = [];

    for (const [providerName, provider] of this.providers.entries()) {
      for (const voice of provider.supportedVoices) {
        voices.push({ voice, provider: providerName });
      }
    }

    return voices;
  }

  /**
   * Get list of registered providers
   */
  getProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if TTS service is available
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
    totalVoices: number;
  } {
    return {
      initialized: this.isInitialized,
      primaryProvider: this.primaryProvider,
      availableProviders: this.providers.size,
      totalVoices: this.getAvailableVoices().length,
    };
  }

  /**
   * Estimate total VRAM usage across all providers
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
