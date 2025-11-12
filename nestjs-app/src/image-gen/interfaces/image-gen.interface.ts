export interface ImageGenOptions {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
  seed?: number;
  sampler?: string;
  scheduler?: string;
}

export interface ImageGenResult {
  imagePath: string;
  imageUrl?: string;
  imageData?: Buffer;
  prompt: string;
  seed: number;
  width: number;
  height: number;
  steps: number;
  model: string;
  generationTime: number;
}

export interface ImageGenProvider {
  readonly name: string;
  readonly supportedModels: string[];
  readonly defaultModel: string;

  generateImage(options: ImageGenOptions): Promise<ImageGenResult>;
  isAvailable(): Promise<boolean>;
  getVRAMUsage(): number;
  unloadModel?(): Promise<void>;
  loadModel?(modelName: string): Promise<void>;
}

export interface ImageGenJobData {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  steps: number;
  cfgScale: number;
  seed?: number;
  sampler?: string;
  model: string;
  userId: string;
  priority?: number;
}

export interface ImageGenJobResult {
  imagePath: string;
  imageUrl?: string;
  prompt: string;
  model: string;
  width: number;
  height: number;
  seed: number;
  generationTime: number;
}
