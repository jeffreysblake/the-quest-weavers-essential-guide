export interface TTSOptions {
  voice?: string;
  speed?: number;
  format?: 'mp3' | 'wav' | 'opus';
  language?: string;
}

export interface TTSResult {
  audioBuffer: Buffer;
  format: string;
  duration?: number;
  voice: string;
}

export interface TTSProvider {
  readonly name: string;
  readonly supportedVoices: string[];
  readonly supportedFormats: string[];

  generateSpeech(text: string, options?: TTSOptions): Promise<TTSResult>;
  isAvailable(): Promise<boolean>;
  getVRAMUsage?(): number;
}

export interface TTSProviderConfig {
  enabled: boolean;
  priority: number;
  config?: Record<string, any>;
}
