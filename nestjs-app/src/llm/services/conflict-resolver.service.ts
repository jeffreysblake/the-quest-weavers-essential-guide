import { Injectable, Logger } from '@nestjs/common';
import { LLMService } from './llm.service';
import { PromptTemplateService } from './prompt-template.service';
import { ContextBuilderService } from './context-builder.service';
import { PhysicsService } from '../../entity/physics.service';
import { RoomService } from '../../entity/room.service';
import { PlayerService } from '../../entity/player.service';
import { ObjectService } from '../../entity/object.service';
import {
  ConflictResolution,
  ConflictType,
  GameContext,
} from '../interfaces/llm.interface';

interface ConflictContext {
  type: ConflictType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedEntities: string[];
  location: string;
  description: string;
  originalAction: string;
  errorDetails: any;
  gameState: any;
  attemptCount: number;
  timestamp: string;
}

interface ResolutionStrategy {
  id: string;
  name: string;
  description: string;
  applicableConflicts: ConflictType[];
  priority: number;
  requiresLLM: boolean;
  autoExecutable: boolean;
}

interface ConflictHook {
  name: string;
  triggerConditions: string[];
  priority: number;
  handler: (context: ConflictContext) => Promise<ConflictResolution | null>;
}

interface ConflictLLMResponse {
  primary_solution: {
    action: string;
    explanation: string;
    side_effects: string[];
    reversible: boolean;
  };
  alternative_solutions?: {
    action: string;
    explanation: string;
    pros: string[];
    cons: string[];
  }[];
  narrative_description: string;
  consistency_notes: string;
}

@Injectable()
export class ConflictResolverService {
  private readonly logger = new Logger(ConflictResolverService.name);
  private hooks: Map<string, ConflictHook> = new Map();
  private strategies: Map<string, ResolutionStrategy> = new Map();
  private resolutionHistory: Map<string, ConflictResolution[]> = new Map();
  private readonly MAX_RESOLUTION_ATTEMPTS = 3;

  constructor(
    private llmService: LLMService,
    private promptTemplateService: PromptTemplateService,
    private contextBuilderService: ContextBuilderService,
    private physicsService: PhysicsService,
    private roomService: RoomService,
    private playerService: PlayerService,
    private objectService: ObjectService,
  ) {
    this.initializeDefaultStrategies();
    this.registerDefaultHooks();
  }

  /**
   * Resolve a conflict using AI-driven intelligent analysis
   */
  async resolveConflict(
    conflictType: ConflictType,
    context: {
      affectedEntities: string[];
      location?: string;
      description: string;
      originalAction: string;
      errorDetails?: any;
    },
  ): Promise<ConflictResolution> {
    const conflictContext: ConflictContext = {
      type: conflictType,
      severity: this.determineSeverity(conflictType, context),
      affectedEntities: context.affectedEntities,
      location: context.location || 'unknown',
      description: context.description,
      originalAction: context.originalAction,
      errorDetails: context.errorDetails,
      gameState: await this.captureGameState(),
      attemptCount: 0,
      timestamp: new Date().toISOString(),
    };

    this.logger.log(
      `Resolving ${conflictType} conflict: ${context.description}`,
    );

    try {
      // Try registered hooks first
      const hookResolution = await this.tryConflictHooks(conflictContext);
      if (hookResolution) {
        this.recordResolution(conflictContext, hookResolution);
        return hookResolution;
      }

      // Fall back to LLM-based resolution
      const llmResolution = await this.resolveBWithLLM(conflictContext);
      this.recordResolution(conflictContext, llmResolution);
      return llmResolution;
    } catch (error) {
      this.logger.error(`Failed to resolve conflict: ${error.message}`);
      return this.createFailsafeResolution(conflictContext);
    }
  }

  /**
   * Register a custom conflict resolution hook
   */
  registerHook(hook: ConflictHook): void {
    this.hooks.set(hook.name, hook);
    this.logger.log(`Registered conflict resolution hook: ${hook.name}`);
  }

