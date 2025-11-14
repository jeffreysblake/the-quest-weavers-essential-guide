import { Injectable, Logger } from '@nestjs/common';
import {
  LLMProvider,
  LLMResponse,
  LLMRequestOptions,
  StructuredLLMResponse,
  ConversationTurn,
} from '../interfaces/llm.interface';

interface AnthropicConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  timeout?: number;
  maxRetries?: number;
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AnthropicResponse {
  content: {
    type: 'text';
    text: string;
  }[];
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  model: string;
  stop_reason: string;
}

@Injectable()
export class AnthropicProvider implements LLMProvider {
  public readonly name = 'anthropic';
  private readonly logger = new Logger(AnthropicProvider.name);
  private config: AnthropicConfig;
  private lastHealthCheck = 0;
  private isHealthy = false;
  private readonly HEALTH_CHECK_INTERVAL = 60000; // 1 minute

  constructor(config: AnthropicConfig) {
    this.config = {
      defaultModel: 'claude-3-haiku-20240307',
      timeout: 30000,
      maxRetries: 3,
      baseUrl: 'https://api.anthropic.com/v1',
      ...config,
    };

    this.logger.log(
      `Anthropic provider initialized with model: ${this.config.defaultModel}`,
    );
  }

  async isAvailable(): Promise<boolean> {
    const now = Date.now();

    // Use cached health status if recent
    if (now - this.lastHealthCheck < this.HEALTH_CHECK_INTERVAL) {
      return this.isHealthy;
    }

    try {
      // Test with a minimal request
      const response = await this.makeRequest({
        model: this.config.defaultModel!,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1,
      });

      this.isHealthy = response.content?.length > 0;
      this.lastHealthCheck = now;

      return this.isHealthy;
    } catch (error) {
      this.logger.warn(`Anthropic health check failed: ${error.message}`);
      this.isHealthy = false;
      this.lastHealthCheck = now;
      return false;
    }
  }

  async generateResponse(
    prompt: string,
    options: LLMRequestOptions = {},
  ): Promise<LLMResponse> {
    const messages = this.buildMessages(prompt, options);

    const requestBody = {
      model: options.model || this.config.defaultModel!,
      messages,
      max_tokens: options.maxTokens || 2000,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 1.0,
      system: options.systemPrompt,
    };

    const startTime = Date.now();
    const response = await this.makeRequest(requestBody);
    const processingTime = Date.now() - startTime;

    const content = response.content[0];
    if (!content || content.type !== 'text') {
      throw new Error('No text content returned from Anthropic');
    }

    return {
      content: content.text,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      model: response.model,
      finishReason: this.mapStopReason(response.stop_reason),
      metadata: {
        processingTime,
        provider: this.name,
      },
    };
  }

  async generateStructuredResponse<T>(
    prompt: string,
    schema: any,
    options: LLMRequestOptions = {},
  ): Promise<StructuredLLMResponse<T>> {
    // Enhance prompt for structured output
    const structuredPrompt = `${prompt}

Please respond with a valid JSON object that matches this schema:
${JSON.stringify(schema, null, 2)}

Respond with only the JSON object, no additional text.`;

    const structuredOptions: LLMRequestOptions = {
      ...options,
      temperature: Math.min(options.temperature ?? 0.7, 0.3), // Lower temp for structured
      systemPrompt: this.combineSystemPrompts(
        options.systemPrompt,
        'You are a precise assistant that responds with valid JSON only. Do not include any text outside the JSON object.',
      ),
    };

    const baseResponse = await this.generateResponse(
      structuredPrompt,
      structuredOptions,
    );

    // Parse the structured response
    let parsedContent: T;
    const validationErrors: string[] = [];

    try {
      // Extract JSON from response
      const jsonMatch = baseResponse.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        validationErrors.push('No JSON object found in response');
        parsedContent = null as any;
      } else {
        parsedContent = JSON.parse(jsonMatch[0]);

        // Basic validation against schema
        const validation = this.validateSchema(parsedContent, schema);
        if (!validation.valid) {
          validationErrors.push(...validation.errors);
        }
      }
    } catch (error) {
      validationErrors.push(`JSON parsing failed: ${error.message}`);
      parsedContent = null as any;
    }

    return {
      ...baseResponse,
      parsedContent,
      validationErrors:
        validationErrors.length > 0 ? validationErrors : undefined,
    };
  }

  private buildMessages(
    prompt: string,
    options: LLMRequestOptions,
  ): AnthropicMessage[] {
    const messages: AnthropicMessage[] = [];

    // Add conversation history if provided
    if (options.conversationHistory) {
      for (const turn of options.conversationHistory) {
        if (turn.role !== 'system') {
          // Anthropic handles system prompts separately
          messages.push({
            role: turn.role,
            content: turn.content,
          });
        }
      }
    }

    // Add the current prompt
    messages.push({
      role: 'user',
      content: prompt,
    });

    return messages;
  }

  private async makeRequest(requestBody: any): Promise<AnthropicResponse> {
    const url = `${this.config.baseUrl}/messages`;

    let lastError: Error;
    for (let attempt = 1; attempt <= this.config.maxRetries!; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          this.config.timeout,
        );

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.config.apiKey,
            'anthropic-version': '2023-06-01',
            'User-Agent': 'Quest-Weaver-Engine/1.0',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(
            `Anthropic API error (${response.status}): ${errorData}`,
          );
        }

        const data = await response.json();
        return data;
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.config.maxRetries!) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff
          this.logger.warn(
            `Anthropic request attempt ${attempt} failed, retrying in ${delay}ms: ${error.message}`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(
      `Anthropic request failed after ${this.config.maxRetries} attempts: ${lastError!.message}`,
    );
  }

  private mapStopReason(
    reason: string,
  ): 'stop' | 'length' | 'content_filter' | 'error' {
    switch (reason) {
      case 'end_turn':
        return 'stop';
      case 'max_tokens':
        return 'length';
      case 'stop_sequence':
        return 'stop';
      default:
        return 'error';
    }
  }

  private combineSystemPrompts(...prompts: (string | undefined)[]): string {
    return prompts.filter((p) => p && p.trim()).join('\n\n');
  }

  private validateSchema(
    data: any,
    schema: any,
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Basic type checking
    if (
      schema.type === 'object' &&
      (typeof data !== 'object' || data === null)
    ) {
      errors.push('Expected object type');
    } else if (schema.type === 'array' && !Array.isArray(data)) {
      errors.push('Expected array type');
    } else if (schema.type === 'string' && typeof data !== 'string') {
      errors.push('Expected string type');
    } else if (schema.type === 'number' && typeof data !== 'number') {
      errors.push('Expected number type');
    } else if (schema.type === 'boolean' && typeof data !== 'boolean') {
      errors.push('Expected boolean type');
    }

    // Check required properties for objects
    if (
      schema.type === 'object' &&
      schema.required &&
      Array.isArray(schema.required)
    ) {
      for (const prop of schema.required) {
        if (!(prop in data)) {
          errors.push(`Missing required property: ${prop}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // Static factory method for easy configuration
  static create(
    apiKey: string,
    config: Partial<AnthropicConfig> = {},
  ): AnthropicProvider {
    return new AnthropicProvider({
      apiKey,
      ...config,
    });
  }
}
