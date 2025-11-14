import { Injectable, Logger } from '@nestjs/common';
import {
  IEffect,
  IActiveEffect,
  IEffectContext,
  IEffectResult,
  IEffectStats,
  EffectType,
  DurationType,
  StatType,
} from './effect.interfaces';
import { EventEmitterService } from '../events/event-emitter.service';
import { GameEventType } from '../events/event.interfaces';
import { v4 as uuidv4 } from 'uuid';

/**
 * Manages item effects, buffs, debuffs, and stat modifications
 */
@Injectable()
export class EffectManagerService {
  private readonly logger = new Logger(EffectManagerService.name);
  private effects: Map<string, IEffect> = new Map(); // effectId -> effect definition
  private activeEffects: Map<string, IActiveEffect[]> = new Map(); // targetId -> active effects
  private intervals: Map<string, NodeJS.Timeout> = new Map(); // activeEffectId -> interval

  constructor(private readonly eventEmitter: EventEmitterService) {}

  /**
   * Register an effect definition
   */
  registerEffect(effect: IEffect): void {
    this.effects.set(effect.id, effect);
    this.logger.log(`Registered effect '${effect.name}' (${effect.id}) of type ${effect.type}`);
  }

  /**
   * Apply an effect to a target
   */
  async applyEffect(
    effectId: string,
    targetId: string,
    gameId: string,
    context: Partial<IEffectContext> = {},
  ): Promise<IEffectResult> {
    const effect = this.effects.get(effectId);

    if (!effect) {
      return {
        success: false,
        message: `Effect '${effectId}' not found`,
      };
    }

    // Get target's active effects
    const targetEffects = this.activeEffects.get(targetId) || [];

    // Check if effect is already active and handle stacking
    const existingEffect = targetEffects.find((ae) => ae.effectId === effectId);

    if (existingEffect) {
      if (effect.stackable) {
        const maxStacks = effect.maxStacks || 99;
        if (existingEffect.stacks < maxStacks) {
          existingEffect.stacks++;
          existingEffect.appliedAt = new Date().toISOString();

          // Refresh duration
          if (effect.duration) {
            existingEffect.expiresAt = new Date(
              Date.now() + effect.duration,
            ).toISOString();
          }

          this.logger.log(
            `Stacked effect '${effect.name}' on ${targetId} (stacks: ${existingEffect.stacks})`,
          );

          return {
            success: true,
            message: `Effect '${effect.name}' stacked (${existingEffect.stacks}/${maxStacks})`,
            activeEffect: existingEffect,
          };
        } else {
          return {
            success: false,
            message: `Effect '${effect.name}' already at max stacks`,
          };
        }
      } else {
        // Refresh non-stackable effect
        existingEffect.appliedAt = new Date().toISOString();
        if (effect.duration) {
          existingEffect.expiresAt = new Date(Date.now() + effect.duration).toISOString();
        }

        return {
          success: true,
          message: `Effect '${effect.name}' refreshed`,
          activeEffect: existingEffect,
        };
      }
    }

    // Create new active effect
    const now = new Date().toISOString();
    const activeEffect: IActiveEffect = {
      effectId: effect.id,
      effect,
      targetId,
      sourceId: context.sourceId,
      appliedAt: now,
      stacks: 1,
    };

    // Set expiration for temporary effects
    if (effect.duration && effect.durationType !== DurationType.PERMANENT) {
      activeEffect.expiresAt = new Date(Date.now() + effect.duration).toISOString();
    }

    // Set tick count for over_time effects
    if (effect.durationType === DurationType.OVER_TIME && effect.tickCount) {
      activeEffect.ticksRemaining = effect.tickCount;
    }

    // Apply instant effects
    const statChanges: Record<string, number> = {};
    let damage = 0;
    let healing = 0;

    const effectContext: IEffectContext = {
      gameId,
      targetId,
      sourceId: context.sourceId,
      effect,
      targetStats: context.targetStats || {},
      targetFlags: context.targetFlags || {},
      targetVariables: context.targetVariables || {},
    };

    if (effect.durationType === DurationType.INSTANT) {
      const result = await this.applyEffectTick(activeEffect, effectContext);
      Object.assign(statChanges, result.statChanges);
      damage = result.damage || 0;
      healing = result.healing || 0;
    } else {
      // Setup ticking for over_time effects
      if (effect.durationType === DurationType.OVER_TIME && effect.tickInterval) {
        this.setupEffectTicking(activeEffect, effectContext);
      }

      // Apply permanent/temporary stat modifiers immediately
      if (
        effect.type === EffectType.INCREASE_STAT ||
        effect.type === EffectType.DECREASE_STAT ||
        effect.type === EffectType.MULTIPLY_STAT ||
        effect.type === EffectType.BUFF ||
        effect.type === EffectType.DEBUFF ||
        effect.type === EffectType.EQUIPMENT_BONUS
      ) {
        const result = await this.applyStatModifier(activeEffect, effectContext);
        Object.assign(statChanges, result.statChanges);
      }
    }

    // Store active effect
    targetEffects.push(activeEffect);
    this.activeEffects.set(targetId, targetEffects);

    // Emit event
    await this.eventEmitter.emit(
      GameEventType.CUSTOM_EVENT,
      {
        action: 'effect_applied',
        effectId: effect.id,
        effectName: effect.name,
        targetId,
        sourceId: context.sourceId,
      },
      gameId,
    );

    this.logger.log(`Applied effect '${effect.name}' to ${targetId}`);

    return {
      success: true,
      message: `Effect '${effect.name}' applied`,
      effectId: effect.id,
      activeEffect,
      statChanges,
      damage,
      healing,
    };
  }

