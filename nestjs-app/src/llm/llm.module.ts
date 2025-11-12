import { Module, Global, Logger } from '@nestjs/common';
import { LLMService } from './services/llm.service';
import { PromptTemplateService } from './services/prompt-template.service';
import { ContextBuilderService } from './services/context-builder.service';
import { NarrativeGeneratorService } from './services/narrative-generator.service';
import { RoomGeneratorService } from './services/room-generator.service';
import { NPCGeneratorService } from './services/npc-generator.service';
import { StoryAgentService } from './services/story-agent.service';
import { ConflictResolverService } from './services/conflict-resolver.service';
import { LLMCacheService } from './services/llm-cache.service';
import { LLMErrorHandlerService } from './services/llm-error-handler.service';
import { LLMController } from './llm.controller';
import { OpenAIProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { EntityModule } from '../entity/entity.module';
import { RoomModule } from '../entity/room.module';
import { ObjectModule } from '../entity/object.module';
import { PlayerModule } from '../entity/player.module';

@Global()
@Module({
  imports: [
    EntityModule,
    RoomModule,
    ObjectModule,
    PlayerModule
  ],
  controllers: [LLMController],
  providers: [
    // Performance and Reliability Services
    LLMCacheService,
    LLMErrorHandlerService,
    
    // Core LLM Services
    LLMService,
    PromptTemplateService,
    ContextBuilderService,
    
    // Content Generation Services  
    NarrativeGeneratorService,
    RoomGeneratorService,
    NPCGeneratorService,
    
    // Advanced AI Services
    StoryAgentService,
    ConflictResolverService,
    
    // Provider Configuration Factory
    {
      provide: 'LLM_PROVIDERS',
      useFactory: () => {
        const providers: any[] = [];
        
        // Configure OpenAI if API key is available
        if (process.env.OPENAI_API_KEY) {
          providers.push(OpenAIProvider.create(process.env.OPENAI_API_KEY, {
            baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
            defaultModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            timeout: parseInt(process.env.LLM_TIMEOUT || '30000'),
            maxRetries: parseInt(process.env.LLM_MAX_RETRIES || '3')
          }));
        }
        
        // Configure Anthropic if API key is available
        if (process.env.ANTHROPIC_API_KEY) {
          providers.push(AnthropicProvider.create(process.env.ANTHROPIC_API_KEY, {
            defaultModel: process.env.ANTHROPIC_MODEL || 'claude-3-haiku-20240307',
            timeout: parseInt(process.env.LLM_TIMEOUT || '30000'),
            maxRetries: parseInt(process.env.LLM_MAX_RETRIES || '3')
          }));
        }
        
        return providers;
      }
    },
    
    // Provider Registration Service
    {
      provide: 'LLM_INITIALIZER',
      useFactory: async (llmService: LLMService, providers: any[]) => {
        const logger = new Logger('LLMModule');

        if (providers.length === 0) {
          logger.warn('No LLM providers configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variables.');
          return;
        }

        // Register providers with the LLM service
        for (let i = 0; i < providers.length; i++) {
          const provider = providers[i];
          const isPrimary = i === 0; // First provider is primary
          llmService.registerProvider(provider, isPrimary);
        }

        // Test provider connectivity
        const available = await llmService.isAvailable();
        if (!available) {
          logger.warn('No LLM providers are currently available. Features requiring AI will be disabled.');
        } else {
          logger.log('LLM integration initialized successfully');
        }
        
        return llmService;
      },
      inject: [LLMService, 'LLM_PROVIDERS']
    }
  ],
  exports: [
    LLMService,
    PromptTemplateService,
    ContextBuilderService,
    NarrativeGeneratorService,
    RoomGeneratorService,
    NPCGeneratorService,
    StoryAgentService,
    ConflictResolverService,
    LLMCacheService,
    LLMErrorHandlerService
  ]
})
export class LLMModule {
  private readonly logger = new Logger(LLMModule.name);

  constructor(
    private readonly llmService: LLMService,
    private readonly conflictResolver: ConflictResolverService
  ) {
    // Module is initialized via the factory providers above
    this.logInitializationStatus();
  }

  private async logInitializationStatus(): Promise<void> {
    try {
      const stats = this.llmService.getStats();
      this.logger.log(`LLM Module Status:
        - Available Providers: ${stats.availableProviders.join(', ')}
        - Primary Provider: ${stats.primaryProvider}
        - Total Requests: ${stats.totalRequests}
        - Success Rate: ${(stats.successRate * 100).toFixed(1)}%
      `);

      const conflictStats = this.conflictResolver.getResolutionStats();
      this.logger.log(`Conflict Resolution Status:
        - Total Conflicts Resolved: ${conflictStats.totalConflicts}
        - Success Rate: ${(conflictStats.successRate * 100).toFixed(1)}%
      `);
    } catch (error) {
      this.logger.error('Error logging LLM module status:', error.message);
    }
  }
}