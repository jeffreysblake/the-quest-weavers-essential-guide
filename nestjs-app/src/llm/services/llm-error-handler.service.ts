import { Injectable, Logger } from '@nestjs/common';

export interface LLMError {
  type:
    | 'provider'
    | 'validation'
    | 'timeout'
    | 'rate_limit'
    | 'quota'
    | 'network'
    | 'parsing'
    | 'internal';
  message: string;
  code?: string;
  retryable: boolean;
  suggestedAction?: string;
  originalError?: Error;
  context?: any;
  timestamp: string;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  retryableErrors: string[];
}

export interface ErrorStats {
  totalErrors: number;
  errorsByType: Record<string, number>;
  recentErrors: LLMError[];
  avgResolutionTime: number;
  successfulRetries: number;
  failedRetries: number;
}

@Injectable()
export class LLMErrorHandlerService {
  private readonly logger = new Logger(LLMErrorHandlerService.name);
  private errorHistory: LLMError[] = [];
  private readonly MAX_ERROR_HISTORY = 1000;

  private stats = {
    totalErrors: 0,
    errorsByType: {} as Record<string, number>,
    successfulRetries: 0,
    failedRetries: 0,
    resolutionTimes: [] as number[],
  };

  private readonly defaultRetryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffFactor: 2,
    retryableErrors: [
      'network_error',
      'timeout',
      'rate_limit',
      'temporary_unavailable',
      'server_error',
    ],
  };

  /**
   * Handle and classify an error
   */
  handleError(error: Error, context?: any): LLMError {
    const startTime = Date.now();
    const llmError = this.classifyError(error, context);

    this.recordError(llmError);
    this.logError(llmError);

    const resolutionTime = Date.now() - startTime;
    this.stats.resolutionTimes.push(resolutionTime);

    return llmError;
  }

  /**
   * Execute operation with retry logic
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
  ): Promise<T> {
    const retryConfig = { ...this.defaultRetryConfig, ...config };
    let lastError: Error;

    for (let attempt = 1; attempt <= retryConfig.maxRetries + 1; attempt++) {
      try {
        const result = await operation();

        if (attempt > 1) {
          this.stats.successfulRetries++;
          this.logger.log(`Operation succeeded on attempt ${attempt}`);
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        const llmError = this.classifyError(lastError);

        if (
          attempt === retryConfig.maxRetries + 1 ||
          !this.isRetryable(llmError, retryConfig)
        ) {
          this.stats.failedRetries++;
          throw this.enhanceError(lastError, llmError, attempt - 1);
        }

        const delay = this.calculateDelay(attempt - 1, retryConfig);
        this.logger.warn(
          `Attempt ${attempt} failed: ${llmError.message}. Retrying in ${delay}ms...`,
        );

        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  /**
   * Create a circuit breaker for unreliable operations
   */
  createCircuitBreaker<T>(
    operation: () => Promise<T>,
    options: {
      failureThreshold: number;
      resetTimeout: number;
      monitoringPeriod: number;
    } = {
      failureThreshold: 5,
      resetTimeout: 60000,
      monitoringPeriod: 300000,
    },
  ) {
    let state: 'closed' | 'open' | 'half-open' = 'closed';
    let failureCount = 0;
    let lastFailureTime = 0;
    let successCount = 0;

    return async (): Promise<T> => {
      const now = Date.now();

      // Reset failure count after monitoring period
      if (now - lastFailureTime > options.monitoringPeriod) {
        failureCount = 0;
        if (state === 'open') {
          state = 'half-open';
          this.logger.log('Circuit breaker transitioning to half-open');
        }
      }

      // Check if circuit is open
      if (state === 'open') {
        if (now - lastFailureTime < options.resetTimeout) {
          throw new Error('Circuit breaker is open - operation not allowed');
        }
        state = 'half-open';
        this.logger.log('Circuit breaker transitioning to half-open');
      }

      try {
        const result = await operation();

        if (state === 'half-open') {
          successCount++;
          if (successCount >= 3) {
            // Require 3 successes to close
            state = 'closed';
            failureCount = 0;
            successCount = 0;
            this.logger.log('Circuit breaker closed - service recovered');
          }
        }

        return result;
      } catch (error) {
        failureCount++;
        lastFailureTime = now;
        successCount = 0;

        if (failureCount >= options.failureThreshold && state === 'closed') {
          state = 'open';
          this.logger.error(
            `Circuit breaker opened after ${failureCount} failures`,
          );
        }

        throw error;
      }
    };
  }

  /**
   * Get comprehensive error statistics
   */
  getErrorStats(): ErrorStats {
    const recentErrors = this.errorHistory.slice(-10);
    const avgResolutionTime =
      this.stats.resolutionTimes.length > 0
        ? this.stats.resolutionTimes.reduce((a, b) => a + b, 0) /
          this.stats.resolutionTimes.length
        : 0;

    return {
      totalErrors: this.stats.totalErrors,
      errorsByType: { ...this.stats.errorsByType },
      recentErrors,
      avgResolutionTime,
      successfulRetries: this.stats.successfulRetries,
      failedRetries: this.stats.failedRetries,
    };
  }

  /**
   * Generate user-friendly error messages
   */
  getUserFriendlyMessage(error: LLMError): string {
    switch (error.type) {
      case 'provider':
        return 'The AI service is temporarily unavailable. Please try again in a few moments.';
      case 'rate_limit':
        return 'Too many requests. Please wait a moment before trying again.';
      case 'quota':
        return 'AI service quota exceeded. Please contact an administrator.';
      case 'validation':
        return 'The request format is invalid. Please check your input and try again.';
      case 'timeout':
        return 'The request took too long to process. Please try again with a shorter prompt.';
      case 'network':
        return 'Network connection issue. Please check your internet connection.';
      case 'parsing':
        return 'Failed to process the AI response. Please try again.';
      default:
        return 'An unexpected error occurred. Please try again or contact support.';
    }
  }

  /**
   * Generate recovery suggestions
   */
  getRecoverySuggestions(error: LLMError): string[] {
    const suggestions: string[] = [];

    switch (error.type) {
      case 'provider':
        suggestions.push('Wait a few minutes and try again');
        suggestions.push('Check if other AI features are working');
        suggestions.push('Contact support if the issue persists');
        break;
      case 'rate_limit':
        suggestions.push('Wait before making another request');
        suggestions.push('Reduce the frequency of your requests');
        suggestions.push('Consider upgrading your plan for higher limits');
        break;
      case 'validation':
        suggestions.push('Check your input format');
        suggestions.push('Ensure all required fields are provided');
        suggestions.push('Verify that values are within acceptable ranges');
        break;
      case 'timeout':
        suggestions.push('Try with a shorter prompt');
        suggestions.push('Reduce the complexity of your request');
        suggestions.push('Split large requests into smaller ones');
        break;
      case 'network':
        suggestions.push('Check your internet connection');
        suggestions.push('Try again in a few moments');
        suggestions.push(
          'Contact your network administrator if the problem persists',
        );
        break;
      default:
        suggestions.push('Try again in a few moments');
        suggestions.push('Contact support if the error continues');
        break;
    }

    return suggestions;
  }

  /**
   * Check if the system is experiencing widespread issues
   */
  isSystemHealthy(): boolean {
    const recentErrors = this.getRecentErrors(300000); // Last 5 minutes
    const errorRate = recentErrors.length / 5; // Errors per minute

    // System is unhealthy if more than 10 errors per minute
    return errorRate < 10;
  }

  /**
   * Clear error history (for testing or maintenance)
   */
  clearErrorHistory(): void {
    this.errorHistory = [];
    this.stats.totalErrors = 0;
    this.stats.errorsByType = {};
    this.stats.successfulRetries = 0;
    this.stats.failedRetries = 0;
    this.stats.resolutionTimes = [];

    this.logger.log('Error history cleared');
  }

  private classifyError(error: Error, context?: any): LLMError {
    const message = error.message.toLowerCase();
    let type: LLMError['type'] = 'internal';
    let retryable = false;
    let suggestedAction: string | undefined;

    // Classify based on error message patterns
    if (message.includes('rate limit') || message.includes('429')) {
      type = 'rate_limit';
      retryable = true;
      suggestedAction = 'Wait before retrying';
    } else if (message.includes('quota') || message.includes('billing')) {
      type = 'quota';
      retryable = false;
      suggestedAction = 'Check billing and quota limits';
    } else if (message.includes('timeout') || message.includes('timed out')) {
      type = 'timeout';
      retryable = true;
      suggestedAction = 'Reduce request complexity or increase timeout';
    } else if (message.includes('network') || message.includes('connection')) {
      type = 'network';
      retryable = true;
      suggestedAction = 'Check network connectivity';
    } else if (message.includes('validation') || message.includes('invalid')) {
      type = 'validation';
      retryable = false;
      suggestedAction = 'Check request format and parameters';
    } else if (message.includes('parsing') || message.includes('json')) {
      type = 'parsing';
      retryable = true;
      suggestedAction = 'Retry or adjust prompt for better structure';
    } else if (
      message.includes('provider') ||
      message.includes('unavailable')
    ) {
      type = 'provider';
      retryable = true;
      suggestedAction = 'Try again later or use fallback provider';
    } else if (
      message.includes('500') ||
      message.includes('502') ||
      message.includes('503')
    ) {
      type = 'provider';
      retryable = true;
      suggestedAction = 'Server error - retry after delay';
    }

    return {
      type,
      message: error.message,
      retryable,
      suggestedAction,
      originalError: error,
      context,
      timestamp: new Date().toISOString(),
    };
  }

  private recordError(error: LLMError): void {
    this.errorHistory.push(error);

    // Maintain history size limit
    if (this.errorHistory.length > this.MAX_ERROR_HISTORY) {
      this.errorHistory.shift();
    }

    this.stats.totalErrors++;
    this.stats.errorsByType[error.type] =
      (this.stats.errorsByType[error.type] || 0) + 1;
  }

  private logError(error: LLMError): void {
    const logMessage = `LLM Error [${error.type}]: ${error.message}`;

    if (error.retryable) {
      this.logger.warn(logMessage);
    } else {
      this.logger.error(logMessage);
    }

    if (error.suggestedAction) {
      this.logger.debug(`Suggested action: ${error.suggestedAction}`);
    }
  }

  private isRetryable(error: LLMError, config: RetryConfig): boolean {
    return error.retryable || config.retryableErrors.includes(error.type);
  }

  private calculateDelay(attempt: number, config: RetryConfig): number {
    const baseDelay =
      config.baseDelay * Math.pow(config.backoffFactor, attempt);
    const jitter = Math.random() * 0.1 * baseDelay; // Add 10% jitter
    return Math.min(baseDelay + jitter, config.maxDelay);
  }

  private enhanceError(
    originalError: Error,
    llmError: LLMError,
    attempts: number,
  ): Error {
    const enhancedMessage = `${originalError.message} (Failed after ${attempts} attempts)`;
    const enhancedError = new Error(enhancedMessage);

    // Add additional properties
    (enhancedError as any).llmError = llmError;
    (enhancedError as any).attempts = attempts;

    return enhancedError;
  }

  private getRecentErrors(timeWindow: number): LLMError[] {
    const cutoff = Date.now() - timeWindow;
    return this.errorHistory.filter(
      (error) => new Date(error.timestamp).getTime() > cutoff,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