  /**
   * Setup ticking for over_time effects
   */
  private setupEffectTicking(
    activeEffect: IActiveEffect,
    context: IEffectContext,
  ): void {
    const effect = activeEffect.effect;
    const instanceId = `${activeEffect.targetId}_${activeEffect.effectId}_${Date.now()}`;

    if (!effect.tickInterval) return;

    const interval = setInterval(async () => {
      // Check if effect expired
      if (activeEffect.expiresAt) {
        const now = Date.now();
        const expiresAt = new Date(activeEffect.expiresAt).getTime();
        if (now >= expiresAt) {
          await this.removeEffect(activeEffect.targetId, activeEffect.effectId);
          clearInterval(interval);
          this.intervals.delete(instanceId);
          return;
        }
      }

      // Check tick count
      if (activeEffect.ticksRemaining !== undefined) {
        if (activeEffect.ticksRemaining <= 0) {
          await this.removeEffect(activeEffect.targetId, activeEffect.effectId);
          clearInterval(interval);
          this.intervals.delete(instanceId);
          return;
        }
        activeEffect.ticksRemaining--;
      }

      // Apply tick
      if (!activeEffect.paused) {
        await this.applyEffectTick(activeEffect, context);
        activeEffect.lastTickAt = new Date().toISOString();
      }
    }, effect.tickInterval);

    this.intervals.set(instanceId, interval);
  }

