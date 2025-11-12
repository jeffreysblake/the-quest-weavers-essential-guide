import { Injectable, Logger } from '@nestjs/common';

export interface ModelInfo {
  name: string;
  vramUsage: number;
  isLoaded: boolean;
  loadedAt?: number;
  lastUsed?: number;
}

@Injectable()
export class VRAMManagerService {
  private readonly logger = new Logger(VRAMManagerService.name);
  private loadedModels: Map<string, ModelInfo> = new Map();
  private maxVRAM: number;
  private usedVRAM = 0;
  private baselineVRAM = 0; // LLM + STT always loaded

  constructor() {
    // Get VRAM limit from environment (in MB)
    this.maxVRAM = parseInt(process.env.VRAM_LIMIT || '24576'); // 24GB default

    // Calculate baseline VRAM (always loaded models)
    this.calculateBaselineVRAM();
  }

  private calculateBaselineVRAM(): void {
    // 7B LLM (Q4_K_M): ~5GB
    const llmVRAM = 5120;

    // Whisper Small: ~2GB
    const sttVRAM = 2048;

    // TTS (GPU mode): 0.5-1GB, but typically CPU offloaded
    const ttsVRAM = 0;

    this.baselineVRAM = llmVRAM + sttVRAM + ttsVRAM;
    this.usedVRAM = this.baselineVRAM;

    this.logger.log(`Baseline VRAM usage: ${this.baselineVRAM}MB (LLM + STT)`);
    this.logger.log(`Available VRAM for dynamic models: ${this.maxVRAM - this.baselineVRAM}MB`);
  }

  async loadModel(modelName: string, vramRequired: number): Promise<boolean> {
    // Check if model is already loaded
    if (this.loadedModels.has(modelName)) {
      const model = this.loadedModels.get(modelName)!;
      model.lastUsed = Date.now();
      this.logger.log(`Model ${modelName} already loaded`);
      return true;
    }

    // Check VRAM availability
    const availableVRAM = this.maxVRAM - this.usedVRAM;

    if (vramRequired > availableVRAM) {
      this.logger.warn(
        `Insufficient VRAM for ${modelName}. Required: ${vramRequired}MB, Available: ${availableVRAM}MB`,
      );

      // Try to free up VRAM by unloading least recently used models
      const freed = await this.freeLRUModels(vramRequired - availableVRAM);

      if (!freed) {
        this.logger.error(`Cannot free enough VRAM for ${modelName}`);
        return false;
      }
    }

    // Load model
    const now = Date.now();
    this.loadedModels.set(modelName, {
      name: modelName,
      vramUsage: vramRequired,
      isLoaded: true,
      loadedAt: now,
      lastUsed: now,
    });

    this.usedVRAM += vramRequired;

    this.logger.log(
      `Loaded ${modelName} (${vramRequired}MB). Total VRAM: ${this.usedVRAM}/${this.maxVRAM}MB`,
    );

    return true;
  }

  async unloadModel(modelName: string): Promise<boolean> {
    const model = this.loadedModels.get(modelName);
    if (!model) {
      this.logger.warn(`Model ${modelName} is not loaded`);
      return false;
    }

    this.usedVRAM -= model.vramUsage;
    this.loadedModels.delete(modelName);

    this.logger.log(
      `Unloaded ${modelName} (${model.vramUsage}MB). Total VRAM: ${this.usedVRAM}/${this.maxVRAM}MB`,
    );

    return true;
  }

  private async freeLRUModels(requiredSpace: number): Promise<boolean> {
    // Get all loaded models sorted by last used time
    const models = Array.from(this.loadedModels.values()).sort((a, b) => {
      return (a.lastUsed || 0) - (b.lastUsed || 0);
    });

    let freedSpace = 0;

    for (const model of models) {
      if (freedSpace >= requiredSpace) {
        break;
      }

      this.logger.log(`Unloading LRU model: ${model.name} to free VRAM`);
      await this.unloadModel(model.name);
      freedSpace += model.vramUsage;
    }

    return freedSpace >= requiredSpace;
  }

  getVRAMStatus(): {
    total: number;
    used: number;
    available: number;
    baseline: number;
    models: ModelInfo[];
  } {
    return {
      total: this.maxVRAM,
      used: this.usedVRAM,
      available: this.maxVRAM - this.usedVRAM,
      baseline: this.baselineVRAM,
      models: Array.from(this.loadedModels.values()),
    };
  }

  canLoadModel(vramRequired: number): boolean {
    const availableVRAM = this.maxVRAM - this.usedVRAM;
    return vramRequired <= availableVRAM || this.loadedModels.size > 0; // Can free LRU models
  }

  markModelUsed(modelName: string): void {
    const model = this.loadedModels.get(modelName);
    if (model) {
      model.lastUsed = Date.now();
    }
  }

  async autoUnloadIdleModels(idleTimeMs: number = 300000): Promise<void> {
    // Unload models that haven't been used in the specified time (default 5 minutes)
    const now = Date.now();

    for (const [name, model] of this.loadedModels.entries()) {
      if (model.lastUsed && now - model.lastUsed > idleTimeMs) {
        this.logger.log(`Auto-unloading idle model: ${name}`);
        await this.unloadModel(name);
      }
    }
  }
}
