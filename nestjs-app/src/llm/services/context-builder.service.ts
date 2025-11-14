import { Injectable, Logger } from '@nestjs/common';
import { EntityService } from '../../entity/entity.service';
import { RoomService } from '../../entity/room.service';
import { ObjectService } from '../../entity/object.service';
import { PlayerService } from '../../entity/player.service';
import {
  GameContext,
  GameInfo,
  SceneContext,
  RoomContext,
  ObjectContext,
  NPCContext,
  PlayerContext,
  WorldState,
  GameConstraints,
} from '../interfaces/llm.interface';

export interface ContextBuilderOptions {
  includeNearbyRooms?: boolean;
  maxNearbyRooms?: number;
  includeRecentEvents?: boolean;
  maxRecentEvents?: number;
  includeDetailedObjects?: boolean;
  includePlayerHistory?: boolean;
  maxHistoryItems?: number;
  proximityRadius?: number;
  compressionLevel?: 'none' | 'light' | 'moderate' | 'aggressive';
  includeHistory?: boolean;
  maxHistoryEntries?: number;
}

@Injectable()
export class ContextBuilderService {
  private readonly logger = new Logger(ContextBuilderService.name);

  constructor(
    private readonly entityService: EntityService,
    private readonly roomService: RoomService,
    private readonly objectService: ObjectService,
    private readonly playerService: PlayerService,
  ) {}

  /**
   * Build complete game context for LLM requests
   */
  async buildGameContext(
    gameId: string,
    playerId?: string,
    roomId?: string,
    options: ContextBuilderOptions = {},
  ): Promise<GameContext> {
    const defaultOptions: ContextBuilderOptions = {
      includeNearbyRooms: true,
      maxNearbyRooms: 3,
      includeRecentEvents: true,
      maxRecentEvents: 10,
      includeDetailedObjects: true,
      includePlayerHistory: true,
      maxHistoryItems: 20,
      proximityRadius: 2,
      compressionLevel: 'light',
      ...options,
    };

    this.logger.log(
      `Building context for game ${gameId}, player ${playerId}, room ${roomId}`,
    );

    const [gameInfo, sceneContext, playerContext, worldState, constraints] =
      await Promise.all([
        this.buildGameInfo(gameId),
        this.buildSceneContext(gameId, roomId, defaultOptions),
        playerId
          ? this.buildPlayerContext(playerId, defaultOptions)
          : this.buildDefaultPlayerContext(),
        this.buildWorldState(gameId, defaultOptions),
        this.buildGameConstraints(gameId),
      ]);

    const context: GameContext = {
      gameInfo,
      currentScene: sceneContext,
      playerContext,
      worldState,
      constraints,
    };

    // Apply compression if requested
    if (defaultOptions.compressionLevel !== 'none') {
      return this.compressContext(context, defaultOptions.compressionLevel!);
    }

    return context;
  }

  /**
   * Build focused context for specific operations
   */
  async buildFocusedContext(
    gameId: string,
    focusType: 'room' | 'object' | 'npc' | 'conflict',
    focusId: string,
    options: ContextBuilderOptions = {},
  ): Promise<GameContext> {
    switch (focusType) {
      case 'room':
        return this.buildRoomFocusedContext(gameId, focusId, options);
      case 'object':
        return this.buildObjectFocusedContext(gameId, focusId, options);
      case 'npc':
        return this.buildNPCFocusedContext(gameId, focusId, options);
      case 'conflict':
        return this.buildConflictFocusedContext(gameId, focusId, options);
      default:
        throw new Error(`Unknown focus type: ${focusType}`);
    }
  }

  /**
   * Update context with new information
   */
  async updateContext(
    baseContext: GameContext,
    updates: Partial<GameContext>,
  ): Promise<GameContext> {
    return {
      ...baseContext,
      ...updates,
      currentScene: {
        ...baseContext.currentScene,
        ...updates.currentScene,
      },
      playerContext: {
        ...baseContext.playerContext,
        ...updates.playerContext,
      },
      worldState: {
        ...baseContext.worldState,
        ...updates.worldState,
      },
    };
  }