  /**
   * Apply a single effect tick
   */
  private async applyEffectTick(
    activeEffect: IActiveEffect,
    context: IEffectContext,
  ): Promise<{
    statChanges?: Record<string, number>;
    damage?: number;
    healing?: number;
  }> {
    const effect = activeEffect.effect;
    const statChanges: Record<string, number> = {};
    let damage = 0;
    let healing = 0;

    switch (effect.type) {
      case EffectType.HEAL:
        if (effect.value) {
          const healAmount = effect.percentage
            ? (context.targetStats[StatType.HEALTH] || 100) * (effect.value / 100)
            : effect.value;
          statChanges[StatType.HEALTH] = healAmount * activeEffect.stacks;
          healing = healAmount * activeEffect.stacks;
        }
        break;

      case EffectType.DAMAGE:
      case EffectType.POISON:
      case EffectType.BURN:
        if (effect.value) {
          const damageAmount = effect.percentage
            ? (context.targetStats[StatType.HEALTH] || 100) * (effect.value / 100)
            : effect.value;
          statChanges[StatType.HEALTH] = -damageAmount * activeEffect.stacks;
          damage = damageAmount * activeEffect.stacks;
        }
        break;

      case EffectType.RESTORE_MANA:
        if (effect.value) {
          const manaAmount = effect.percentage
            ? (context.targetStats[StatType.MANA] || 100) * (effect.value / 100)
            : effect.value;
          statChanges[StatType.MANA] = manaAmount * activeEffect.stacks;
        }
        break;

      case EffectType.RESTORE_STAMINA:
        if (effect.value) {
          const staminaAmount = effect.percentage
            ? (context.targetStats[StatType.STAMINA] || 100) * (effect.value / 100)
            : effect.value;
          statChanges[StatType.STAMINA] = staminaAmount * activeEffect.stacks;
        }
        break;

      case EffectType.CUSTOM:
        if (effect.customTick) {
          await effect.customTick(context);
        } else if (effect.customEffect) {
          await effect.customEffect(context);
        }
        break;
    }

    return { statChanges, damage, healing };
  }

  /**
   * Apply stat modifier
   */
  private async applyStatModifier(
    activeEffect: IActiveEffect,
    context: IEffectContext,
  ): Promise<{ statChanges: Record<string, number> }> {
    const effect = activeEffect.effect;
    const statChanges: Record<string, number> = {};

    if (!effect.statType || !effect.value) {
      return { statChanges };
    }

    const currentValue = context.targetStats[effect.statType] || 0;
    let newValue = currentValue;

    switch (effect.type) {
      case EffectType.INCREASE_STAT:
      case EffectType.BUFF:
      case EffectType.EQUIPMENT_BONUS:
        newValue = effect.percentage
          ? currentValue * (1 + (effect.value / 100) * activeEffect.stacks)
          : currentValue + effect.value * activeEffect.stacks;
        break;

      case EffectType.DECREASE_STAT:
      case EffectType.DEBUFF:
        newValue = effect.percentage
          ? currentValue * (1 - (effect.value / 100) * activeEffect.stacks)
          : currentValue - effect.value * activeEffect.stacks;
        break;

      case EffectType.MULTIPLY_STAT:
        newValue = currentValue * (effect.modifier || 1) * activeEffect.stacks;
        break;
    }

    statChanges[effect.statType] = newValue - currentValue;
    return { statChanges };
  }

  /**
   * Remove an effect from a target
   */
  async removeEffect(targetId: string, effectId: string): Promise<boolean> {
    const targetEffects = this.activeEffects.get(targetId);

    if (!targetEffects) {
      return false;
    }

    const index = targetEffects.findIndex((ae) => ae.effectId === effectId);

    if (index === -1) {
      return false;
    }

    const activeEffect = targetEffects[index];

    // Clear any intervals
    const instanceId = `${targetId}_${effectId}_`;
    for (const [key, interval] of this.intervals.entries()) {
      if (key.startsWith(instanceId)) {
        clearInterval(interval);
        this.intervals.delete(key);
      }
    }

    // Remove from active effects
    targetEffects.splice(index, 1);
    this.activeEffects.set(targetId, targetEffects);

    // Emit event
    await this.eventEmitter.emit(
      GameEventType.CUSTOM_EVENT,
      {
        action: 'effect_removed',
        effectId,
        effectName: activeEffect.effect.name,
        targetId,
      },
      'global',
    );

    this.logger.log(`Removed effect '${activeEffect.effect.name}' from ${targetId}`);

    return true;
  }

