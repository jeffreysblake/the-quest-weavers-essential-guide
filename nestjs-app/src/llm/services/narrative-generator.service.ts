import { Injectable, Logger } from '@nestjs/common';
import { LLMService } from './llm.service';
import { PromptTemplateService } from './prompt-template.service';
import { ContextBuilderService } from './context-builder.service';
import { RoomGeneratorService } from './room-generator.service';
import { NPCGeneratorService } from './npc-generator.service';

interface StoryGenerationRequest {
  genre: 'fantasy' | 'sci-fi' | 'horror' | 'mystery' | 'adventure' | 'drama';
  theme: string;
  targetLength: 'short' | 'medium' | 'long';
  playerLevel: number;
  startingLocation?: string;
  keyElements?: string[];
  conflicts?: string[];
  desiredOutcome?: 'open' | 'heroic' | 'tragic' | 'mysterious';
}

interface GeneratedStory {
  title: string;
  synopsis: string;
  acts: Array<{
    title: string;
    description: string;
    objectives: string[];
    locations: string[];
    characters: string[];
    keyEvents: string[];
  }>;
  characters: Array<{
    name: string;
    role: 'protagonist' | 'antagonist' | 'ally' | 'mentor' | 'neutral';
    description: string;
    motivation: string;
  }>;
  locations: Array<{
    name: string;
    description: string;
    significance: string;
    connections: string[];
  }>;
  plotHooks: Array<{
    trigger: string;
    description: string;
    consequences: string[];
  }>;
  questLines: Array<{
    name: string;
    description: string;
    prerequisites: string[];
    rewards: string[];
    difficulty: number;
  }>;
}

interface QuestGenerationRequest {
  type: 'main' | 'side' | 'hidden';
  difficulty: number;
  objectives: string[];
  npcsInvolved?: string[];
  locationsInvolved?: string[];
  timeLimit?: number;
  prerequisites?: string[];
}

export interface GeneratedQuest {
  name: string;
  description: string;
  objectives: Array<{
    description: string;
    type: 'collect' | 'defeat' | 'explore' | 'deliver' | 'interact';
    target: string;
    quantity?: number;
    location?: string;
  }>;
  rewards: Array<{
    type: 'experience' | 'item' | 'gold' | 'reputation';
    amount: number;
    description: string;
  }>;
  dialogue: {
    questGiver: string[];
    completion: string[];
    failure?: string[];
  };
}

@Injectable()
export class NarrativeGeneratorService {
  private readonly logger = new Logger(NarrativeGeneratorService.name);

  constructor(
    private llmService: LLMService,
    private promptTemplateService: PromptTemplateService,
    private contextBuilderService: ContextBuilderService,
    private roomGeneratorService: RoomGeneratorService,
    private npcGeneratorService: NPCGeneratorService,
  ) {}

  async generateStory(
    request: StoryGenerationRequest,
  ): Promise<GeneratedStory> {
    this.logger.log(`Generating ${request.genre} story: ${request.theme}`);

    try {
      const context = await this.buildStoryContext(request);
      const story = await this.generateStoryContent(request, context);

      this.logger.log(`Successfully generated story: ${story.title}`);
      return story;
    } catch (error) {
      this.logger.error(`Story generation failed: ${error.message}`);
      throw new Error(`Failed to generate story: ${error.message}`);
    }
  }

  async implementStory(story: GeneratedStory): Promise<{
    rooms: any[];
    npcs: any[];
    quests: GeneratedQuest[];
  }> {
    this.logger.log(`Implementing story: ${story.title}`);

    const results = {
      rooms: [] as any[],
      npcs: [] as any[],
      quests: [] as GeneratedQuest[],
    };

    try {
      // Generate locations/rooms
      for (const location of story.locations) {
        const room = await this.roomGeneratorService.generateRoom({
          theme: location.name,
          purpose: location.significance,
          style: this.mapGenreToStyle(story.acts[0]?.title || 'fantasy'),
        });
        results.rooms.push(room);
      }

      // Generate NPCs
      for (const character of story.characters) {
        const npc = await this.npcGeneratorService.generateNPC({
          name: character.name,
          role: this.mapRoleToNPCRole(character.role),
          backstory: `${character.description} Motivation: ${character.motivation}`,
          roomId: results.rooms[0]?.id,
        });
        results.npcs.push(npc);
      }

      // Generate quests from quest lines
      for (const questLine of story.questLines) {
        const quest = await this.generateQuest({
          type: questLine.difficulty > 7 ? 'main' : 'side',
          difficulty: questLine.difficulty,
          objectives: [questLine.description],
          npcsInvolved: results.npcs.slice(0, 2).map((npc) => npc.id),
        });
        results.quests.push(quest);
      }

      this.logger.log(
        `Story implementation complete: ${results.rooms.length} rooms, ${results.npcs.length} NPCs, ${results.quests.length} quests`,
      );
      return results;
    } catch (error) {
      this.logger.error(`Story implementation failed: ${error.message}`);
      throw new Error(`Failed to implement story: ${error.message}`);
    }
  }

