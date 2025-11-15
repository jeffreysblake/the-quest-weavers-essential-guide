import { Injectable, Logger } from '@nestjs/common';
import {
  ITrigger,
  IActiveTrigger,
  ITriggerContext,
  ITriggerResult,
  ITriggerAction,
  ITriggerCondition,
  IConditionGroup,
  TriggerType,
  ConditionOperator,
  LogicOperator,
} from './trigger.interfaces';
import { EventEmitterService } from '../events/event-emitter.service';
import { GameEventType } from '../events/event.interfaces';

/**
 * Manages trigger definitions and execution
 */
@Injectable()
export class TriggerManagerService {
  private readonly logger = new Logger(TriggerManagerService.name);
  private triggers: Map<string, ITrigger> = new Map(); // triggerId -> trigger
  private activeTriggers: Map<string, IActiveTrigger> = new Map(); // triggerId -> state
  private intervals: Map<string, NodeJS.Timeout> = new Map(); // triggerId -> interval

  constructor(private readonly eventEmitter: EventEmitterService) {
    this.setupEventListeners();
  }

  /**
   * Setup event listeners for event-based triggers
   */
  private setupEventListeners(): void {
    // Listen to all events and check for matching triggers
    this.eventEmitter.onAny(async (event) => {
      await this.checkEventTriggers(event.type, event.data);
    });
  }

  /**
   * Register a trigger
   */
  registerTrigger(trigger: ITrigger): void {
    this.triggers.set(trigger.id, trigger);

    // Initialize active trigger state
    const activeTrigger: IActiveTrigger = {
      triggerId: trigger.id,
      gameId: trigger.gameId,
      firedCount: 0,
    };
    this.activeTriggers.set(trigger.id, activeTrigger);

    // Setup time-based triggers
    if (trigger.type === TriggerType.TIME && trigger.enabled) {
      this.setupTimeTrigger(trigger);
    }

    this.logger.log(
      `Registered trigger '${trigger.name}' (${trigger.id}) of type ${trigger.type}`,
    );
  }

  /**
   * Setup time-based trigger
   */
  private setupTimeTrigger(trigger: ITrigger): void {
    if (trigger.interval) {
      // Repeating trigger
      const interval = setInterval(async () => {
        await this.checkAndFireTrigger(trigger.id, {
          gameId: trigger.gameId,
          playerFlags: {},
          playerVariables: {},
          playerInventory: [],
          completedQuests: [],
          worldState: {},
        });
      }, trigger.interval);

      this.intervals.set(trigger.id, interval);
    } else if (trigger.executeAt) {
      // One-time trigger
      const executeTime = new Date(trigger.executeAt).getTime();
      const now = Date.now();
      const delay = executeTime - now;

      if (delay > 0) {
        const timeout = setTimeout(async () => {
          await this.checkAndFireTrigger(trigger.id, {
            gameId: trigger.gameId,
            playerFlags: {},
            playerVariables: {},
            playerInventory: [],
            completedQuests: [],
            worldState: {},
          });
        }, delay);

        this.intervals.set(trigger.id, timeout);
      }
    }
  }

  /**
   * Check event-based triggers
   */
  private async checkEventTriggers(
    eventType: string,
    eventData: any,
  ): Promise<void> {
    for (const trigger of this.triggers.values()) {
      if (
        trigger.enabled &&
        trigger.type === TriggerType.EVENT &&
        trigger.eventType === eventType
      ) {
        // Apply event filter if exists
        if (trigger.eventFilter && !trigger.eventFilter(eventData)) {
          continue;
        }

        const context: ITriggerContext = {
          gameId: trigger.gameId,
          playerFlags: {},
          playerVariables: {},
          playerInventory: [],
          completedQuests: [],
          worldState: {},
          eventData,
        };

        await this.checkAndFireTrigger(trigger.id, context);
      }
    }
  }

