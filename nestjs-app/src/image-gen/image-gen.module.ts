import { Module, Global, Logger } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ImageGenService } from './image-gen.service';
import { ImageGenController } from './image-gen.controller';
import { ImageGenProcessor } from './image-gen.processor';
import { ComfyUIProvider } from './providers/comfyui.provider';
import { VRAMManagerService } from './vram-manager.service';

@Global()
@Module({
  imports: [
    BullModule.registerQueue({
      name: 'image-generation',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: {
          age: 3600, // 1 hour
          count: 100,
        },
        removeOnFail: {
          age: 86400, // 24 hours
        },
      },
    }),
  ],
  controllers: [ImageGenController],
  providers: [
    ImageGenService,
    ImageGenProcessor,
    ComfyUIProvider,
    VRAMManagerService,
    {
      provide: 'IMAGE_GEN_INITIALIZER',
      useFactory: async (
        imageGenService: ImageGenService,
        comfyuiProvider: ComfyUIProvider,
        vramManager: VRAMManagerService,
      ) => {
        const logger = new Logger('ImageGenModule');

        // Check if service is available
        const isAvailable = imageGenService.isAvailable();

        if (!isAvailable) {
          logger.warn(
            'Image generation queue not available. Redis may not be running.',
          );
          logger.warn('To enable image generation:');
          logger.warn(
            '  1. Install Redis: apt-get install redis-server (Linux) or brew install redis (Mac)',
          );
          logger.warn('  2. Start Redis: redis-server');
          logger.warn('  3. Configure: Set REDIS_HOST and REDIS_PORT in .env');
          return;
        }

        // Check if ComfyUI is available
        const comfyuiAvailable = await comfyuiProvider.isAvailable();

        if (!comfyuiAvailable) {
          logger.warn('ComfyUI server not available.');
          logger.warn('To enable image generation with ComfyUI:');
          logger.warn(
            '  1. Install ComfyUI: https://github.com/comfyanonymous/ComfyUI',
          );
          logger.warn(
            '  2. Start server: python main.py --listen 0.0.0.0 --port 8188',
          );
          logger.warn(
            '  3. Download SDXL model and place in ComfyUI/models/checkpoints/',
          );
          logger.warn('  4. Configure: Set COMFYUI_HOST in .env');
          return;
        }

        // Log VRAM status
        const vramStatus = vramManager.getVRAMStatus();
        logger.log(`Image Generation Module initialized successfully`);
        logger.log(`VRAM Status:
          - Total: ${vramStatus.total}MB
          - Baseline (LLM+STT): ${vramStatus.baseline}MB
          - Used: ${vramStatus.used}MB
          - Available: ${vramStatus.available}MB
        `);

        logger.log('ComfyUI provider is available');
        logger.log(
          `Estimated VRAM for SDXL: ${comfyuiProvider.getVRAMUsage()}MB`,
        );

        // Set up auto-unload idle models every 5 minutes
        setInterval(() => {
          void vramManager.autoUnloadIdleModels(300000); // 5 minutes
        }, 60000); // Check every minute

        return imageGenService;
      },
      inject: [ImageGenService, ComfyUIProvider, VRAMManagerService],
    },
  ],
  exports: [ImageGenService, VRAMManagerService],
})
export class ImageGenModule {
  private readonly logger = new Logger(ImageGenModule.name);

  constructor(
    private readonly imageGenService: ImageGenService,
    private readonly vramManager: VRAMManagerService,
  ) {
    // Log module status after initialization
    setTimeout(() => {
      this.logStatus();
    }, 2000);
  }

  private logStatus(): void {
    const isAvailable = this.imageGenService.isAvailable();
    const vramStatus = this.vramManager.getVRAMStatus();

    this.logger.log(`Image Generation Module Status:
      - Queue Available: ${isAvailable}
      - VRAM Used: ${vramStatus.used}/${vramStatus.total}MB
      - Available for Image Gen: ${vramStatus.available}MB
      - Loaded Models: ${vramStatus.models.length}
    `);
  }
}
