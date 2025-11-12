import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ImageGenService } from './image-gen.service';
import { GenerateImageDto } from './image-gen.dto';

@Controller('api/image-gen')
export class ImageGenController {
  private readonly logger = new Logger(ImageGenController.name);

  constructor(private readonly imageGenService: ImageGenService) {}

  @Get('status')
  getStatus() {
    const isAvailable = this.imageGenService.isAvailable();
    return {
      status: isAvailable ? 'available' : 'unavailable',
      message: isAvailable
        ? 'Image generation service is ready'
        : 'Redis not available. Start Redis to enable image generation.',
    };
  }

  @Get('metrics')
  async getMetrics() {
    return this.imageGenService.getQueueMetrics();
  }

  @Post('generate')
  async generateImage(
    @Body() dto: GenerateImageDto,
    @Query('userId') userId: string = 'anonymous',
  ) {
    if (!this.imageGenService.isAvailable()) {
      throw new HttpException(
        'Image generation service is not available. Ensure Redis is running.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    this.logger.log(`Image generation requested by user: ${userId}`);

    try {
      const job = await this.imageGenService.queueImageGeneration({
        prompt: dto.prompt,
        negativePrompt: dto.negativePrompt,
        width: dto.width || 1024,
        height: dto.height || 1024,
        steps: dto.steps || 20,
        cfgScale: dto.cfgScale || 7.5,
        seed: dto.seed,
        sampler: dto.sampler || 'dpmpp_2m',
        model: dto.model || 'sdxl',
        userId,
        priority: dto.priority || 10,
      });

      return {
        success: true,
        jobId: job.id,
        status: 'queued',
        message: 'Image generation queued successfully',
        estimatedTime: '1-2 minutes',
      };
    } catch (error) {
      this.logger.error(`Failed to queue image generation: ${error.message}`);
      throw new HttpException(
        error.message || 'Failed to queue image generation',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('job/:jobId')
  async getJobStatus(@Param('jobId') jobId: string) {
    try {
      const status = await this.imageGenService.getJobStatus(jobId);

      if (status.status === 'not_found') {
        throw new HttpException('Job not found', HttpStatus.NOT_FOUND);
      }

      return {
        success: true,
        ...status,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to get job status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('job/:jobId')
  async cancelJob(@Param('jobId') jobId: string) {
    try {
      const cancelled = await this.imageGenService.cancelJob(jobId);

      if (!cancelled) {
        throw new HttpException('Job not found', HttpStatus.NOT_FOUND);
      }

      return {
        success: true,
        message: 'Job cancelled successfully',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to cancel job',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('job/:jobId/retry')
  async retryJob(@Param('jobId') jobId: string) {
    try {
      const job = await this.imageGenService.retryFailedJob(jobId);

      if (!job) {
        throw new HttpException('Job not found', HttpStatus.NOT_FOUND);
      }

      return {
        success: true,
        jobId: job.id,
        message: 'Job retry initiated',
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to retry job',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
