import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { ImageGenJobData, ImageGenJobResult } from './interfaces/image-gen.interface';

@Injectable()
export class ImageGenService implements OnModuleInit {
  private readonly logger = new Logger(ImageGenService.name);
  private isQueueAvailable = false;

  constructor(
    @InjectQueue('image-generation')
    private readonly imageQueue: Queue<ImageGenJobData>,
  ) {}

  async onModuleInit() {
    try {
      await this.imageQueue.waitUntilReady();
      this.isQueueAvailable = true;
      this.logger.log('Image generation queue is ready');
    } catch (error) {
      this.logger.warn('Image generation queue not available. Redis may not be running.');
      this.logger.warn('To enable image generation: Start Redis server (redis-server)');
    }
  }

  async queueImageGeneration(data: ImageGenJobData): Promise<Job<ImageGenJobData>> {
    if (!this.isQueueAvailable) {
      throw new Error('Image generation queue is not available. Ensure Redis is running.');
    }

    const job = await this.imageQueue.add('generate-image', data, {
      priority: data.priority || 10,
      jobId: `img-${data.userId}-${Date.now()}`,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: {
        age: 3600, // Keep completed jobs for 1 hour
        count: 100, // Keep last 100 completed jobs
      },
      removeOnFail: {
        age: 86400, // Keep failed jobs for 24 hours
      },
    });

    this.logger.log(`Queued image generation job: ${job.id}`);

    return job;
  }

  async getJobStatus(jobId: string): Promise<any> {
    if (!this.isQueueAvailable) {
      return { status: 'queue_unavailable' };
    }

    const job = await this.imageQueue.getJob(jobId);
    if (!job) {
      return { status: 'not_found' };
    }

    const state = await job.getState();
    const progress = job.progress;

    return {
      id: job.id,
      status: state,
      progress,
      data: job.data,
      result: job.returnvalue,
      failedReason: job.failedReason,
      createdAt: job.timestamp,
      processedAt: job.processedOn,
      finishedAt: job.finishedOn,
    };
  }

  async getQueueMetrics(): Promise<any> {
    if (!this.isQueueAvailable) {
      return {
        available: false,
        message: 'Redis not available',
      };
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.imageQueue.getWaitingCount(),
      this.imageQueue.getActiveCount(),
      this.imageQueue.getCompletedCount(),
      this.imageQueue.getFailedCount(),
      this.imageQueue.getDelayedCount(),
    ]);

    return {
      available: true,
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + delayed,
    };
  }

  async cancelJob(jobId: string): Promise<boolean> {
    if (!this.isQueueAvailable) {
      throw new Error('Queue not available');
    }

    const job = await this.imageQueue.getJob(jobId);
    if (!job) {
      return false;
    }

    await job.remove();
    this.logger.log(`Cancelled job: ${jobId}`);
    return true;
  }

  async retryFailedJob(jobId: string): Promise<Job<ImageGenJobData> | null> {
    if (!this.isQueueAvailable) {
      throw new Error('Queue not available');
    }

    const job = await this.imageQueue.getJob(jobId);
    if (!job) {
      return null;
    }

    await job.retry();
    this.logger.log(`Retrying job: ${jobId}`);
    return job;
  }

  isAvailable(): boolean {
    return this.isQueueAvailable;
  }
}
