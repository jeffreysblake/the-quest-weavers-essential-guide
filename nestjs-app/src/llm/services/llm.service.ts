import { Injectable, Logger } from '@nestjs/common';
import {
  LLMProvider,
  LLMResponse,
  LLMRequestOptions,
  StructuredLLMResponse,
  LLMError,
  ConversationTurn,
} from '../interfaces/llm.interface';
import { LLMCacheService } from './llm-cache.service';
import { LLMErrorHandlerService } from './llm-error-handler.service';

@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);
  private providers: Map<string, LLMProvider> = new Map();
  private primaryProvider: string;
  private fallbackProviders: string[] = [];
  private requestCount = 0;
  private errorCount = 0;

  constructor(
    private readonly cacheService?: LLMCacheService,
    private readonly errorHandler?: LLMErrorHandlerService,
  ) {
    this.logger.log('Initializing LLM Service with caching and error handling');
  }

  /**
   * Register an LLM provider
   */
  registerProvider(provider: LLMProvider, isPrimary = false): void {
    this.providers.set(provider.name, provider);

    if (isPrimary) {
      this.primaryProvider = provider.name;
    } else {
      this.fallbackProviders.push(provider.name);
    }

    this.logger.log(
      `Registered LLM provider: ${provider.name}${isPrimary ? ' (primary)' : ''}`,
    );
  }

  /**
   * Generate a text response using the best available provider
   */
  async generateResponse(
    prompt: string,
    options: LLMRequestOptions = {},
  ): Promise<LLMResponse> {
    this.requestCount++;
    const startTime = Date.now();

    // Check cache first
    if (this.cacheService) {
      const cached = await this.cacheService.getCachedPromptResponse(
        prompt,
        options,
      );
      if (cached) {
        this.logger.debug('Returning cached response');
        return cached as LLMResponse;
      }
    }

    const operation = async (): Promise<LLMResponse> => {
      // Try primary provider first
      if (this.primaryProvider) {
        try {
          const provider = this.providers.get(this.primaryProvider);
          if (provider && (await provider.isAvailable())) {
            const response = await provider.generateResponse(prompt, options);
            this.logSuccess(this.primaryProvider, startTime);

            // Cache the response
            if (this.cacheService) {
              await this.cacheService.cachePromptResponse(
                prompt,
                response,
                options,
              );
            }

            return response;
          }
        } catch (error) {
          this.logger.warn(
            `Primary provider ${this.primaryProvider} failed: ${error.message}`,
          );
          this.errorCount++;
          throw error;
        }
      }

      // Try fallback providers
      for (const providerName of this.fallbackProviders) {
        try {
          const provider = this.providers.get(providerName);
          if (provider && (await provider.isAvailable())) {
            const response = await provider.generateResponse(prompt, options);
            this.logFallbackSuccess(providerName, startTime);

            // Cache the response
            if (this.cacheService) {
              await this.cacheService.cachePromptResponse(
                prompt,
                response,
                options,
              );
            }

            return response;
          }
        } catch (error) {
          this.logger.warn(
            `Fallback provider ${providerName} failed: ${error.message}`,
          );
          this.errorCount++;
          throw error;
        }
      }

      // All providers failed
      const error = new Error('All LLM providers are unavailable');
      throw error;
    };

    try {
      if (this.errorHandler) {
        return await this.errorHandler.withRetry(operation);
      } else {
        return await operation();
      }
    } catch (error) {
      if (this.errorHandler) {
        const llmError = this.errorHandler.handleError(error as Error, {
          prompt,
          options,
        });
        throw new Error(this.errorHandler.getUserFriendlyMessage(llmError));
      } else {
        throw error;
      }
    }
  }

  /**
   * Generate a structured response with JSON parsing and validation
   */
  async generateStructuredResponse<T>(
    prompt: string,
    schema: any,
    options: LLMRequestOptions = {},
  ): Promise<StructuredLLMResponse<T>> {
    // Add JSON formatting instructions to prompt
    const structuredPrompt = this.formatPromptForStructuredOutput(
      prompt,
      schema,
    );

    // Modify options to encourage structured output
    const structuredOptions: LLMRequestOptions = {
      ...options,
      temperature: Math.min(options.temperature || 0.7, 0.3), // Lower temperature for structured output
      systemPrompt: this.combineSystemPrompts(
        options.systemPrompt,
        'You must respond with valid JSON that matches the provided schema exactly.',
      ),
    };

    const response = await this.generateResponse(
      structuredPrompt,
      structuredOptions,
    );

    // Parse and validate the structured response
    return this.parseStructuredResponse<T>(response, schema);
  }

  /**
   * Generate response with conversation history context
   */
  async generateConversationResponse(
    message: string,
    conversationHistory: ConversationTurn[],
    options: LLMRequestOptions = {},
  ): Promise<LLMResponse> {
    const contextualOptions: LLMRequestOptions = {
      ...options,
      conversationHistory,
    };

    return this.generateResponse(message, contextualOptions);
  }

  /**
   * Check if any LLM provider is available
   */
  async isAvailable(): Promise<boolean> {
    // Check primary provider
    if (this.primaryProvider) {
      const provider = this.providers.get(this.primaryProvider);
      if (provider && (await provider.isAvailable())) {
        return true;
      }
    }

    // Check fallback providers
    for (const providerName of this.fallbackProviders) {
      const provider = this.providers.get(providerName);
      if (provider && (await provider.isAvailable())) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get service statistics
   */
  getStats(): {
    totalRequests: number;
    errorCount: number;
    successRate: number;
    availableProviders: string[];
    primaryProvider: string;
  } {
    return {
      totalRequests: this.requestCount,
      errorCount: this.errorCount,
      successRate:
        this.requestCount > 0
          ? (this.requestCount - this.errorCount) / this.requestCount
          : 0,
      availableProviders: Array.from(this.providers.keys()),
      primaryProvider: this.primaryProvider,
    };
  }

  /**
   * Test all providers and return their status
   */
  async testProviders(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const [name, provider] of this.providers) {
      try {
        const isAvailable = await provider.isAvailable();
        results.set(name, isAvailable);
        this.logger.log(
          `Provider ${name}: ${isAvailable ? 'Available' : 'Unavailable'}`,
        );
      } catch (error) {
        results.set(name, false);
        this.logger.error(`Provider ${name} test failed: ${error.message}`);
      }
    }

    return results;
  }

  // Private helper methods

  private formatPromptForStructuredOutput(prompt: string, schema: any): string {
    const schemaDescription = this.generateSchemaDescription(schema);

    return `${prompt}

Please respond with a valid JSON object that matches this schema:
${JSON.stringify(schema, null, 2)}

Schema requirements:
${schemaDescription}

Ensure your response is valid JSON with no additional text or formatting.`;
  }

  private generateSchemaDescription(schema: any): string {
    if (schema.type === 'object') {
      const props = Object.entries(schema.properties || {})
        .map(([key, prop]: [string, any]) => {
          const required = schema.required?.includes(key)
            ? ' (required)'
            : ' (optional)';
          return `- ${key}: ${prop.type}${required}${prop.description ? ` - ${prop.description}` : ''}`;
        })
        .join('\n');

      return `Object with properties:\n${props}`;
    }

    return `Type: ${schema.type}`;
  }

  private combineSystemPrompts(...prompts: (string | undefined)[]): string {
    return prompts.filter((p) => p && p.trim()).join('\n\n');
  }

  private async parseStructuredResponse<T>(
    response: LLMResponse,
    schema: any,
  ): Promise<StructuredLLMResponse<T>> {
    const structuredResponse: StructuredLLMResponse<T> = {
      ...response,
      parsedContent: null as any,
      validationErrors: [],
    };

    try {
      // Extract JSON from response content
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        structuredResponse.validationErrors!.push(
          'No JSON object found in response',
        );
        return structuredResponse;
      }

      // Parse JSON
      const parsedContent = JSON.parse(jsonMatch[0]);

      // Basic validation against schema
      const validation = this.validateAgainstSchema(parsedContent, schema);
      if (validation.errors.length > 0) {
        structuredResponse.validationErrors = validation.errors;
      }

      structuredResponse.parsedContent = parsedContent;
    } catch (error) {
      structuredResponse.validationErrors!.push(
        `JSON parsing failed: ${error.message}`,
      );
    }

    return structuredResponse;
  }

  private validateAgainstSchema(
    data: any,
    schema: any,
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (schema.type === 'object') {
      if (typeof data !== 'object' || data === null) {
        errors.push('Expected object type');
        return { valid: false, errors };
      }

      // Check required properties
      if (schema.required) {
        for (const requiredProp of schema.required) {
          if (!(requiredProp in data)) {
            errors.push(`Missing required property: ${requiredProp}`);
          }
        }
      }

      // Check property types
      if (schema.properties) {
        for (const [propName, propSchema] of Object.entries(
          schema.properties,
        )) {
          if (propName in data) {
            const propValidation = this.validateAgainstSchema(
              data[propName],
              propSchema,
            );
            errors.push(
              ...propValidation.errors.map((e) => `${propName}.${e}`),
            );
          }
        }
      }
    } else if (schema.type === 'array') {
      if (!Array.isArray(data)) {
        errors.push('Expected array type');
      }
    } else if (schema.type === 'string') {
      if (typeof data !== 'string') {
        errors.push('Expected string type');
      }
    } else if (schema.type === 'number') {
      if (typeof data !== 'number') {
        errors.push('Expected number type');
      }
    } else if (schema.type === 'boolean') {
      if (typeof data !== 'boolean') {
        errors.push('Expected boolean type');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  private logSuccess(providerName: string, startTime: number): void {
    const duration = Date.now() - startTime;
    this.logger.log(
      `Successfully generated response using ${providerName} in ${duration}ms`,
    );
  }

  private logFallbackSuccess(providerName: string, startTime: number): void {
    const duration = Date.now() - startTime;
    this.logger.warn(
      `Used fallback provider ${providerName} for response in ${duration}ms`,
    );
  }
}
