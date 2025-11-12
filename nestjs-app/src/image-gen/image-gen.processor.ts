import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  ImageGenJobData,
  ImageGenJobResult,
} from './interfaces/image-gen.interface';
import { ComfyUIProvider } from './providers/comfyui.provider';

@Processor('image-generation', {
  concurrency: 1, // Process one image at a time to manage VRAM
})
export class ImageGenProcessor extends WorkerHost {
  private readonly logger = new Logger(ImageGenProcessor.name);

  constructor(private readonly comfyuiProvider: ComfyUIProvider) {
    super();
  }

  async process(job: Job<ImageGenJobData>): Promise<ImageGenJobResult> {
    const {
      prompt,
      negativePrompt,
      width,
      height,
      steps,
      cfgScale,
      seed,
      sampler,
      userId,
    } = job.data;

    this.logger.log(
      `Processing image generation job ${job.id} for user ${userId}`,
    );

    try {
      // Update progress: 10% - Job started
      await job.updateProgress(10);

      // Check if provider is available
      const isAvailable = await this.comfyuiProvider.isAvailable();
      if (!isAvailable) {
        throw new Error('ComfyUI server is not available');
      }

      await job.updateProgress(20);

      // Generate image
      this.logger.log(`Generating image: "${prompt.substring(0, 50)}..."`);

      const result = await this.comfyuiProvider.generateImage({
        prompt,
        negativePrompt,
        width,
        height,
        steps,
        cfgScale,
        seed,
        sampler,
      });

      await job.updateProgress(90);

      this.logger.log(
        `Image generation completed for job ${job.id}: ${result.imagePath}`,
      );

      await job.updateProgress(100);

      return {
        imagePath: result.imagePath,
        imageUrl: result.imageUrl,
        prompt: result.prompt,
        model: result.model,
        width: result.width,
        height: result.height,
        seed: result.seed,
        generationTime: result.generationTime,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to process job ${job.id}: ${errorMessage}`);
      throw error;
    }
  }
}
