import { Test, TestingModule } from '@nestjs/testing';
import { ImageGenService } from './image-gen.service';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';

describe('ImageGenService', () => {
  let service: ImageGenService;
  let mockQueue: jest.Mocked<Queue>;

  beforeEach(async () => {
    mockQueue = {
      waitUntilReady: jest.fn(),
      add: jest.fn(),
      getJob: jest.fn(),
      getWaitingCount: jest.fn(),
      getActiveCount: jest.fn(),
      getCompletedCount: jest.fn(),
      getFailedCount: jest.fn(),
      getDelayedCount: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImageGenService,
        {
          provide: getQueueToken('image-generation'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<ImageGenService>(ImageGenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should mark queue as available when Redis is running', async () => {
      mockQueue.waitUntilReady.mockResolvedValue();

      await service.onModuleInit();

      expect(service.isAvailable()).toBe(true);
    });

    it('should handle Redis unavailable gracefully', async () => {
      mockQueue.waitUntilReady.mockRejectedValue(
        new Error('Redis not running'),
      );

      await service.onModuleInit();

      expect(service.isAvailable()).toBe(false);
    });
  });

  describe('queueImageGeneration', () => {
    const mockJobData = {
      prompt: 'A beautiful sunset',
      width: 1024,
      height: 1024,
      steps: 20,
      cfgScale: 7.5,
      model: 'sdxl' as const,
      userId: 'test-user',
    };

    beforeEach(() => {
      (service as any).isQueueAvailable = true;
    });

    it('should queue image generation job', async () => {
      const mockJob = { id: 'job-123' } as Job;
      mockQueue.add.mockResolvedValue(mockJob as any);

      const result = await service.queueImageGeneration(mockJobData);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'generate-image',
        mockJobData,
        expect.objectContaining({
          priority: 10,
          attempts: 3,
        }),
      );
      expect(result.id).toBe('job-123');
    });

    it('should throw error when queue unavailable', async () => {
      (service as any).isQueueAvailable = false;

      await expect(service.queueImageGeneration(mockJobData)).rejects.toThrow(
        'Image generation queue is not available',
      );
    });

    it('should use custom priority if provided', async () => {
      const mockJob = { id: 'job-456' } as Job;
      mockQueue.add.mockResolvedValue(mockJob as any);

      await service.queueImageGeneration({ ...mockJobData, priority: 5 });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'generate-image',
        expect.anything(),
        expect.objectContaining({
          priority: 5,
        }),
      );
    });
  });

  describe('getJobStatus', () => {
    it('should return job status for existing job', async () => {
      const mockJob = {
        id: 'job-123',
        data: { prompt: 'Test' },
        getState: jest.fn().mockResolvedValue('completed'),
        progress: 100,
        returnvalue: { imagePath: '/output/test.png' },
        timestamp: 1234567890,
      } as any;

      mockQueue.getJob.mockResolvedValue(mockJob);
      (service as any).isQueueAvailable = true;

      const status = await service.getJobStatus('job-123');

      expect(status.id).toBe('job-123');
      expect(status.status).toBe('completed');
      expect(status.progress).toBe(100);
    });

    it('should return not_found for non-existent job', async () => {
      mockQueue.getJob.mockResolvedValue(null);
      (service as any).isQueueAvailable = true;

      const status = await service.getJobStatus('non-existent');

      expect(status.status).toBe('not_found');
    });

    it('should return queue_unavailable when Redis down', async () => {
      (service as any).isQueueAvailable = false;

      const status = await service.getJobStatus('job-123');

      expect(status.status).toBe('queue_unavailable');
    });
  });

  describe('getQueueMetrics', () => {
    it('should return queue metrics when available', async () => {
      (service as any).isQueueAvailable = true;
      mockQueue.getWaitingCount.mockResolvedValue(5);
      mockQueue.getActiveCount.mockResolvedValue(2);
      mockQueue.getCompletedCount.mockResolvedValue(100);
      mockQueue.getFailedCount.mockResolvedValue(3);
      mockQueue.getDelayedCount.mockResolvedValue(1);

      const metrics = await service.getQueueMetrics();

      expect(metrics.available).toBe(true);
      expect(metrics.waiting).toBe(5);
      expect(metrics.active).toBe(2);
      expect(metrics.total).toBe(8); // waiting + active + delayed
    });

    it('should return unavailable when Redis down', async () => {
      (service as any).isQueueAvailable = false;

      const metrics = await service.getQueueMetrics();

      expect(metrics.available).toBe(false);
      expect(metrics.message).toBe('Redis not available');
    });
  });

  describe('cancelJob', () => {
    it('should cancel existing job', async () => {
      const mockJob = {
        remove: jest.fn(),
      } as any;

      mockQueue.getJob.mockResolvedValue(mockJob);
      (service as any).isQueueAvailable = true;

      const result = await service.cancelJob('job-123');

      expect(mockJob.remove).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false for non-existent job', async () => {
      mockQueue.getJob.mockResolvedValue(null);
      (service as any).isQueueAvailable = true;

      const result = await service.cancelJob('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('retryFailedJob', () => {
    it('should retry failed job', async () => {
      const mockJob = {
        retry: jest.fn(),
        id: 'job-123',
      } as any;

      mockQueue.getJob.mockResolvedValue(mockJob);
      (service as any).isQueueAvailable = true;

      const result = await service.retryFailedJob('job-123');

      expect(mockJob.retry).toHaveBeenCalled();
      expect(result?.id).toBe('job-123');
    });
  });
});
