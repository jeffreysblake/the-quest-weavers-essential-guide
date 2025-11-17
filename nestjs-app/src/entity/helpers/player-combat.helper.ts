import { Injectable, Logger } from '@nestjs/common';
import { IPlayer } from '../player.interface';
import { IInteractionResult } from '../entity.interface';
import { PhysicsService } from '../physics.service';
import { IPhysicsEffect, EffectType } from '../physics.interface';

/**
 * Player Combat Helper
 * Handles all combat and spell-casting operations including:
 * - Single-target spells
 * - Area-effect spells
 * - Spell validation and intensity capping
 */
@Injectable()
export class PlayerCombatHelper {
  private readonly logger = new Logger(PlayerCombatHelper.name);

  constructor(private readonly physicsService: PhysicsService) {}

  /**
   * Cast a spell at a specific target
   */
  async castSpell(
    player: IPlayer,
    spellType: EffectType,
    targetId: string,
    intensity: number = 5,
  ): Promise<IInteractionResult> {
    // VALIDATION: Validate intensity parameter to prevent crashes
    if (
      typeof intensity !== 'number' ||
      Number.isNaN(intensity) ||
      !Number.isFinite(intensity)
    ) {
      this.logger.error(`castSpell: Invalid intensity value: ${intensity}`);
      return {
        success: false,
        message: 'Invalid spell intensity',
      };
    }

    // VALIDATION: Ensure intensity is positive and reasonable
    if (intensity < 0) {
      this.logger.error(
        `castSpell: Negative intensity not allowed: ${intensity}`,
      );
      return {
        success: false,
        message: 'Spell intensity must be positive',
      };
    }

    if (intensity > 1000) {
      this.logger.warn(
        `castSpell: Capping extremely high intensity from ${intensity} to 1000`,
      );
      intensity = 1000; // Cap at reasonable maximum
    }

    const effect: IPhysicsEffect = {
      type: spellType,
      intensity,
      sourceId: player.id,
      description: this.getSpellDescription(spellType, intensity),
    };

    const result = await this.physicsService.applyEffect(targetId, effect);

    return {
      success: result.success,
      message: `${player.name} casts ${this.getSpellName(spellType)}! ${result.message}`,
      effects: {
        physicsResult: result,
      },
    };
  }

  /**
   * Cast an area-effect spell in a room
   */
  async castAreaSpell(
    player: IPlayer,
    spellType: EffectType,
    roomId: string,
    intensity: number = 5,
  ): Promise<IInteractionResult> {
    const effect: IPhysicsEffect = {
      type: spellType,
      intensity,
      sourceId: player.id,
      description: this.getAreaSpellDescription(spellType, intensity),
    };

    const result = await this.physicsService.applyAreaEffect(roomId, effect);

    // BUG FIX #2: Casting a spell should succeed even if no objects are affected
    // The spell was cast successfully, it just didn't hit anything
    return {
      success: true,
      message: `${player.name} casts ${this.getSpellName(spellType)} across the room! ${result.message}`,
      effects: {
        physicsResult: result,
      },
    };
  }

  /**
   * Get spell name from effect type
   */
  private getSpellName(spellType: EffectType): string {
    const spellNames: Record<EffectType, string> = {
      fire: 'Fireball',
      lightning: 'Lightning Bolt',
      ice: 'Ice Shard',
      force: 'Force Push',
      poison: 'Poison Cloud',
      acid: 'Acid Splash',
      magic: 'Magic Missile',
    };
    return spellNames[spellType] || 'Unknown Spell';
  }

  /**
   * Get spell description based on intensity
   */
  private getSpellDescription(
    spellType: EffectType,
    intensity: number,
  ): string {
    const base = this.getSpellName(spellType).toLowerCase();
    if (intensity <= 3) return `weak ${base}`;
    if (intensity <= 6) return `${base}`;
    return `powerful ${base}`;
  }

  /**
   * Get area spell description based on intensity
   */
  private getAreaSpellDescription(
    spellType: EffectType,
    intensity: number,
  ): string {
    const base = this.getSpellName(spellType).toLowerCase();
    if (intensity <= 3) return `spreading ${base}`;
    if (intensity <= 6) return `area ${base}`;
    return `devastating ${base} storm`;
  }
}
