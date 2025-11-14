import { Injectable, Logger } from '@nestjs/common';
import {
  IAction,
  IActionResult,
  IGameContext,
  ActionType,
  IActionHandler,
  IInteraction,
  IProximityCheck,
  IStateChange,
} from './action.interfaces';
import { EventEmitterService } from '../events/event-emitter.service';
import { GameEventType } from '../events/event.interfaces';
import { RoomService } from '../entity/room.service';
import { ObjectService } from '../entity/object.service';
import { PlayerService } from '../entity/player.service';

@Injectable()
export class ActionResolverService {
  private readonly logger = new Logger(ActionResolverService.name);
  private actionHandlers: Map<ActionType, IActionHandler> = new Map();
  private interactions: Map<string, IInteraction[]> = new Map(); // gameId -> interactions

  constructor(
    private readonly eventEmitter: EventEmitterService,
    private readonly roomService: RoomService,
    private readonly objectService: ObjectService,
    private readonly playerService: PlayerService,
  ) {
    this.registerDefaultHandlers();
  }

  /**
   * Register an action handler
   */
  registerHandler(actionType: ActionType, handler: IActionHandler): void {
    this.actionHandlers.set(actionType, handler);
    this.logger.log(`Registered handler for action type: ${actionType}`);
  }

  /**
   * Execute an action
   */
  async executeAction(
    action: IAction,
    context: IGameContext,
  ): Promise<IActionResult> {
    this.logger.debug(
      `Executing action: ${action.type} by ${action.actor} on ${action.target}`,
    );

    try {
      // Validate action
      const validation = await this.validateAction(action, context);
      if (!validation.valid) {
        return {
          success: false,
          message: validation.reason || 'Action cannot be performed',
        };
      }

      // Find handler
      const handler = this.actionHandlers.get(action.type);
      if (!handler) {
        return {
          success: false,
          message: `No handler registered for action type: ${action.type}`,
        };
      }

      // Execute action
      const result = await handler.execute(action, context);

      // Emit event
      await this.eventEmitter.emit(
        GameEventType.CUSTOM_EVENT,
        {
          action: 'gameplay_action',
          actionType: action.type,
          actor: action.actor,
          target: action.target,
          success: result.success,
        },
        context.gameId,
      );

      return result;
    } catch (error) {
      this.logger.error(`Action execution failed: ${error.message}`);
      return {
        success: false,
        message: `Action failed: ${error.message}`,
      };
    }
  }

