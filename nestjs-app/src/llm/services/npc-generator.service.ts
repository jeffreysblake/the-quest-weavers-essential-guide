import { Injectable, Logger } from '@nestjs/common';
import { LLMService } from './llm.service';
import { PromptTemplateService } from './prompt-template.service';
import { ContextBuilderService } from './context-builder.service';
import { PlayerService } from '../../entity/player.service';
import { RoomService } from '../../entity/room.service';
import { IPlayer } from '../../entity/player.interface';

interface NPCGenerationRequest {
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
}

interface GeneratedNPCContent {
  name: string;
  description: string;
  personality: {
    traits: string[];
    mannerisms: string[];
    speechPatterns: string[];
  };
  backstory: {
    origin: string;
    motivation: string;
    secrets: string[];
    fears: string[];
  };
  stats: {
    health: number;
    level: number;
    skills: { [skill: string]: number };
  };
  inventory: Array<{
    name: string;
    description: string;
    material?: string;
    value?: number;
  }>;
  dialogue: {
    greeting: string[];
    farewell: string[];
    topics: { [topic: string]: string[] };
    questDialogue?: {
      questOffer: string;
      questAccepted: string;
      questCompleted: string;
    };
  };
  behavior: {
    defaultAction: string;
    combatStyle?: string;
    tradeItems?: string[];
    wanderPattern?: string;
  };
}

@Injectable()
export class NPCGeneratorService {
  private readonly logger = new Logger(NPCGeneratorService.name);

  constructor(
    private llmService: LLMService,
    private promptTemplateService: PromptTemplateService,
    private contextBuilderService: ContextBuilderService,
    private playerService: PlayerService,
    private roomService: RoomService,
  ) {}

  async generateNPC(request: NPCGenerationRequest): Promise<IPlayer> {
    this.logger.log(`Generating NPC with role: ${request.role || 'generic'}`);

    try {
      const context = await this.buildNPCGenerationContext(request);
      const npcContent = await this.generateNPCContent(request, context);
      const npc = await this.createNPCFromContent(npcContent, request);

      this.logger.log(`Successfully generated NPC: ${npc.name} (${npc.id})`);
      return npc;
    } catch (error) {
      this.logger.error(`NPC generation failed: ${error.message}`);
      throw new Error(`Failed to generate NPC: ${error.message}`);
    }
  }

  async generateNPCGroup(groupRequest: {
    size: number;
    theme: string;
    relationships?: 'family' | 'guild' | 'enemies' | 'random';
    roomId?: string;
  }): Promise<IPlayer[]> {
    const npcs: IPlayer[] = [];
    const baseRequest: NPCGenerationRequest = {
      roomId: groupRequest.roomId,
    };

    for (let i = 0; i < groupRequest.size; i++) {
      const npcRequest = {
        ...baseRequest,
        relationships: this.buildGroupRelationships(
          npcs,
          groupRequest.relationships,
        ),
      };

      const npc = await this.generateNPC(npcRequest);
      npcs.push(npc);
    }

    return npcs;
  }

  async generateDialogue(
    npcId: string,
    topic: string,
    context: { playerId?: string; roomId?: string; situation?: string },
  ): Promise<string[]> {
    const npc = this.playerService.findById(npcId);
    if (!npc) {
      throw new Error(`NPC ${npcId} not found`);
    }

    const gameContext = await this.contextBuilderService.buildNPCContext(npcId);
    const dialoguePrompt = await this.promptTemplateService.renderTemplate(
      'npc_dialogue',
      {
        npcName: npc.name,
        npcPersonality: gameContext?.npc?.type || 'friendly',
        topic,
        situation: context.situation || 'casual conversation',
        roomDescription: context.roomId
          ? this.roomService.findById(context.roomId)?.description
          : 'unknown location',
      },
    );

    const schema = {
      type: 'object',
      required: ['responses'],
      properties: {
        responses: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of possible dialogue responses',
        },
      },
    };

    const response = await this.llmService.generateStructuredResponse<{
      responses: string[];
    }>(dialoguePrompt, schema, { temperature: 0.9 });