  async generateQuest(
    request: QuestGenerationRequest,
  ): Promise<GeneratedQuest> {
    this.logger.log(
      `Generating ${request.type} quest with difficulty ${request.difficulty}`,
    );

    const context = await this.buildQuestContext(request);
    const questPrompt = await this.promptTemplateService.renderTemplate(
      'quest_generation',
      {
        type: request.type,
        difficulty: request.difficulty.toString(),
        objectives: request.objectives.join(', '),
        npcsInvolved:
          context.npcs?.map((npc: any) => npc.name).join(', ') || 'none',
        locationsInvolved:
          context.locations?.map((loc: any) => loc.name).join(', ') ||
          'current area',
        prerequisites: request.prerequisites?.join(', ') || 'none',
      },
    );

    const schema = this.getQuestSchema();
    const response =
      await this.llmService.generateStructuredResponse<GeneratedQuest>(
        questPrompt,
        schema,
        { temperature: 0.7 },
      );

    if (response.validationErrors?.length) {
      this.logger.warn(
        `Quest generation validation errors: ${response.validationErrors.join(', ')}`,
      );
    }

    return response.parsedContent;
  }

  async generatePlotTwist(currentStoryState: any): Promise<{
    twist: string;
    impact: string;
    newObjectives: string[];
    affectedCharacters: string[];
  }> {
    const twistPrompt = await this.promptTemplateService.renderTemplate(
      'plot_twist',
      {
        currentState: JSON.stringify(currentStoryState, null, 2),
        storyProgress: '50%', // Could be calculated dynamically
      },
    );

    const schema = {
      type: 'object',
      required: ['twist', 'impact', 'newObjectives', 'affectedCharacters'],
      properties: {
        twist: { type: 'string', description: 'The plot twist description' },
        impact: { type: 'string', description: 'How this affects the story' },
        newObjectives: {
          type: 'array',
          items: { type: 'string' },
          description: 'New objectives created by this twist',
        },
        affectedCharacters: {
          type: 'array',
          items: { type: 'string' },
          description: 'Characters affected by this twist',
        },
      },
    };

    const response = await this.llmService.generateStructuredResponse(
      twistPrompt,
      schema,
      { temperature: 0.9 },
    );

    return response.parsedContent as {
      twist: string;
      impact: string;
      newObjectives: string[];
      affectedCharacters: string[];
    };
  }

  async generateAdaptiveNarrative(
    playerActions: string[],
    currentGameState: any,
    storyContext: any,
  ): Promise<{
    narrativeResponse: string;
    consequences: string[];
    newStoryElements: any[];
  }> {
    const adaptivePrompt = await this.promptTemplateService.renderTemplate(
      'adaptive_narrative',
      {
        playerActions: playerActions.join(', '),
        gameState: JSON.stringify(currentGameState, null, 2),
        storyContext: JSON.stringify(storyContext, null, 2),
      },
    );

    const schema = {
      type: 'object',
      required: ['narrativeResponse', 'consequences', 'newStoryElements'],
      properties: {
        narrativeResponse: {
          type: 'string',
          description: 'The narrative response to player actions',
        },
        consequences: {
          type: 'array',
          items: { type: 'string' },
          description: 'Consequences of the player actions',
        },
        newStoryElements: {
          type: 'array',
          items: { type: 'object' },
          description: 'New story elements introduced',
        },
      },
    };

    const response = await this.llmService.generateStructuredResponse(
      adaptivePrompt,
      schema,
      { temperature: 0.8 },
    );

    return response.parsedContent as {
      narrativeResponse: string;
      consequences: string[];
      newStoryElements: any[];
    };
  }

  private async buildStoryContext(
    request: StoryGenerationRequest,
  ): Promise<any> {
    return {
      request,
      worldState: await this.contextBuilderService.buildFullContext(),
      storyConstraints: {
        maxRooms: this.getMaxRoomsByLength(request.targetLength),
        maxNPCs: this.getMaxNPCsByLength(request.targetLength),
        complexityLevel: request.playerLevel,
      },
    };
  }

  private async buildQuestContext(
    request: QuestGenerationRequest,
  ): Promise<any> {
    const context: any = { request };

    if (request.npcsInvolved?.length) {
      context.npcs = request.npcsInvolved.map((id) =>
        // Would fetch NPC data here
        ({ id, name: `NPC_${id}` }),
      );
    }

    if (request.locationsInvolved?.length) {
      context.locations = request.locationsInvolved.map((id) =>
        // Would fetch room data here
        ({ id, name: `Location_${id}` }),
      );
    }

    return context;
  }