  /**
   * Manually check and fire a trigger
   */
  async checkAndFireTrigger(
    triggerId: string,
    context: ITriggerContext,
  ): Promise<ITriggerResult> {
    const trigger = this.triggers.get(triggerId);
    const activeTrigger = this.activeTriggers.get(triggerId);

    if (!trigger) {
      return {
        success: false,
        message: `Trigger '${triggerId}' not found`,
        triggerId,
        conditionsMet: false,
        actionsExecuted: 0,
      };
    }

    if (!activeTrigger) {
      return {
        success: false,
        message: 'Active trigger state not found',
        triggerId,
        conditionsMet: false,
        actionsExecuted: 0,
      };
    }

    if (!trigger.enabled) {
      return {
        success: false,
        message: 'Trigger is disabled',
        triggerId,
        conditionsMet: false,
        actionsExecuted: 0,
      };
    }

    // Check one-time trigger
    if (trigger.oneTime && activeTrigger.firedCount > 0) {
      return {
        success: false,
        message: 'One-time trigger already fired',
        triggerId,
        conditionsMet: false,
        actionsExecuted: 0,
      };
    }

    // Check cooldown
    if (activeTrigger.cooldownUntil) {
      const now = Date.now();
      const cooldownEnd = new Date(activeTrigger.cooldownUntil).getTime();
      if (now < cooldownEnd) {
        return {
          success: false,
          message: 'Trigger is on cooldown',
          triggerId,
          conditionsMet: false,
          actionsExecuted: 0,
        };
      }
    }

    // Check conditions
    let conditionsMet = true;
    if (trigger.conditions) {
      conditionsMet = await this.evaluateConditionGroup(
        trigger.conditions,
        context,
      );
    }

    if (!conditionsMet) {
      return {
        success: false,
        message: 'Trigger conditions not met',
        triggerId,
        conditionsMet: false,
        actionsExecuted: 0,
      };
    }

    // Execute actions
    const errors: string[] = [];
    let actionsExecuted = 0;

    for (const action of trigger.actions) {
      try {
        if (action.delay) {
          // Execute with delay
          setTimeout(async () => {
            await this.executeAction(action, context);
          }, action.delay);
        } else {
          // Execute immediately
          await this.executeAction(action, context);
        }
        actionsExecuted++;
      } catch (error) {
        errors.push(`Action ${action.id} failed: ${error.message}`);
        this.logger.error(`Failed to execute action ${action.id}`, error);
      }
    }

    // Update active trigger state
    activeTrigger.firedCount++;
    activeTrigger.lastFiredAt = new Date().toISOString();

    if (trigger.cooldown) {
      activeTrigger.cooldownUntil = new Date(
        Date.now() + trigger.cooldown,
      ).toISOString();
    }

    // Emit trigger fired event
    await this.eventEmitter.emit(
      GameEventType.CUSTOM_EVENT,
      {
        action: 'trigger_fired',
        triggerId: trigger.id,
        triggerName: trigger.name,
        actionsExecuted,
      },
      trigger.gameId,
    );

    this.logger.log(
      `Trigger '${trigger.name}' fired (count: ${activeTrigger.firedCount}, actions: ${actionsExecuted})`,
    );

    return {
      success: true,
      message: `Trigger '${trigger.name}' fired successfully`,
      triggerId,
      conditionsMet: true,
      actionsExecuted,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Evaluate condition group with logic operators
   */
  private async evaluateConditionGroup(
    group: IConditionGroup,
    context: ITriggerContext,
  ): Promise<boolean> {
    const results: boolean[] = [];

    for (const condition of group.conditions) {
      if ('operator' in condition && 'conditions' in condition) {
        // Nested condition group
        results.push(await this.evaluateConditionGroup(condition, context));
      } else {
        // Individual condition
        results.push(await this.evaluateCondition(condition, context));
      }
    }

    switch (group.operator) {
      case LogicOperator.AND:
        return results.every((r) => r);
      case LogicOperator.OR:
        return results.some((r) => r);
      case LogicOperator.NOT:
        return !results[0];
      default:
        return false;
    }
  }

  /**
   * Evaluate individual condition
   */
  private async evaluateCondition(
    condition: ITriggerCondition,
    context: ITriggerContext,
  ): Promise<boolean> {
    switch (condition.type) {
      case 'flag':
        return this.evaluateFlagCondition(condition, context);

      case 'variable':
        return this.evaluateVariableCondition(condition, context);

      case 'item':
        return this.evaluateItemCondition(condition, context);

      case 'location':
        return this.evaluateLocationCondition(condition, context);

      case 'quest':
        return this.evaluateQuestCondition(condition, context);

      case 'custom':
        if (condition.customCheck) {
          return await condition.customCheck(context);
        }
        return false;

      default:
        return false;
    }
  }

  /**
   * Evaluate flag condition
   */
  private evaluateFlagCondition(
    condition: ITriggerCondition,
    context: ITriggerContext,
  ): boolean {
    if (!condition.key) return false;

    const flagValue = context.playerFlags[condition.key];
    return this.compareValues(flagValue, condition.operator, condition.value);
  }

  /**
   * Evaluate variable condition
   */
  private evaluateVariableCondition(
    condition: ITriggerCondition,
    context: ITriggerContext,
  ): boolean {
    if (!condition.key) return false;

    const varValue = context.playerVariables[condition.key];
    return this.compareValues(varValue, condition.operator, condition.value);
  }

  /**
   * Evaluate item condition
   */
  private evaluateItemCondition(
    condition: ITriggerCondition,
    context: ITriggerContext,
  ): boolean {
    if (!condition.key) return false;

    return context.playerInventory.includes(condition.key);
  }

  /**
   * Evaluate location condition
   */
  private evaluateLocationCondition(
    condition: ITriggerCondition,
    context: ITriggerContext,
  ): boolean {
    if (!condition.locationId) return false;

    return context.currentRoomId === condition.locationId;
  }

  /**
   * Evaluate quest condition
   */
  private evaluateQuestCondition(
    condition: ITriggerCondition,
    context: ITriggerContext,
  ): boolean {
    if (!condition.key) return false;

    return context.completedQuests.includes(condition.key);
  }

  /**
   * Compare values using operator
   */
  private compareValues(
    actualValue: any,
    operator: ConditionOperator | undefined,
    expectedValue: any,
  ): boolean {
    switch (operator) {
      case ConditionOperator.EQUALS:
        return actualValue === expectedValue;
      case ConditionOperator.NOT_EQUALS:
        return actualValue !== expectedValue;
      case ConditionOperator.GREATER:
        return actualValue > expectedValue;
      case ConditionOperator.GREATER_EQUAL:
        return actualValue >= expectedValue;
      case ConditionOperator.LESS:
        return actualValue < expectedValue;
      case ConditionOperator.LESS_EQUAL:
        return actualValue <= expectedValue;
      case ConditionOperator.EXISTS:
        return actualValue !== undefined && actualValue !== null;
      default:
        return actualValue === expectedValue;
    }
  }

  /**
   * Execute trigger action
   */
  private async executeAction(
    action: ITriggerAction,
    context: ITriggerContext,
  ): Promise<void> {
    switch (action.type) {
      case 'set_flag':
        if (action.flagKey) {
          context.playerFlags[action.flagKey] = action.flagValue ?? true;
        }
        break;

      case 'set_variable':
        if (action.variableKey) {
          context.playerVariables[action.variableKey] = action.variableValue;
        }
        break;

      case 'give_item':
        if (action.itemId) {
          context.playerInventory.push(action.itemId);
        }
        break;

      case 'remove_item':
        if (action.itemId) {
          const index = context.playerInventory.indexOf(action.itemId);
          if (index !== -1) {
            context.playerInventory.splice(index, 1);
          }
        }
        break;

      case 'emit_event':
        if (action.eventType) {
          await this.eventEmitter.emit(
            action.eventType as any,
            action.eventData || {},
            context.gameId,
          );
        }
        break;

      case 'custom':
        if (action.customAction) {
          await action.customAction(context);
        }
        break;

      default:
        this.logger.warn(`Unknown action type: ${action.type}`);
    }
  }

  /**
   * Enable/disable trigger
   */
  setTriggerEnabled(triggerId: string, enabled: boolean): void {
    const trigger = this.triggers.get(triggerId);

    if (trigger) {
      trigger.enabled = enabled;

      if (enabled && trigger.type === TriggerType.TIME) {
        this.setupTimeTrigger(trigger);
      } else if (!enabled) {
        this.clearTimeTrigger(triggerId);
      }

      this.logger.log(
        `Trigger '${trigger.name}' ${enabled ? 'enabled' : 'disabled'}`,
      );
    }
  }

  /**
   * Clear time-based trigger
   */
  private clearTimeTrigger(triggerId: string): void {
    const interval = this.intervals.get(triggerId);
    if (interval) {
      clearInterval(interval);
      clearTimeout(interval);
      this.intervals.delete(triggerId);
    }
  }

  /**
   * Get trigger
   */
  getTrigger(triggerId: string): ITrigger | undefined {
    return this.triggers.get(triggerId);
  }

  /**
   * Get active trigger state
   */
  getActiveTrigger(triggerId: string): IActiveTrigger | undefined {
    return this.activeTriggers.get(triggerId);
  }

  /**
   * Get all triggers for a game
   */
  getGameTriggers(gameId: string): ITrigger[] {
    const triggers: ITrigger[] = [];
    for (const trigger of this.triggers.values()) {
      if (trigger.gameId === gameId) {
        triggers.push(trigger);
      }
    }
    return triggers;
  }

  /**
   * Remove trigger
   */
  removeTrigger(triggerId: string): void {
    this.clearTimeTrigger(triggerId);
    this.triggers.delete(triggerId);
    this.activeTriggers.delete(triggerId);
    this.logger.log(`Removed trigger '${triggerId}'`);
  }

  /**
   * Clear all triggers
   */
  clearAllTriggers(): void {
    for (const triggerId of this.intervals.keys()) {
      this.clearTimeTrigger(triggerId);
    }
    this.triggers.clear();
    this.activeTriggers.clear();
    this.logger.log('Cleared all triggers');
  }
}
