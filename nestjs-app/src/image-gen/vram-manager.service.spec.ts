import { Test, TestingModule } from '@nestjs/testing';
import { VRAMManagerService } from './vram-manager.service';

describe('VRAMManagerService', () => {
  let service: VRAMManagerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VRAMManagerService],
    }).compile();

    service = module.get<VRAMManagerService>(VRAMManagerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should calculate baseline VRAM correctly', () => {
    const status = service.getVRAMStatus();

    expect(status.baseline).toBe(7168); // 5GB LLM + 2GB STT
    expect(status.total).toBe(24576); // Default 24GB
    expect(status.used).toBe(7168); // Only baseline loaded initially
  });

  describe('loadModel', () => {
    it('should load a model when VRAM available', async () => {
      const result = await service.loadModel('sdxl', 5120);

      expect(result).toBe(true);

      const status = service.getVRAMStatus();
      expect(status.used).toBe(12288); // 7168 baseline + 5120 SDXL
      expect(status.models).toHaveLength(1);
      expect(status.models[0].name).toBe('sdxl');
    });

    it('should not reload already loaded model', async () => {
      await service.loadModel('sdxl', 5120);
      const firstStatus = service.getVRAMStatus();

      await service.loadModel('sdxl', 5120);
      const secondStatus = service.getVRAMStatus();

      expect(secondStatus.used).toBe(firstStatus.used);
      expect(secondStatus.models).toHaveLength(1);
    });

    it('should unload LRU model when VRAM insufficient', async () => {
      await service.loadModel('model1', 5000);
      await new Promise((resolve) => setTimeout(resolve, 10));
      await service.loadModel('model2', 5000);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Try to load a large model that requires freeing space
      const result = await service.loadModel('large-model', 10000);

      expect(result).toBe(true);
      const status = service.getVRAMStatus();

      // Should have unloaded model1 (LRU)
      const loadedModels = status.models.map((m) => m.name);
      expect(loadedModels).not.toContain('model1');
    });

    it('should return false when insufficient VRAM even after eviction', async () => {
      // Try to load a model that's too large even with all space available
      const result = await service.loadModel('huge-model', 25000);

      expect(result).toBe(false);
    });
  });

  describe('unloadModel', () => {
    it('should unload a loaded model', async () => {
      await service.loadModel('sdxl', 5120);

      const result = await service.unloadModel('sdxl');

      expect(result).toBe(true);

      const status = service.getVRAMStatus();
      expect(status.used).toBe(7168); // Back to baseline
      expect(status.models).toHaveLength(0);
    });

    it('should return false when unloading non-existent model', async () => {
      const result = await service.unloadModel('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('canLoadModel', () => {
    it('should return true when enough VRAM available', () => {
      const canLoad = service.canLoadModel(5120);

      expect(canLoad).toBe(true); // 17GB available
    });

    it('should return true when can free LRU models', async () => {
      await service.loadModel('model1', 10000);

      const canLoad = service.canLoadModel(10000);

      expect(canLoad).toBe(true); // Can evict model1
    });

    it('should return false when model too large', () => {
      const canLoad = service.canLoadModel(30000);

      expect(canLoad).toBe(false);
    });
  });

  describe('markModelUsed', () => {
    it('should update lastUsed timestamp', async () => {
      await service.loadModel('sdxl', 5120);
      const initialStatus = service.getVRAMStatus();
      const initialTime = initialStatus.models[0].lastUsed;

      await new Promise((resolve) => setTimeout(resolve, 10));
      service.markModelUsed('sdxl');

      const updatedStatus = service.getVRAMStatus();
      const updatedTime = updatedStatus.models[0].lastUsed;

      expect(updatedTime).toBeGreaterThan(initialTime!);
    });
  });

  describe('autoUnloadIdleModels', () => {
    it('should unload models idle longer than threshold', async () => {
      await service.loadModel('idle-model', 5120);

      // Manually set lastUsed to past time
      const status = service.getVRAMStatus();
      const model = status.models[0];
      model.lastUsed = Date.now() - 400000; // 6+ minutes ago

      await service.autoUnloadIdleModels(300000); // 5 minute threshold

      const updatedStatus = service.getVRAMStatus();
      expect(updatedStatus.models).toHaveLength(0);
    });

    it('should not unload recently used models', async () => {
      await service.loadModel('active-model', 5120);

      await service.autoUnloadIdleModels(300000);

      const status = service.getVRAMStatus();
      expect(status.models).toHaveLength(1);
    });
  });

  describe('getVRAMStatus', () => {
    it('should return comprehensive VRAM status', async () => {
      await service.loadModel('model1', 3000);
      await service.loadModel('model2', 2000);

      const status = service.getVRAMStatus();

      expect(status.total).toBe(24576);
      expect(status.baseline).toBe(7168);
      expect(status.used).toBe(12168); // 7168 + 3000 + 2000
      expect(status.available).toBe(12408); // 24576 - 12168
      expect(status.models).toHaveLength(2);
    });
  });
});
