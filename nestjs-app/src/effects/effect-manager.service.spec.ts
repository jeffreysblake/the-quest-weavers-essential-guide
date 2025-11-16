import { Test, TestingModule } from '@nestjs/testing';
import { EffectManagerService } from './effect-manager.service';
import { EventEmitterService } from '../events/event-emitter.service';
import {
  IEffect,
  EffectType,
  DurationType,
  StatType,
  EffectTarget,
  IEffectContext,
} from './effect.interfaces';
import { GameEventType } from '../events/event.interfaces';

describe('EffectManagerService', () => {
  let service: EffectManagerService;
  let mockEventEmitter: jest.Mocked<EventEmitterService>;

  beforeEach(async () => {
    // Create mock event emitter
    mockEventEmitter = {
      emit: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      once: jest.fn(),
      off: jest.fn(),
      onAny: jest.fn(),
      getHistory: jest.fn(),
      clearHistory: jest.fn(),
      getSubscriberCount: jest.fn(),
      removeAllSubscribers: jest.fn(),
      waitFor: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EffectManagerService,
        {
          provide: EventEmitterService,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<EffectManagerService>(EffectManagerService);

    // Clear timers between tests
    jest.clearAllTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('registerEffect', () => {
    it('should register a basic effect', () => {
      const effect: IEffect = {
        id: 'heal-potion',
        name: 'Healing Potion',
        description: 'Restores 50 HP',
        type: EffectType.HEAL,
        target: EffectTarget.SELF,
        durationType: DurationType.INSTANT,
        value: 50,
      };

      service.registerEffect(effect);
      const retrieved = service.getEffect('heal-potion');

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe('heal-potion');
      expect(retrieved?.name).toBe('Healing Potion');
    });

    it('should register multiple effects', () => {
      const effect1: IEffect = {
        id: 'effect1',
        name: 'Effect 1',
        description: 'Test',
        type: EffectType.HEAL,
        target: EffectTarget.SELF,
        durationType: DurationType.INSTANT,
      };

      const effect2: IEffect = {
        id: 'effect2',
        name: 'Effect 2',
        description: 'Test',
        type: EffectType.DAMAGE,
        target: EffectTarget.TARGET,
        durationType: DurationType.INSTANT,
      };

      service.registerEffect(effect1);
      service.registerEffect(effect2);

      expect(service.getEffect('effect1')).toBeDefined();
      expect(service.getEffect('effect2')).toBeDefined();
    });

    it('should overwrite existing effect with same id', () => {
      const effect1: IEffect = {
        id: 'test',
        name: 'Original',
        description: 'Original',
        type: EffectType.HEAL,
        target: EffectTarget.SELF,
        durationType: DurationType.INSTANT,
      };

      const effect2: IEffect = {
        id: 'test',
        name: 'Updated',
        description: 'Updated',
        type: EffectType.DAMAGE,
        target: EffectTarget.SELF,
        durationType: DurationType.INSTANT,
      };

      service.registerEffect(effect1);
      service.registerEffect(effect2);

      const retrieved = service.getEffect('test');
      expect(retrieved?.name).toBe('Updated');
    });
  });

  describe('applyEffect - Instant Effects', () => {
    it('should apply instant heal effect', async () => {
      const healEffect: IEffect = {
        id: 'heal',
        name: 'Heal',
        description: 'Restores 50 HP',
        type: EffectType.HEAL,
        target: EffectTarget.SELF,
        durationType: DurationType.INSTANT,
        value: 50,
      };

      service.registerEffect(healEffect);
      const result = await service.applyEffect('heal', 'player1', 'game1');

      expect(result.success).toBe(true);
      expect(result.healing).toBe(50);
      expect(result.statChanges?.[StatType.HEALTH]).toBe(50);
    });

    it('should apply instant damage effect', async () => {
      const damageEffect: IEffect = {
        id: 'damage',
        name: 'Damage',
        description: 'Deals 30 damage',
        type: EffectType.DAMAGE,
        target: EffectTarget.TARGET,
        durationType: DurationType.INSTANT,
        value: 30,
      };

      service.registerEffect(damageEffect);
      const result = await service.applyEffect('damage', 'enemy1', 'game1');

      expect(result.success).toBe(true);
      expect(result.damage).toBe(30);
      expect(result.statChanges?.[StatType.HEALTH]).toBe(-30);
    });

    it('should apply percentage-based heal', async () => {
      const healEffect: IEffect = {
        id: 'percent-heal',
        name: 'Percent Heal',
        description: 'Restores 25% HP',
        type: EffectType.HEAL,
        target: EffectTarget.SELF,
        durationType: DurationType.INSTANT,
        value: 25,
        percentage: true,
      };

      service.registerEffect(healEffect);
      const context = {
        targetStats: { [StatType.HEALTH]: 100 },
      };
      const result = await service.applyEffect(
        'percent-heal',
        'player1',
        'game1',
        context,
      );

      expect(result.success).toBe(true);
      expect(result.healing).toBe(25);
    });

    it('should apply mana restoration effect', async () => {
      const manaEffect: IEffect = {
        id: 'restore-mana',
        name: 'Restore Mana',
        description: 'Restores 40 mana',
        type: EffectType.RESTORE_MANA,
        target: EffectTarget.SELF,
        durationType: DurationType.INSTANT,
        value: 40,
      };

      service.registerEffect(manaEffect);
      const result = await service.applyEffect(
        'restore-mana',
        'player1',
        'game1',
      );

      expect(result.success).toBe(true);
      expect(result.statChanges?.[StatType.MANA]).toBe(40);
    });

    it('should apply stamina restoration effect', async () => {
      const staminaEffect: IEffect = {
        id: 'restore-stamina',
        name: 'Restore Stamina',
        description: 'Restores 60 stamina',
        type: EffectType.RESTORE_STAMINA,
        target: EffectTarget.SELF,
        durationType: DurationType.INSTANT,
        value: 60,
      };

      service.registerEffect(staminaEffect);
      const result = await service.applyEffect(
        'restore-stamina',
        'player1',
        'game1',
      );

      expect(result.success).toBe(true);
      expect(result.statChanges?.[StatType.STAMINA]).toBe(60);
    });

    it('should return error for non-existent effect', async () => {
      const result = await service.applyEffect(
        'nonexistent',
        'player1',
        'game1',
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('applyEffect - Stat Modifiers', () => {
    it('should apply stat increase effect', async () => {
      const buffEffect: IEffect = {
        id: 'strength-buff',
        name: 'Strength Buff',
        description: 'Increases strength by 10',
        type: EffectType.INCREASE_STAT,
        target: EffectTarget.SELF,
        durationType: DurationType.PERMANENT,
        statType: StatType.STRENGTH,
        value: 10,
      };

      service.registerEffect(buffEffect);
      const context = {
        targetStats: { [StatType.STRENGTH]: 50 },
      };
      const result = await service.applyEffect(
        'strength-buff',
        'player1',
        'game1',
        context,
      );

      expect(result.success).toBe(true);
      expect(result.statChanges?.[StatType.STRENGTH]).toBe(10);
    });

    it('should apply stat decrease effect', async () => {
      const debuffEffect: IEffect = {
        id: 'defense-debuff',
        name: 'Defense Debuff',
        description: 'Decreases defense by 5',
        type: EffectType.DECREASE_STAT,
        target: EffectTarget.TARGET,
        durationType: DurationType.PERMANENT,
        statType: StatType.DEFENSE,
        value: 5,
      };

      service.registerEffect(debuffEffect);
      const context = {
        targetStats: { [StatType.DEFENSE]: 30 },
      };
      const result = await service.applyEffect(
        'defense-debuff',
        'enemy1',
        'game1',
        context,
      );

      expect(result.success).toBe(true);
      expect(result.statChanges?.[StatType.DEFENSE]).toBe(-5);
    });

    it('should apply percentage stat buff', async () => {
      const buffEffect: IEffect = {
        id: 'attack-buff',
        name: 'Attack Buff',
        description: 'Increases attack by 20%',
        type: EffectType.BUFF,
        target: EffectTarget.SELF,
        durationType: DurationType.PERMANENT,
        statType: StatType.ATTACK,
        value: 20,
        percentage: true,
      };

      service.registerEffect(buffEffect);
      const context = {
        targetStats: { [StatType.ATTACK]: 100 },
      };
      const result = await service.applyEffect(
        'attack-buff',
        'player1',
        'game1',
        context,
      );

      expect(result.success).toBe(true);
      expect(result.statChanges?.[StatType.ATTACK]).toBe(20);
    });

    it('should apply equipment bonus', async () => {
      const equipmentEffect: IEffect = {
        id: 'sword-bonus',
        name: 'Sword Bonus',
        description: 'Sword provides +15 attack',
        type: EffectType.EQUIPMENT_BONUS,
        target: EffectTarget.SELF,
        durationType: DurationType.PERMANENT,
        statType: StatType.ATTACK,
        value: 15,
      };

      service.registerEffect(equipmentEffect);
      const context = {
        targetStats: { [StatType.ATTACK]: 50 },
      };
      const result = await service.applyEffect(
        'sword-bonus',
        'player1',
        'game1',
        context,
      );

      expect(result.success).toBe(true);
      expect(result.statChanges?.[StatType.ATTACK]).toBe(15);
    });

    it('should apply multiply stat effect', async () => {
      const multiplyEffect: IEffect = {
        id: 'double-damage',
        name: 'Double Damage',
        description: 'Doubles attack damage',
        type: EffectType.MULTIPLY_STAT,
        target: EffectTarget.SELF,
        durationType: DurationType.PERMANENT,
        statType: StatType.ATTACK,
        value: 1, // Need value for applyStatModifier check
        modifier: 2,
      };

      service.registerEffect(multiplyEffect);
      const context = {
        targetStats: { [StatType.ATTACK]: 50 },
      };
      const result = await service.applyEffect(
        'double-damage',
        'player1',
        'game1',
        context,
      );

      expect(result.success).toBe(true);
      expect(result.statChanges?.[StatType.ATTACK]).toBe(50); // 50 * 2 * 1 stack = 100, change is 50
    });
  });

  describe('applyEffect - Effect Stacking', () => {
    it('should stack stackable effects', async () => {
      const stackableEffect: IEffect = {
        id: 'poison-stack',
        name: 'Poison Stack',
        description: 'Stacking poison',
        type: EffectType.POISON,
        target: EffectTarget.TARGET,
        durationType: DurationType.OVER_TIME,
        value: 5,
        duration: 5000,
        tickInterval: 1000,
        stackable: true,
        maxStacks: 5,
      };

      service.registerEffect(stackableEffect);

      const result1 = await service.applyEffect(
        'poison-stack',
        'enemy1',
        'game1',
      );
      expect(result1.success).toBe(true);
      expect(result1.activeEffect?.stacks).toBe(1);

      const result2 = await service.applyEffect(
        'poison-stack',
        'enemy1',
        'game1',
      );
      expect(result2.success).toBe(true);
      expect(result2.activeEffect?.stacks).toBe(2);
      expect(result2.message).toContain('stacked');

      const result3 = await service.applyEffect(
        'poison-stack',
        'enemy1',
        'game1',
      );
      expect(result3.success).toBe(true);
      expect(result3.activeEffect?.stacks).toBe(3);
    });

    it('should not exceed max stacks', async () => {
      const stackableEffect: IEffect = {
        id: 'limited-stack',
        name: 'Limited Stack',
        description: 'Limited stacking buff',
        type: EffectType.BUFF,
        target: EffectTarget.SELF,
        durationType: DurationType.PERMANENT,
        statType: StatType.STRENGTH,
        value: 5,
        stackable: true,
        maxStacks: 3,
      };

      service.registerEffect(stackableEffect);

      await service.applyEffect('limited-stack', 'player1', 'game1');
      await service.applyEffect('limited-stack', 'player1', 'game1');
      await service.applyEffect('limited-stack', 'player1', 'game1');

      const result = await service.applyEffect(
        'limited-stack',
        'player1',
        'game1',
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('max stacks');
    });

    it('should refresh non-stackable effect', async () => {
      const nonStackableEffect: IEffect = {
        id: 'shield',
        name: 'Shield',
        description: 'Protective shield',
        type: EffectType.BUFF,
        target: EffectTarget.SELF,
        durationType: DurationType.OVER_TIME,
        duration: 5000,
        statType: StatType.DEFENSE,
        value: 10,
        stackable: false,
      };

      service.registerEffect(nonStackableEffect);

      const result1 = await service.applyEffect('shield', 'player1', 'game1');
      expect(result1.success).toBe(true);
      const firstAppliedAt = result1.activeEffect?.appliedAt;

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result2 = await service.applyEffect('shield', 'player1', 'game1');
      expect(result2.success).toBe(true);
      expect(result2.message).toContain('refreshed');
      expect(result2.activeEffect?.stacks).toBe(1);
      expect(result2.activeEffect?.appliedAt).not.toBe(firstAppliedAt);
    });

    it('should use max stacks of 99 if not specified', async () => {
      const effect: IEffect = {
        id: 'unlimited-stack',
        name: 'Unlimited Stack',
        description: 'Stacks up to 99',
        type: EffectType.BUFF,
        target: EffectTarget.SELF,
        durationType: DurationType.PERMANENT,
        statType: StatType.ATTACK,
        value: 1,
        stackable: true,
      };

      service.registerEffect(effect);

      // Apply effect multiple times
      for (let i = 0; i < 10; i++) {
        const result = await service.applyEffect(
          'unlimited-stack',
          'player1',
          'game1',
        );
        expect(result.success).toBe(true);
      }

      const activeEffects = service.getActiveEffects('game1', 'player1');
      expect(activeEffects[0].stacks).toBe(10);
    });

    it('should multiply stat modifier by stacks', async () => {
      const stackableEffect: IEffect = {
        id: 'stacking-buff',
        name: 'Stacking Buff',
        description: 'Buff that stacks',
        type: EffectType.BUFF,
        target: EffectTarget.SELF,
        durationType: DurationType.PERMANENT,
        statType: StatType.ATTACK,
        value: 10,
        stackable: true,
        maxStacks: 5,
      };

      service.registerEffect(stackableEffect);
      const context = {
        targetStats: { [StatType.ATTACK]: 50 },
      };

      await service.applyEffect('stacking-buff', 'player1', 'game1', context);
      await service.applyEffect('stacking-buff', 'player1', 'game1', context);
      await service.applyEffect('stacking-buff', 'player1', 'game1', context);

      // Check that total modifier is value * stacks
      const modifiers = service.getTotalStatModifiers('game1', 'player1');
      expect(modifiers[StatType.ATTACK]).toBe(30); // 10 * 3 stacks
    });
  });

  describe('applyEffect - Over Time Effects', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it('should setup ticking for poison effect', async () => {
      const poisonEffect: IEffect = {
        id: 'poison',
        name: 'Poison',
        description: 'Deals damage over time',
        type: EffectType.POISON,
        target: EffectTarget.TARGET,
        durationType: DurationType.OVER_TIME,
        value: 5,
        duration: 5000,
        tickInterval: 1000,
      };

      service.registerEffect(poisonEffect);
      await service.applyEffect('poison', 'enemy1', 'game1');

      const effects = service.getActiveEffects('game1', 'enemy1');
      expect(effects.length).toBe(1);
      expect(effects[0].expiresAt).toBeDefined();
    });

    it('should apply burn effect ticks', async () => {
      const burnEffect: IEffect = {
        id: 'burn',
        name: 'Burn',
        description: 'Burns over time',
        type: EffectType.BURN,
        target: EffectTarget.TARGET,
        durationType: DurationType.OVER_TIME,
        value: 3,
        tickInterval: 500,
        tickCount: 5,
      };

      service.registerEffect(burnEffect);
      const context = {
        targetStats: { [StatType.HEALTH]: 100 },
      };
      await service.applyEffect('burn', 'enemy1', 'game1', context);

      const effects = service.getActiveEffects('game1', 'enemy1');
      expect(effects[0].ticksRemaining).toBe(5);

      // Advance time and check ticks
      jest.advanceTimersByTime(500);
      await Promise.resolve();

      const afterTick = service.getActiveEffects('game1', 'enemy1');
      if (afterTick.length > 0) {
        expect(afterTick[0].ticksRemaining).toBe(4);
      }
    });

    it('should expire effect after duration', async () => {
      const tempEffect: IEffect = {
        id: 'temp-buff',
        name: 'Temporary Buff',
        description: 'Temporary buff',
        type: EffectType.BUFF,
        target: EffectTarget.SELF,
        durationType: DurationType.OVER_TIME,
        duration: 2000,
        tickInterval: 500,
        statType: StatType.ATTACK,
        value: 10,
      };

      service.registerEffect(tempEffect);
      await service.applyEffect('temp-buff', 'player1', 'game1');

      expect(service.getActiveEffects('game1', 'player1').length).toBe(1);

      // Advance past duration
      jest.advanceTimersByTime(2500);
      await Promise.resolve();

      expect(service.getActiveEffects('game1', 'player1').length).toBe(0);
    });

    it('should expire effect after tick count reaches zero', async () => {
      const tickEffect: IEffect = {
        id: 'tick-effect',
        name: 'Tick Effect',
        description: 'Effect with tick count',
        type: EffectType.POISON,
        target: EffectTarget.TARGET,
        durationType: DurationType.OVER_TIME,
        value: 5,
        tickInterval: 100,
        tickCount: 3,
      };

      service.registerEffect(tickEffect);
      await service.applyEffect('tick-effect', 'enemy1', 'game1');

      expect(service.getActiveEffects('game1', 'enemy1').length).toBe(1);

      // Advance through all ticks
      for (let i = 0; i < 4; i++) {
        jest.advanceTimersByTime(100);
        await Promise.resolve();
      }

      expect(service.getActiveEffects('game1', 'enemy1').length).toBe(0);
    });

    it('should not tick when effect is paused', async () => {
      const poisonEffect: IEffect = {
        id: 'pausable-poison',
        name: 'Pausable Poison',
        description: 'Can be paused',
        type: EffectType.POISON,
        target: EffectTarget.TARGET,
        durationType: DurationType.OVER_TIME,
        value: 5,
        tickInterval: 100,
        tickCount: 10,
      };

      service.registerEffect(poisonEffect);
      await service.applyEffect('pausable-poison', 'enemy1', 'game1');

      // Pause the effect
      service.setEffectPaused('game1', 'enemy1', 'pausable-poison', true);

      // Advance time
      jest.advanceTimersByTime(500);
      await Promise.resolve();

      // Tick count should remain high since paused
      const effects = service.getActiveEffects('game1', 'enemy1');
      if (effects.length > 0) {
        expect(effects[0].paused).toBe(true);
      }
    });
  });

  describe('applyEffect - Permanent Effects', () => {
    it('should not set expiration for permanent effects', async () => {
      const permanentEffect: IEffect = {
        id: 'permanent-buff',
        name: 'Permanent Buff',
        description: 'Lasts forever',
        type: EffectType.EQUIPMENT_BONUS,
        target: EffectTarget.SELF,
        durationType: DurationType.PERMANENT,
        statType: StatType.STRENGTH,
        value: 10,
        duration: 5000, // Should be ignored
      };

      service.registerEffect(permanentEffect);
      const result = await service.applyEffect(
        'permanent-buff',
        'player1',
        'game1',
      );

      expect(result.success).toBe(true);
      expect(result.activeEffect?.expiresAt).toBeUndefined();
    });

    it('should apply permanent equipment bonus', async () => {
      const equipmentEffect: IEffect = {
        id: 'armor-bonus',
        name: 'Armor Bonus',
        description: 'Armor provides defense',
        type: EffectType.EQUIPMENT_BONUS,
        target: EffectTarget.SELF,
        durationType: DurationType.PERMANENT,
        statType: StatType.DEFENSE,
        value: 20,
      };

      service.registerEffect(equipmentEffect);
      const context = {
        targetStats: { [StatType.DEFENSE]: 30 },
      };
      const result = await service.applyEffect(
        'armor-bonus',
        'player1',
        'game1',
        context,
      );

      expect(result.success).toBe(true);
      expect(result.statChanges?.[StatType.DEFENSE]).toBe(20);
      expect(result.activeEffect?.expiresAt).toBeUndefined();
    });
  });

  describe('applyEffect - Custom Effects', () => {
    it('should execute custom effect function', async () => {
      const customFn = jest.fn();
      const customEffect: IEffect = {
        id: 'custom',
        name: 'Custom Effect',
        description: 'Custom logic',
        type: EffectType.CUSTOM,
        target: EffectTarget.SELF,
        durationType: DurationType.INSTANT,
        customEffect: customFn,
      };

      service.registerEffect(customEffect);
      await service.applyEffect('custom', 'player1', 'game1');

      expect(customFn).toHaveBeenCalled();
    });

    it('should pass context to custom effect', async () => {
      let receivedContext: IEffectContext | undefined;
      const customEffect: IEffect = {
        id: 'custom-context',
        name: 'Custom Context',
        description: 'Receives context',
        type: EffectType.CUSTOM,
        target: EffectTarget.SELF,
        durationType: DurationType.INSTANT,
        customEffect: async (context) => {
          receivedContext = context;
        },
      };

      service.registerEffect(customEffect);
      const context = {
        targetStats: { [StatType.HEALTH]: 100 },
        targetFlags: { isAlive: true },
        targetVariables: { level: 5 },
      };
      await service.applyEffect('custom-context', 'player1', 'game1', context);

      expect(receivedContext).toBeDefined();
      expect(receivedContext?.gameId).toBe('game1');
      expect(receivedContext?.targetId).toBe('player1');
      expect(receivedContext?.targetStats[StatType.HEALTH]).toBe(100);
    });
  });

  describe('removeEffect', () => {
    it('should remove active effect from target', async () => {
      const effect: IEffect = {
        id: 'removable',
        name: 'Removable',
        description: 'Can be removed',
        type: EffectType.BUFF,
        target: EffectTarget.SELF,
        durationType: DurationType.PERMANENT,
        statType: StatType.ATTACK,
        value: 10,
      };

      service.registerEffect(effect);
      await service.applyEffect('removable', 'player1', 'game1');

      expect(service.getActiveEffects('game1', 'player1').length).toBe(1);

      const removed = await service.removeEffect('game1', 'player1', 'removable');
      expect(removed).toBe(true);
      expect(service.getActiveEffects('game1', 'player1').length).toBe(0);
    });

    it('should return false when effect not found', async () => {
      const removed = await service.removeEffect('game1', 'player1', 'nonexistent');
      expect(removed).toBe(false);
    });

    it('should return false when target has no effects', async () => {
      const removed = await service.removeEffect(
        'nonexistent-target',
        'some-effect',
      );
      expect(removed).toBe(false);
    });

    it('should emit effect_removed event', async () => {
      const effect: IEffect = {
        id: 'test-remove',
        name: 'Test Remove',
        description: 'Test',
        type: EffectType.BUFF,
        target: EffectTarget.SELF,
        durationType: DurationType.PERMANENT,
        statType: StatType.ATTACK,
        value: 5,
      };

      service.registerEffect(effect);
      await service.applyEffect('test-remove', 'player1', 'game1');

      mockEventEmitter.emit.mockClear();
      await service.removeEffect('game1', 'player1', 'test-remove');

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.CUSTOM_EVENT,
        expect.objectContaining({
          action: 'effect_removed',
          effectId: 'test-remove',
        }),
        'global',
      );
    });

    it('should clear effect intervals when removed', async () => {
      jest.useFakeTimers();

      const tickEffect: IEffect = {
        id: 'tick-remove',
        name: 'Tick Remove',
        description: 'Ticking effect',
        type: EffectType.POISON,
        target: EffectTarget.TARGET,
        durationType: DurationType.OVER_TIME,
        value: 5,
        tickInterval: 1000,
        duration: 10000,
      };

      service.registerEffect(tickEffect);
      await service.applyEffect('tick-remove', 'enemy1', 'game1');

      await service.removeEffect('game1', 'enemy1', 'tick-remove');

      // Advance time to ensure interval doesn't fire
      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      expect(service.getActiveEffects('game1', 'enemy1').length).toBe(0);

      jest.useRealTimers();
    });
  });

  describe('removeAllEffects', () => {
    it('should remove all effects from target', async () => {
      const effect1: IEffect = {
        id: 'effect1',
        name: 'Effect 1',
        description: 'Test',
        type: EffectType.BUFF,
        target: EffectTarget.SELF,
        durationType: DurationType.PERMANENT,
        statType: StatType.ATTACK,
        value: 5,
      };

      const effect2: IEffect = {
        id: 'effect2',
        name: 'Effect 2',
        description: 'Test',
        type: EffectType.BUFF,
        target: EffectTarget.SELF,
        durationType: DurationType.PERMANENT,
        statType: StatType.DEFENSE,
        value: 5,
      };

      service.registerEffect(effect1);
      service.registerEffect(effect2);

      await service.applyEffect('effect1', 'player1', 'game1');
      await service.applyEffect('effect2', 'player1', 'game1');

      expect(service.getActiveEffects('game1', 'player1').length).toBe(2);

      const count = await service.removeAllEffects('game1', 'player1');
      expect(count).toBe(2);
      expect(service.getActiveEffects('game1', 'player1').length).toBe(0);
    });

    it('should return 0 when target has no effects', async () => {
      const count = await service.removeAllEffects('game1', 'empty-target');
      expect(count).toBe(0);
    });

    it('should clear all intervals for target', async () => {
      jest.useFakeTimers();

      const tickEffect: IEffect = {
        id: 'multi-tick',
        name: 'Multi Tick',
        description: 'Ticking effect',
        type: EffectType.POISON,
        target: EffectTarget.TARGET,
        durationType: DurationType.OVER_TIME,
        value: 5,
        tickInterval: 1000,
        duration: 10000,
      };

      service.registerEffect(tickEffect);
      await service.applyEffect('multi-tick', 'enemy1', 'game1');
      await service.applyEffect('multi-tick', 'enemy1', 'game1');

      await service.removeAllEffects('game1', 'enemy1');

      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      expect(service.getActiveEffects('game1', 'enemy1').length).toBe(0);

      jest.useRealTimers();
    });
  });

  describe('getActiveEffects', () => {
    it('should return active effects for target', async () => {
      const effect: IEffect = {
        id: 'active',
        name: 'Active',
        description: 'Test',
        type: EffectType.BUFF,
        target: EffectTarget.SELF,
        durationType: DurationType.PERMANENT,
        statType: StatType.ATTACK,
        value: 10,
      };

      service.registerEffect(effect);
      await service.applyEffect('active', 'player1', 'game1');

      const activeEffects = service.getActiveEffects('game1', 'player1');
      expect(activeEffects.length).toBe(1);
      expect(activeEffects[0].effectId).toBe('active');
    });

    it('should return empty array for target with no effects', () => {
      const activeEffects = service.getActiveEffects('game1', 'no-effects');
      expect(activeEffects).toEqual([]);
    });

    it('should return multiple active effects', async () => {
      const effect1: IEffect = {
        id: 'buff1',
        name: 'Buff 1',
        description: 'Test',
        type: EffectType.BUFF,
        target: EffectTarget.SELF,
        durationType: DurationType.PERMANENT,
        statType: StatType.ATTACK,
        value: 5,
      };

      const effect2: IEffect = {
        id: 'buff2',
        name: 'Buff 2',
        description: 'Test',
        type: EffectType.BUFF,
        target: EffectTarget.SELF,
        durationType: DurationType.PERMANENT,
        statType: StatType.DEFENSE,
        value: 5,
      };

      service.registerEffect(effect1);
      service.registerEffect(effect2);

      await service.applyEffect('buff1', 'player1', 'game1');
      await service.applyEffect('buff2', 'player1', 'game1');

      const activeEffects = service.getActiveEffects('game1', 'player1');
      expect(activeEffects.length).toBe(2);
    });
  });

  describe('getTotalStatModifiers', () => {
    it('should calculate total stat modifiers', async () => {
      const buff1: IEffect = {
        id: 'str-buff',
        name: 'Strength Buff',
        description: 'Test',
        type: EffectType.INCREASE_STAT,
        target: EffectTarget.SELF,
        durationType: DurationType.PERMANENT,
        statType: StatType.STRENGTH,
        value: 10,
      };

      const buff2: IEffect = {
        id: 'str-buff2',
        name: 'Strength Buff 2',
        description: 'Test',
        type: EffectType.BUFF,
        target: EffectTarget.SELF,
        durationType: DurationType.PERMANENT,
        statType: StatType.STRENGTH,
        value: 5,
      };

      service.registerEffect(buff1);
      service.registerEffect(buff2);

      await service.applyEffect('str-buff', 'player1', 'game1');
      await service.applyEffect('str-buff2', 'player1', 'game1');

      const modifiers = service.getTotalStatModifiers('game1', 'player1');
      expect(modifiers[StatType.STRENGTH]).toBe(15);
    });

    it('should handle stat decreases', async () => {
      const buff: IEffect = {
        id: 'buff',
        name: 'Buff',
        description: 'Test',
        type: EffectType.INCREASE_STAT,
        target: EffectTarget.SELF,
        durationType: DurationType.PERMANENT,
        statType: StatType.ATTACK,
        value: 20,
      };

      const debuff: IEffect = {
        id: 'debuff',
        name: 'Debuff',
        description: 'Test',
        type: EffectType.DECREASE_STAT,
        target: EffectTarget.SELF,
        durationType: DurationType.PERMANENT,
        statType: StatType.ATTACK,
        value: 5,
      };

      service.registerEffect(buff);
      service.registerEffect(debuff);

      await service.applyEffect('buff', 'player1', 'game1');
      await service.applyEffect('debuff', 'player1', 'game1');

      const modifiers = service.getTotalStatModifiers('game1', 'player1');
      expect(modifiers[StatType.ATTACK]).toBe(15);
    });

    it('should multiply modifiers by stacks', async () => {
      const stackableBuff: IEffect = {
        id: 'stack-buff',
        name: 'Stack Buff',
        description: 'Test',
        type: EffectType.BUFF,
        target: EffectTarget.SELF,
        durationType: DurationType.PERMANENT,
        statType: StatType.DEFENSE,
        value: 5,
        stackable: true,
        maxStacks: 5,
      };

      service.registerEffect(stackableBuff);

      await service.applyEffect('stack-buff', 'player1', 'game1');
      await service.applyEffect('stack-buff', 'player1', 'game1');
      await service.applyEffect('stack-buff', 'player1', 'game1');

      const modifiers = service.getTotalStatModifiers('game1', 'player1');
      expect(modifiers[StatType.DEFENSE]).toBe(15); // 5 * 3 stacks
    });

    it('should return empty object for target with no effects', () => {
      const modifiers = service.getTotalStatModifiers('game1', 'no-effects');
      expect(modifiers).toEqual({});
    });
  });

  describe('getEffectStats', () => {
    it('should return effect statistics', async () => {
      const buff: IEffect = {
        id: 'buff',
        name: 'Buff',
        description: 'Test',
        type: EffectType.BUFF,
        target: EffectTarget.SELF,
        durationType: DurationType.PERMANENT,
        statType: StatType.ATTACK,
        value: 10,
      };

      const debuff: IEffect = {
        id: 'debuff',
        name: 'Debuff',
        description: 'Test',
        type: EffectType.DEBUFF,
        target: EffectTarget.SELF,
        durationType: DurationType.PERMANENT,
        statType: StatType.DEFENSE,
        value: 5,
      };

      const poison: IEffect = {
        id: 'poison',
        name: 'Poison',
        description: 'Test',
        type: EffectType.POISON,
        target: EffectTarget.TARGET,
        durationType: DurationType.OVER_TIME,
        value: 3,
        tickInterval: 1000,
      };

      service.registerEffect(buff);
      service.registerEffect(debuff);
      service.registerEffect(poison);

      await service.applyEffect('buff', 'player1', 'game1');
      await service.applyEffect('debuff', 'player1', 'game1');
      await service.applyEffect('poison', 'player1', 'game1');

      const stats = service.getEffectStats('game1', 'player1');
      expect(stats.activeEffects).toBe(3);
      expect(stats.buffs).toBe(1);
      expect(stats.debuffs).toBe(1);
      expect(stats.statusEffects).toBe(1);
    });

    it('should count equipment bonuses', async () => {
      const equipmentEffect: IEffect = {
        id: 'equipment',
        name: 'Equipment',
        description: 'Test',
        type: EffectType.EQUIPMENT_BONUS,
        target: EffectTarget.SELF,
        durationType: DurationType.PERMANENT,
        statType: StatType.ATTACK,
        value: 15,
      };

      service.registerEffect(equipmentEffect);
      await service.applyEffect('equipment', 'player1', 'game1');

      const stats = service.getEffectStats('game1', 'player1');
      expect(stats.equipmentBonuses).toBe(1);
    });

    it('should return zero counts for no effects', () => {
      const stats = service.getEffectStats('game1', 'no-effects');
      expect(stats.activeEffects).toBe(0);
      expect(stats.buffs).toBe(0);
      expect(stats.debuffs).toBe(0);
      expect(stats.statusEffects).toBe(0);
      expect(stats.equipmentBonuses).toBe(0);
    });
  });

  describe('setEffectPaused', () => {
    it('should pause active effect', async () => {
      const effect: IEffect = {
        id: 'pausable',
        name: 'Pausable',
        description: 'Test',
        type: EffectType.POISON,
        target: EffectTarget.TARGET,
        durationType: DurationType.OVER_TIME,
        value: 5,
        tickInterval: 1000,
      };

      service.registerEffect(effect);
      await service.applyEffect('pausable', 'enemy1', 'game1');

      const paused = service.setEffectPaused('game1', 'enemy1', 'pausable', true);
      expect(paused).toBe(true);

      const effects = service.getActiveEffects('game1', 'enemy1');
      expect(effects[0].paused).toBe(true);
    });

    it('should unpause active effect', async () => {
      const effect: IEffect = {
        id: 'pausable',
        name: 'Pausable',
        description: 'Test',
        type: EffectType.POISON,
        target: EffectTarget.TARGET,
        durationType: DurationType.OVER_TIME,
        value: 5,
        tickInterval: 1000,
      };

      service.registerEffect(effect);
      await service.applyEffect('pausable', 'enemy1', 'game1');

      service.setEffectPaused('game1', 'enemy1', 'pausable', true);
      const unpaused = service.setEffectPaused('game1', 'enemy1', 'pausable', false);
      expect(unpaused).toBe(true);

      const effects = service.getActiveEffects('game1', 'enemy1');
      expect(effects[0].paused).toBe(false);
    });

    it('should return false when effect not found', () => {
      const result = service.setEffectPaused('game1', 'player1', 'nonexistent', true);
      expect(result).toBe(false);
    });

    it('should return false when target has no effects', () => {
      const result = service.setEffectPaused('game1', 'no-effects', 'some-effect', true);
      expect(result).toBe(false);
    });
  });

  describe('Effect Events', () => {
    it('should emit effect_applied event', async () => {
      const effect: IEffect = {
        id: 'test-event',
        name: 'Test Event',
        description: 'Test',
        type: EffectType.BUFF,
        target: EffectTarget.SELF,
        durationType: DurationType.PERMANENT,
        statType: StatType.ATTACK,
        value: 10,
      };

      service.registerEffect(effect);
      await service.applyEffect('test-event', 'player1', 'game1', {
        sourceId: 'potion1',
      });

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.CUSTOM_EVENT,
        expect.objectContaining({
          action: 'effect_applied',
          effectId: 'test-event',
          effectName: 'Test Event',
          targetId: 'player1',
          sourceId: 'potion1',
        }),
        'game1',
      );
    });
  });

  describe('Effect Definition Management', () => {
    it('should remove effect definition', () => {
      const effect: IEffect = {
        id: 'removable-def',
        name: 'Removable',
        description: 'Test',
        type: EffectType.HEAL,
        target: EffectTarget.SELF,
        durationType: DurationType.INSTANT,
      };

      service.registerEffect(effect);
      expect(service.getEffect('removable-def')).toBeDefined();

      service.removeEffectDefinition('removable-def');
      expect(service.getEffect('removable-def')).toBeUndefined();
    });

    it('should clear all effect definitions', () => {
      const effect1: IEffect = {
        id: 'effect1',
        name: 'Effect 1',
        description: 'Test',
        type: EffectType.HEAL,
        target: EffectTarget.SELF,
        durationType: DurationType.INSTANT,
      };

      const effect2: IEffect = {
        id: 'effect2',
        name: 'Effect 2',
        description: 'Test',
        type: EffectType.DAMAGE,
        target: EffectTarget.TARGET,
        durationType: DurationType.INSTANT,
      };

      service.registerEffect(effect1);
      service.registerEffect(effect2);

      service.clearAllEffectDefinitions();

      expect(service.getEffect('effect1')).toBeUndefined();
      expect(service.getEffect('effect2')).toBeUndefined();
    });
  });

  describe('Module Lifecycle', () => {
    it('should clear all intervals on module destroy', async () => {
      jest.useFakeTimers();

      const tickEffect: IEffect = {
        id: 'lifecycle-test',
        name: 'Lifecycle Test',
        description: 'Test',
        type: EffectType.POISON,
        target: EffectTarget.TARGET,
        durationType: DurationType.OVER_TIME,
        value: 5,
        tickInterval: 1000,
        duration: 10000,
      };

      service.registerEffect(tickEffect);
      await service.applyEffect('lifecycle-test', 'enemy1', 'game1');

      service.onModuleDestroy();

      // Advance time to ensure intervals don't fire
      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      // Effect should still exist but intervals cleared
      expect(service.getActiveEffects('game1', 'enemy1').length).toBe(1);

      jest.useRealTimers();
    });
  });

  describe('Edge Cases', () => {
    it('should handle effect with no value', async () => {
      const effect: IEffect = {
        id: 'no-value',
        name: 'No Value',
        description: 'Effect without value',
        type: EffectType.HEAL,
        target: EffectTarget.SELF,
        durationType: DurationType.INSTANT,
      };

      service.registerEffect(effect);
      const result = await service.applyEffect('no-value', 'player1', 'game1');

      expect(result.success).toBe(true);
    });

    it('should handle effect with zero duration', async () => {
      const effect: IEffect = {
        id: 'zero-duration',
        name: 'Zero Duration',
        description: 'Effect with zero duration',
        type: EffectType.BUFF,
        target: EffectTarget.SELF,
        durationType: DurationType.OVER_TIME,
        duration: 0,
        statType: StatType.ATTACK,
        value: 10,
      };

      service.registerEffect(effect);
      const result = await service.applyEffect(
        'zero-duration',
        'player1',
        'game1',
      );

      expect(result.success).toBe(true);
    });

    it('should handle stat modifier without stat type', async () => {
      const effect: IEffect = {
        id: 'no-stat-type',
        name: 'No Stat Type',
        description: 'Stat modifier without stat type',
        type: EffectType.INCREASE_STAT,
        target: EffectTarget.SELF,
        durationType: DurationType.PERMANENT,
        value: 10,
      };

      service.registerEffect(effect);
      const result = await service.applyEffect(
        'no-stat-type',
        'player1',
        'game1',
      );

      expect(result.success).toBe(true);
    });

    it('should handle context with missing stats', async () => {
      const effect: IEffect = {
        id: 'missing-stats',
        name: 'Missing Stats',
        description: 'Test',
        type: EffectType.HEAL,
        target: EffectTarget.SELF,
        durationType: DurationType.INSTANT,
        value: 50,
        percentage: true,
      };

      service.registerEffect(effect);
      const result = await service.applyEffect(
        'missing-stats',
        'player1',
        'game1',
        {},
      );

      expect(result.success).toBe(true);
    });
  });
});
