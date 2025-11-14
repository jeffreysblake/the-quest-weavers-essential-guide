import { Test, TestingModule } from '@nestjs/testing';
import { TriggerManagerService } from './trigger-manager.service';
import { EventEmitterService } from '../events/event-emitter.service';
import { GameEventType } from '../events/event.interfaces';
import {
  ITrigger,
  ITriggerContext,
  TriggerType,
  ConditionOperator,
  LogicOperator,
  ITriggerAction,
  ITriggerCondition,
  IConditionGroup,
} from './trigger.interfaces';

describe('TriggerManagerService', () => {
  let service: TriggerManagerService;
  let eventEmitter: jest.Mocked<EventEmitterService>;

  beforeEach(async () => {
    const mockEventEmitter = {
      emit: jest.fn().mockResolvedValue(undefined),
      onAny: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TriggerManagerService,
        {
          provide: EventEmitterService,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<TriggerManagerService>(TriggerManagerService);
    eventEmitter = module.get(EventEmitterService) as jest.Mocked<EventEmitterService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
    service.clearAllTriggers();
  });

  describe('registerTrigger', () => {
    it('should register a trigger', () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Test Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        actions: [
          {
            id: 'action1',
            type: 'set_flag',
            flagKey: 'test_flag',
            flagValue: true,
          },
        ],
      };

      service.registerTrigger(trigger);

      const retrieved = service.getTrigger('trigger1');
      expect(retrieved).toEqual(trigger);
    });

    it('should initialize active trigger state', () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Test Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        actions: [],
      };

      service.registerTrigger(trigger);

      const activeTrigger = service.getActiveTrigger('trigger1');
      expect(activeTrigger).toBeDefined();
      expect(activeTrigger?.firedCount).toBe(0);
    });

    it('should setup time-based trigger with interval', () => {
      jest.useFakeTimers();

      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Interval Trigger',
        gameId: 'game1',
        type: TriggerType.TIME,
        enabled: true,
        interval: 1000,
        actions: [],
      };

      service.registerTrigger(trigger);

      expect(eventEmitter.onAny).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should setup time-based trigger with executeAt', () => {
      jest.useFakeTimers();

      const futureTime = new Date(Date.now() + 5000).toISOString();

      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Scheduled Trigger',
        gameId: 'game1',
        type: TriggerType.TIME,
        enabled: true,
        executeAt: futureTime,
        actions: [],
      };

      service.registerTrigger(trigger);

      expect(eventEmitter.onAny).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should not setup time-based trigger if disabled', () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Disabled Time Trigger',
        gameId: 'game1',
        type: TriggerType.TIME,
        enabled: false,
        interval: 1000,
        actions: [],
      };

      service.registerTrigger(trigger);

      // The trigger is registered but not active
      const retrieved = service.getTrigger('trigger1');
      expect(retrieved).toBeDefined();
    });
  });

  describe('checkAndFireTrigger', () => {
    it('should fire trigger when conditions are met', async () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Test Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        actions: [
          {
            id: 'action1',
            type: 'set_flag',
            flagKey: 'triggered',
            flagValue: true,
          },
        ],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      const result = await service.checkAndFireTrigger('trigger1', context);

      expect(result.success).toBe(true);
      expect(result.conditionsMet).toBe(true);
      expect(result.actionsExecuted).toBe(1);
      expect(context.playerFlags.triggered).toBe(true);
    });

    it('should return error for non-existent trigger', async () => {
      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      const result = await service.checkAndFireTrigger('nonexistent', context);

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should return error for disabled trigger', async () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Disabled Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: false,
        actions: [],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      const result = await service.checkAndFireTrigger('trigger1', context);

      expect(result.success).toBe(false);
      expect(result.message).toContain('disabled');
    });

    it('should enforce one-time trigger', async () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'One-time Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        oneTime: true,
        actions: [
          {
            id: 'action1',
            type: 'set_flag',
            flagKey: 'test',
            flagValue: true,
          },
        ],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      const result1 = await service.checkAndFireTrigger('trigger1', context);
      expect(result1.success).toBe(true);

      const result2 = await service.checkAndFireTrigger('trigger1', context);
      expect(result2.success).toBe(false);
      expect(result2.message).toContain('already fired');
    });

    it('should enforce cooldown', async () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Cooldown Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        cooldown: 1000,
        actions: [],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      const result1 = await service.checkAndFireTrigger('trigger1', context);
      expect(result1.success).toBe(true);

      const result2 = await service.checkAndFireTrigger('trigger1', context);
      expect(result2.success).toBe(false);
      expect(result2.message).toContain('cooldown');
    });

    it('should allow firing after cooldown expires', async () => {
      jest.useFakeTimers();

      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Cooldown Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        cooldown: 1000,
        actions: [],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      await service.checkAndFireTrigger('trigger1', context);

      jest.advanceTimersByTime(1001);

      const result = await service.checkAndFireTrigger('trigger1', context);
      expect(result.success).toBe(true);

      jest.useRealTimers();
    });

    it('should not fire when conditions are not met', async () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Conditional Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        conditions: {
          operator: LogicOperator.AND,
          conditions: [
            {
              id: 'cond1',
              type: 'flag',
              key: 'required_flag',
              operator: ConditionOperator.EQUALS,
              value: true,
            },
          ],
        },
        actions: [],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: { required_flag: false },
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      const result = await service.checkAndFireTrigger('trigger1', context);

      expect(result.success).toBe(false);
      expect(result.conditionsMet).toBe(false);
    });

    it('should update fired count', async () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Test Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        actions: [],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      await service.checkAndFireTrigger('trigger1', context);
      await service.checkAndFireTrigger('trigger1', context);

      const activeTrigger = service.getActiveTrigger('trigger1');
      expect(activeTrigger?.firedCount).toBe(2);
    });

    it('should emit trigger fired event', async () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Test Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        actions: [],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      eventEmitter.emit.mockClear();

      await service.checkAndFireTrigger('trigger1', context);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.CUSTOM_EVENT,
        expect.objectContaining({
          action: 'trigger_fired',
          triggerId: 'trigger1',
        }),
        'game1',
      );
    });
  });

  describe('condition evaluation - flag conditions', () => {
    it('should evaluate flag equals condition', async () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Flag Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        conditions: {
          operator: LogicOperator.AND,
          conditions: [
            {
              id: 'cond1',
              type: 'flag',
              key: 'test_flag',
              operator: ConditionOperator.EQUALS,
              value: true,
            },
          ],
        },
        actions: [],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: { test_flag: true },
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      const result = await service.checkAndFireTrigger('trigger1', context);

      expect(result.conditionsMet).toBe(true);
    });

    it('should evaluate flag not_equals condition', async () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Flag Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        conditions: {
          operator: LogicOperator.AND,
          conditions: [
            {
              id: 'cond1',
              type: 'flag',
              key: 'test_flag',
              operator: ConditionOperator.NOT_EQUALS,
              value: true,
            },
          ],
        },
        actions: [],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: { test_flag: false },
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      const result = await service.checkAndFireTrigger('trigger1', context);

      expect(result.conditionsMet).toBe(true);
    });

    it('should evaluate flag exists condition', async () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Flag Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        conditions: {
          operator: LogicOperator.AND,
          conditions: [
            {
              id: 'cond1',
              type: 'flag',
              key: 'test_flag',
              operator: ConditionOperator.EXISTS,
            },
          ],
        },
        actions: [],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: { test_flag: true },
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      const result = await service.checkAndFireTrigger('trigger1', context);

      expect(result.conditionsMet).toBe(true);
    });
  });

  describe('condition evaluation - variable conditions', () => {
    it('should evaluate variable equals condition', async () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Variable Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        conditions: {
          operator: LogicOperator.AND,
          conditions: [
            {
              id: 'cond1',
              type: 'variable',
              key: 'score',
              operator: ConditionOperator.EQUALS,
              value: 100,
            },
          ],
        },
        actions: [],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: {},
        playerVariables: { score: 100 },
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      const result = await service.checkAndFireTrigger('trigger1', context);

      expect(result.conditionsMet).toBe(true);
    });

    it('should evaluate variable greater condition', async () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Variable Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        conditions: {
          operator: LogicOperator.AND,
          conditions: [
            {
              id: 'cond1',
              type: 'variable',
              key: 'score',
              operator: ConditionOperator.GREATER,
              value: 50,
            },
          ],
        },
        actions: [],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: {},
        playerVariables: { score: 100 },
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      const result = await service.checkAndFireTrigger('trigger1', context);

      expect(result.conditionsMet).toBe(true);
    });

    it('should evaluate variable greater_equal condition', async () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Variable Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        conditions: {
          operator: LogicOperator.AND,
          conditions: [
            {
              id: 'cond1',
              type: 'variable',
              key: 'score',
              operator: ConditionOperator.GREATER_EQUAL,
              value: 100,
            },
          ],
        },
        actions: [],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: {},
        playerVariables: { score: 100 },
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      const result = await service.checkAndFireTrigger('trigger1', context);

      expect(result.conditionsMet).toBe(true);
    });

    it('should evaluate variable less condition', async () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Variable Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        conditions: {
          operator: LogicOperator.AND,
          conditions: [
            {
              id: 'cond1',
              type: 'variable',
              key: 'score',
              operator: ConditionOperator.LESS,
              value: 200,
            },
          ],
        },
        actions: [],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: {},
        playerVariables: { score: 100 },
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      const result = await service.checkAndFireTrigger('trigger1', context);

      expect(result.conditionsMet).toBe(true);
    });

    it('should evaluate variable less_equal condition', async () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Variable Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        conditions: {
          operator: LogicOperator.AND,
          conditions: [
            {
              id: 'cond1',
              type: 'variable',
              key: 'score',
              operator: ConditionOperator.LESS_EQUAL,
              value: 100,
            },
          ],
        },
        actions: [],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: {},
        playerVariables: { score: 100 },
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      const result = await service.checkAndFireTrigger('trigger1', context);

      expect(result.conditionsMet).toBe(true);
    });
  });

  describe('condition evaluation - other conditions', () => {
    it('should evaluate item condition', async () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Item Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        conditions: {
          operator: LogicOperator.AND,
          conditions: [
            {
              id: 'cond1',
              type: 'item',
              key: 'magic_sword',
            },
          ],
        },
        actions: [],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: ['magic_sword', 'potion'],
        completedQuests: [],
        worldState: {},
      };

      const result = await service.checkAndFireTrigger('trigger1', context);

      expect(result.conditionsMet).toBe(true);
    });

    it('should evaluate location condition', async () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Location Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        conditions: {
          operator: LogicOperator.AND,
          conditions: [
            {
              id: 'cond1',
              type: 'location',
              locationId: 'tavern',
            },
          ],
        },
        actions: [],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        currentRoomId: 'tavern',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      const result = await service.checkAndFireTrigger('trigger1', context);

      expect(result.conditionsMet).toBe(true);
    });

    it('should evaluate quest condition', async () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Quest Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        conditions: {
          operator: LogicOperator.AND,
          conditions: [
            {
              id: 'cond1',
              type: 'quest',
              key: 'intro_quest',
            },
          ],
        },
        actions: [],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: ['intro_quest'],
        worldState: {},
      };

      const result = await service.checkAndFireTrigger('trigger1', context);

      expect(result.conditionsMet).toBe(true);
    });

    it('should evaluate custom condition', async () => {
      const customCheck = jest.fn().mockResolvedValue(true);

      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Custom Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        conditions: {
          operator: LogicOperator.AND,
          conditions: [
            {
              id: 'cond1',
              type: 'custom',
              customCheck,
            },
          ],
        },
        actions: [],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      const result = await service.checkAndFireTrigger('trigger1', context);

      expect(result.conditionsMet).toBe(true);
      expect(customCheck).toHaveBeenCalledWith(context);
    });
  });

  describe('condition evaluation - logic operators', () => {
    it('should evaluate AND operator (all conditions true)', async () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'AND Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        conditions: {
          operator: LogicOperator.AND,
          conditions: [
            {
              id: 'cond1',
              type: 'flag',
              key: 'flag1',
              operator: ConditionOperator.EQUALS,
              value: true,
            },
            {
              id: 'cond2',
              type: 'flag',
              key: 'flag2',
              operator: ConditionOperator.EQUALS,
              value: true,
            },
          ],
        },
        actions: [],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: { flag1: true, flag2: true },
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      const result = await service.checkAndFireTrigger('trigger1', context);

      expect(result.conditionsMet).toBe(true);
    });

    it('should evaluate AND operator (one condition false)', async () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'AND Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        conditions: {
          operator: LogicOperator.AND,
          conditions: [
            {
              id: 'cond1',
              type: 'flag',
              key: 'flag1',
              operator: ConditionOperator.EQUALS,
              value: true,
            },
            {
              id: 'cond2',
              type: 'flag',
              key: 'flag2',
              operator: ConditionOperator.EQUALS,
              value: true,
            },
          ],
        },
        actions: [],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: { flag1: true, flag2: false },
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      const result = await service.checkAndFireTrigger('trigger1', context);

      expect(result.conditionsMet).toBe(false);
    });

    it('should evaluate OR operator (one condition true)', async () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'OR Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        conditions: {
          operator: LogicOperator.OR,
          conditions: [
            {
              id: 'cond1',
              type: 'flag',
              key: 'flag1',
              operator: ConditionOperator.EQUALS,
              value: true,
            },
            {
              id: 'cond2',
              type: 'flag',
              key: 'flag2',
              operator: ConditionOperator.EQUALS,
              value: true,
            },
          ],
        },
        actions: [],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: { flag1: true, flag2: false },
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      const result = await service.checkAndFireTrigger('trigger1', context);

      expect(result.conditionsMet).toBe(true);
    });

    it('should evaluate OR operator (all conditions false)', async () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'OR Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        conditions: {
          operator: LogicOperator.OR,
          conditions: [
            {
              id: 'cond1',
              type: 'flag',
              key: 'flag1',
              operator: ConditionOperator.EQUALS,
              value: true,
            },
            {
              id: 'cond2',
              type: 'flag',
              key: 'flag2',
              operator: ConditionOperator.EQUALS,
              value: true,
            },
          ],
        },
        actions: [],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: { flag1: false, flag2: false },
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      const result = await service.checkAndFireTrigger('trigger1', context);

      expect(result.conditionsMet).toBe(false);
    });

    it('should evaluate NOT operator', async () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'NOT Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        conditions: {
          operator: LogicOperator.NOT,
          conditions: [
            {
              id: 'cond1',
              type: 'flag',
              key: 'flag1',
              operator: ConditionOperator.EQUALS,
              value: true,
            },
          ],
        },
        actions: [],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: { flag1: false },
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      const result = await service.checkAndFireTrigger('trigger1', context);

      expect(result.conditionsMet).toBe(true);
    });

    it('should evaluate nested condition groups', async () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Nested Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        conditions: {
          operator: LogicOperator.AND,
          conditions: [
            {
              id: 'cond1',
              type: 'flag',
              key: 'flag1',
              operator: ConditionOperator.EQUALS,
              value: true,
            },
            {
              operator: LogicOperator.OR,
              conditions: [
                {
                  id: 'cond2',
                  type: 'flag',
                  key: 'flag2',
                  operator: ConditionOperator.EQUALS,
                  value: true,
                },
                {
                  id: 'cond3',
                  type: 'flag',
                  key: 'flag3',
                  operator: ConditionOperator.EQUALS,
                  value: true,
                },
              ],
            },
          ],
        },
        actions: [],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: { flag1: true, flag2: false, flag3: true },
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      const result = await service.checkAndFireTrigger('trigger1', context);

      expect(result.conditionsMet).toBe(true);
    });
  });

  describe('action execution', () => {
    it('should execute set_flag action', async () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Flag Action Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        actions: [
          {
            id: 'action1',
            type: 'set_flag',
            flagKey: 'test_flag',
            flagValue: true,
          },
        ],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      await service.checkAndFireTrigger('trigger1', context);

      expect(context.playerFlags.test_flag).toBe(true);
    });

    it('should execute set_variable action', async () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Variable Action Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        actions: [
          {
            id: 'action1',
            type: 'set_variable',
            variableKey: 'score',
            variableValue: 100,
          },
        ],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      await service.checkAndFireTrigger('trigger1', context);

      expect(context.playerVariables.score).toBe(100);
    });

    it('should execute give_item action', async () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Give Item Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        actions: [
          {
            id: 'action1',
            type: 'give_item',
            itemId: 'magic_sword',
          },
        ],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      await service.checkAndFireTrigger('trigger1', context);

      expect(context.playerInventory).toContain('magic_sword');
    });

    it('should execute remove_item action', async () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Remove Item Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        actions: [
          {
            id: 'action1',
            type: 'remove_item',
            itemId: 'old_key',
          },
        ],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: ['old_key', 'potion'],
        completedQuests: [],
        worldState: {},
      };

      await service.checkAndFireTrigger('trigger1', context);

      expect(context.playerInventory).not.toContain('old_key');
      expect(context.playerInventory).toContain('potion');
    });

    it('should execute emit_event action', async () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Emit Event Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        actions: [
          {
            id: 'action1',
            type: 'emit_event',
            eventType: GameEventType.CUSTOM_EVENT,
            eventData: { message: 'test' },
          },
        ],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      eventEmitter.emit.mockClear();

      await service.checkAndFireTrigger('trigger1', context);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.CUSTOM_EVENT,
        { message: 'test' },
        'game1',
      );
    });

    it('should execute custom action', async () => {
      const customAction = jest.fn();

      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Custom Action Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        actions: [
          {
            id: 'action1',
            type: 'custom',
            customAction,
          },
        ],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      await service.checkAndFireTrigger('trigger1', context);

      expect(customAction).toHaveBeenCalledWith(context);
    });

    it('should execute multiple actions in order', async () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Multiple Actions Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        actions: [
          {
            id: 'action1',
            type: 'set_flag',
            flagKey: 'flag1',
            flagValue: true,
          },
          {
            id: 'action2',
            type: 'set_variable',
            variableKey: 'var1',
            variableValue: 100,
          },
          {
            id: 'action3',
            type: 'give_item',
            itemId: 'sword',
          },
        ],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      const result = await service.checkAndFireTrigger('trigger1', context);

      expect(result.actionsExecuted).toBe(3);
      expect(context.playerFlags.flag1).toBe(true);
      expect(context.playerVariables.var1).toBe(100);
      expect(context.playerInventory).toContain('sword');
    });

    it('should handle action execution errors gracefully', async () => {
      const errorAction = jest.fn().mockRejectedValue(new Error('Action failed'));

      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Error Action Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        actions: [
          {
            id: 'action1',
            type: 'custom',
            customAction: errorAction,
          },
        ],
      };

      service.registerTrigger(trigger);

      const context: ITriggerContext = {
        gameId: 'game1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
        worldState: {},
      };

      const result = await service.checkAndFireTrigger('trigger1', context);

      expect(result.success).toBe(true);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
    });
  });

  describe('setTriggerEnabled', () => {
    it('should enable a trigger', () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Test Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: false,
        actions: [],
      };

      service.registerTrigger(trigger);
      service.setTriggerEnabled('trigger1', true);

      const retrieved = service.getTrigger('trigger1');
      expect(retrieved?.enabled).toBe(true);
    });

    it('should disable a trigger', () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Test Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        actions: [],
      };

      service.registerTrigger(trigger);
      service.setTriggerEnabled('trigger1', false);

      const retrieved = service.getTrigger('trigger1');
      expect(retrieved?.enabled).toBe(false);
    });

    it('should setup time trigger when enabling', () => {
      jest.useFakeTimers();

      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Time Trigger',
        gameId: 'game1',
        type: TriggerType.TIME,
        enabled: false,
        interval: 1000,
        actions: [],
      };

      service.registerTrigger(trigger);
      service.setTriggerEnabled('trigger1', true);

      const retrieved = service.getTrigger('trigger1');
      expect(retrieved?.enabled).toBe(true);

      jest.useRealTimers();
    });

    it('should clear time trigger when disabling', () => {
      jest.useFakeTimers();

      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Time Trigger',
        gameId: 'game1',
        type: TriggerType.TIME,
        enabled: true,
        interval: 1000,
        actions: [],
      };

      service.registerTrigger(trigger);
      service.setTriggerEnabled('trigger1', false);

      const retrieved = service.getTrigger('trigger1');
      expect(retrieved?.enabled).toBe(false);

      jest.useRealTimers();
    });
  });

  describe('getTrigger', () => {
    it('should return trigger', () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Test Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        actions: [],
      };

      service.registerTrigger(trigger);

      const retrieved = service.getTrigger('trigger1');
      expect(retrieved).toEqual(trigger);
    });

    it('should return undefined for non-existent trigger', () => {
      const retrieved = service.getTrigger('nonexistent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('getActiveTrigger', () => {
    it('should return active trigger state', () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Test Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        actions: [],
      };

      service.registerTrigger(trigger);

      const activeTrigger = service.getActiveTrigger('trigger1');
      expect(activeTrigger).toBeDefined();
      expect(activeTrigger?.triggerId).toBe('trigger1');
    });

    it('should return undefined for non-existent trigger', () => {
      const activeTrigger = service.getActiveTrigger('nonexistent');
      expect(activeTrigger).toBeUndefined();
    });
  });

  describe('getGameTriggers', () => {
    it('should return all triggers for a game', () => {
      const trigger1: ITrigger = {
        id: 'trigger1',
        name: 'Trigger 1',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        actions: [],
      };

      const trigger2: ITrigger = {
        id: 'trigger2',
        name: 'Trigger 2',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        actions: [],
      };

      const trigger3: ITrigger = {
        id: 'trigger3',
        name: 'Trigger 3',
        gameId: 'game2',
        type: TriggerType.EVENT,
        enabled: true,
        actions: [],
      };

      service.registerTrigger(trigger1);
      service.registerTrigger(trigger2);
      service.registerTrigger(trigger3);

      const game1Triggers = service.getGameTriggers('game1');

      expect(game1Triggers.length).toBe(2);
      expect(game1Triggers.every((t) => t.gameId === 'game1')).toBe(true);
    });

    it('should return empty array for game with no triggers', () => {
      const triggers = service.getGameTriggers('game1');
      expect(triggers).toEqual([]);
    });
  });

  describe('removeTrigger', () => {
    it('should remove a trigger', () => {
      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Test Trigger',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        actions: [],
      };

      service.registerTrigger(trigger);
      service.removeTrigger('trigger1');

      const retrieved = service.getTrigger('trigger1');
      expect(retrieved).toBeUndefined();
    });

    it('should clear time trigger when removing', () => {
      jest.useFakeTimers();

      const trigger: ITrigger = {
        id: 'trigger1',
        name: 'Time Trigger',
        gameId: 'game1',
        type: TriggerType.TIME,
        enabled: true,
        interval: 1000,
        actions: [],
      };

      service.registerTrigger(trigger);
      service.removeTrigger('trigger1');

      const retrieved = service.getTrigger('trigger1');
      expect(retrieved).toBeUndefined();

      jest.useRealTimers();
    });
  });

  describe('clearAllTriggers', () => {
    it('should clear all triggers', () => {
      const trigger1: ITrigger = {
        id: 'trigger1',
        name: 'Trigger 1',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        actions: [],
      };

      const trigger2: ITrigger = {
        id: 'trigger2',
        name: 'Trigger 2',
        gameId: 'game1',
        type: TriggerType.EVENT,
        enabled: true,
        actions: [],
      };

      service.registerTrigger(trigger1);
      service.registerTrigger(trigger2);

      service.clearAllTriggers();

      expect(service.getTrigger('trigger1')).toBeUndefined();
      expect(service.getTrigger('trigger2')).toBeUndefined();
    });

    it('should clear all time triggers', () => {
      jest.useFakeTimers();

      const trigger1: ITrigger = {
        id: 'trigger1',
        name: 'Time Trigger 1',
        gameId: 'game1',
        type: TriggerType.TIME,
        enabled: true,
        interval: 1000,
        actions: [],
      };

      const trigger2: ITrigger = {
        id: 'trigger2',
        name: 'Time Trigger 2',
        gameId: 'game1',
        type: TriggerType.TIME,
        enabled: true,
        interval: 2000,
        actions: [],
      };

      service.registerTrigger(trigger1);
      service.registerTrigger(trigger2);

      service.clearAllTriggers();

      expect(service.getTrigger('trigger1')).toBeUndefined();
      expect(service.getTrigger('trigger2')).toBeUndefined();

      jest.useRealTimers();
    });
  });
});
