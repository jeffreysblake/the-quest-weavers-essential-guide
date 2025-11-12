export interface STTOptions {
  language?: string;
  model?: string;
  wordTimestamps?: boolean;
  temperature?: number;
}

export interface STTWord {
  word: string;
  start: number;
  end: number;
  probability?: number;
}

export interface STTSegment {
  text: string;
  start: number;
  end: number;
  words?: STTWord[];
}

export interface STTResult {
  text: string;
  language: string;
  languageProbability?: number;
  duration?: number;
  segments?: STTSegment[];
}

export interface STTProvider {
  readonly name: string;
  readonly supportedLanguages: string[];
  readonly supportedModels: string[];

  transcribe(audioBuffer: Buffer, options?: STTOptions): Promise<STTResult>;
  transcribeFile(filePath: string, options?: STTOptions): Promise<STTResult>;
  isAvailable(): Promise<boolean>;
  getVRAMUsage?(): number;
}
