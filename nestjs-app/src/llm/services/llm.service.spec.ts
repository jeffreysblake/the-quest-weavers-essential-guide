import { Test, TestingModule } from '@nestjs/testing';
import { LLMService } from './llm.service';
import {
  LLMProvider,
  LLMResponse,
  StructuredLLMResponse,
} from '../interfaces/llm.interface';
import { LLMCacheService } from './llm-cache.service';
import { LLMErrorHandlerService } from './llm-error-handler.service';

// Mock LLM Provider for testing
class MockLLMProvider implements LLMProvider {
  public readonly name = 'mock';
  private shouldFail = false;

  async isAvailable(): Promise<boolean> {
    return !this.shouldFail;
  }

  async generateResponse(
    prompt: string,
    options: any = {},
  ): Promise<LLMResponse> {
    if (this.shouldFail) {
      throw new Error('Mock provider failure');
    }

    // Check if this is a structured request by looking for JSON schema request
    let content: string;
    if (
      prompt.includes('JSON') ||
      prompt.includes('schema') ||
      options.schema
    ) {
      // Check if it's a nested schema request
      if (prompt.includes('character')) {
        content = JSON.stringify({
          character: {
            name: 'mock_string_value',
            skills: ['mock_item_1', 'mock_item_2'],
          },
        });
      } else {
        content = JSON.stringify({
          name: 'mock_string_value',
          age: 42,
          active: true,
        });
      }
    } else {
      content = `Mock response to: ${prompt.substring(0, 50)}...`;
    }

    return {
      content,
      usage: {
        promptTokens: prompt.length / 4,
        completionTokens: content.length / 4,
        totalTokens: (prompt.length + content.length) / 4,
      },
      model: 'mock-model',
      finishReason: 'stop',
      metadata: {
        processingTime: 100,
        provider: this.name,
      },
    };
  }

  async generateStructuredResponse<T>(
    prompt: string,
    schema: any,
    options: any = {},
  ): Promise<StructuredLLMResponse<T>> {
    const baseResponse = await this.generateResponse(prompt, options);

    const mockStructuredData = this.generateMockDataForSchema(schema);

    return {
      ...baseResponse,
      parsedContent: mockStructuredData,
      validationErrors: undefined,
    };
  }

  setFailure(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  private generateMockDataForSchema(schema: any): any {
    if (schema.type === 'object') {
      const result: any = {};

      if (schema.properties) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          result[key] = this.generateMockDataForSchema(propSchema);
        }
      }

      return result;
    } else if (schema.type === 'array') {
      return ['mock_item_1', 'mock_item_2'];
    } else if (schema.type === 'string') {
      return 'mock_string_value';
    } else if (schema.type === 'number') {
      return 42;
    } else if (schema.type === 'boolean') {
      return true;
    }

    return 'mock_value';
  }
}