  /**
   * Validate if action can be performed
   */
  private async validateAction(
    action: IAction,
    context: IGameContext,
  ): Promise<{ valid: boolean; reason?: string }> {
    // Check if target exists (if action has a target)
    if (action.target && action.targetType) {
      const exists = await this.entityExists(
        action.target,
        action.targetType,
        context.gameId,
      );
      if (!exists) {
        return {
          valid: false,
          reason: `${action.targetType} '${action.target}' not found`,
        };
      }

      // Check proximity for actions requiring it
      if (this.requiresProximity(action.type)) {
        const inRange = await this.checkProximity(action, context);
        if (!inRange) {
          return {
            valid: false,
            reason: `You are too far from the ${action.targetType}`,
          };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Check if entity exists
   */
  private async entityExists(
    entityId: string,
    entityType: string,
    gameId: string,
  ): Promise<boolean> {
    try {
      switch (entityType) {
        case 'object':
          const obj = await this.objectService.getObject(entityId);
          return obj !== undefined;
        case 'room':
          const room = await this.roomService.getRoom(entityId);
          return room !== undefined;
        case 'npc':
          // NPC service check would go here
          return true; // Placeholder
        default:
          return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * Check if action requires proximity
   */
  private requiresProximity(actionType: ActionType): boolean {
    const proximityActions = [
      ActionType.TAKE,
      ActionType.USE,
      ActionType.EXAMINE,
      ActionType.OPEN,
      ActionType.CLOSE,
      ActionType.UNLOCK,
      ActionType.LOCK,
      ActionType.TALK,
    ];
    return proximityActions.includes(actionType);
  }

  /**
   * Check proximity between actor and target
   */
  private async checkProximity(
    action: IAction,
    context: IGameContext,
  ): Promise<boolean> {
    // For now, just check if they're in the same room
    // More sophisticated distance checks can be added later
    try {
      if (action.targetType === 'object') {
        const obj = await this.objectService.getObject(action.target!);
        if (obj) {
          // Check if object is in player's current room or inventory
          return (
            context.inventory.includes(action.target!) ||
            obj.roomId === context.currentRoomId
          );
        }
      }
      return true; // Default to true for other types
    } catch {
      return false;
    }
  }

  /**
   * Register an interaction between objects
   */
  registerInteraction(gameId: string, interaction: IInteraction): void {
    if (!this.interactions.has(gameId)) {
      this.interactions.set(gameId, []);
    }
    this.interactions.get(gameId)!.push(interaction);
    this.logger.log(
      `Registered interaction: ${interaction.subjectId} -> ${interaction.targetId}`,
    );
  }

  /**
   * Get interactions for a game
   */
  getInteractions(gameId: string): IInteraction[] {
    return this.interactions.get(gameId) || [];
  }

  /**
   * Find interaction between subject and target
   */
  findInteraction(
    gameId: string,
    subjectId: string,
    targetId: string,
    actionType: ActionType,
  ): IInteraction | undefined {
    const interactions = this.getInteractions(gameId);
    return interactions.find(
      (i) =>
        i.subjectId === subjectId &&
        i.targetId === targetId &&
        i.actionType === actionType,
    );
  }

  /**
   * Process interaction effects
   */
  async processInteraction(
    interaction: IInteraction,
    context: IGameContext,
  ): Promise<IActionResult> {
    // Check conditions
    if (interaction.conditions) {
      for (const condition of interaction.conditions) {
        const met = await this.checkCondition(condition, context);
        if (!met) {
          return {
            success: false,
            message: interaction.failureMessage || 'Condition not met',
          };
        }
      }
    }

    // Apply effects
    const stateChanges: IStateChange[] = [];
    for (const effect of interaction.effects) {
      const change = await this.applyEffect(effect, context);
      if (change) {
        stateChanges.push(change);
      }
    }

    return {
      success: true,
      message: interaction.message || 'Interaction successful',
      stateChanges,
    };
  }

  /**
   * Check interaction condition
   */
  private async checkCondition(
    condition: any,
    context: IGameContext,
  ): Promise<boolean> {
    switch (condition.type) {
      case 'has_item':
        return context.inventory.includes(condition.value);
      case 'in_room':
        return context.currentRoomId === condition.value;
      case 'property_equals':
        // Check entity property - would need entity service lookup
        return true; // Placeholder
      case 'custom':
        return condition.customCheck ? condition.customCheck(context) : true;
      default:
        return true;
    }
  }

  /**
   * Apply interaction effect
   */
  private async applyEffect(effect: any, context: IGameContext): Promise<any> {
    switch (effect.type) {
      case 'change_property':
        // Would update entity property
        return {
          entityId: effect.entityId,
          entityType: effect.entityType,
          property: effect.property,
          oldValue: null,
          newValue: effect.value,
          timestamp: new Date().toISOString(),
        };
      case 'add_item':
        // Would add item to inventory
        return null;
      case 'remove_item':
        // Would remove item from inventory
        return null;
      case 'custom':
        if (effect.customEffect) {
          await effect.customEffect(context);
        }
        return null;
      default:
        return null;
    }
  }

  /**
   * Get available actions for current context
   */
  async getAvailableActions(context: IGameContext): Promise<string[]> {
    const actions: string[] = [];

    // Always available
    actions.push('look', 'inventory', 'status', 'help');

    // Room-based actions
    const room = await this.roomService.getRoom(context.currentRoomId);
    if (room) {
      // Add movement actions based on connections
      actions.push('go north', 'go south', 'go east', 'go west');
    }

    // Object-based actions
    // Would query objects in current room
    actions.push('examine', 'take', 'use');

    return actions;
  }

  /**
   * Register default action handlers
   */
  private registerDefaultHandlers(): void {
    // Basic handlers will be registered here
    // For now, just log that we're ready
    this.logger.log('Action resolver initialized');
  }

  /**
   * Clear interactions for a game
   */
  clearInteractions(gameId: string): void {
    this.interactions.delete(gameId);
    this.logger.log(`Cleared interactions for game: ${gameId}`);
  }

  /**
   * Get handler for action type
   */
  getHandler(actionType: ActionType): IActionHandler | undefined {
    return this.actionHandlers.get(actionType);
  }

  /**
   * Get all registered action types
   */
  getRegisteredActionTypes(): ActionType[] {
    return Array.from(this.actionHandlers.keys());
  }
}