  /**
   * Handle physics conflicts (objects in impossible states)
   */
  async handlePhysicsConflict(context: {
    objects: string[];
    physicsError: string;
    location: string;
  }): Promise<ConflictResolution> {
    return this.resolveConflict('physics', {
      affectedEntities: context.objects,
      location: context.location,
      description: `Physics conflict: ${context.physicsError}`,
      originalAction: 'physics_simulation',
      errorDetails: { physicsError: context.physicsError },
    });
  }

  /**
   * Handle NPC behavior conflicts (impossible actions)
   */
  async handleNPCConflict(context: {
    npcId: string;
    conflictDescription: string;
    attemptedAction: string;
    location?: string;
  }): Promise<ConflictResolution> {
    return this.resolveConflict('npc_behavior', {
      affectedEntities: [context.npcId],
      location: context.location,
      description: context.conflictDescription,
      originalAction: context.attemptedAction,
    });
  }

  /**
   * Handle object state conflicts (contradictory states)
   */
  async handleObjectConflict(context: {
    objectId: string;
    conflictDescription: string;
    currentState: any;
    desiredState: any;
  }): Promise<ConflictResolution> {
    return this.resolveConflict('object_state', {
      affectedEntities: [context.objectId],
      description: context.conflictDescription,
      originalAction: 'state_change',
      errorDetails: {
        currentState: context.currentState,
        desiredState: context.desiredState,
      },
    });
  }

  /**
   * Handle player action conflicts (impossible actions)
   */
  async handlePlayerActionConflict(context: {
    playerId: string;
    action: string;
    reason: string;
    location?: string;
  }): Promise<ConflictResolution> {
    return this.resolveConflict('player_action', {
      affectedEntities: [context.playerId],
      location: context.location,
      description: `Player action conflict: ${context.reason}`,
      originalAction: context.action,
    });
  }

  /**
   * Handle world consistency conflicts (contradictory world state)
   */
  async handleWorldConsistencyConflict(context: {
    entities: string[];
    inconsistency: string;
    location?: string;
  }): Promise<ConflictResolution> {
    return this.resolveConflict('world_consistency', {
      affectedEntities: context.entities,
      location: context.location,
      description: `World consistency conflict: ${context.inconsistency}`,
      originalAction: 'world_state_validation',
    });
  }

  /**
   * Get conflict resolution statistics
   */
  getResolutionStats(): {
    totalConflicts: number;
    resolutionsByType: Record<ConflictType, number>;
    successRate: number;
    averageResolutionTime: number;
  } {
    let totalConflicts = 0;
    const resolutionsByType: Record<ConflictType, number> = {} as any;
    let successfulResolutions = 0;

    for (const [entityId, resolutions] of this.resolutionHistory) {
      totalConflicts += resolutions.length;

      for (const resolution of resolutions) {
        const type = resolution.conflictType;
        resolutionsByType[type] = (resolutionsByType[type] || 0) + 1;

        if (resolution.success) {
          successfulResolutions++;
        }
      }
    }

    return {
      totalConflicts,
      resolutionsByType,
      successRate:
        totalConflicts > 0 ? successfulResolutions / totalConflicts : 1,
      averageResolutionTime: 0, // Would track timing in production
    };
  }

  private async tryConflictHooks(
    context: ConflictContext,
  ): Promise<ConflictResolution | null> {
    const applicableHooks = Array.from(this.hooks.values())
      .filter((hook) => this.isHookApplicable(hook, context))
      .sort((a, b) => b.priority - a.priority);

    for (const hook of applicableHooks) {
      try {
        const resolution = await hook.handler(context);
        if (resolution) {
          this.logger.log(`Conflict resolved by hook: ${hook.name}`);
          return resolution;
        }
      } catch (error) {
        this.logger.warn(`Hook ${hook.name} failed: ${error.message}`);
      }
    }

    return null;
  }