  // Private methods for building context components

  private async buildGameInfo(gameId: string): Promise<GameInfo> {
    // In a real implementation, this would fetch from a game metadata service
    return {
      id: gameId,
      name: `Game ${gameId}`,
      theme: 'fantasy adventure', // Default theme
      genre: 'RPG',
      description: 'An epic adventure game',
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
    };
  }

  private async buildSceneContext(
    gameId: string,
    roomId?: string,
    options: ContextBuilderOptions = {},
  ): Promise<SceneContext> {
    let activeRoom: RoomContext | undefined;
    let nearbyRooms: RoomContext[] = [];

    if (roomId) {
      activeRoom = await this.buildRoomContext(roomId, options);

      if (options.includeNearbyRooms) {
        nearbyRooms = await this.buildNearbyRooms(
          roomId,
          options.maxNearbyRooms || 3,
        );
      }
    }

    // Build recent events (placeholder - would integrate with event system)
    const recentEvents = options.includeRecentEvents
      ? await this.buildRecentEvents(gameId, options.maxRecentEvents || 10)
      : [];

    return {
      activeRoom: activeRoom!,
      nearbyRooms,
      recentEvents,
      timeOfDay: this.getCurrentTimeOfDay(),
      weather: 'clear',
      atmosphere: 'calm',
    };
  }

  async buildRoomContext(
    roomId: string,
    options: ContextBuilderOptions = {
      includeHistory: true,
      maxHistoryEntries: 10,
    },
  ): Promise<RoomContext> {
    const room = this.roomService.getRoom(roomId);
    if (!room) {
      throw new Error(`Room not found: ${roomId}`);
    }

    // Get objects in room
    const roomObjects = await this.roomService.getObjectsInRoom(roomId);
    const objects: ObjectContext[] = [];

    for (const obj of roomObjects) {
      const objectContext = await this.buildObjectContext(obj.id, options);
      if (objectContext) {
        objects.push(objectContext);
      }
    }

    // Get NPCs in room
    const roomNPCs = await this.roomService.getPlayersInRoom(roomId);
    const npcs: NPCContext[] = [];

    for (const npc of roomNPCs) {
      if (npc.type === 'npc') {
        const npcContext = await this.buildNPCContext(npc.id, options);
        if (npcContext) {
          npcs.push(npcContext);
        }
      }
    }

    // Get room connections
    const connections = await this.buildRoomConnections(roomId);

    return {
      room,
      objects,
      npcs,
      connections,
      ambiance: {
        lighting: 'natural light',
        sounds: ['ambient room sounds'],
        smells: ['neutral'],
        temperature: 'comfortable',
      },
    };
  }

  async buildObjectContext(
    objectId: string,
    options: ContextBuilderOptions = {
      includeHistory: true,
      maxHistoryEntries: 10,
    },
  ): Promise<ObjectContext | null> {
    const object = this.objectService.getObject(objectId);
    if (!object) {
      return null;
    }

    // Get spatial relationships
    const spatialRelationships =
      await this.objectService.getSpatialRelationships(objectId);

    // Build interaction history (placeholder)
    const interactionHistory = options.includePlayerHistory
      ? await this.buildObjectInteractionHistory(objectId)
      : [];

    // Determine significance
    const significance = this.determineObjectSignificance(object);

    return {
      object,
      spatialRelationships:
        spatialRelationships?.map((rel) => ({
          type: rel.relationshipType,
          targetId: rel.targetId,
          description: rel.description || '',
          stability: 80, // Default stability
        })) || [],
      interactionHistory,
      significance,
    };
  }

  async buildNPCContext(
    npcId: string,
    options: ContextBuilderOptions = {
      includeHistory: true,
      maxHistoryEntries: 10,
    },
  ): Promise<NPCContext | null> {
    const npc = this.playerService.getPlayer(npcId);
    if (!npc) {
      return null;
    }

    // Build NPC personality (would be stored in NPC data)
    const personality = this.buildNPCPersonality(npc);

    // Build relationships
    const relationships = await this.buildNPCRelationships(npcId);

    // Get conversation history
    const conversationHistory = options.includePlayerHistory
      ? await this.buildConversationHistory(npcId)
      : [];

    return {
      npc,
      personality,
      relationships,
      currentMood: 'neutral',
      recentActions: [],
      conversationHistory,
    };
  }

