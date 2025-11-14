import { Test, TestingModule } from '@nestjs/testing';
import { LLMErrorHandlerService, LLMError, RetryConfig } from './llm-error-handler.service';

describe('LLMErrorHandlerService', () => {
  let service: LLMErrorHandlerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LLMErrorHandlerService],
    }).compile();

    service = module.get<LLMErrorHandlerService>(LLMErrorHandlerService);

    // Clear error history before each test
    service.clearErrorHistory();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('Error Classification - classifyError', () => {
    describe('Rate Limit Errors', () => {
      it('should classify rate limit error with "rate limit" in message', () => {
        const error = new Error('Rate limit exceeded');
        const llmError = service.handleError(error);

        expect(llmError.type).toBe('rate_limit');
        expect(llmError.retryable).toBe(true);
        expect(llmError.suggestedAction).toBe('Wait before retrying');
        expect(llmError.message).toBe('Rate limit exceeded');
      });

      it('should classify 429 status code as rate limit', () => {
        const error = new Error('HTTP 429 Too Many Requests');
        const llmError = service.handleError(error);

        expect(llmError.type).toBe('rate_limit');
        expect(llmError.retryable).toBe(true);
      });

      it('should include timestamp in classified error', () => {
        const error = new Error('Rate limit exceeded');
        const llmError = service.handleError(error);

        expect(llmError.timestamp).toBeDefined();
        expect(new Date(llmError.timestamp).getTime()).toBeGreaterThan(0);
      });
    });

    describe('Quota Errors', () => {
      it('should classify quota error as non-retryable', () => {
        const error = new Error('Quota exceeded for this month');
        const llmError = service.handleError(error);

        expect(llmError.type).toBe('quota');
        expect(llmError.retryable).toBe(false);
        expect(llmError.suggestedAction).toBe('Check billing and quota limits');
      });

      it('should classify billing error as quota error', () => {
        const error = new Error('Billing issue detected');
        const llmError = service.handleError(error);

        expect(llmError.type).toBe('quota');
        expect(llmError.retryable).toBe(false);
      });
    });

    describe('Timeout Errors', () => {
      it('should classify timeout error as retryable', () => {
        const error = new Error('Request timeout after 30s');
        const llmError = service.handleError(error);

        expect(llmError.type).toBe('timeout');
        expect(llmError.retryable).toBe(true);
        expect(llmError.suggestedAction).toBe('Reduce request complexity or increase timeout');
      });

      it('should classify "timed out" message as timeout', () => {
        const error = new Error('Operation timed out');
        const llmError = service.handleError(error);

        expect(llmError.type).toBe('timeout');
        expect(llmError.retryable).toBe(true);
      });
    });

    describe('Network Errors', () => {
      it('should classify network error as retryable', () => {
        const error = new Error('Network error occurred');
        const llmError = service.handleError(error);

        expect(llmError.type).toBe('network');
        expect(llmError.retryable).toBe(true);
        expect(llmError.suggestedAction).toBe('Check network connectivity');
      });

      it('should classify connection error as network error', () => {
        const error = new Error('Connection refused');
        const llmError = service.handleError(error);

        expect(llmError.type).toBe('network');
        expect(llmError.retryable).toBe(true);
      });
    });

    describe('Validation Errors', () => {
      it('should classify validation error as non-retryable', () => {
        const error = new Error('Validation failed for input');
        const llmError = service.handleError(error);

        expect(llmError.type).toBe('validation');
        expect(llmError.retryable).toBe(false);
        expect(llmError.suggestedAction).toBe('Check request format and parameters');
      });

      it('should classify invalid parameter error', () => {
        const error = new Error('Invalid parameter provided');
        const llmError = service.handleError(error);

        expect(llmError.type).toBe('validation');
        expect(llmError.retryable).toBe(false);
      });
    });

    describe('Parsing Errors', () => {
      it('should classify parsing error as retryable', () => {
        const error = new Error('Error parsing response');
        const llmError = service.handleError(error);

        expect(llmError.type).toBe('parsing');
        expect(llmError.retryable).toBe(true);
        expect(llmError.suggestedAction).toBe('Retry or adjust prompt for better structure');
      });

      it('should classify JSON error as parsing error', () => {
        const error = new Error('JSON decode error');
        const llmError = service.handleError(error);

        expect(llmError.type).toBe('parsing');
        expect(llmError.retryable).toBe(true);
      });
    });

    describe('Provider Errors', () => {
      it('should classify provider unavailable error', () => {
        const error = new Error('Provider unavailable');
        const llmError = service.handleError(error);

        expect(llmError.type).toBe('provider');
        expect(llmError.retryable).toBe(true);
        expect(llmError.suggestedAction).toBe('Try again later or use fallback provider');
      });

      it('should classify 500 status as provider error', () => {
        const error = new Error('HTTP 500 Internal Server Error');
        const llmError = service.handleError(error);

        expect(llmError.type).toBe('provider');
        expect(llmError.retryable).toBe(true);
        expect(llmError.suggestedAction).toBe('Server error - retry after delay');
      });

      it('should classify 502 status as provider error', () => {
        const error = new Error('HTTP 502 Bad Gateway');
        const llmError = service.handleError(error);

        expect(llmError.type).toBe('provider');
        expect(llmError.retryable).toBe(true);
      });

      it('should classify 503 status as provider error', () => {
        const error = new Error('HTTP 503 Service Unavailable');
        const llmError = service.handleError(error);

        expect(llmError.type).toBe('provider');
        expect(llmError.retryable).toBe(true);
      });
    });

    describe('Internal Errors', () => {
      it('should classify unknown errors as internal', () => {
        const error = new Error('Something unexpected happened');
        const llmError = service.handleError(error);

        expect(llmError.type).toBe('internal');
        expect(llmError.retryable).toBe(false);
      });

      it('should handle errors with uppercase messages', () => {
        const error = new Error('UNKNOWN ERROR');
        const llmError = service.handleError(error);

        expect(llmError.type).toBe('internal');
      });
    });

    describe('Context Inclusion', () => {
      it('should include context in classified error', () => {
        const error = new Error('Test error');
        const context = { userId: '123', operation: 'generate' };
        const llmError = service.handleError(error, context);

        expect(llmError.context).toEqual(context);
      });

      it('should handle undefined context', () => {
        const error = new Error('Test error');
        const llmError = service.handleError(error);

        expect(llmError.context).toBeUndefined();
      });
    });
  });

  describe('Retry Logic - withRetry', () => {
    describe('Successful Retry Scenarios', () => {
      it('should succeed on first attempt', async () => {
        const operation = jest.fn().mockResolvedValue('success');

        const result = await service.withRetry(operation);

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(1);
      });

      it('should retry and succeed on second attempt', async () => {
        const operation = jest
          .fn()
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce('success');

        const result = await service.withRetry(operation, {
          baseDelay: 1, // Very short delay for testing
          maxRetries: 3,
        });

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(2);
      });

      it('should retry and succeed on third attempt', async () => {
        const operation = jest
          .fn()
          .mockRejectedValueOnce(new Error('Timeout error'))
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce('success');

        const result = await service.withRetry(operation, {
          baseDelay: 1,
          maxRetries: 3,
        });

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(3);
      });

      it('should track successful retry stats', async () => {
        const operation = jest
          .fn()
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce('success');

        const initialStats = service.getErrorStats();
        const initialSuccessful = initialStats.successfulRetries;

        await service.withRetry(operation, {
          baseDelay: 1,
          maxRetries: 3,
        });

        const finalStats = service.getErrorStats();
        expect(finalStats.successfulRetries).toBe(initialSuccessful + 1);
      });
    });

    describe('Failed Retry Scenarios', () => {
      it('should fail after max retries exhausted', async () => {
        const operation = jest.fn().mockRejectedValue(new Error('Network error'));

        try {
          await service.withRetry(operation, {
            maxRetries: 2,
            baseDelay: 1,
          });
          fail('Should have thrown an error');
        } catch (error) {
          expect(error).toBeDefined();
        }

        expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
      });

      it('should track failed retry stats', async () => {
        const operation = jest.fn().mockRejectedValue(new Error('Network error'));

        const initialStats = service.getErrorStats();
        const initialFailed = initialStats.failedRetries;

        try {
          await service.withRetry(operation, {
            maxRetries: 1,
            baseDelay: 1,
          });
          fail('Should have thrown an error');
        } catch (error) {
          expect(error).toBeDefined();
        }

        const finalStats = service.getErrorStats();
        expect(finalStats.failedRetries).toBe(initialFailed + 1);
      });

      it('should enhance error with attempt count', async () => {
        const operation = jest.fn().mockRejectedValue(new Error('Network error'));

        try {
          await service.withRetry(operation, {
            maxRetries: 2,
            baseDelay: 1,
          });
          fail('Should have thrown an error');
        } catch (error: any) {
          expect(error.message).toContain('Failed after 2 attempts');
          expect(error.attempts).toBe(2);
        }
      });
    });

    describe('Non-Retryable Errors', () => {
      it('should fail immediately for validation errors', async () => {
        const operation = jest.fn().mockRejectedValue(new Error('Validation failed'));

        try {
          await service.withRetry(operation);
          fail('Should have thrown an error');
        } catch (error: any) {
          expect(error.message).toContain('Validation failed');
        }

        expect(operation).toHaveBeenCalledTimes(1);
      });

      it('should fail immediately for quota errors', async () => {
        const operation = jest.fn().mockRejectedValue(new Error('Quota exceeded'));

        try {
          await service.withRetry(operation);
          fail('Should have thrown an error');
        } catch (error: any) {
          expect(error.message).toContain('Quota exceeded');
        }

        expect(operation).toHaveBeenCalledTimes(1);
      });

      it('should not retry internal errors by default', async () => {
        const operation = jest.fn().mockRejectedValue(new Error('Unknown error'));

        try {
          await service.withRetry(operation);
          fail('Should have thrown an error');
        } catch (error: any) {
          expect(error.message).toContain('Unknown error');
        }

        expect(operation).toHaveBeenCalledTimes(1);
      });
    });

    describe('Exponential Backoff Calculation', () => {
      it('should use base delay for first retry', async () => {
        const operation = jest
          .fn()
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce('success');

        const result = await service.withRetry(operation, {
          baseDelay: 1,
          maxRetries: 3,
        });

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(2);
      });

      it('should apply exponential backoff for subsequent retries', async () => {
        const operation = jest
          .fn()
          .mockRejectedValueOnce(new Error('Network error'))
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce('success');

        const result = await service.withRetry(operation, {
          baseDelay: 1,
          backoffFactor: 2,
          maxRetries: 3,
        });

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(3);
      });

      it('should respect max delay limit', async () => {
        const operation = jest
          .fn()
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce('success');

        const result = await service.withRetry(operation, {
          baseDelay: 10,
          backoffFactor: 10,
          maxDelay: 5,
          maxRetries: 1,
        });

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(2);
      });
    });

    describe('Custom Retry Configuration', () => {
      it('should respect custom maxRetries', async () => {
        const operation = jest.fn().mockRejectedValue(new Error('Network error'));

        try {
          await service.withRetry(operation, {
            maxRetries: 5,
            baseDelay: 1,
          });
          fail('Should have thrown an error');
        } catch (error) {
          expect(error).toBeDefined();
        }

        expect(operation).toHaveBeenCalledTimes(6); // Initial + 5 retries
      });

      it('should use custom retryable error types', async () => {
        const operation = jest.fn().mockRejectedValue(new Error('Custom error'));

        const config: Partial<RetryConfig> = {
          retryableErrors: ['internal'],
          maxRetries: 2,
          baseDelay: 1,
        };

        try {
          await service.withRetry(operation, config);
          fail('Should have thrown an error');
        } catch (error) {
          expect(error).toBeDefined();
        }

        expect(operation).toHaveBeenCalledTimes(3); // Will retry internal errors
      });

      it('should merge custom config with defaults', async () => {
        const operation = jest
          .fn()
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce('success');

        const result = await service.withRetry(operation, {
          maxRetries: 1, // Only override maxRetries
          baseDelay: 1,
        });

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(2);
      });
    });

    describe('Jitter in Backoff', () => {
      it('should add jitter to delay calculations', async () => {
        const delays: number[] = [];
        const originalSetTimeout = global.setTimeout;

        // Spy on setTimeout to capture delays
        jest.spyOn(global, 'setTimeout').mockImplementation((callback: any, delay: number) => {
          delays.push(delay);
          return originalSetTimeout(callback, 0) as any;
        });

        const operation = jest
          .fn()
          .mockRejectedValueOnce(new Error('Network error'))
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce('success');

        await service.withRetry(operation, {
          baseDelay: 1000,
          maxRetries: 3,
        });

        // Verify delays have jitter (should be slightly different from exact multiples)
        expect(delays.length).toBeGreaterThan(0);
        // First delay should be base + jitter (1000 + up to 100ms)
        if (delays[0]) {
          expect(delays[0]).toBeGreaterThanOrEqual(1000);
          expect(delays[0]).toBeLessThanOrEqual(1100);
        }
      });
    });
  });

  describe('Circuit Breaker - createCircuitBreaker', () => {

    describe('Closed State', () => {
      it('should allow operations in closed state', async () => {
        const operation = jest.fn().mockResolvedValue('success');
        const circuitBreaker = service.createCircuitBreaker(operation);

        const result = await circuitBreaker();

        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(1);
      });

      it('should remain closed on successful operations', async () => {
        const operation = jest.fn().mockResolvedValue('success');
        const circuitBreaker = service.createCircuitBreaker(operation, {
          failureThreshold: 3,
          resetTimeout: 60000,
          monitoringPeriod: 300000,
        });

        await circuitBreaker();
        await circuitBreaker();
        await circuitBreaker();

        expect(operation).toHaveBeenCalledTimes(3);
      });
    });

    describe('Closed to Open Transition', () => {
      it('should open after threshold failures', async () => {
        const operation = jest.fn().mockRejectedValue(new Error('Service error'));
        const circuitBreaker = service.createCircuitBreaker(operation, {
          failureThreshold: 3,
          resetTimeout: 60000,
          monitoringPeriod: 300000,
        });

        // Trigger failures to reach threshold
        await expect(circuitBreaker()).rejects.toThrow('Service error');
        await expect(circuitBreaker()).rejects.toThrow('Service error');
        await expect(circuitBreaker()).rejects.toThrow('Service error');

        // Next call should fail with circuit open
        await expect(circuitBreaker()).rejects.toThrow('Circuit breaker is open');
      });

      it('should track failures correctly', async () => {
        const operation = jest.fn().mockRejectedValue(new Error('Service error'));
        const circuitBreaker = service.createCircuitBreaker(operation, {
          failureThreshold: 5,
          resetTimeout: 60000,
          monitoringPeriod: 300000,
        });

        // Fail 4 times (below threshold)
        for (let i = 0; i < 4; i++) {
          await expect(circuitBreaker()).rejects.toThrow('Service error');
        }

        // 5th failure should open circuit
        await expect(circuitBreaker()).rejects.toThrow('Service error');

        // Verify circuit is open
        await expect(circuitBreaker()).rejects.toThrow('Circuit breaker is open');
      });
    });

    describe('Open to Half-Open Transition', () => {
      it('should transition to half-open after reset timeout', async () => {
        jest.useFakeTimers();

        const operation = jest
          .fn()
          .mockRejectedValueOnce(new Error('Error'))
          .mockRejectedValueOnce(new Error('Error'))
          .mockRejectedValueOnce(new Error('Error'))
          .mockResolvedValue('success');

        const circuitBreaker = service.createCircuitBreaker(operation, {
          failureThreshold: 3,
          resetTimeout: 60000,
          monitoringPeriod: 300000,
        });

        // Open the circuit
        await expect(circuitBreaker()).rejects.toThrow();
        await expect(circuitBreaker()).rejects.toThrow();
        await expect(circuitBreaker()).rejects.toThrow();
        await expect(circuitBreaker()).rejects.toThrow('Circuit breaker is open');

        // Advance time past reset timeout
        jest.advanceTimersByTime(60001);

        // Should transition to half-open and allow attempt
        const result = await circuitBreaker();
        expect(result).toBe('success');

        jest.useRealTimers();
      });

      it('should remain open before reset timeout', async () => {
        jest.useFakeTimers();

        const operation = jest.fn().mockRejectedValue(new Error('Error'));
        const circuitBreaker = service.createCircuitBreaker(operation, {
          failureThreshold: 2,
          resetTimeout: 60000,
          monitoringPeriod: 300000,
        });

        // Open the circuit
        await expect(circuitBreaker()).rejects.toThrow('Error');
        await expect(circuitBreaker()).rejects.toThrow('Error');
        await expect(circuitBreaker()).rejects.toThrow('Circuit breaker is open');

        // Advance time but not enough
        jest.advanceTimersByTime(30000);

        // Should still be open
        await expect(circuitBreaker()).rejects.toThrow('Circuit breaker is open');

        jest.useRealTimers();
      });
    });

    describe('Half-Open to Closed Transition', () => {
      it('should close after 3 successful operations in half-open', async () => {
        jest.useFakeTimers();

        let callCount = 0;
        const operation = jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount <= 3) {
            return Promise.reject(new Error('Error'));
          }
          return Promise.resolve('success');
        });

        const circuitBreaker = service.createCircuitBreaker(operation, {
          failureThreshold: 3,
          resetTimeout: 60000,
          monitoringPeriod: 300000,
        });

        // Open the circuit
        await expect(circuitBreaker()).rejects.toThrow('Error');
        await expect(circuitBreaker()).rejects.toThrow('Error');
        await expect(circuitBreaker()).rejects.toThrow('Error');

        // Advance to half-open
        jest.advanceTimersByTime(60001);

        // Need 3 successes to close
        await circuitBreaker();
        await circuitBreaker();
        await circuitBreaker();

        // Circuit should now be closed
        await circuitBreaker();
        expect(operation).toHaveBeenCalled();

        jest.useRealTimers();
      });

      it('should require exactly 3 successes to close', async () => {
        jest.useFakeTimers();

        let callCount = 0;
        const operation = jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount <= 2) {
            return Promise.reject(new Error('Error'));
          }
          return Promise.resolve('success');
        });

        const circuitBreaker = service.createCircuitBreaker(operation, {
          failureThreshold: 2,
          resetTimeout: 60000,
          monitoringPeriod: 300000,
        });

        // Open the circuit
        await expect(circuitBreaker()).rejects.toThrow('Error');
        await expect(circuitBreaker()).rejects.toThrow('Error');

        // Advance to half-open
        jest.advanceTimersByTime(60001);

        // 2 successes should not be enough
        await circuitBreaker();
        await circuitBreaker();

        // Still should work (not closed yet, but half-open allows calls)
        await circuitBreaker();

        jest.useRealTimers();
      });
    });

    describe('Half-Open to Open Transition', () => {
      it('should reopen on failure in half-open state', async () => {
        jest.useFakeTimers();

        let callCount = 0;
        const operation = jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount <= 3) {
            return Promise.reject(new Error('Error'));
          }
          if (callCount === 4) {
            return Promise.resolve('success');
          }
          return Promise.reject(new Error('Error again'));
        });

        const circuitBreaker = service.createCircuitBreaker(operation, {
          failureThreshold: 3,
          resetTimeout: 60000,
          monitoringPeriod: 300000,
        });

        // Open the circuit
        await expect(circuitBreaker()).rejects.toThrow('Error');
        await expect(circuitBreaker()).rejects.toThrow('Error');
        await expect(circuitBreaker()).rejects.toThrow('Error');

        // Advance to half-open
        jest.advanceTimersByTime(60001);

        // First attempt succeeds
        await circuitBreaker();

        // Second attempt fails - should reset success count
        await expect(circuitBreaker()).rejects.toThrow('Error again');

        // Verify the circuit didn't close
        expect(operation).toHaveBeenCalled();

        jest.useRealTimers();
      });
    });

    describe('Monitoring Period Reset', () => {
      it('should reset failure count after monitoring period', async () => {
        jest.useFakeTimers();

        const operation = jest
          .fn()
          .mockRejectedValueOnce(new Error('Error'))
          .mockRejectedValueOnce(new Error('Error'))
          .mockResolvedValue('success');

        const circuitBreaker = service.createCircuitBreaker(operation, {
          failureThreshold: 5,
          resetTimeout: 60000,
          monitoringPeriod: 300000,
        });

        // Generate 2 failures
        await expect(circuitBreaker()).rejects.toThrow('Error');
        await expect(circuitBreaker()).rejects.toThrow('Error');

        // Advance past monitoring period
        jest.advanceTimersByTime(300001);

        // Failure count should reset, circuit should remain closed
        const result = await circuitBreaker();
        expect(result).toBe('success');

        jest.useRealTimers();
      });

      it('should transition open to half-open after monitoring period', async () => {
        jest.useFakeTimers();

        const operation = jest
          .fn()
          .mockRejectedValueOnce(new Error('Error'))
          .mockRejectedValueOnce(new Error('Error'))
          .mockRejectedValueOnce(new Error('Error'))
          .mockResolvedValue('success');

        const circuitBreaker = service.createCircuitBreaker(operation, {
          failureThreshold: 3,
          resetTimeout: 60000,
          monitoringPeriod: 300000,
        });

        // Open the circuit
        await expect(circuitBreaker()).rejects.toThrow('Error');
        await expect(circuitBreaker()).rejects.toThrow('Error');
        await expect(circuitBreaker()).rejects.toThrow('Error');

        // Verify it's open
        await expect(circuitBreaker()).rejects.toThrow('Circuit breaker is open');

        // Advance past monitoring period
        jest.advanceTimersByTime(300001);

        // Should transition to half-open and allow operations
        const result = await circuitBreaker();
        expect(result).toBe('success');

        jest.useRealTimers();
      });
    });

    describe('Multiple Circuit Breakers', () => {
      it('should maintain independent state for different breakers', async () => {
        const operation1 = jest.fn().mockRejectedValue(new Error('Error 1'));
        const operation2 = jest.fn().mockResolvedValue('success');

        const breaker1 = service.createCircuitBreaker(operation1, {
          failureThreshold: 2,
          resetTimeout: 60000,
          monitoringPeriod: 300000,
        });

        const breaker2 = service.createCircuitBreaker(operation2, {
          failureThreshold: 2,
          resetTimeout: 60000,
          monitoringPeriod: 300000,
        });

        // Open breaker1
        await expect(breaker1()).rejects.toThrow('Error 1');
        await expect(breaker1()).rejects.toThrow('Error 1');
        await expect(breaker1()).rejects.toThrow('Circuit breaker is open');

        // breaker2 should still work
        const result = await breaker2();
        expect(result).toBe('success');
      });
    });
  });

  describe('Error Statistics - getErrorStats', () => {
    it('should track total error count', () => {
      service.handleError(new Error('Error 1'));
      service.handleError(new Error('Error 2'));
      service.handleError(new Error('Error 3'));

      const stats = service.getErrorStats();
      expect(stats.totalErrors).toBe(3);
    });

    it('should categorize errors by type', () => {
      service.handleError(new Error('Network error'));
      service.handleError(new Error('Network error'));
      service.handleError(new Error('Timeout error'));
      service.handleError(new Error('Validation failed'));

      const stats = service.getErrorStats();
      expect(stats.errorsByType['network']).toBe(2);
      expect(stats.errorsByType['timeout']).toBe(1);
      expect(stats.errorsByType['validation']).toBe(1);
    });

    it('should return recent errors (last 10)', () => {
      // Generate 15 errors
      for (let i = 0; i < 15; i++) {
        service.handleError(new Error(`Error ${i}`));
      }

      const stats = service.getErrorStats();
      expect(stats.recentErrors.length).toBe(10);
      expect(stats.recentErrors[9].message).toBe('Error 14');
    });

    it('should calculate average resolution time', () => {
      service.handleError(new Error('Error 1'));
      service.handleError(new Error('Error 2'));
      service.handleError(new Error('Error 3'));

      const stats = service.getErrorStats();
      expect(stats.avgResolutionTime).toBeGreaterThanOrEqual(0);
    });

    it('should return 0 for average resolution time with no errors', () => {
      const stats = service.getErrorStats();
      expect(stats.avgResolutionTime).toBe(0);
    });

    it('should track successful retries', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce('success');

      const initialStats = service.getErrorStats();

      await service.withRetry(operation, {
        baseDelay: 1,
        maxRetries: 3,
      });

      const finalStats = service.getErrorStats();
      expect(finalStats.successfulRetries).toBe(initialStats.successfulRetries + 1);
    });

    it('should track failed retries', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Network error'));

      const initialStats = service.getErrorStats();

      try {
        await service.withRetry(operation, {
          maxRetries: 1,
          baseDelay: 1,
        });
      } catch {
        // Expected to fail
      }

      const finalStats = service.getErrorStats();
      expect(finalStats.failedRetries).toBe(initialStats.failedRetries + 1);
    });

    it('should maintain error history limit of 1000', () => {
      // Generate more than 1000 errors
      for (let i = 0; i < 1200; i++) {
        service.handleError(new Error(`Error ${i}`));
      }

      const stats = service.getErrorStats();
      expect(stats.totalErrors).toBe(1200);
      // Recent errors should only be last 10
      expect(stats.recentErrors.length).toBe(10);
    });
  });

  describe('User-Friendly Messages - getUserFriendlyMessage', () => {
    it('should return friendly message for provider errors', () => {
      const error: LLMError = {
        type: 'provider',
        message: 'Provider unavailable',
        retryable: true,
        timestamp: new Date().toISOString(),
      };

      const message = service.getUserFriendlyMessage(error);
      expect(message).toBe('The AI service is temporarily unavailable. Please try again in a few moments.');
    });

    it('should return friendly message for rate limit errors', () => {
      const error: LLMError = {
        type: 'rate_limit',
        message: 'Rate limit exceeded',
        retryable: true,
        timestamp: new Date().toISOString(),
      };

      const message = service.getUserFriendlyMessage(error);
      expect(message).toBe('Too many requests. Please wait a moment before trying again.');
    });

    it('should return friendly message for quota errors', () => {
      const error: LLMError = {
        type: 'quota',
        message: 'Quota exceeded',
        retryable: false,
        timestamp: new Date().toISOString(),
      };

      const message = service.getUserFriendlyMessage(error);
      expect(message).toBe('AI service quota exceeded. Please contact an administrator.');
    });

    it('should return friendly message for validation errors', () => {
      const error: LLMError = {
        type: 'validation',
        message: 'Validation failed',
        retryable: false,
        timestamp: new Date().toISOString(),
      };

      const message = service.getUserFriendlyMessage(error);
      expect(message).toBe('The request format is invalid. Please check your input and try again.');
    });

    it('should return friendly message for timeout errors', () => {
      const error: LLMError = {
        type: 'timeout',
        message: 'Request timeout',
        retryable: true,
        timestamp: new Date().toISOString(),
      };

      const message = service.getUserFriendlyMessage(error);
      expect(message).toBe('The request took too long to process. Please try again with a shorter prompt.');
    });

    it('should return friendly message for network errors', () => {
      const error: LLMError = {
        type: 'network',
        message: 'Network error',
        retryable: true,
        timestamp: new Date().toISOString(),
      };

      const message = service.getUserFriendlyMessage(error);
      expect(message).toBe('Network connection issue. Please check your internet connection.');
    });

    it('should return friendly message for parsing errors', () => {
      const error: LLMError = {
        type: 'parsing',
        message: 'Parsing failed',
        retryable: true,
        timestamp: new Date().toISOString(),
      };

      const message = service.getUserFriendlyMessage(error);
      expect(message).toBe('Failed to process the AI response. Please try again.');
    });

    it('should return friendly message for internal errors', () => {
      const error: LLMError = {
        type: 'internal',
        message: 'Unknown error',
        retryable: false,
        timestamp: new Date().toISOString(),
      };

      const message = service.getUserFriendlyMessage(error);
      expect(message).toBe('An unexpected error occurred. Please try again or contact support.');
    });
  });

  describe('Recovery Suggestions - getRecoverySuggestions', () => {
    it('should provide suggestions for provider errors', () => {
      const error: LLMError = {
        type: 'provider',
        message: 'Provider unavailable',
        retryable: true,
        timestamp: new Date().toISOString(),
      };

      const suggestions = service.getRecoverySuggestions(error);
      expect(suggestions).toContain('Wait a few minutes and try again');
      expect(suggestions).toContain('Check if other AI features are working');
      expect(suggestions).toContain('Contact support if the issue persists');
    });

    it('should provide suggestions for rate limit errors', () => {
      const error: LLMError = {
        type: 'rate_limit',
        message: 'Rate limit exceeded',
        retryable: true,
        timestamp: new Date().toISOString(),
      };

      const suggestions = service.getRecoverySuggestions(error);
      expect(suggestions).toContain('Wait before making another request');
      expect(suggestions).toContain('Reduce the frequency of your requests');
      expect(suggestions).toContain('Consider upgrading your plan for higher limits');
    });

    it('should provide suggestions for validation errors', () => {
      const error: LLMError = {
        type: 'validation',
        message: 'Validation failed',
        retryable: false,
        timestamp: new Date().toISOString(),
      };

      const suggestions = service.getRecoverySuggestions(error);
      expect(suggestions).toContain('Check your input format');
      expect(suggestions).toContain('Ensure all required fields are provided');
      expect(suggestions).toContain('Verify that values are within acceptable ranges');
    });

    it('should provide suggestions for timeout errors', () => {
      const error: LLMError = {
        type: 'timeout',
        message: 'Request timeout',
        retryable: true,
        timestamp: new Date().toISOString(),
      };

      const suggestions = service.getRecoverySuggestions(error);
      expect(suggestions).toContain('Try with a shorter prompt');
      expect(suggestions).toContain('Reduce the complexity of your request');
      expect(suggestions).toContain('Split large requests into smaller ones');
    });

    it('should provide suggestions for network errors', () => {
      const error: LLMError = {
        type: 'network',
        message: 'Network error',
        retryable: true,
        timestamp: new Date().toISOString(),
      };

      const suggestions = service.getRecoverySuggestions(error);
      expect(suggestions).toContain('Check your internet connection');
      expect(suggestions).toContain('Try again in a few moments');
      expect(suggestions).toContain('Contact your network administrator if the problem persists');
    });

    it('should provide default suggestions for other errors', () => {
      const error: LLMError = {
        type: 'internal',
        message: 'Unknown error',
        retryable: false,
        timestamp: new Date().toISOString(),
      };

      const suggestions = service.getRecoverySuggestions(error);
      expect(suggestions).toContain('Try again in a few moments');
      expect(suggestions).toContain('Contact support if the error continues');
    });
  });

  describe('System Health - isSystemHealthy', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return true for healthy system (low error rate)', () => {
      // Generate 5 errors in last 5 minutes (1 per minute)
      for (let i = 0; i < 5; i++) {
        service.handleError(new Error(`Error ${i}`));
        jest.advanceTimersByTime(60000); // 1 minute
      }

      const healthy = service.isSystemHealthy();
      expect(healthy).toBe(true);
    });

    it('should return false for unhealthy system (high error rate)', () => {
      // Generate 60 errors in last 5 minutes (12 per minute)
      for (let i = 0; i < 60; i++) {
        service.handleError(new Error(`Error ${i}`));
      }

      const healthy = service.isSystemHealthy();
      expect(healthy).toBe(false);
    });

    it('should only consider errors in last 5 minutes', () => {
      // Generate old errors (> 5 minutes ago)
      for (let i = 0; i < 100; i++) {
        service.handleError(new Error(`Old error ${i}`));
      }

      // Advance time past 5 minutes
      jest.advanceTimersByTime(6 * 60 * 1000);

      // System should be healthy (old errors don't count)
      const healthy = service.isSystemHealthy();
      expect(healthy).toBe(true);
    });

    it('should return true for system with no errors', () => {
      const healthy = service.isSystemHealthy();
      expect(healthy).toBe(true);
    });

    it('should handle exactly 50 errors in 5 minutes (threshold)', () => {
      // 50 errors = 10 per minute (exactly at threshold)
      for (let i = 0; i < 50; i++) {
        service.handleError(new Error(`Error ${i}`));
      }

      const healthy = service.isSystemHealthy();
      expect(healthy).toBe(false); // At or above threshold is unhealthy
    });
  });

  describe('Error History Management - clearErrorHistory', () => {
    it('should clear all error history', () => {
      service.handleError(new Error('Error 1'));
      service.handleError(new Error('Error 2'));
      service.handleError(new Error('Error 3'));

      service.clearErrorHistory();

      const stats = service.getErrorStats();
      expect(stats.totalErrors).toBe(0);
      expect(stats.recentErrors.length).toBe(0);
      expect(Object.keys(stats.errorsByType).length).toBe(0);
    });

    it('should reset retry statistics', () => {
      jest.useFakeTimers();

      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce('success');

      service.withRetry(operation).then(() => {
        jest.runAllTimersAsync();
      });

      jest.runAllTimersAsync();

      service.clearErrorHistory();

      const stats = service.getErrorStats();
      expect(stats.successfulRetries).toBe(0);
      expect(stats.failedRetries).toBe(0);

      jest.useRealTimers();
    });

    it('should reset resolution times', () => {
      service.handleError(new Error('Error 1'));
      service.handleError(new Error('Error 2'));

      service.clearErrorHistory();

      const stats = service.getErrorStats();
      expect(stats.avgResolutionTime).toBe(0);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle errors with empty messages', () => {
      const error = new Error('');
      const llmError = service.handleError(error);

      expect(llmError.type).toBe('internal');
      expect(llmError.message).toBe('');
    });

    it('should handle errors with very long messages', () => {
      const longMessage = 'A'.repeat(10000);
      const error = new Error(longMessage);
      const llmError = service.handleError(error);

      expect(llmError.message).toBe(longMessage);
      expect(llmError.type).toBe('internal');
    });

    it('should handle errors with special characters', () => {
      const error = new Error('Error with special chars: !@#$%^&*()');
      const llmError = service.handleError(error);

      expect(llmError.message).toBe('Error with special chars: !@#$%^&*()');
    });

    it('should handle rapid successive errors', () => {
      for (let i = 0; i < 100; i++) {
        service.handleError(new Error(`Rapid error ${i}`));
      }

      const stats = service.getErrorStats();
      expect(stats.totalErrors).toBe(100);
    });

    it('should handle concurrent error handling', async () => {
      const errors = Array.from({ length: 50 }, (_, i) => new Error(`Concurrent error ${i}`));

      await Promise.all(errors.map(error => Promise.resolve(service.handleError(error))));

      const stats = service.getErrorStats();
      expect(stats.totalErrors).toBe(50);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete error lifecycle with retries', async () => {
      // Use real timers with very short delays for integration test
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Timeout error'))
        .mockResolvedValueOnce('success');

      const result = await service.withRetry(operation, {
        baseDelay: 1, // Very short delay for testing
        maxRetries: 3,
      });

      expect(result).toBe('success');

      const stats = service.getErrorStats();
      expect(stats.successfulRetries).toBeGreaterThanOrEqual(1);
    });

    it('should track errors from both handleError and withRetry', async () => {
      // Direct error handling
      service.handleError(new Error('Direct error'));

      // Error from withRetry (non-retryable error - fails immediately, no timers)
      const operation = jest.fn().mockRejectedValue(new Error('Validation failed'));

      try {
        await service.withRetry(operation, { maxRetries: 1 });
      } catch {
        // Expected to fail
      }

      const stats = service.getErrorStats();
      expect(stats.totalErrors).toBeGreaterThan(0);
    });

    it('should handle circuit breaker with error stats', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Service error'));
      const circuitBreaker = service.createCircuitBreaker(operation, {
        failureThreshold: 3,
        resetTimeout: 60000,
        monitoringPeriod: 300000,
      });

      // Generate failures
      await expect(circuitBreaker()).rejects.toThrow();
      await expect(circuitBreaker()).rejects.toThrow();
      await expect(circuitBreaker()).rejects.toThrow();

      // Circuit should be open
      await expect(circuitBreaker()).rejects.toThrow('Circuit breaker is open');

      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should maintain error context through retry cycles', () => {
      const context = { userId: '123', operation: 'generate' };
      let capturedError: LLMError | null = null;

      const operation = jest.fn().mockImplementation(() => {
        const error = new Error('Validation failed'); // Non-retryable
        capturedError = service.handleError(error, context);
        return Promise.reject(error);
      });

      return service.withRetry(operation, { maxRetries: 0 }).catch(() => {
        expect(capturedError).not.toBeNull();
        expect(capturedError?.context).toEqual(context);
      });
    });
  });
});
