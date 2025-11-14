/**
 * Item effects system interfaces
 * Supports stat modifications, buffs/debuffs, consumable effects, and equipment bonuses
 */

/**
 * Effect type
 */
export enum EffectType {
  // Instant effects
  HEAL = 'heal',
  DAMAGE = 'damage',
  RESTORE_MANA = 'restore_mana',
  RESTORE_STAMINA = 'restore_stamina',

  // Stat modifiers
  INCREASE_STAT = 'increase_stat',
  DECREASE_STAT = 'decrease_stat',
  MULTIPLY_STAT = 'multiply_stat',

  // Buffs/Debuffs
  BUFF = 'buff',
  DEBUFF = 'debuff',

  // Status effects
  POISON = 'poison',
  BURN = 'burn',
  FREEZE = 'freeze',
  STUN = 'stun',
  SLOW = 'slow',
  HASTE = 'haste',
  INVISIBILITY = 'invisibility',
  INVULNERABILITY = 'invulnerability',

  // Equipment bonuses
  EQUIPMENT_BONUS = 'equipment_bonus',

  // Custom
  CUSTOM = 'custom',
}

/**
 * Effect target
 */
export enum EffectTarget {
  SELF = 'self',
  TARGET = 'target',
  AREA = 'area',
  ALL_ALLIES = 'all_allies',
  ALL_ENEMIES = 'all_enemies',
}

/**
 * Stat type
 */
export enum StatType {
  HEALTH = 'health',
  MANA = 'mana',
  STAMINA = 'stamina',
  STRENGTH = 'strength',
  DEXTERITY = 'dexterity',
  INTELLIGENCE = 'intelligence',
  VITALITY = 'vitality',
  LUCK = 'luck',
  DEFENSE = 'defense',
  ATTACK = 'attack',
  SPEED = 'speed',
  CRITICAL_CHANCE = 'critical_chance',
  CRITICAL_DAMAGE = 'critical_damage',
}

/**
 * Effect duration type
 */
export enum DurationType {
  INSTANT = 'instant', // Applies once immediately
  OVER_TIME = 'over_time', // Applies repeatedly over duration
  PERMANENT = 'permanent', // Lasts until removed
  UNTIL_REST = 'until_rest', // Lasts until player rests
  UNTIL_COMBAT_END = 'until_combat_end', // Lasts until combat ends
}

/**
 * Base effect definition
 */
export interface IEffect {
  id: string;
  name: string;
  description: string;
  type: EffectType;
  target: EffectTarget;
  durationType: DurationType;

  // Duration and timing
  duration?: number; // Milliseconds for temporary effects
  tickInterval?: number; // For over_time effects (milliseconds between ticks)
  tickCount?: number; // Number of times to apply (for over_time)

  // Effect values
  value?: number; // Primary effect value
  statType?: StatType; // Stat to modify
  modifier?: number; // Multiplier for stat modifications
  percentage?: boolean; // If true, value is a percentage

  // Stacking
  stackable?: boolean;
  maxStacks?: number;

  // Removal conditions
  removedOnDeath?: boolean;
  removedOnCombatEnd?: boolean;
  removedOnRest?: boolean;

  // Visual/Audio
  icon?: string;
  animation?: string;
  soundEffect?: string;

  // Custom effect function
  customEffect?: (context: IEffectContext) => void | Promise<void>;
  customTick?: (context: IEffectContext) => void | Promise<void>;

  metadata?: Record<string, any>;
}

/**
 * Active effect instance
 */
export interface IActiveEffect {
  effectId: string;
  effect: IEffect;
  targetId: string; // Entity ID (player or NPC)
  sourceId?: string; // Who/what applied this effect
  appliedAt: string;
  expiresAt?: string;
  lastTickAt?: string;
  ticksRemaining?: number;
  stacks: number;
  paused?: boolean;
  metadata?: Record<string, any>;
}

/**
 * Effect context for custom effects
 */
export interface IEffectContext {
  gameId: string;
  targetId: string;
  sourceId?: string;
  effect: IEffect;
  targetStats: Record<string, number>;
  targetFlags: Record<string, boolean>;
  targetVariables: Record<string, any>;
}

/**
 * Effect application result
 */
export interface IEffectResult {
  success: boolean;
  message: string;
  effectId?: string;
  activeEffect?: IActiveEffect;
  statChanges?: Record<string, number>;
  damage?: number;
  healing?: number;
  errors?: string[];
}

/**
 * Equipment effect definition
 */
export interface IEquipmentEffect extends IEffect {
  equipmentSlot?: string;
  requiresEquipped: boolean;
}

/**
 * Consumable effect definition
 */
export interface IConsumableEffect extends IEffect {
  consumeOnUse: boolean;
  cooldown?: number; // Milliseconds before can be used again
}

/**
 * Buff/Debuff definition
 */
export interface IBuffEffect extends IEffect {
  isDebuff: boolean;
  dispellable: boolean;
  priority: number; // Higher priority buffs apply first
}

/**
 * Status effect definition
 */
export interface IStatusEffect extends IEffect {
  damagePerTick?: number;
  resistanceReduction?: number;
  movementModifier?: number; // 0.5 = 50% slower, 2.0 = 200% faster
  canAct?: boolean; // Can the target perform actions
  canMove?: boolean; // Can the target move
}

/**
 * Effect stats snapshot
 */
export interface IEffectStats {
  activeEffects: number;
  buffs: number;
  debuffs: number;
  statusEffects: number;
  equipmentBonuses: number;
  totalStatModifiers: Record<string, number>;
}
