import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Logger,
} from '@nestjs/common';
import { LLMService } from './services/llm.service';
import { NarrativeGeneratorService } from './services/narrative-generator.service';
import { RoomGeneratorService } from './services/room-generator.service';
import { NPCGeneratorService } from './services/npc-generator.service';
import { StoryAgentService } from './services/story-agent.service';
import { ConflictResolverService } from './services/conflict-resolver.service';
import { PromptTemplateService } from './services/prompt-template.service';

@Controller('api/llm')
export class LLMController {
  private readonly logger = new Logger(LLMController.name);

  constructor(
    private readonly llmService: LLMService,
    private readonly narrativeService: NarrativeGeneratorService,
    private readonly roomGenerator: RoomGeneratorService,
    private readonly npcGenerator: NPCGeneratorService,
    private readonly storyAgent: StoryAgentService,
    private readonly conflictResolver: ConflictResolverService,
    private readonly promptService: PromptTemplateService,
  ) {}

  @Get('status')
  async getStatus() {
    const isAvailable = await this.llmService.isAvailable();
    const stats = this.llmService.getStats();
    const conflictStats = this.conflictResolver.getResolutionStats();
    const promptStats = this.promptService.getStats();

    return {
      available: isAvailable,
      llmStats: stats,
      conflictStats,
      promptStats,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('generate/text')
  async generateText(
    @Body()
    body: {
      prompt: string;
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
      model?: string;
    },
  ) {
    try {
      const response = await this.llmService.generateResponse(body.prompt, {
        systemPrompt: body.systemPrompt,
        temperature: body.temperature,
        maxTokens: body.maxTokens,
        model: body.model,
      });

      return {
        success: true,
        content: response.content,
        usage: response.usage,
        model: response.model,
        finishReason: response.finishReason,
        metadata: response.metadata,
      };
    } catch (error) {
      this.logger.error(`Text generation failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post('generate/structured')
  async generateStructured(
    @Body()
    body: {
      prompt: string;
      schema: any;
      systemPrompt?: string;
      temperature?: number;
      maxTokens?: number;
      model?: string;
    },
  ) {
    try {
      const response = await this.llmService.generateStructuredResponse(
        body.prompt,
        body.schema,
        {
          systemPrompt: body.systemPrompt,
          temperature: body.temperature,
          maxTokens: body.maxTokens,
          model: body.model,
        },
      );

      return {
        success: true,
        content: response.content,
        parsedContent: response.parsedContent,
        validationErrors: response.validationErrors,
        usage: response.usage,
        model: response.model,
        metadata: response.metadata,
      };
    } catch (error) {
      this.logger.error(`Structured generation failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Story Creation Endpoints

  @Post('story/create')
  async createStory(
    @Body()
    body: {
      theme: string;
      genre:
        | 'fantasy'
        | 'sci-fi'
        | 'horror'
        | 'mystery'
        | 'adventure'
        | 'drama';
      playerLevel: number;
      preferences?: any;
    },
  ) {
    try {
      const result = await this.storyAgent.startStoryCreation(body);
      return {
        success: true,
        sessionId: result.sessionId,
        firstDecision: result.firstDecision,
      };
    } catch (error) {
      this.logger.error(`Story creation failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post('story/decision/:sessionId')
  async processStoryDecision(
    @Param('sessionId') sessionId: string,
    @Body()
    body: {
      decisionId: string;
      choice: string;
      feedback?: string;
    },
  ) {
    try {
      const result = await this.storyAgent.processDecision(
        sessionId,
        body.decisionId,
        body.choice,
        body.feedback,
      );

      return {
        success: true,
        nextDecision: result.nextDecision,
        progress: result.progress,
        generated: result.generated,
      };
    } catch (error) {
      this.logger.error(`Story decision processing failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Get('story/status/:sessionId')
  async getStoryStatus(@Param('sessionId') sessionId: string) {
    try {
      const status = this.storyAgent.getSessionStatus(sessionId);
      return {
        success: true,
        ...status,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post('story/finalize/:sessionId')
  async finalizeStory(@Param('sessionId') sessionId: string) {
    try {
      const result = await this.storyAgent.finalizeStory(sessionId);
      return {
        success: true,
        deployedElements: result.deployedElements,
        summary: result.summary,
      };
    } catch (error) {
      this.logger.error(`Story finalization failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Content Generation Endpoints

  @Post('generate/room')
  async generateRoom(
    @Body()
    body: {
      theme?: string;
      style?:
        | 'medieval'
        | 'modern'
        | 'fantasy'
        | 'sci-fi'
        | 'horror'
        | 'mystery';
      size?: 'small' | 'medium' | 'large';
      purpose?: string;
      connectedRooms?: string[];
      requiredObjects?: string[];
      ambiance?: string;
      dangerLevel?: number;
    },
  ) {
    try {
      const room = await this.roomGenerator.generateRoom(body);
      return {
        success: true,
        room: {
          id: room.id,
          name: room.name,
          description: room.description,
          position: room.position,
        },
      };
    } catch (error) {
      this.logger.error(`Room generation failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post('generate/npc')
  async generateNPC(
    @Body()
    body: {
      name?: string;
      role?:
        | 'merchant'
        | 'guard'
        | 'wizard'
        | 'villager'
        | 'enemy'
        | 'ally'
        | 'quest_giver';
      personality?: string[];
      backstory?: string;
      roomId?: string;
      level?: number;
      alignment?: 'good' | 'neutral' | 'evil';
      skills?: string[];
      inventory?: string[];
      relationships?: {
        [npcId: string]: 'friend' | 'enemy' | 'neutral' | 'family';
      };
    },
  ) {
    try {
      const npc = await this.npcGenerator.generateNPC(body);
      return {
        success: true,
        npc: {
          id: npc.id,
          name: npc.name,
          description: npc.description,
          position: npc.position,
          health: npc.health,
          type: npc.type,
        },
      };
    } catch (error) {
      this.logger.error(`NPC generation failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post('generate/dialogue/:npcId')
  async generateDialogue(
    @Param('npcId') npcId: string,
    @Body()
    body: {
      topic: string;
      context: {
        playerId?: string;
        roomId?: string;
        situation?: string;
      };
    },
  ) {
    try {
      const dialogue = await this.npcGenerator.generateDialogue(
        npcId,
        body.topic,
        body.context,
      );

      return {
        success: true,
        dialogue,
      };
    } catch (error) {
      this.logger.error(`Dialogue generation failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post('generate/quest')
  async generateQuest(
    @Body()
    body: {
      type: 'main' | 'side' | 'hidden';
      difficulty: number;
      objectives: string[];
      npcsInvolved?: string[];
      locationsInvolved?: string[];
      timeLimit?: number;
      prerequisites?: string[];
    },
  ) {
    try {
      const quest = await this.narrativeService.generateQuest(body);
      return {
        success: true,
        quest,
      };
    } catch (error) {
      this.logger.error(`Quest generation failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Conflict Resolution Endpoints

  @Post('conflict/resolve')
  async resolveConflict(
    @Body()
    body: {
      conflictType:
        | 'physics'
        | 'npc_behavior'
        | 'object_state'
        | 'player_action'
        | 'world_consistency';
      affectedEntities: string[];
      location?: string;
      description: string;
      originalAction: string;
      errorDetails?: any;
    },
  ) {
    try {
      const resolution = await this.conflictResolver.resolveConflict(
        body.conflictType,
        {
          affectedEntities: body.affectedEntities,
          location: body.location,
          description: body.description,
          originalAction: body.originalAction,
          errorDetails: body.errorDetails,
        },
      );

      return {
        success: true,
        resolution,
      };
    } catch (error) {
      this.logger.error(`Conflict resolution failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post('conflict/physics')
  async resolvePhysicsConflict(
    @Body() body: { objects: string[]; physicsError: string; location: string },
  ) {
    try {
      const resolution =
        await this.conflictResolver.handlePhysicsConflict(body);
      return {
        success: true,
        resolution,
      };
    } catch (error) {
      this.logger.error(`Physics conflict resolution failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post('conflict/npc')
  async resolveNPCConflict(
    @Body()
    body: {
      npcId: string;
      conflictDescription: string;
      attemptedAction: string;
      location?: string;
    },
  ) {
    try {
      const resolution = await this.conflictResolver.handleNPCConflict(body);
      return {
        success: true,
        resolution,
      };
    } catch (error) {
      this.logger.error(`NPC conflict resolution failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Template Management Endpoints

  @Get('templates')
  async getTemplates(@Query('category') category?: string) {
    if (category) {
      return {
        templates: this.promptService.getTemplatesByCategory(category),
      };
    }

    const stats = this.promptService.getStats();
    return stats;
  }

  @Get('templates/:templateId')
  async getTemplate(@Param('templateId') templateId: string) {
    const template = this.promptService.getTemplate(templateId);
    if (!template) {
      return {
        success: false,
        error: 'Template not found',
      };
    }

    return {
      success: true,
      template,
    };
  }

  @Post('templates/:templateId/compile')
  async compileTemplate(
    @Param('templateId') templateId: string,
    @Body() body: { variables: Record<string, any> },
  ) {
    try {
      const compiled = this.promptService.compileTemplate(
        templateId,
        body.variables,
      );
      return {
        success: true,
        compiled,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Test Endpoints

  @Post('test/providers')
  async testProviders() {
    try {
      const results = await this.llmService.testProviders();
      return {
        success: true,
        providers: Object.fromEntries(results),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Post('test/simple')
  async testSimpleGeneration(@Body() body: { prompt?: string }) {
    const prompt =
      body.prompt ||
      'Generate a short, creative description of a magical forest.';

    try {
      const response = await this.llmService.generateResponse(prompt, {
        maxTokens: 200,
        temperature: 0.7,
      });

      return {
        success: true,
        prompt,
        response: response.content,
        usage: response.usage,
        model: response.model,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }
}