describe('LLMService', () => {
  let service: LLMService;
  let mockProvider: MockLLMProvider;
  let fallbackProvider: MockLLMProvider;
  let mockErrorCount = 0;

  beforeEach(async () => {
    mockErrorCount = 0; // Reset error count for each test

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LLMService,
        {
          provide: LLMCacheService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            invalidate: jest.fn(),
            getStats: jest.fn(() => ({ hitRate: 0.5, totalRequests: 0 })),
            getCachedPromptResponse: jest.fn(() => Promise.resolve(null)),
            cachePromptResponse: jest.fn(() => Promise.resolve()),
          },
        },
        {
          provide: LLMErrorHandlerService,
          useValue: {
            withRetry: jest.fn((fn) => fn()),
            createCircuitBreaker: jest.fn(),
            isSystemHealthy: jest.fn(() => true),
            logError: jest.fn(),
            getErrorStats: jest.fn(() => ({
              totalErrors: mockErrorCount,
              errorRate: mockErrorCount > 0 ? 0.5 : 0,
            })),
            handleError: jest.fn((error) => {
              mockErrorCount++;
              return error;
            }),
            getUserFriendlyMessage: jest.fn(
              (error) => 'All LLM providers are unavailable',
            ),
          },
        },
      ],
    }).compile();

    service = module.get<LLMService>(LLMService);

    mockProvider = new MockLLMProvider();
    fallbackProvider = new MockLLMProvider();
    Object.defineProperty(fallbackProvider, 'name', { value: 'fallback' });

    // Register providers
    service.registerProvider(mockProvider, true); // Primary
    service.registerProvider(fallbackProvider, false); // Fallback
  });

  describe('Provider Registration', () => {
    it('should register providers correctly', () => {
      const stats = service.getStats();
      expect(stats.availableProviders).toContain('mock');
      expect(stats.primaryProvider).toBe('mock');
    });

    it('should handle multiple providers', () => {
      const anotherProvider = new MockLLMProvider();
      Object.defineProperty(anotherProvider, 'name', { value: 'mock2' });

      service.registerProvider(anotherProvider, false);

      const stats = service.getStats();
      expect(stats.availableProviders).toHaveLength(3); // mock + fallback + mock2
    });
  });

  describe('Text Generation', () => {
    it('should generate text responses', async () => {
      const response = await service.generateResponse('Test prompt');

      expect(response.content).toBeDefined();
      expect(response.content).toContain('Mock response to: Test prompt');
      expect(response.usage.totalTokens).toBeGreaterThan(0);
      expect(response.model).toBe('mock-model');
      expect(response.finishReason).toBe('stop');
    });

    it('should handle generation options', async () => {
      const options = {
        temperature: 0.8,
        maxTokens: 150,
        systemPrompt: 'You are a helpful assistant',
      };

      const response = await service.generateResponse('Test prompt', options);
      expect(response.content).toBeDefined();
    });

    it('should include conversation history', async () => {
      const options = {
        conversationHistory: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
      };

      const response = await service.generateResponse(
        'Continue the conversation',
        options,
      );
      expect(response.content).toBeDefined();
    });
  });

  describe('Structured Generation', () => {
    it('should generate structured responses', async () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
          active: { type: 'boolean' },
        },
        required: ['name', 'age'],
      };

      const response = await service.generateStructuredResponse(
        'Generate a person',
        schema,
      );

      expect(response.parsedContent).toBeDefined();
      expect(response.parsedContent.name).toBe('mock_string_value');
      expect(response.parsedContent.age).toBe(42);
      expect(response.parsedContent.active).toBe(true);
      expect(response.validationErrors).toEqual([]);
    });

    it('should handle complex nested schemas', async () => {
      const schema = {
        type: 'object',
        properties: {
          character: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              skills: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      };

      const response = await service.generateStructuredResponse(
        'Generate a character',
        schema,
      );

      expect(response.parsedContent.character).toBeDefined();
      expect(response.parsedContent.character.name).toBe('mock_string_value');
      expect(Array.isArray(response.parsedContent.character.skills)).toBe(true);
    });
  });

  describe('Provider Fallback', () => {
    it('should fallback to secondary provider when primary fails', async () => {
      // Make primary provider fail
      mockProvider.setFailure(true);

      const response = await service.generateResponse('Test prompt');
      expect(response.content).toBeDefined();
    });

    it('should throw error when all providers fail', async () => {
      // Make all providers fail
      mockProvider.setFailure(true);
      fallbackProvider.setFailure(true);

      await expect(service.generateResponse('Test prompt')).rejects.toThrow(
        'All LLM providers are unavailable',
      );
    });
  });

  describe('Availability Checking', () => {
    it('should return true when providers are available', async () => {
      const available = await service.isAvailable();
      expect(available).toBe(true);
    });

    it('should return false when no providers are available', async () => {
      mockProvider.setFailure(true);
      fallbackProvider.setFailure(true);

      const available = await service.isAvailable();
      expect(available).toBe(false);
    });
  });

  describe('Statistics Tracking', () => {
    it('should track request statistics', async () => {
      const initialStats = service.getStats();
      const initialRequests = initialStats.totalRequests;

      await service.generateResponse('Test prompt');

      const finalStats = service.getStats();
      expect(finalStats.totalRequests).toBe(initialRequests + 1);
      expect(finalStats.successRate).toBeGreaterThanOrEqual(0);
    });

    it('should track error statistics', async () => {
      // Override the mock to have isAvailable return true but generateResponse throw error
      jest.spyOn(mockProvider, 'isAvailable').mockResolvedValue(true);
      jest
        .spyOn(mockProvider, 'generateResponse')
        .mockRejectedValue(new Error('Mock provider failure'));
      jest.spyOn(fallbackProvider, 'isAvailable').mockResolvedValue(true);
      jest
        .spyOn(fallbackProvider, 'generateResponse')
        .mockRejectedValue(new Error('Fallback provider failure'));

      const initialStats = service.getStats();

      try {
        await service.generateResponse('Test prompt');
      } catch (error) {
        // Expected to fail
      }

      const finalStats = service.getStats();
      expect(finalStats.errorCount).toBeGreaterThan(initialStats.errorCount);
    });
  });

  describe('Provider Testing', () => {
    it('should test all registered providers', async () => {
      const results = await service.testProviders();

      expect(results.size).toBe(2); // mock and fallback providers
      expect(results.get('mock')).toBe(true);
      expect(results.get('fallback')).toBe(true);
    });

    it('should handle provider test failures', async () => {
      mockProvider.setFailure(true);

      const results = await service.testProviders();
      expect(results.get('mock')).toBe(false);
    });
  });

  describe('Conversation Context', () => {
    it('should generate conversational responses', async () => {
      const conversationHistory = [
        { role: 'user', content: 'What is the capital of France?' },
        { role: 'assistant', content: 'The capital of France is Paris.' },
      ];

      const response = await service.generateConversationResponse(
        'What about its population?',
        conversationHistory,
      );

      expect(response.content).toBeDefined();
      expect(response.content).toContain(
        'Mock response to: What about its population?',
      );
    });

    it('should handle empty conversation history', async () => {
      const response = await service.generateConversationResponse('Hello', []);

      expect(response.content).toBeDefined();
    });
  });
});