  private async buildPlayerContext(
    playerId: string,
    options: ContextBuilderOptions,
  ): Promise<PlayerContext> {
    const player = this.playerService.getPlayer(playerId);
    if (!player) {
      throw new Error(`Player not found: ${playerId}`);
    }

    // Build recent actions
    const recentActions = options.includePlayerHistory
      ? await this.buildPlayerActions(playerId, options.maxHistoryItems || 20)
      : [];

    // Build preferences (would be stored in player profile)
    const preferences = this.buildPlayerPreferences(player);

    // Build current objectives
    const currentObjectives = await this.buildPlayerObjectives(playerId);

    // Build conversation history
    const conversationHistory = options.includePlayerHistory
      ? await this.buildConversationHistory(playerId)
      : [];

    // Build play style
    const playStyle = this.analyzePlayStyle(player);

    return {
      player,
      recentActions,
      preferences,
      currentObjectives,
      conversationHistory,
      playStyle,
    };
  }

  private buildDefaultPlayerContext(): PlayerContext {
    return {
      player: {
        id: 'default',
        name: 'Player',
        type: 'player',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        level: 1,
        experience: 0,
        inventory: [],
      },
      recentActions: [],
      preferences: {
        preferredGenres: ['adventure'],
        contentPreferences: {
          violence: 'mild',
          romance: 'none',
          horror: 'none',
          humor: 'occasional',
        },
        interactionStyle: 'explorer',
        pacing: 'moderate',
      },
      currentObjectives: [],
      conversationHistory: [],
      playStyle: {
        exploration: 70,
        combat: 20,
        social: 50,
        puzzle: 40,
        story: 80,
        creation: 30,
      },
    };
  }

  private async buildWorldState(
    gameId: string,
    options: ContextBuilderOptions,
  ): Promise<WorldState> {
    // This would integrate with a world state management system
    return {
      keyLocations: [],
      importantNPCs: [],
      majorItems: [],
      ongoingQuests: [],
      worldEvents: [],
      factions: [],
    };
  }

  private async buildGameConstraints(gameId: string): Promise<GameConstraints> {
    // This would be configured per game
    return {
      physicsRules: [
        {
          type: 'gravity',
          description: 'Objects fall when not supported',
          flexibility: 'moderate',
          exceptions: ['magical items', 'flying creatures'],
        },
      ],
      culturalSettings: {
        era: 'medieval fantasy',
        technology: 'pre-industrial',
        socialStructure: 'feudal',
        religion: ['pantheon of gods'],
        values: ['honor', 'courage', 'loyalty'],
        taboos: ['necromancy', 'betrayal'],
        languages: ['Common', 'Elvish', 'Dwarvish'],
      },
      narrativeGuidelines: {
        tense: 'second',
        perspective: 'limited',
        tone: 'epic',
        complexity: 'moderate',
        descriptiveness: 'rich',
      },
      contentRatings: [
        {
          category: 'violence',
          level: 'moderate',
          guidelines: ['fantasy combat allowed', 'no graphic descriptions'],
        },
      ],
      technicalLimitations: [
        {
          type: 'performance',
          limit: '2000 tokens per context',
          description: 'Maximum context size for LLM requests',
        },
      ],
    };
  }

  // Helper methods

  private async buildNearbyRooms(
    roomId: string,
    maxRooms: number,
  ): Promise<RoomContext[]> {
    // This would use the room connection system to find nearby rooms
    return [];
  }

  private async buildRecentEvents(
    gameId: string,
    maxEvents: number,
  ): Promise<any[]> {
    // This would integrate with an event logging system
    return [];
  }

  private getCurrentTimeOfDay(): string {
    const hour = new Date().getHours();
    if (hour < 6) return 'night';
    if (hour < 12) return 'morning';
    if (hour < 18) return 'afternoon';
    return 'evening';
  }

