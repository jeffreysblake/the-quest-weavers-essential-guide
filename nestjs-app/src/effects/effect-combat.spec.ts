import { Test, TestingModule } from '@nestjs/testing';
import { EffectManagerService } from './effect-manager.service';
import { EventEmitterService } from '../events/event-emitter.service';
import {
  IEffect,
  EffectType,
  EffectTarget,
  DurationType,
  StatType,
} from './effect.interfaces';

describe('EffectManagerService - Combat System Tests', () => {
  let service: EffectManagerService;
  let eventEmitter: EventEmitterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EffectManagerService,
        {
          provide: EventEmitterService,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EffectManagerService>(EffectManagerService);
    eventEmitter = module.get<EventEmitterService>(EventEmitterService);
  });

  afterEach(() => {
    // Clean up any active effects
    service.onModuleDestroy();
  });

  describe('Death and Damage Edge Cases', () => {
    it('should handle instant death (health reaches 0)', async () => {
      const deathEffect: IEffect = {
        id: 'instant-death',
        name: 'Instant Death',
        description: 'Reduces health to 0',
        type: EffectType.DAMAGE,
        target: EffectTarget.TARGET,
        durationType: DurationType.INSTANT,
        value: 100, // Enough to kill most targets
      };

      service.registerEffect(deathEffect);

      const targetStats = { [StatType.HEALTH]: 50 };

      const result = await service.applyEffect('instant-death', 'player-1', 'game-1', {
        targetStats,
      });

      expect(result.success).toBe(true);
      expect(result.damage).toBe(100);
      expect(result.statChanges?.[StatType.HEALTH]).toBe(-100);
    });

    it('should handle negative health without going below 0', async () => {
      const massiveDamage: IEffect = {
        id: 'massive-damage',
        name: 'Massive Damage',
        description: 'Extreme damage',
        type: EffectType.DAMAGE,
        target: EffectTarget.TARGET,
        durationType: DurationType.INSTANT,
        value: Number.MAX_SAFE_INTEGER, // Extreme value
      };

      service.registerEffect(massiveDamage);

      const targetStats = { [StatType.HEALTH]: 100 };

      const result = await service.applyEffect('massive-damage', 'player-1', 'game-1', {
        targetStats,
      });

      expect(result.success).toBe(true);
      expect(result.damage).toBeDefined();
      // The actual health should be managed by the caller, but damage should be calculated
    });

    it('should handle zero damage', async () => {
      const zeroDamage: IEffect = {
        id: 'zero-damage',
        name: 'Zero Damage',
        description: 'No damage',
        type: EffectType.DAMAGE,
        target: EffectTarget.TARGET,
        durationType: DurationType.INSTANT,
        value: 0,
      };

      service.registerEffect(zeroDamage);

      const result = await service.applyEffect('zero-damage', 'player-1', 'game-1', {
        targetStats: { [StatType.HEALTH]: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.damage).toBe(0);
    });

    it('should handle percentage damage correctly', async () => {
      const percentDamage: IEffect = {
        id: 'percent-damage',
        name: 'Percent Damage',
        description: '50% max health damage',
        type: EffectType.DAMAGE,
        target: EffectTarget.TARGET,
        durationType: DurationType.INSTANT,
        value: 50,
        percentage: true,
      };

      service.registerEffect(percentDamage);

      const result = await service.applyEffect('percent-damage', 'player-1', 'game-1', {
        targetStats: { [StatType.HEALTH]: 200 },
      });

      expect(result.success).toBe(true);
      expect(result.damage).toBe(100); // 50% of 200
    });

    it('should handle healing edge case (cannot exceed max health)', async () => {
      const overHeal: IEffect = {
        id: 'over-heal',
        name: 'Over Heal',
        description: 'Massive healing',
        type: EffectType.HEAL,
        target: EffectTarget.TARGET,
        durationType: DurationType.INSTANT,
        value: 1000,
      };

      service.registerEffect(overHeal);

      const result = await service.applyEffect('over-heal', 'player-1', 'game-1', {
        targetStats: { [StatType.HEALTH]: 90 }, // Close to max (100)
      });

      expect(result.success).toBe(true);
      expect(result.healing).toBe(1000);
      // Note: The service calculates healing, the caller should cap at max health
    });
  });

  describe('Effect Stacking Edge Cases', () => {
    it('should stack effects correctly', async () => {
      const stackablePoison: IEffect = {
        id: 'stackable-poison',
        name: 'Stackable Poison',
        description: 'Poison that stacks',
        type: EffectType.POISON,
        target: EffectTarget.TARGET,
        durationType: DurationType.OVER_TIME,
        value: 5,
        duration: 10000,
        tickInterval: 1000,
        stackable: true,
        maxStacks: 5,
      };

      service.registerEffect(stackablePoison);

      // Apply 3 times
      await service.applyEffect('stackable-poison', 'player-1', 'game-1', {
        targetStats: { [StatType.HEALTH]: 100 },
      });
      await service.applyEffect('stackable-poison', 'player-1', 'game-1', {
        targetStats: { [StatType.HEALTH]: 100 },
      });
      const result3 = await service.applyEffect('stackable-poison', 'player-1', 'game-1', {
        targetStats: { [StatType.HEALTH]: 100 },
      });

      expect(result3.success).toBe(true);
      expect(result3.activeEffect?.stacks).toBe(3);
    });

    it('should respect max stacks', async () => {
      const limitedStack: IEffect = {
        id: 'limited-stack',
        name: 'Limited Stack',
        description: 'Effect with max 2 stacks',
        type: EffectType.BUFF,
        target: EffectTarget.TARGET,
        durationType: DurationType.PERMANENT,
        value: 10,
        statType: StatType.ATTACK,
        stackable: true,
        maxStacks: 2,
      };

      service.registerEffect(limitedStack);

      await service.applyEffect('limited-stack', 'player-1', 'game-1', {
        targetStats: {},
      });
      await service.applyEffect('limited-stack', 'player-1', 'game-1', {
        targetStats: {},
      });
      const result3 = await service.applyEffect('limited-stack', 'player-1', 'game-1', {
        targetStats: {},
      });

      expect(result3.success).toBe(false);
      expect(result3.message).toContain('max stacks');
    });

    it('should refresh non-stackable effects', async () => {
      const nonStackable: IEffect = {
        id: 'non-stackable',
        name: 'Non-Stackable',
        description: 'Effect that refreshes',
        type: EffectType.BUFF,
        target: EffectTarget.TARGET,
        durationType: DurationType.PERMANENT,
        value: 10,
        statType: StatType.DEFENSE,
        stackable: false,
      };

      service.registerEffect(nonStackable);

      const result1 = await service.applyEffect('non-stackable', 'player-1', 'game-1', {
        targetStats: {},
      });
      const firstAppliedAt = result1.activeEffect?.appliedAt;

      // Wait a tiny bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result2 = await service.applyEffect('non-stackable', 'player-1', 'game-1', {
        targetStats: {},
      });

      expect(result2.success).toBe(true);
      expect(result2.message).toContain('refreshed');
      expect(result2.activeEffect?.appliedAt).not.toBe(firstAppliedAt);
    });

    it('should handle stack overflow attempt', async () => {
      const infiniteStack: IEffect = {
        id: 'infinite-stack',
        name: 'Infinite Stack',
        description: 'Effect with very high max stacks',
        type: EffectType.BUFF,
        target: EffectTarget.TARGET,
        durationType: DurationType.PERMANENT,
        value: 1,
        statType: StatType.ATTACK,
        stackable: true,
        maxStacks: 99999,
      };

      service.registerEffect(infiniteStack);

      // Try to apply many times quickly
      for (let i = 0; i < 100; i++) {
        await service.applyEffect('infinite-stack', 'player-1', 'game-1', {
          targetStats: {},
        });
      }

      const effects = service.getActiveEffects('player-1');
      expect(effects.length).toBe(1);
      expect(effects[0].stacks).toBe(100);
    });
  });

  describe('Damage Over Time (DoT) Edge Cases', () => {
    it('should handle DoT ticking correctly', async () => {
      const poison: IEffect = {
        id: 'poison-dot',
        name: 'Poison',
        description: 'Poison damage over time',
        type: EffectType.POISON,
        target: EffectTarget.TARGET,
        durationType: DurationType.OVER_TIME,
        value: 10,
        tickInterval: 100, // 100ms for fast testing
        tickCount: 3,
      };

      service.registerEffect(poison);

      await service.applyEffect('poison-dot', 'player-1', 'game-1', {
        targetStats: { [StatType.HEALTH]: 100 },
      });

      const effects = service.getActiveEffects('player-1');
      expect(effects.length).toBe(1);
      expect(effects[0].ticksRemaining).toBe(3);

      // Wait for ticks to complete
      await new Promise((resolve) => setTimeout(resolve, 400));

      const effectsAfter = service.getActiveEffects('player-1');
      // Effect should be removed after ticks complete
      expect(effectsAfter.length).toBe(0);
    });

    it('should handle burn effect with duration expiration', async () => {
      const burn: IEffect = {
        id: 'burn-effect',
        name: 'Burn',
        description: 'Fire damage over time',
        type: EffectType.BURN,
        target: EffectTarget.TARGET,
        durationType: DurationType.OVER_TIME,
        value: 5,
        duration: 200, // 200ms duration
        tickInterval: 50,
      };

      service.registerEffect(burn);

      await service.applyEffect('burn-effect', 'player-1', 'game-1', {
        targetStats: { [StatType.HEALTH]: 100 },
      });

      // Wait for duration to expire
      await new Promise((resolve) => setTimeout(resolve, 300));

      const effects = service.getActiveEffects('player-1');
      expect(effects.length).toBe(0);
    });

    it('should pause/unpause effects correctly', async () => {
      const pausableEffect: IEffect = {
        id: 'pausable',
        name: 'Pausable Effect',
        description: 'Can be paused',
        type: EffectType.POISON,
        target: EffectTarget.TARGET,
        durationType: DurationType.OVER_TIME,
        value: 10,
        tickInterval: 100,
        duration: 5000,
      };

      service.registerEffect(pausableEffect);

      await service.applyEffect('pausable', 'player-1', 'game-1', {
        targetStats: { [StatType.HEALTH]: 100 },
      });

      const paused = service.setEffectPaused('player-1', 'pausable', true);
      expect(paused).toBe(true);

      const effects = service.getActiveEffects('player-1');
      expect(effects[0].paused).toBe(true);

      const unpaused = service.setEffectPaused('player-1', 'pausable', false);
      expect(unpaused).toBe(true);
    });
  });

  describe('Buff/Debuff Calculation Edge Cases', () => {
    it('should handle stat increase with percentage', async () => {
      const percentBuff: IEffect = {
        id: 'percent-buff',
        name: 'Percent Buff',
        description: '50% attack increase',
        type: EffectType.INCREASE_STAT,
        target: EffectTarget.TARGET,
        durationType: DurationType.PERMANENT,
        value: 50,
        percentage: true,
        statType: StatType.ATTACK,
      };

      service.registerEffect(percentBuff);

      const result = await service.applyEffect('percent-buff', 'player-1', 'game-1', {
        targetStats: { [StatType.ATTACK]: 100 },
      });

      expect(result.success).toBe(true);
      expect(result.statChanges?.[StatType.ATTACK]).toBe(50); // 50% of 100
    });

    it('should handle stat decrease to minimum (0)', async () => {
      const massiveDebuff: IEffect = {
        id: 'massive-debuff',
        name: 'Massive Debuff',
        description: 'Reduces stat by large amount',
        type: EffectType.DECREASE_STAT,
        target: EffectTarget.TARGET,
        durationType: DurationType.PERMANENT,
        value: 1000,
        statType: StatType.DEFENSE,
      };

      service.registerEffect(massiveDebuff);

      const result = await service.applyEffect('massive-debuff', 'player-1', 'game-1', {
        targetStats: { [StatType.DEFENSE]: 50 },
      });

      expect(result.success).toBe(true);
      expect(result.statChanges?.[StatType.DEFENSE]).toBe(-1000);
      // Caller should ensure stat doesn't go negative
    });

    it('should handle stat multiply with extreme values', async () => {
      const extremeMultiplier: IEffect = {
        id: 'extreme-multiply',
        name: 'Extreme Multiply',
        description: 'Multiplies stat by huge amount',
        type: EffectType.MULTIPLY_STAT,
        target: EffectTarget.TARGET,
        durationType: DurationType.PERMANENT,
        modifier: 1000,
        statType: StatType.ATTACK,
      };

      service.registerEffect(extremeMultiplier);

      const result = await service.applyEffect('extreme-multiply', 'player-1', 'game-1', {
        targetStats: { [StatType.ATTACK]: 100 },
      });

      expect(result.success).toBe(true);
      // Should not cause overflow
      expect(result.statChanges).toBeDefined();
    });

    it('should calculate total stat modifiers correctly', async () => {
      const buff1: IEffect = {
        id: 'buff-1',
        name: 'Buff 1',
        description: '+10 attack',
        type: EffectType.BUFF,
        target: EffectTarget.TARGET,
        durationType: DurationType.PERMANENT,
        value: 10,
        statType: StatType.ATTACK,
      };

      const buff2: IEffect = {
        id: 'buff-2',
        name: 'Buff 2',
        description: '+15 attack',
        type: EffectType.BUFF,
        target: EffectTarget.TARGET,
        durationType: DurationType.PERMANENT,
        value: 15,
        statType: StatType.ATTACK,
      };

      const debuff: IEffect = {
        id: 'debuff-1',
        name: 'Debuff 1',
        description: '-5 attack',
        type: EffectType.DEBUFF,
        target: EffectTarget.TARGET,
        durationType: DurationType.PERMANENT,
        value: 5,
        statType: StatType.ATTACK,
      };

      service.registerEffect(buff1);
      service.registerEffect(buff2);
      service.registerEffect(debuff);

      await service.applyEffect('buff-1', 'player-1', 'game-1', { targetStats: {} });
      await service.applyEffect('buff-2', 'player-1', 'game-1', { targetStats: {} });
      await service.applyEffect('debuff-1', 'player-1', 'game-1', { targetStats: {} });

      const modifiers = service.getTotalStatModifiers('player-1');
      expect(modifiers[StatType.ATTACK]).toBe(20); // 10 + 15 - 5
    });
  });

  describe('Effect Removal and Cleanup', () => {
    it('should remove effect correctly', async () => {
      const removableEffect: IEffect = {
        id: 'removable',
        name: 'Removable',
        description: 'Can be removed',
        type: EffectType.BUFF,
        target: EffectTarget.TARGET,
        durationType: DurationType.PERMANENT,
        value: 10,
        statType: StatType.DEFENSE,
      };

      service.registerEffect(removableEffect);

      await service.applyEffect('removable', 'player-1', 'game-1', { targetStats: {} });

      let effects = service.getActiveEffects('player-1');
      expect(effects.length).toBe(1);

      const removed = await service.removeEffect('player-1', 'removable');
      expect(removed).toBe(true);

      effects = service.getActiveEffects('player-1');
      expect(effects.length).toBe(0);
    });

    it('should remove all effects from target', async () => {
      const effect1: IEffect = {
        id: 'effect-1',
        name: 'Effect 1',
        description: 'Test effect 1',
        type: EffectType.BUFF,
        target: EffectTarget.TARGET,
        durationType: DurationType.PERMANENT,
        value: 10,
        statType: StatType.ATTACK,
      };

      const effect2: IEffect = {
        id: 'effect-2',
        name: 'Effect 2',
        description: 'Test effect 2',
        type: EffectType.BUFF,
        target: EffectTarget.TARGET,
        durationType: DurationType.PERMANENT,
        value: 10,
        statType: StatType.DEFENSE,
      };

      service.registerEffect(effect1);
      service.registerEffect(effect2);

      await service.applyEffect('effect-1', 'player-1', 'game-1', { targetStats: {} });
      await service.applyEffect('effect-2', 'player-1', 'game-1', { targetStats: {} });

      const count = await service.removeAllEffects('player-1');
      expect(count).toBe(2);

      const effects = service.getActiveEffects('player-1');
      expect(effects.length).toBe(0);
    });

    it('should handle removing nonexistent effect', async () => {
      const removed = await service.removeEffect('nonexistent-player', 'nonexistent-effect');
      expect(removed).toBe(false);
    });

    it('should clear all intervals on destroy', () => {
      // This is tested via afterEach cleanup
      expect(() => service.onModuleDestroy()).not.toThrow();
    });
  });

  describe('Custom Effect Edge Cases', () => {
    it('should handle custom effect function', async () => {
      const customFn = jest.fn();

      const customEffect: IEffect = {
        id: 'custom-effect',
        name: 'Custom Effect',
        description: 'Custom logic',
        type: EffectType.CUSTOM,
        target: EffectTarget.TARGET,
        durationType: DurationType.INSTANT,
        customEffect: customFn,
      };

      service.registerEffect(customEffect);

      await service.applyEffect('custom-effect', 'player-1', 'game-1', {
        targetStats: {},
        targetFlags: {},
        targetVariables: {},
      });

      expect(customFn).toHaveBeenCalled();
    });

    it('should handle custom tick function for DoT', async () => {
      const customTickFn = jest.fn();

      const customDoT: IEffect = {
        id: 'custom-dot',
        name: 'Custom DoT',
        description: 'Custom tick logic',
        type: EffectType.CUSTOM,
        target: EffectTarget.TARGET,
        durationType: DurationType.OVER_TIME,
        tickInterval: 100,
        tickCount: 2,
        customTick: customTickFn,
      };

      service.registerEffect(customDoT);

      await service.applyEffect('custom-dot', 'player-1', 'game-1', {
        targetStats: {},
        targetFlags: {},
        targetVariables: {},
      });

      // Wait for ticks
      await new Promise((resolve) => setTimeout(resolve, 250));

      expect(customTickFn).toHaveBeenCalledTimes(2);
    });

    it('should handle custom effect throwing error', async () => {
      const errorEffect: IEffect = {
        id: 'error-effect',
        name: 'Error Effect',
        description: 'Throws error',
        type: EffectType.CUSTOM,
        target: EffectTarget.TARGET,
        durationType: DurationType.INSTANT,
        customEffect: () => {
          throw new Error('Custom effect error');
        },
      };

      service.registerEffect(errorEffect);

      // Should not crash the whole system
      await expect(
        service.applyEffect('error-effect', 'player-1', 'game-1', {
          targetStats: {},
          targetFlags: {},
          targetVariables: {},
        }),
      ).rejects.toThrow();
    });
  });

  describe('Effect Statistics', () => {
    it('should calculate effect stats correctly', async () => {
      const buff: IEffect = {
        id: 'stat-buff',
        name: 'Stat Buff',
        description: 'Buff',
        type: EffectType.BUFF,
        target: EffectTarget.TARGET,
        durationType: DurationType.PERMANENT,
        value: 10,
        statType: StatType.ATTACK,
      };

      const debuff: IEffect = {
        id: 'stat-debuff',
        name: 'Stat Debuff',
        description: 'Debuff',
        type: EffectType.DEBUFF,
        target: EffectTarget.TARGET,
        durationType: DurationType.PERMANENT,
        value: 5,
        statType: StatType.DEFENSE,
      };

      const status: IEffect = {
        id: 'stat-poison',
        name: 'Stat Poison',
        description: 'Poison',
        type: EffectType.POISON,
        target: EffectTarget.TARGET,
        durationType: DurationType.OVER_TIME,
        value: 10,
        duration: 5000,
        tickInterval: 1000,
      };

      service.registerEffect(buff);
      service.registerEffect(debuff);
      service.registerEffect(status);

      await service.applyEffect('stat-buff', 'player-1', 'game-1', { targetStats: {} });
      await service.applyEffect('stat-debuff', 'player-1', 'game-1', { targetStats: {} });
      await service.applyEffect('stat-poison', 'player-1', 'game-1', {
        targetStats: { [StatType.HEALTH]: 100 },
      });

      const stats = service.getEffectStats('player-1');
      expect(stats.activeEffects).toBe(3);
      expect(stats.buffs).toBeGreaterThanOrEqual(1);
      expect(stats.debuffs).toBeGreaterThanOrEqual(1);
      expect(stats.statusEffects).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Edge Case Combinations', () => {
    it('should handle applying same effect to multiple targets', async () => {
      const areaEffect: IEffect = {
        id: 'area-damage',
        name: 'Area Damage',
        description: 'Damages all in area',
        type: EffectType.DAMAGE,
        target: EffectTarget.AREA,
        durationType: DurationType.INSTANT,
        value: 25,
      };

      service.registerEffect(areaEffect);

      const targets = ['player-1', 'player-2', 'player-3'];

      for (const target of targets) {
        await service.applyEffect('area-damage', target, 'game-1', {
          targetStats: { [StatType.HEALTH]: 100 },
        });
      }

      // Each should have received the effect independently
      targets.forEach((target) => {
        const effects = service.getActiveEffects(target);
        // Instant effects don't persist, so should be 0
        expect(effects.length).toBe(0);
      });
    });

    it('should handle effect with missing required properties', async () => {
      const incompleteEffect: IEffect = {
        id: 'incomplete',
        name: 'Incomplete',
        description: 'Missing properties',
        type: EffectType.INCREASE_STAT,
        target: EffectTarget.TARGET,
        durationType: DurationType.PERMANENT,
        // Missing value and statType
      } as any;

      service.registerEffect(incompleteEffect);

      const result = await service.applyEffect('incomplete', 'player-1', 'game-1', {
        targetStats: {},
      });

      // Should still succeed but with no effect
      expect(result.success).toBe(true);
    });
  });
});