  private async generateStoryContent(
    request: StoryGenerationRequest,
    context: any,
  ): Promise<GeneratedStory> {
    const storyPrompt = await this.promptTemplateService.renderTemplate(
      'story_generation',
      {
        genre: request.genre,
        theme: request.theme,
        targetLength: request.targetLength,
        playerLevel: request.playerLevel.toString(),
        keyElements:
          request.keyElements?.join(', ') || 'adventure, discovery, challenge',
        conflicts: request.conflicts?.join(', ') || 'overcome obstacles',
        desiredOutcome: request.desiredOutcome || 'open',
        maxRooms: context.storyConstraints.maxRooms.toString(),
        maxNPCs: context.storyConstraints.maxNPCs.toString(),
      },
    );

    const schema = this.getStorySchema();
    const response =
      await this.llmService.generateStructuredResponse<GeneratedStory>(
        storyPrompt,
        schema,
        {
          temperature: 0.8,
          maxTokens: 6000,
        },
      );

    if (response.validationErrors?.length) {
      this.logger.warn(
        `Story generation validation errors: ${response.validationErrors.join(', ')}`,
      );
    }

    return response.parsedContent;
  }

  private getStorySchema() {
    return {
      type: 'object',
      required: [
        'title',
        'synopsis',
        'acts',
        'characters',
        'locations',
        'questLines',
      ],
      properties: {
        title: { type: 'string' },
        synopsis: { type: 'string' },
        acts: {
          type: 'array',
          items: {
            type: 'object',
            required: ['title', 'description', 'objectives'],
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              objectives: { type: 'array', items: { type: 'string' } },
              locations: { type: 'array', items: { type: 'string' } },
              characters: { type: 'array', items: { type: 'string' } },
              keyEvents: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        characters: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'role', 'description', 'motivation'],
            properties: {
              name: { type: 'string' },
              role: {
                type: 'string',
                enum: [
                  'protagonist',
                  'antagonist',
                  'ally',
                  'mentor',
                  'neutral',
                ],
              },
              description: { type: 'string' },
              motivation: { type: 'string' },
            },
          },
        },
        locations: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'description', 'significance'],
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              significance: { type: 'string' },
              connections: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        plotHooks: {
          type: 'array',
          items: {
            type: 'object',
            required: ['trigger', 'description', 'consequences'],
            properties: {
              trigger: { type: 'string' },
              description: { type: 'string' },
              consequences: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        questLines: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'description', 'difficulty'],
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              prerequisites: { type: 'array', items: { type: 'string' } },
              rewards: { type: 'array', items: { type: 'string' } },
              difficulty: { type: 'number', minimum: 1, maximum: 10 },
            },
          },
        },
      },
    };
  }

  private getQuestSchema() {
    return {
      type: 'object',
      required: ['name', 'description', 'objectives', 'rewards', 'dialogue'],
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        objectives: {
          type: 'array',
          items: {
            type: 'object',
            required: ['description', 'type', 'target'],
            properties: {
              description: { type: 'string' },
              type: {
                type: 'string',
                enum: ['collect', 'defeat', 'explore', 'deliver', 'interact'],
              },
              target: { type: 'string' },
              quantity: { type: 'number' },
              location: { type: 'string' },
            },
          },
        },
        rewards: {
          type: 'array',
          items: {
            type: 'object',
            required: ['type', 'amount', 'description'],
            properties: {
              type: {
                type: 'string',
                enum: ['experience', 'item', 'gold', 'reputation'],
              },
              amount: { type: 'number' },
              description: { type: 'string' },
            },
          },
        },
        dialogue: {
          type: 'object',
          required: ['questGiver', 'completion'],
          properties: {
            questGiver: { type: 'array', items: { type: 'string' } },
            completion: { type: 'array', items: { type: 'string' } },
            failure: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    };
  }

  private getMaxRoomsByLength(length: string): number {
    switch (length) {
      case 'short':
        return 5;
      case 'medium':
        return 15;
      case 'long':
        return 30;
      default:
        return 10;
    }
  }

  private getMaxNPCsByLength(length: string): number {
    switch (length) {
      case 'short':
        return 3;
      case 'medium':
        return 8;
      case 'long':
        return 15;
      default:
        return 5;
    }
  }

  private mapGenreToStyle(
    genre: string,
  ): 'medieval' | 'modern' | 'fantasy' | 'sci-fi' | 'horror' | 'mystery' {
    const mapping: { [key: string]: any } = {
      fantasy: 'fantasy',
      'sci-fi': 'sci-fi',
      horror: 'horror',
      mystery: 'mystery',
      adventure: 'fantasy',
      drama: 'modern',
    };
    return mapping[genre.toLowerCase()] || 'fantasy';
  }

  private mapRoleToNPCRole(
    role: string,
  ):
    | 'merchant'
    | 'guard'
    | 'wizard'
    | 'villager'
    | 'enemy'
    | 'ally'
    | 'quest_giver' {
    const mapping: { [key: string]: any } = {
      protagonist: 'ally',
      antagonist: 'enemy',
      ally: 'ally',
      mentor: 'wizard',
      neutral: 'villager',
    };
    return mapping[role] || 'villager';
  }
}