  private async buildRoomConnections(roomId: string): Promise<any[]> {
    // This would fetch actual room connections
    return [];
  }

  private async buildObjectInteractionHistory(
    objectId: string,
  ): Promise<any[]> {
    // This would fetch interaction history
    return [];
  }

  private determineObjectSignificance(
    object: any,
  ): 'background' | 'notable' | 'important' | 'quest_critical' {
    // Logic to determine object importance
    if (object.properties?.questItem) return 'quest_critical';
    if (object.properties?.magical) return 'important';
    if (object.isPortable) return 'notable';
    return 'background';
  }

  private buildNPCPersonality(npc: any): any {
    // Extract or generate NPC personality
    return {
      traits: ['friendly', 'helpful'],
      values: ['honesty', 'kindness'],
      fears: ['darkness', 'conflict'],
      motivations: ['helping others', 'personal growth'],
      speechPatterns: {
        formality: 'casual',
        verbosity: 'normal',
        emotiveness: 'balanced',
        vocabulary: ['common words'],
        commonPhrases: ['How can I help?'],
      },
      background: 'A helpful character',
    };
  }

  private async buildNPCRelationships(npcId: string): Promise<any[]> {
    // Build NPC relationship network
    return [];
  }

  private async buildConversationHistory(entityId: string): Promise<any[]> {
    // Fetch conversation history
    return [];
  }

  private async buildPlayerActions(
    playerId: string,
    maxActions: number,
  ): Promise<any[]> {
    // Fetch recent player actions
    return [];
  }

  private buildPlayerPreferences(player: any): any {
    // Extract or infer player preferences
    return {
      preferredGenres: ['adventure', 'fantasy'],
      contentPreferences: {
        violence: 'moderate',
        romance: 'mild',
        horror: 'mild',
        humor: 'frequent',
      },
      interactionStyle: 'explorer',
      pacing: 'moderate',
    };
  }

  private async buildPlayerObjectives(playerId: string): Promise<any[]> {
    // Fetch current player objectives/quests
    return [];
  }

  private analyzePlayStyle(player: any): any {
    // Analyze player behavior to determine play style
    return {
      exploration: 70,
      combat: 30,
      social: 60,
      puzzle: 40,
      story: 80,
      creation: 20,
    };
  }

  private compressContext(
    context: GameContext,
    level: 'light' | 'moderate' | 'aggressive',
  ): GameContext {
    // Implement context compression strategies
    switch (level) {
      case 'light':
        return this.lightCompression(context);
      case 'moderate':
        return this.moderateCompression(context);
      case 'aggressive':
        return this.aggressiveCompression(context);
      default:
        return context;
    }
  }

  private lightCompression(context: GameContext): GameContext {
    // Remove least important details
    return {
      ...context,
      currentScene: {
        ...context.currentScene,
        nearbyRooms: context.currentScene.nearbyRooms.slice(0, 2), // Limit nearby rooms
        recentEvents: context.currentScene.recentEvents.slice(0, 5), // Limit recent events
      },
    };
  }

  private moderateCompression(context: GameContext): GameContext {
    // Remove more details and summarize
    const lightCompressed = this.lightCompression(context);
    return {
      ...lightCompressed,
      currentScene: {
        ...lightCompressed.currentScene,
        activeRoom: {
          ...lightCompressed.currentScene.activeRoom,
          objects: lightCompressed.currentScene.activeRoom.objects
            .filter((obj) => obj.significance !== 'background')
            .slice(0, 10), // Limit objects
        },
      },
    };
  }

  private aggressiveCompression(context: GameContext): GameContext {
    // Keep only essential information
    const moderateCompressed = this.moderateCompression(context);
    return {
      ...moderateCompressed,
      currentScene: {
        ...moderateCompressed.currentScene,
        nearbyRooms: [], // Remove nearby rooms
        activeRoom: {
          ...moderateCompressed.currentScene.activeRoom,
          objects: moderateCompressed.currentScene.activeRoom.objects
            .filter(
              (obj) =>
                obj.significance === 'quest_critical' ||
                obj.significance === 'important',
            )
            .slice(0, 5),
          npcs: moderateCompressed.currentScene.activeRoom.npcs.slice(0, 3), // Limit NPCs
        },
      },
      worldState: {
        ...moderateCompressed.worldState,
        keyLocations: moderateCompressed.worldState.keyLocations.slice(0, 3),
        importantNPCs: moderateCompressed.worldState.importantNPCs.slice(0, 3),
      },
    };
  }