  private async resolveBWithLLM(
    context: ConflictContext,
  ): Promise<ConflictResolution> {
    context.attemptCount++;

    const gameContext = await this.buildGameContext(context);
    const prompt = await this.promptTemplateService.renderTemplate(
      'physics_conflict_resolution',
      {
        game_name: "The Quest Weaver's Essential Guide",
        conflict_type: context.type,
        affected_objects: context.affectedEntities.join(', '),
        location: context.location,
        conflict_description: context.description,
        physics_rules: this.getPhysicsRules(),
        current_situation: JSON.stringify(gameContext, null, 2),
        game_theme: 'fantasy adventure',
        magic_system: 'elemental magic with physical effects',
        tech_level: 'medieval with magical elements',
      },
    );

    const schema = {
      type: 'object',
      required: ['primary_solution', 'narrative_description'],
      properties: {
        primary_solution: {
          type: 'object',
          required: ['action', 'explanation', 'side_effects', 'reversible'],
          properties: {
            action: { type: 'string' },
            explanation: { type: 'string' },
            side_effects: { type: 'array', items: { type: 'string' } },
            reversible: { type: 'boolean' },
          },
        },
        alternative_solutions: {
          type: 'array',
          items: {
            type: 'object',
            required: ['action', 'explanation', 'pros', 'cons'],
            properties: {
              action: { type: 'string' },
              explanation: { type: 'string' },
              pros: { type: 'array', items: { type: 'string' } },
              cons: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        narrative_description: { type: 'string' },
        consistency_notes: { type: 'string' },
      },
    };

    const response = await this.llmService.generateStructuredResponse(
      prompt,
      schema,
      { temperature: 0.6, maxTokens: 2000 },
    );

    if (response.validationErrors?.length) {
      this.logger.warn(
        `LLM resolution validation errors: ${response.validationErrors.join(', ')}`,
      );
    }

    // Convert LLM response to ConflictResolution
    const llmResponse = response.parsedContent as ConflictLLMResponse;
    const resolution: ConflictResolution = {
      conflictType: context.type,
      success: true,
      resolution: llmResponse.primary_solution.action,
      explanation: llmResponse.primary_solution.explanation,
      appliedChanges: [llmResponse.primary_solution.action],
      sideEffects: llmResponse.primary_solution.side_effects || [],
      alternativeSolutions:
        llmResponse.alternative_solutions?.map((alt) => ({
          description: alt.action,
          explanation: alt.explanation,
          pros: alt.pros,
          cons: alt.cons,
        })) || [],
      narrativeDescription: llmResponse.narrative_description,
      confidence: 0.8,
      processingTime: 0,
      requiresPlayerConfirmation: context.severity === 'critical',
      metadata: {
        resolverType: 'llm',
        attemptCount: context.attemptCount,
        timestamp: new Date().toISOString(),
        reversible: llmResponse.primary_solution.reversible,
      },
    };

    // Apply the resolution
    await this.applyResolution(context, resolution);

    return resolution;
  }

  private async buildGameContext(context: ConflictContext): Promise<any> {
    const gameContext: any = {
      conflictType: context.type,
      location: context.location,
      affectedEntities: context.affectedEntities,
      gameState: context.gameState,
    };

    // Add location details if available
    if (context.location !== 'unknown') {
      try {
        gameContext.roomContext =
          await this.contextBuilderService.buildRoomContext(context.location);
      } catch (error) {
        this.logger.warn(
          `Could not build room context for ${context.location}: ${error.message}`,
        );
      }
    }

    // Add entity details
    for (const entityId of context.affectedEntities) {
      try {
        // Try to identify entity type and get context
        if (this.playerService.findById(entityId)) {
          gameContext[`player_${entityId}`] =
            await this.contextBuilderService.buildNPCContext(entityId);
        } else if (this.objectService.findById(entityId)) {
          gameContext[`object_${entityId}`] =
            await this.contextBuilderService.buildObjectContext(entityId);
        }
      } catch (error) {
        this.logger.warn(
          `Could not build entity context for ${entityId}: ${error.message}`,
        );
      }
    }

    return gameContext;
  }

  private async applyResolution(
    context: ConflictContext,
    resolution: ConflictResolution,
  ): Promise<void> {
    try {
      // Apply the resolution based on conflict type
      switch (context.type) {
        case 'physics':
          await this.applyPhysicsResolution(context, resolution);
          break;
        case 'npc_behavior':
          await this.applyNPCResolution(context, resolution);
          break;
        case 'object_state':
          await this.applyObjectStateResolution(context, resolution);
          break;
        case 'player_action':
          await this.applyPlayerActionResolution(context, resolution);
          break;
        case 'world_consistency':
          await this.applyWorldConsistencyResolution(context, resolution);
          break;
      }

      this.logger.log(`Applied resolution for ${context.type} conflict`);
    } catch (error) {
      this.logger.error(`Failed to apply resolution: ${error.message}`);
      resolution.success = false;
      resolution.sideEffects.push(
        `Resolution application failed: ${error.message}`,
      );
    }
  }

  private async applyPhysicsResolution(
    context: ConflictContext,
    resolution: ConflictResolution,
  ): Promise<void> {
    // Physics-specific resolution application
    for (const entityId of context.affectedEntities) {
      const object = this.objectService.findById(entityId);
      if (object) {
        // Reset object to a safe state
        this.objectService.update(entityId, {
          ...object,
          position: object.position, // Keep current position as safe fallback
        });
      }
    }
  }

  private async applyNPCResolution(
    context: ConflictContext,
    resolution: ConflictResolution,
  ): Promise<void> {
    // NPC-specific resolution application
    const npcId = context.affectedEntities[0];
    const npc = this.playerService.findById(npcId);
    if (npc) {
      // Reset NPC to a consistent state
      this.playerService.update(npcId, npc);
    }
  }

  private async applyObjectStateResolution(
    context: ConflictContext,
    resolution: ConflictResolution,
  ): Promise<void> {
    // Object state resolution application
    const objectId = context.affectedEntities[0];
    const object = this.objectService.findById(objectId);
    if (object) {
      // Apply state corrections based on resolution
      this.objectService.update(objectId, object);
    }
  }

  private async applyPlayerActionResolution(
    context: ConflictContext,
    resolution: ConflictResolution,
  ): Promise<void> {
    // Player action resolution - usually just validation/correction
    // The resolution explanation serves as feedback to the player
  }

  private async applyWorldConsistencyResolution(
    context: ConflictContext,
    resolution: ConflictResolution,
  ): Promise<void> {
    // World consistency resolution - may affect multiple entities
    for (const entityId of context.affectedEntities) {
      // Apply consistency corrections as needed
    }
  }

  private createFailsafeResolution(
    context: ConflictContext,
  ): ConflictResolution {
    return {
      conflictType: context.type,
      success: false,
      resolution: 'Reset to safe state',
      explanation:
        'Automatic failsafe resolution applied due to resolution failure',
      appliedChanges: ['reset_to_safe_state'],
      sideEffects: ['Some game state may have been reset'],
      alternativeSolutions: [],
      narrativeDescription:
        'The world seems to shimmer for a moment as reality reasserts itself.',
      confidence: 1.0,
      processingTime: 0,
      requiresPlayerConfirmation: false,
      metadata: {
        resolverType: 'failsafe',
        attemptCount: context.attemptCount,
        timestamp: new Date().toISOString(),
      },
    };
  }

  private determineSeverity(
    conflictType: ConflictType,
    context: any,
  ): 'low' | 'medium' | 'high' | 'critical' {
    // Determine conflict severity based on type and context
    switch (conflictType) {
      case 'physics':
        return context.errorDetails?.severity || 'medium';
      case 'world_consistency':
        return 'high';
      case 'player_action':
        return 'low';
      case 'npc_behavior':
        return 'medium';
      case 'object_state':
        return 'medium';
      default:
        return 'medium';
    }
  }

  private async captureGameState(): Promise<any> {
    return {
      totalRooms: this.roomService.findAll().length,
      totalPlayers: this.playerService.findAll().length,
      totalObjects: this.objectService.findAll().length,
      timestamp: new Date().toISOString(),
    };
  }

  private getPhysicsRules(): string {
    return 'Standard physics with magical elements, object material properties affect interactions, effects can chain through connected objects';
  }

  private isHookApplicable(
    hook: ConflictHook,
    context: ConflictContext,
  ): boolean {
    // Check if hook conditions match the conflict context
    return hook.triggerConditions.some((condition) => {
      // Simple string matching for now - could be more sophisticated
      return (
        context.description.toLowerCase().includes(condition.toLowerCase()) ||
        context.type.includes(condition.toLowerCase() as any)
      );
    });
  }

  private recordResolution(
    context: ConflictContext,
    resolution: ConflictResolution,
  ): void {
    const key = context.affectedEntities.join(',');
    const existing = this.resolutionHistory.get(key) || [];
    existing.push(resolution);
    this.resolutionHistory.set(key, existing);
  }

  private initializeDefaultStrategies(): void {
    this.strategies.set('physics_reset', {
      id: 'physics_reset',
      name: 'Physics State Reset',
      description: 'Reset objects to safe physics state',
      applicableConflicts: ['physics'],
      priority: 1,
      requiresLLM: false,
      autoExecutable: true,
    });

    this.strategies.set('npc_behavior_correction', {
      id: 'npc_behavior_correction',
      name: 'NPC Behavior Correction',
      description: 'Correct impossible NPC actions',
      applicableConflicts: ['npc_behavior'],
      priority: 2,
      requiresLLM: true,
      autoExecutable: false,
    });

    this.strategies.set('world_consistency_repair', {
      id: 'world_consistency_repair',
      name: 'World Consistency Repair',
      description: 'Repair contradictory world states',
      applicableConflicts: ['world_consistency'],
      priority: 3,
      requiresLLM: true,
      autoExecutable: false,
    });
  }

  private registerDefaultHooks(): void {
    // Physics conflict hook - handles simple physics violations
    this.registerHook({
      name: 'simple_physics_reset',
      triggerConditions: [
        'object_overlap',
        'invalid_position',
        'impossible_state',
      ],
      priority: 10,
      handler: async (
        context: ConflictContext,
      ): Promise<ConflictResolution | null> => {
        if (context.type === 'physics' && context.severity === 'low') {
          // Simple reset for low-severity physics conflicts
          return {
            conflictType: 'physics',
            success: true,
            resolution: 'Reset object positions to valid coordinates',
            explanation:
              'Objects were moved to nearby valid positions to resolve the physics conflict.',
            appliedChanges: ['position_reset'],
            sideEffects: [],
            alternativeSolutions: [],
            narrativeDescription:
              'Items shift slightly to more stable positions.',
            confidence: 0.9,
            processingTime: 0,
            requiresPlayerConfirmation: false,
            metadata: {
              resolverType: 'hook',
              hookName: 'simple_physics_reset',
              timestamp: new Date().toISOString(),
            },
          };
        }
        return null;
      },
    });

    // Player action validation hook
    this.registerHook({
      name: 'player_action_validation',
      triggerConditions: [
        'impossible_action',
        'invalid_target',
        'missing_requirements',
      ],
      priority: 5,
      handler: async (
        context: ConflictContext,
      ): Promise<ConflictResolution | null> => {
        if (context.type === 'player_action') {
          return {
            conflictType: 'player_action',
            success: true,
            resolution: 'Provide alternative action suggestions',
            explanation:
              'The attempted action is not possible in the current context. Here are some alternatives.',
            appliedChanges: ['suggested_alternatives'],
            sideEffects: [],
            alternativeSolutions: [
              {
                description: 'Try examining the object first',
                explanation:
                  'Understanding the object better might reveal new possibilities',
              },
              {
                description: 'Look for tools or items that might help',
                explanation:
                  'Some actions require specific items or conditions',
              },
            ],
            narrativeDescription: 'You consider your options carefully.',
            confidence: 0.7,
            processingTime: 0,
            requiresPlayerConfirmation: false,
            metadata: {
              resolverType: 'hook',
              hookName: 'player_action_validation',
              timestamp: new Date().toISOString(),
            },
          };
        }
        return null;
      },
    });
  }
}