    return (
      response.parsedContent?.responses || [
        `${npc.name} looks at you thoughtfully but says nothing.`,
      ]
    );
  }

  async enhanceNPC(
    npcId: string,
    enhancements: {
      newPersonalityTraits?: string[];
      newSkills?: { [skill: string]: number };
      newInventory?: string[];
      relationshipChanges?: {
        [otherId: string]: 'friend' | 'enemy' | 'neutral';
      };
    },
  ): Promise<IPlayer> {
    const npc = this.playerService.findById(npcId);
    if (!npc) {
      throw new Error(`NPC ${npcId} not found`);
    }

    const context = await this.contextBuilderService.buildNPCContext(npcId);
    if (!context) {
      throw new Error(`NPC ${npcId} not found for enhancement`);
    }

    const enhancementPrompt = await this.promptTemplateService.renderTemplate(
      'npc_enhancement',
      {
        existingNPC: JSON.stringify(context.npc, null, 2),
        enhancements: JSON.stringify(enhancements, null, 2),
      },
    );

    const schema = this.getNPCContentSchema();
    const response =
      await this.llmService.generateStructuredResponse<GeneratedNPCContent>(
        enhancementPrompt,
        schema,
      );

    const enhancedNPC = await this.applyNPCEnhancements(
      npc,
      response.parsedContent,
      enhancements,
    );
    return enhancedNPC;
  }

  private async buildNPCGenerationContext(
    request: NPCGenerationRequest,
  ): Promise<any> {
    const context: any = {
      request,
      worldState: {
        totalNPCs: this.playerService
          .findAll()
          .filter((p) => p.type !== 'player').length,
        totalRooms: this.roomService.findAll().length,
      },
    };

    if (request.roomId) {
      const roomContext = await this.contextBuilderService.buildRoomContext(
        request.roomId,
      );
      context.room = roomContext.room;
      context.existingNPCs = roomContext.npcs || [];
    }

    if (request.relationships) {
      context.relatedNPCs = Object.keys(request.relationships)
        .map((npcId) => {
          const npc = this.playerService.findById(npcId);
          return npc
            ? {
                id: npc.id,
                name: npc.name,
                relationship: request.relationships![npcId],
              }
            : null;
        })
        .filter(Boolean);
    }

    return context;
  }

  private async generateNPCContent(
    request: NPCGenerationRequest,
    context: any,
  ): Promise<GeneratedNPCContent> {
    // Handle personality as either string or array
    let personalityStr = 'generate appropriate personality';
    if (request.personality) {
      if (Array.isArray(request.personality)) {
        personalityStr = request.personality.join(', ');
      } else {
        personalityStr = request.personality as string;
      }
    }

    // Handle skills as either string or array
    let skillsStr = 'generate appropriate skills';
    if (request.skills) {
      if (Array.isArray(request.skills)) {
        skillsStr = request.skills.join(', ');
      } else {
        skillsStr = request.skills as any;
      }
    }

    const prompt = await this.promptTemplateService.renderTemplate(
      'npc_generation',
      {
        name: request.name || 'generate appropriate name',
        role: request.role || 'villager',
        personality: personalityStr,
        backstory: request.backstory || 'create interesting backstory',
        level: (request.level || 1).toString(),
        alignment: request.alignment || 'neutral',
        skills: skillsStr,
        roomDescription: context.room?.description || 'unknown location',
        existingNPCs:
          context.existingNPCs?.map((npc: any) => npc.name).join(', ') ||
          'none',
        relationships:
          context.relatedNPCs
            ?.map((npc: any) => `${npc.name} (${npc.relationship})`)
            .join(', ') || 'none',
      },
    );

    const schema = this.getNPCContentSchema();

    const response =
      await this.llmService.generateStructuredResponse<GeneratedNPCContent>(
        prompt,
        schema,
        {
          temperature: 0.8,
          maxTokens: 4000,
        },
      );

    if (response.validationErrors?.length) {
      this.logger.warn(
        `NPC generation validation errors: ${response.validationErrors.join(', ')}`,
      );
    }

    return response.parsedContent;
  }

  private async createNPCFromContent(
    content: GeneratedNPCContent,
    request: NPCGenerationRequest,
  ): Promise<IPlayer> {
    const position = request.roomId
      ? this.roomService.findById(request.roomId)?.position || {
          x: 0,
          y: 0,
          z: 0,
        }
      : { x: 0, y: 0, z: 0 };

    const npc = this.playerService.create({
      name: content.name,
      description: content.description,
      position,
      health: content.stats.health,
      maxHealth: content.stats.health,
      level: 1,
      experience: 0,
      inventory: [],
    });

    if (request.roomId) {
      this.playerService.moveToRoom(npc.id, request.roomId);
    }

    return npc;
  }

  private buildGroupRelationships(
    existingNPCs: IPlayer[],
    relationshipType?: 'family' | 'guild' | 'enemies' | 'random',
  ): { [npcId: string]: 'friend' | 'enemy' | 'neutral' | 'family' } {
    const relationships: {
      [npcId: string]: 'friend' | 'enemy' | 'neutral' | 'family';
    } = {};

    if (!relationshipType || existingNPCs.length === 0) {
      return relationships;
    }

    for (const npc of existingNPCs) {
      switch (relationshipType) {
        case 'family':
          relationships[npc.id] = 'family';
          break;
        case 'guild':
          relationships[npc.id] = 'friend';
          break;
        case 'enemies':
          relationships[npc.id] = 'enemy';
          break;
        case 'random':
          const options: ('friend' | 'enemy' | 'neutral')[] = [
            'friend',
            'enemy',
            'neutral',
          ];
          relationships[npc.id] =
            options[Math.floor(Math.random() * options.length)];
          break;
      }
    }

    return relationships;
  }

  private async applyNPCEnhancements(
    npc: IPlayer,
    enhancements: GeneratedNPCContent,
    originalEnhancements: any,
  ): Promise<IPlayer> {
    if (enhancements.description) {
      npc.description = enhancements.description;
    }

    if (enhancements.stats.health && enhancements.stats.health !== npc.health) {
      npc.health = Math.min(
        enhancements.stats.health,
        npc.maxHealth || enhancements.stats.health,
      );
      npc.maxHealth = enhancements.stats.health;
    }

    this.playerService.update(npc.id, npc);
    return npc;
  }

  private getNPCContentSchema() {
    return {
      type: 'object',
      required: [
        'name',
        'description',
        'personality',
        'backstory',
        'stats',
        'dialogue',
        'behavior',
      ],
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        personality: {
          type: 'object',
          required: ['traits', 'mannerisms', 'speechPatterns'],
          properties: {
            traits: { type: 'array', items: { type: 'string' } },
            mannerisms: { type: 'array', items: { type: 'string' } },
            speechPatterns: { type: 'array', items: { type: 'string' } },
          },
        },
        backstory: {
          type: 'object',
          required: ['origin', 'motivation'],
          properties: {
            origin: { type: 'string' },
            motivation: { type: 'string' },
            secrets: { type: 'array', items: { type: 'string' } },
            fears: { type: 'array', items: { type: 'string' } },
          },
        },
        stats: {
          type: 'object',
          required: ['health', 'level'],
          properties: {
            health: { type: 'number' },
            level: { type: 'number' },
            skills: {
              type: 'object',
              additionalProperties: { type: 'number' },
            },
          },
        },
        inventory: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'description'],
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
              material: { type: 'string' },
              value: { type: 'number' },
            },
          },
        },
        dialogue: {
          type: 'object',
          required: ['greeting', 'farewell', 'topics'],
          properties: {
            greeting: { type: 'array', items: { type: 'string' } },
            farewell: { type: 'array', items: { type: 'string' } },
            topics: {
              type: 'object',
              additionalProperties: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            questDialogue: {
              type: 'object',
              properties: {
                questOffer: { type: 'string' },
                questAccepted: { type: 'string' },
                questCompleted: { type: 'string' },
              },
            },
          },
        },
        behavior: {
          type: 'object',
          required: ['defaultAction'],
          properties: {
            defaultAction: { type: 'string' },
            combatStyle: { type: 'string' },
            tradeItems: { type: 'array', items: { type: 'string' } },
            wanderPattern: { type: 'string' },
          },
        },
      },
    };
  }
}
