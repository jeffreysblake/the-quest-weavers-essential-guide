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
  private activeEffects: Map<string, Map<string, IActiveEffect[]>> = new Map(); // gameId -> targetId -> active effects
  private intervals: Map<string, NodeJS.Timeout> = new Map(); // activeEffectId -> interval

  constructor(private readonly eventEmitter: EventEmitterService) {}

  /**
   * Register an effect definition
   */
  registerEffect(effect: IEffect): void {
    this.effects.set(effect.id, effect);
    this.logger.log(
      `Registered effect '${effect.name}' (${effect.id}) of type ${effect.type}`,
    );
  }

  /**
   * Apply an effect to a target (supports two signatures)
   * 1. applyEffect(effectId, targetId, gameId, context) - Normal application
   * 2. applyEffect(gameId, activeEffect) - Restoration from save
   */
  async applyEffect(
    effectIdOrGameId: string,
    targetIdOrActiveEffect: string | IActiveEffect,
    gameId?: string,
    context: Partial<IEffectContext> = {},
  ): Promise<IEffectResult> {
    // Determine which signature is being used
    if (typeof targetIdOrActiveEffect === 'object') {
      // Signature 2: applyEffect(gameId, activeEffect)
      return this.restoreActiveEffect(effectIdOrGameId, targetIdOrActiveEffect);
    }

    // Signature 1: applyEffect(effectId, targetId, gameId, context)
    const effectId = effectIdOrGameId;
    const targetId = targetIdOrActiveEffect;
    const actualGameId = gameId!;

    const effect = this.effects.get(effectId);

    if (!effect) {
      return {
        success: false,
        message: `Effect '${effectId}' not found`,
      };
    }

    // Get or create game-specific active effects
    if (!this.activeEffects.has(actualGameId)) {
      this.activeEffects.set(actualGameId, new Map());
    }
    const gameEffects = this.activeEffects.get(actualGameId)!;

    // Get target's active effects
    const targetEffects = gameEffects.get(targetId) || [];

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
          existingEffect.expiresAt = new Date(
            Date.now() + effect.duration,
          ).toISOString();
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
      activeEffect.expiresAt = new Date(
        Date.now() + effect.duration,
      ).toISOString();
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
      gameId: actualGameId,
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
      // Don't store instant effects - they apply immediately and don't persist
    } else {
      // Setup ticking for over_time effects
      if (
        effect.durationType === DurationType.OVER_TIME &&
        effect.tickInterval
      ) {
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
        const result = await this.applyStatModifier(
          activeEffect,
          effectContext,
        );
        Object.assign(statChanges, result.statChanges);
      }

      // Store active effect (only non-instant effects persist)
      targetEffects.push(activeEffect);
      gameEffects.set(targetId, targetEffects);
    }

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
      actualGameId,
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
    const instanceId = `${context.gameId}_${activeEffect.targetId}_${activeEffect.effectId}_${Date.now()}`;

    if (!effect.tickInterval) return;

    const interval = setInterval(async () => {
      // Check if effect expired
      if (activeEffect.expiresAt) {
        const now = Date.now();
        const expiresAt = new Date(activeEffect.expiresAt).getTime();
        if (now >= expiresAt) {
          await this.removeEffect(
            context.gameId,
            activeEffect.targetId,
            activeEffect.effectId,
          );
          clearInterval(interval);
          this.intervals.delete(instanceId);
          return;
        }
      }

      // Check tick count
      if (activeEffect.ticksRemaining !== undefined) {
        if (activeEffect.ticksRemaining <= 0) {
          await this.removeEffect(
            context.gameId,
            activeEffect.targetId,
            activeEffect.effectId,
          );
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

      // Check if ticks are complete after applying the tick
      if (
        activeEffect.ticksRemaining !== undefined &&
        activeEffect.ticksRemaining <= 0
      ) {
        await this.removeEffect(
          context.gameId,
          activeEffect.targetId,
          activeEffect.effectId,
        );
        clearInterval(interval);
        this.intervals.delete(instanceId);
        return;
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
            ? (context.targetStats[StatType.HEALTH] || 100) *
              (effect.value / 100)
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
            ? (context.targetStats[StatType.HEALTH] || 100) *
              (effect.value / 100)
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
            ? (context.targetStats[StatType.STAMINA] || 100) *
              (effect.value / 100)
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
  async removeEffect(
    gameId: string,
    targetId: string,
    effectId: string,
  ): Promise<boolean> {
    const gameEffects = this.activeEffects.get(gameId);
    if (!gameEffects) {
      return false;
    }

    const targetEffects = gameEffects.get(targetId);
    if (!targetEffects) {
      return false;
    }

    const index = targetEffects.findIndex((ae) => ae.effectId === effectId);

    if (index === -1) {
      return false;
    }

    const activeEffect = targetEffects[index];

    // Clear any intervals
    const instanceId = `${gameId}_${targetId}_${effectId}_`;
    for (const [key, interval] of this.intervals.entries()) {
      if (key.startsWith(instanceId)) {
        clearInterval(interval);
        this.intervals.delete(key);
      }
    }

    // Remove from active effects
    targetEffects.splice(index, 1);
    gameEffects.set(targetId, targetEffects);

    // Emit event
    await this.eventEmitter.emit(
      GameEventType.CUSTOM_EVENT,
      {
        action: 'effect_removed',
        effectId,
        effectName: activeEffect.effect.name,
        targetId,
      },
      gameId,
    );

    this.logger.log(
      `Removed effect '${activeEffect.effect.name}' from ${targetId} in game ${gameId}`,
    );

    return true;
  }

  /**
   * Remove all effects from a target
   */
  async removeAllEffects(gameId: string, targetId: string): Promise<number> {
    const gameEffects = this.activeEffects.get(gameId);
    if (!gameEffects) {
      return 0;
    }

    const targetEffects = gameEffects.get(targetId);
    if (!targetEffects) {
      return 0;
    }

    const count = targetEffects.length;

    // Clear all intervals for this target
    const prefix = `${gameId}_${targetId}_`;
    for (const [key, interval] of this.intervals.entries()) {
      if (key.startsWith(prefix)) {
        clearInterval(interval);
        this.intervals.delete(key);
      }
    }

    gameEffects.delete(targetId);
    this.logger.log(
      `Removed all ${count} effects from ${targetId} in game ${gameId}`,
    );

    return count;
  }

  /**
   * Get active effects for a target
   */
  getActiveEffects(gameId: string, targetId: string): IActiveEffect[] {
    const gameEffects = this.activeEffects.get(gameId);
    if (!gameEffects) {
      return [];
    }
    return gameEffects.get(targetId) || [];
  }

  /**
   * Get total stat modifiers for a target
   */
  getTotalStatModifiers(
    gameId: string,
    targetId: string,
  ): Record<string, number> {
    const effects = this.getActiveEffects(gameId, targetId);
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
        const sign =
          effect.type === EffectType.DECREASE_STAT ||
          effect.type === EffectType.DEBUFF
            ? -1
            : 1;

        modifiers[effect.statType] =
          currentMod + sign * effect.value * activeEffect.stacks;
      }
    }

    return modifiers;
  }

  /**
   * Get effect statistics for a target
   */
  getEffectStats(gameId: string, targetId: string): IEffectStats {
    const effects = this.getActiveEffects(gameId, targetId);

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
      totalStatModifiers: this.getTotalStatModifiers(gameId, targetId),
    };
  }

  /**
   * Pause/unpause an effect
   */
  setEffectPaused(
    gameId: string,
    targetId: string,
    effectId: string,
    paused: boolean,
  ): boolean {
    const gameEffects = this.activeEffects.get(gameId);
    if (!gameEffects) {
      return false;
    }

    const targetEffects = gameEffects.get(targetId);
    if (!targetEffects) {
      return false;
    }

    const activeEffect = targetEffects.find((ae) => ae.effectId === effectId);

    if (!activeEffect) {
      return false;
    }

    activeEffect.paused = paused;
    this.logger.log(
      `${paused ? 'Paused' : 'Unpaused'} effect '${activeEffect.effect.name}' on ${targetId} in game ${gameId}`,
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
   * Export active effects for a game (for save/load)
   */
  exportEffects(gameId: string): any {
    const gameEffects = this.activeEffects.get(gameId);
    if (!gameEffects) {
      return {};
    }

    const exportData: Record<string, any[]> = {};

    for (const [targetId, effects] of gameEffects.entries()) {
      exportData[targetId] = effects.map((ae) => ({
        effectId: ae.effectId,
        targetId: ae.targetId,
        sourceId: ae.sourceId,
        appliedAt: ae.appliedAt,
        expiresAt: ae.expiresAt,
        lastTickAt: ae.lastTickAt,
        ticksRemaining: ae.ticksRemaining,
        stacks: ae.stacks,
        paused: ae.paused,
        metadata: ae.metadata,
        // Store the effect definition separately
        effect: ae.effect,
      }));
    }

    return exportData;
  }

  /**
   * Import active effects for a game (from save/load)
   */
  async importEffects(gameId: string, effectsData: any): Promise<void> {
    if (!effectsData || typeof effectsData !== 'object') {
      return;
    }

    // Clear existing effects for this game
    const gameEffects = this.activeEffects.get(gameId);
    if (gameEffects) {
      // Clear intervals for this game
      const prefix = `${gameId}_`;
      for (const [key, interval] of this.intervals.entries()) {
        if (key.startsWith(prefix)) {
          clearInterval(interval);
          this.intervals.delete(key);
        }
      }
      gameEffects.clear();
    }

    // Initialize game effects if needed
    if (!this.activeEffects.has(gameId)) {
      this.activeEffects.set(gameId, new Map());
    }

    // Restore effects
    let totalImported = 0;
    for (const [targetId, effects] of Object.entries(effectsData)) {
      if (Array.isArray(effects)) {
        for (const effectData of effects) {
          const result = await this.applyEffect(
            gameId,
            effectData as IActiveEffect,
          );
          if (result.success) {
            totalImported++;
          }
        }
      }
    }

    this.logger.log(`Imported ${totalImported} effects for game ${gameId}`);
  }

  /**
   * Restore an active effect (used during load)
   */
  private async restoreActiveEffect(
    gameId: string,
    activeEffect: IActiveEffect,
  ): Promise<IEffectResult> {
    // Get or create game-specific active effects
    if (!this.activeEffects.has(gameId)) {
      this.activeEffects.set(gameId, new Map());
    }
    const gameEffects = this.activeEffects.get(gameId)!;

    // Get target's active effects
    const targetId = activeEffect.targetId;
    const targetEffects = gameEffects.get(targetId) || [];

    // Check if effect already exists (avoid duplicates)
    const existingEffect = targetEffects.find(
      (ae) => ae.effectId === activeEffect.effectId,
    );
    if (existingEffect) {
      this.logger.warn(
        `Effect ${activeEffect.effectId} already exists on ${targetId}, skipping restoration`,
      );
      return {
        success: false,
        message: 'Effect already exists',
      };
    }

    // Ensure the effect definition is registered
    if (!this.effects.has(activeEffect.effectId)) {
      this.registerEffect(activeEffect.effect);
    }

    // Store the active effect
    targetEffects.push(activeEffect);
    gameEffects.set(targetId, targetEffects);

    // Setup ticking for over_time effects if they haven't expired
    const effect = activeEffect.effect;
    if (effect.durationType === DurationType.OVER_TIME && effect.tickInterval) {
      // Check if effect hasn't expired
      if (
        !activeEffect.expiresAt ||
        new Date(activeEffect.expiresAt).getTime() > Date.now()
      ) {
        // Check if there are ticks remaining
        if (!activeEffect.ticksRemaining || activeEffect.ticksRemaining > 0) {
          const context: IEffectContext = {
            gameId,
            targetId: activeEffect.targetId,
            sourceId: activeEffect.sourceId,
            effect,
            targetStats: {},
            targetFlags: {},
            targetVariables: {},
          };
          this.setupEffectTicking(activeEffect, context);
        }
      }
    }

    this.logger.log(
      `Restored effect '${effect.name}' on ${targetId} in game ${gameId}`,
    );

    return {
      success: true,
      message: `Effect '${effect.name}' restored`,
      effectId: effect.id,
      activeEffect,
    };
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