  // Room-focused context building
  private async buildRoomFocusedContext(
    gameId: string,
    roomId: string,
    options: ContextBuilderOptions,
  ): Promise<GameContext> {
    const enhancedOptions = {
      ...options,
      includeNearbyRooms: true,
      includeDetailedObjects: true,
    };
    return this.buildGameContext(gameId, undefined, roomId, enhancedOptions);
  }

  // Object-focused context building
  private async buildObjectFocusedContext(
    gameId: string,
    objectId: string,
    options: ContextBuilderOptions,
  ): Promise<GameContext> {
    const object = this.objectService.getObject(objectId);
    if (!object) {
      throw new Error(`Object not found: ${objectId}`);
    }

    // Find room containing the object
    const allRooms = this.roomService.getAllRooms();
    let roomId: string | undefined;

    for (const room of allRooms) {
      const roomObjects = await this.roomService.getObjectsInRoom(room.id);
      if (roomObjects.some((obj) => obj.id === objectId)) {
        roomId = room.id;
        break;
      }
    }

    const enhancedOptions = { ...options, includeDetailedObjects: true };
    return this.buildGameContext(gameId, undefined, roomId, enhancedOptions);
  }

  // NPC-focused context building
  private async buildNPCFocusedContext(
    gameId: string,
    npcId: string,
    options: ContextBuilderOptions,
  ): Promise<GameContext> {
    const npc = this.playerService.getPlayer(npcId);
    if (!npc) {
      throw new Error(`NPC not found: ${npcId}`);
    }

    // Find room containing the NPC
    const allRooms = this.roomService.getAllRooms();
    let roomId: string | undefined;

    for (const room of allRooms) {
      const roomNPCs = await this.roomService.getPlayersInRoom(room.id);
      if (roomNPCs.some((player) => player.id === npcId)) {
        roomId = room.id;
        break;
      }
    }

    const enhancedOptions = { ...options, includePlayerHistory: true };
    return this.buildGameContext(gameId, undefined, roomId, enhancedOptions);
  }

  // Conflict-focused context building
  private async buildConflictFocusedContext(
    gameId: string,
    conflictId: string,
    options: ContextBuilderOptions,
  ): Promise<GameContext> {
    // For conflict resolution, we need comprehensive context
    const enhancedOptions = {
      ...options,
      includeNearbyRooms: true,
      includeDetailedObjects: true,
      includeRecentEvents: true,
      compressionLevel: 'light' as const, // Keep more detail for conflicts
    };

    return this.buildGameContext(gameId, undefined, undefined, enhancedOptions);
  }

  async buildFullContext(gameId?: string): Promise<GameContext> {
    // Create a minimal full context for compatibility
    return {
      gameInfo: {
        id: gameId || 'default',
        name: "The Quest Weaver's Essential Guide Game",
        theme: 'fantasy',
        genre: 'adventure',
        description: 'A dynamic text-based adventure game',
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
      },
      currentScene: {
        activeRoom: await this.buildRoomContext('default', {}),
        nearbyRooms: [],
        recentEvents: [],
        timeOfDay: 'day',
        weather: 'clear',
        atmosphere: 'calm',
      },
      playerContext: {
        player: {} as any,
        recentActions: [],
        preferences: {} as any,
        currentObjectives: [],
        conversationHistory: [],
        playStyle: {} as any,
      },
      worldState: {
        keyLocations: [],
        importantNPCs: [],
        majorItems: [],
        ongoingQuests: [],
        worldEvents: [],
        factions: [],
      },
      constraints: {
        physicsRules: [],
        culturalSettings: {} as any,
        narrativeGuidelines: {} as any,
        contentRatings: [],
        technicalLimitations: [],
      },
    };
  }
}