  /**
   * Remove all effects from a target
   */
  async removeAllEffects(targetId: string): Promise<number> {
    const targetEffects = this.activeEffects.get(targetId);

    if (!targetEffects) {
      return 0;
    }

    const count = targetEffects.length;

    // Clear all intervals for this target
    for (const [key, interval] of this.intervals.entries()) {
      if (key.startsWith(targetId)) {
        clearInterval(interval);
        this.intervals.delete(key);
      }
    }

    this.activeEffects.delete(targetId);
    this.logger.log(`Removed all ${count} effects from ${targetId}`);

    return count;
  }

  /**
   * Get active effects for a target
   */
  getActiveEffects(targetId: string): IActiveEffect[] {
    return this.activeEffects.get(targetId) || [];
  }

  /**
   * Get total stat modifiers for a target
   */
  getTotalStatModifiers(targetId: string): Record<string, number> {
    const effects = this.getActiveEffects(targetId);
    const modifiers: Record<string, number> = {};

    for (const activeEffect of effects) {
      const effect = activeEffect.effect;

      if (
        effect.statType &&
        effect.value &&
        (effect.type === EffectType.INCREASE_STAT ||
          effect.type === EffectType.DECREASE_STAT ||
          effect.type === EffectType.BUFF ||
          effect.type === EffectType.DEBUFF ||
          effect.type === EffectType.EQUIPMENT_BONUS)
      ) {
        const currentMod = modifiers[effect.statType] || 0;
        const sign = effect.type === EffectType.DECREASE_STAT || effect.type === EffectType.DEBUFF ? -1 : 1;

        modifiers[effect.statType] = currentMod + sign * effect.value * activeEffect.stacks;
      }
    }

    return modifiers;
  }

  /**
   * Get effect statistics for a target
   */
  getEffectStats(targetId: string): IEffectStats {
    const effects = this.getActiveEffects(targetId);

    let buffs = 0;
    let debuffs = 0;
    let statusEffects = 0;
    let equipmentBonuses = 0;

    for (const ae of effects) {
      switch (ae.effect.type) {
        case EffectType.BUFF:
        case EffectType.INCREASE_STAT:
          buffs++;
          break;
        case EffectType.DEBUFF:
        case EffectType.DECREASE_STAT:
          debuffs++;
          break;
        case EffectType.POISON:
        case EffectType.BURN:
        case EffectType.FREEZE:
        case EffectType.STUN:
        case EffectType.SLOW:
        case EffectType.HASTE:
          statusEffects++;
          break;
        case EffectType.EQUIPMENT_BONUS:
          equipmentBonuses++;
          break;
      }
    }

    return {
      activeEffects: effects.length,
      buffs,
      debuffs,
      statusEffects,
      equipmentBonuses,
      totalStatModifiers: this.getTotalStatModifiers(targetId),
    };
  }

  /**
   * Pause/unpause an effect
   */
  setEffectPaused(targetId: string, effectId: string, paused: boolean): boolean {
    const targetEffects = this.activeEffects.get(targetId);

    if (!targetEffects) {
      return false;
    }

    const activeEffect = targetEffects.find((ae) => ae.effectId === effectId);

    if (!activeEffect) {
      return false;
    }

    activeEffect.paused = paused;
    this.logger.log(
      `${paused ? 'Paused' : 'Unpaused'} effect '${activeEffect.effect.name}' on ${targetId}`,
    );

    return true;
  }

  /**
   * Get effect definition
   */
  getEffect(effectId: string): IEffect | undefined {
    return this.effects.get(effectId);
  }

  /**
   * Remove effect definition
   */
  removeEffectDefinition(effectId: string): void {
    this.effects.delete(effectId);
    this.logger.log(`Removed effect definition '${effectId}'`);
  }

  /**
   * Clear all effect definitions
   */
  clearAllEffectDefinitions(): void {
    this.effects.clear();
    this.logger.log('Cleared all effect definitions');
  }

  /**
   * Clean up on service destruction
   */
  onModuleDestroy() {
    // Clear all intervals
    for (const interval of this.intervals.values()) {
      clearInterval(interval);
    }
    this.intervals.clear();
  }
}
