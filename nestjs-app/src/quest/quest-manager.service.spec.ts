import { Test, TestingModule } from '@nestjs/testing';
import { QuestManagerService } from './quest-manager.service';
import { EventEmitterService } from '../events/event-emitter.service';
import { GameEventType } from '../events/event.interfaces';
import {
  IQuest,
  IQuestContext,
  QuestState,
  ObjectiveType,
  IQuestObjective,
  IQuestReward,
  IQuestPrerequisite,
  IObjectiveCondition,
} from './quest.interfaces';

describe('QuestManagerService', () => {
  let service: QuestManagerService;
  let eventEmitter: jest.Mocked<EventEmitterService>;

  beforeEach(async () => {
    const mockEventEmitter = {
      emit: jest.fn().mockResolvedValue(undefined),
      onAny: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuestManagerService,
        {
          provide: EventEmitterService,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<QuestManagerService>(QuestManagerService);
    eventEmitter = module.get(EventEmitterService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registerQuest', () => {
    it('should register a quest definition', () => {
      const quest: IQuest = {
        id: 'quest1',
        name: 'Test Quest',
        description: 'A test quest',
        gameId: 'game1',
        objectives: [
          {
            id: 'obj1',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect 5 apples',
            targetId: 'apple',
            targetCount: 5,
            currentCount: 0,
            completed: false,
          },
        ],
      };

      service.registerQuest(quest);

      const retrieved = service.getQuest('quest1');
      expect(retrieved).toEqual(quest);
    });

    it('should register multiple quests', () => {
      const quest1: IQuest = {
        id: 'quest1',
        name: 'Quest 1',
        description: 'First quest',
        gameId: 'game1',
        objectives: [],
      };

      const quest2: IQuest = {
        id: 'quest2',
        name: 'Quest 2',
        description: 'Second quest',
        gameId: 'game1',
        objectives: [],
      };

      service.registerQuest(quest1);
      service.registerQuest(quest2);

      expect(service.getQuest('quest1')).toEqual(quest1);
      expect(service.getQuest('quest2')).toEqual(quest2);
    });

    it('should overwrite existing quest with same id', () => {
      const quest1: IQuest = {
        id: 'quest1',
        name: 'Original',
        description: 'Original',
        gameId: 'game1',
        objectives: [],
      };

      const quest2: IQuest = {
        id: 'quest1',
        name: 'Updated',
        description: 'Updated',
        gameId: 'game1',
        objectives: [],
      };

      service.registerQuest(quest1);
      service.registerQuest(quest2);

      const retrieved = service.getQuest('quest1');
      expect(retrieved?.name).toBe('Updated');
    });
  });

  describe('startQuest', () => {
    it('should start a quest for a player', async () => {
      const quest: IQuest = {
        id: 'quest1',
        name: 'Test Quest',
        description: 'A test quest',
        gameId: 'game1',
        objectives: [
          {
            id: 'obj1',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect 5 apples',
            targetCount: 5,
            completed: false,
          },
        ],
      };

      service.registerQuest(quest);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      const result = await service.startQuest('quest1', 'player1', context);

      expect(result.success).toBe(true);
      expect(result.message).toContain('started');
      expect(result.quest).toBeDefined();
      expect(result.quest?.state).toBe(QuestState.ACTIVE);
      expect(result.quest?.playerId).toBe('player1');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.CUSTOM_EVENT,
        expect.objectContaining({
          action: 'quest_started',
          questId: 'quest1',
          playerId: 'player1',
        }),
        'game1',
      );
    });

    it('should return error for non-existent quest', async () => {
      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      const result = await service.startQuest(
        'nonexistent',
        'player1',
        context,
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should prevent starting already active quest', async () => {
      const quest: IQuest = {
        id: 'quest1',
        name: 'Test Quest',
        description: 'A test quest',
        gameId: 'game1',
        objectives: [],
      };

      service.registerQuest(quest);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await service.startQuest('quest1', 'player1', context);
      const result = await service.startQuest('quest1', 'player1', context);

      expect(result.success).toBe(false);
      expect(result.message).toContain('already');
    });

    it('should check level prerequisite', async () => {
      const quest: IQuest = {
        id: 'quest1',
        name: 'Test Quest',
        description: 'A test quest',
        gameId: 'game1',
        objectives: [],
        prerequisites: [
          {
            type: 'level',
            requiredLevel: 10,
          },
        ],
      };

      service.registerQuest(quest);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerLevel: 5,
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      const result = await service.startQuest('quest1', 'player1', context);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Prerequisites not met');
      expect(result.prerequisitesFailed).toContain('Level 10 required');
    });

    it('should allow quest start when level prerequisite is met', async () => {
      const quest: IQuest = {
        id: 'quest1',
        name: 'Test Quest',
        description: 'A test quest',
        gameId: 'game1',
        objectives: [],
        prerequisites: [
          {
            type: 'level',
            requiredLevel: 10,
          },
        ],
      };

      service.registerQuest(quest);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerLevel: 15,
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      const result = await service.startQuest('quest1', 'player1', context);

      expect(result.success).toBe(true);
    });

    it('should check quest prerequisite', async () => {
      const quest: IQuest = {
        id: 'quest2',
        name: 'Quest 2',
        description: 'Second quest',
        gameId: 'game1',
        objectives: [],
        prerequisites: [
          {
            type: 'quest',
            questId: 'quest1',
          },
        ],
      };

      service.registerQuest(quest);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      const result = await service.startQuest('quest2', 'player1', context);

      expect(result.success).toBe(false);
      expect(result.prerequisitesFailed).toContain(
        'Quest quest1 must be completed',
      );
    });

    it('should allow quest start when quest prerequisite is met', async () => {
      const quest: IQuest = {
        id: 'quest2',
        name: 'Quest 2',
        description: 'Second quest',
        gameId: 'game1',
        objectives: [],
        prerequisites: [
          {
            type: 'quest',
            questId: 'quest1',
          },
        ],
      };

      service.registerQuest(quest);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: ['quest1'],
      };

      const result = await service.startQuest('quest2', 'player1', context);

      expect(result.success).toBe(true);
    });

    it('should check flag prerequisite', async () => {
      const quest: IQuest = {
        id: 'quest1',
        name: 'Test Quest',
        description: 'A test quest',
        gameId: 'game1',
        objectives: [],
        prerequisites: [
          {
            type: 'flag',
            flagKey: 'has_key',
            flagValue: true,
          },
        ],
      };

      service.registerQuest(quest);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: { has_key: false },
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      const result = await service.startQuest('quest1', 'player1', context);

      expect(result.success).toBe(false);
    });

    it('should check item prerequisite', async () => {
      const quest: IQuest = {
        id: 'quest1',
        name: 'Test Quest',
        description: 'A test quest',
        gameId: 'game1',
        objectives: [],
        prerequisites: [
          {
            type: 'item',
            itemId: 'magic_sword',
          },
        ],
      };

      service.registerQuest(quest);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      const result = await service.startQuest('quest1', 'player1', context);

      expect(result.success).toBe(false);
    });

    it('should check custom prerequisite', async () => {
      const quest: IQuest = {
        id: 'quest1',
        name: 'Test Quest',
        description: 'A test quest',
        gameId: 'game1',
        objectives: [],
        prerequisites: [
          {
            type: 'custom',
            customCheck: async (context) =>
              context.playerId === 'special_player',
          },
        ],
      };

      service.registerQuest(quest);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      const result = await service.startQuest('quest1', 'player1', context);

      expect(result.success).toBe(false);
    });

    it('should check multiple prerequisites', async () => {
      const quest: IQuest = {
        id: 'quest1',
        name: 'Test Quest',
        description: 'A test quest',
        gameId: 'game1',
        objectives: [],
        prerequisites: [
          {
            type: 'level',
            requiredLevel: 10,
          },
          {
            type: 'quest',
            questId: 'intro_quest',
          },
        ],
      };

      service.registerQuest(quest);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerLevel: 5,
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      const result = await service.startQuest('quest1', 'player1', context);

      expect(result.success).toBe(false);
      expect(result.prerequisitesFailed?.length).toBe(2);
    });

    it('should set time limit expiration when timeLimit is specified', async () => {
      const quest: IQuest = {
        id: 'quest1',
        name: 'Timed Quest',
        description: 'Complete within time limit',
        gameId: 'game1',
        objectives: [],
        timeLimit: 3600, // 1 hour
      };

      service.registerQuest(quest);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      const result = await service.startQuest('quest1', 'player1', context);

      expect(result.success).toBe(true);
      expect(result.quest?.timeLimitExpiresAt).toBeDefined();
    });
  });

  describe('updateObjective', () => {
    beforeEach(async () => {
      const quest: IQuest = {
        id: 'quest1',
        name: 'Test Quest',
        description: 'A test quest',
        gameId: 'game1',
        objectives: [
          {
            id: 'obj1',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect 5 apples',
            targetCount: 5,
            currentCount: 0,
            completed: false,
          },
        ],
      };

      service.registerQuest(quest);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await service.startQuest('quest1', 'player1', context);
    });

    it('should update objective progress', async () => {
      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      const result = await service.updateObjective(
        'player1',
        'quest1',
        'obj1',
        1,
        context,
      );

      expect(result.success).toBe(true);
      expect(result.objectiveCompleted).toBe(false);

      const playerQuest = service.getPlayerQuest('player1', 'quest1');
      expect(playerQuest?.objectives[0].currentCount).toBe(1);
    });

    it('should complete objective when target is reached', async () => {
      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      const result = await service.updateObjective(
        'player1',
        'quest1',
        'obj1',
        5,
        context,
      );

      expect(result.success).toBe(true);
      // When quest auto-completes, result comes from completeQuest() which has questCompleted but not objectiveCompleted
      expect(result.questCompleted).toBe(true);

      const playerQuest = service.getPlayerQuest('player1', 'quest1');
      expect(playerQuest?.objectives[0].completed).toBe(true);
      expect(playerQuest?.state).toBe(QuestState.COMPLETED);
    });

    it('should not exceed target count', async () => {
      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await service.updateObjective('player1', 'quest1', 'obj1', 10, context);

      const playerQuest = service.getPlayerQuest('player1', 'quest1');
      expect(playerQuest?.objectives[0].currentCount).toBe(5);
    });

    it('should return error for non-existent quest', async () => {
      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      const result = await service.updateObjective(
        'player1',
        'nonexistent',
        'obj1',
        1,
        context,
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should return error for non-existent objective', async () => {
      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      const result = await service.updateObjective(
        'player1',
        'quest1',
        'nonexistent',
        1,
        context,
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should return error when updating already completed objective', async () => {
      // Register a quest with multiple objectives so completing one doesn't complete the quest
      const multiObjectiveQuest: IQuest = {
        id: 'multi-quest',
        gameId: 'game1',
        name: 'Multi Objective Quest',
        description: 'A quest with multiple objectives',
        objectives: [
          {
            id: 'obj1',
            description: 'Collect 5 items',
            type: ObjectiveType.COLLECT,
            targetCount: 5,
            currentCount: 0,
            completed: false,
          },
          {
            id: 'obj2',
            description: 'Defeat 3 enemies',
            type: ObjectiveType.KILL,
            targetCount: 3,
            currentCount: 0,
            completed: false,
          },
        ],
      };

      service.registerQuest(multiObjectiveQuest);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player2',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await service.startQuest('multi-quest', 'player2', context);
      await service.updateObjective(
        'player2',
        'multi-quest',
        'obj1',
        5,
        context,
      );

      // Clear the mock to check only the next call
      eventEmitter.emit.mockClear();

      const result = await service.updateObjective(
        'player2',
        'multi-quest',
        'obj1',
        1,
        context,
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('already completed');
    });

    it('should emit event when objective is completed', async () => {
      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      eventEmitter.emit.mockClear();

      await service.updateObjective('player1', 'quest1', 'obj1', 5, context);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.CUSTOM_EVENT,
        expect.objectContaining({
          action: 'quest_objective_completed',
          questId: 'quest1',
          objectiveId: 'obj1',
        }),
        'game1',
      );
    });

    it('should auto-complete quest when all required objectives are done', async () => {
      const quest: IQuest = {
        id: 'quest2',
        name: 'Multi-objective Quest',
        description: 'Quest with multiple objectives',
        gameId: 'game1',
        objectives: [
          {
            id: 'obj1',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect apples',
            targetCount: 5,
            completed: false,
          },
          {
            id: 'obj2',
            type: ObjectiveType.TALK_TO_NPC,
            description: 'Talk to NPC',
            targetCount: 1,
            completed: false,
          },
        ],
      };

      service.registerQuest(quest);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player2',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await service.startQuest('quest2', 'player2', context);

      await service.updateObjective('player2', 'quest2', 'obj1', 5, context);
      const result = await service.updateObjective(
        'player2',
        'quest2',
        'obj2',
        1,
        context,
      );

      expect(result.questCompleted).toBe(true);
    });

    it('should not auto-complete quest when optional objectives remain', async () => {
      const quest: IQuest = {
        id: 'quest3',
        name: 'Quest with optional objectives',
        description: 'Quest with optional objectives',
        gameId: 'game1',
        objectives: [
          {
            id: 'obj1',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Required objective',
            targetCount: 1,
            completed: false,
          },
          {
            id: 'obj2',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Optional objective',
            targetCount: 1,
            completed: false,
            optional: true,
          },
        ],
      };

      service.registerQuest(quest);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player3',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await service.startQuest('quest3', 'player3', context);

      const result = await service.updateObjective(
        'player3',
        'quest3',
        'obj1',
        1,
        context,
      );

      expect(result.questCompleted).toBe(true);
    });

    it('should return error when quest is not active', async () => {
      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      // Complete the quest first
      await service.updateObjective('player1', 'quest1', 'obj1', 5, context);

      // Try to update again
      const result = await service.updateObjective(
        'player1',
        'quest1',
        'obj1',
        1,
        context,
      );

      expect(result.success).toBe(false);
    });
  });

  describe('completeQuest', () => {
    it('should grant item rewards', async () => {
      const quest: IQuest = {
        id: 'quest1',
        name: 'Test Quest',
        description: 'A test quest',
        gameId: 'game1',
        objectives: [
          {
            id: 'obj1',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect 1 apple',
            targetCount: 1,
            completed: false,
          },
        ],
        rewards: [
          {
            type: 'item',
            itemId: 'gold_coin',
            itemCount: 10,
          },
        ],
      };

      service.registerQuest(quest);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await service.startQuest('quest1', 'player1', context);
      await service.updateObjective('player1', 'quest1', 'obj1', 1, context);

      expect(context.playerInventory.length).toBe(10);
      expect(
        context.playerInventory.filter((item) => item === 'gold_coin').length,
      ).toBe(10);
    });

    it('should grant flag rewards', async () => {
      const quest: IQuest = {
        id: 'quest1',
        name: 'Test Quest',
        description: 'A test quest',
        gameId: 'game1',
        objectives: [
          {
            id: 'obj1',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Complete objective',
            targetCount: 1,
            completed: false,
          },
        ],
        rewards: [
          {
            type: 'flag',
            flagKey: 'quest_completed',
            flagValue: true,
          },
        ],
      };

      service.registerQuest(quest);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await service.startQuest('quest1', 'player1', context);
      await service.updateObjective('player1', 'quest1', 'obj1', 1, context);

      expect(context.playerFlags.quest_completed).toBe(true);
    });

    it('should grant variable rewards', async () => {
      const quest: IQuest = {
        id: 'quest1',
        name: 'Test Quest',
        description: 'A test quest',
        gameId: 'game1',
        objectives: [
          {
            id: 'obj1',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Complete objective',
            targetCount: 1,
            completed: false,
          },
        ],
        rewards: [
          {
            type: 'variable',
            variableKey: 'reputation',
            variableValue: 100,
          },
        ],
      };

      service.registerQuest(quest);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await service.startQuest('quest1', 'player1', context);
      await service.updateObjective('player1', 'quest1', 'obj1', 1, context);

      expect(context.playerVariables.reputation).toBe(100);
    });

    it('should execute custom rewards', async () => {
      const customReward = jest.fn();
      const quest: IQuest = {
        id: 'quest1',
        name: 'Test Quest',
        description: 'A test quest',
        gameId: 'game1',
        objectives: [
          {
            id: 'obj1',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Complete objective',
            targetCount: 1,
            completed: false,
          },
        ],
        rewards: [
          {
            type: 'custom',
            customReward,
          },
        ],
      };

      service.registerQuest(quest);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await service.startQuest('quest1', 'player1', context);
      await service.updateObjective('player1', 'quest1', 'obj1', 1, context);

      expect(customReward).toHaveBeenCalledWith(context);
    });

    it('should emit quest completed event', async () => {
      const quest: IQuest = {
        id: 'quest1',
        name: 'Test Quest',
        description: 'A test quest',
        gameId: 'game1',
        objectives: [
          {
            id: 'obj1',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Complete objective',
            targetCount: 1,
            completed: false,
          },
        ],
      };

      service.registerQuest(quest);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await service.startQuest('quest1', 'player1', context);

      eventEmitter.emit.mockClear();

      await service.updateObjective('player1', 'quest1', 'obj1', 1, context);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.CUSTOM_EVENT,
        expect.objectContaining({
          action: 'quest_completed',
          questId: 'quest1',
        }),
        'game1',
      );
    });

    it('should auto-start next quest in chain when configured', async () => {
      const quest1: IQuest = {
        id: 'quest1',
        name: 'Quest 1',
        description: 'First quest',
        gameId: 'game1',
        objectives: [
          {
            id: 'obj1',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Complete objective',
            targetCount: 1,
            completed: false,
          },
        ],
        nextQuestId: 'quest2',
      };

      const quest2: IQuest = {
        id: 'quest2',
        name: 'Quest 2',
        description: 'Second quest',
        gameId: 'game1',
        objectives: [],
        autoStart: true,
      };

      service.registerQuest(quest1);
      service.registerQuest(quest2);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await service.startQuest('quest1', 'player1', context);
      const result = await service.updateObjective(
        'player1',
        'quest1',
        'obj1',
        1,
        context,
      );

      expect(result.nextQuestUnlocked).toBe('quest2');

      const quest2State = service.getPlayerQuest('player1', 'quest2');
      expect(quest2State?.state).toBe(QuestState.ACTIVE);
    });

    it('should not auto-start next quest if autoStart is false', async () => {
      const quest1: IQuest = {
        id: 'quest1',
        name: 'Quest 1',
        description: 'First quest',
        gameId: 'game1',
        objectives: [
          {
            id: 'obj1',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Complete objective',
            targetCount: 1,
            completed: false,
          },
        ],
        nextQuestId: 'quest2',
      };

      const quest2: IQuest = {
        id: 'quest2',
        name: 'Quest 2',
        description: 'Second quest',
        gameId: 'game1',
        objectives: [],
        autoStart: false,
      };

      service.registerQuest(quest1);
      service.registerQuest(quest2);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await service.startQuest('quest1', 'player1', context);
      const result = await service.updateObjective(
        'player1',
        'quest1',
        'obj1',
        1,
        context,
      );

      expect(result.nextQuestUnlocked).toBeUndefined();

      const quest2State = service.getPlayerQuest('player1', 'quest2');
      expect(quest2State).toBeUndefined();
    });
  });

  describe('failQuest', () => {
    beforeEach(async () => {
      const quest: IQuest = {
        id: 'quest1',
        name: 'Test Quest',
        description: 'A test quest',
        gameId: 'game1',
        objectives: [],
      };

      service.registerQuest(quest);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await service.startQuest('quest1', 'player1', context);
    });

    it('should fail a quest', async () => {
      const result = await service.failQuest('player1', 'quest1');

      expect(result.success).toBe(true);
      expect(result.questFailed).toBe(true);

      const playerQuest = service.getPlayerQuest('player1', 'quest1');
      expect(playerQuest?.state).toBe(QuestState.FAILED);
      expect(playerQuest?.failedAt).toBeDefined();
    });

    it('should emit quest failed event', async () => {
      eventEmitter.emit.mockClear();

      await service.failQuest('player1', 'quest1');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.CUSTOM_EVENT,
        expect.objectContaining({
          action: 'quest_failed',
          questId: 'quest1',
        }),
        'game1',
      );
    });

    it('should return error for non-existent quest', async () => {
      const result = await service.failQuest('player1', 'nonexistent');

      expect(result.success).toBe(false);
    });
  });

  describe('abandonQuest', () => {
    it('should abandon a quest when allowed', async () => {
      const quest: IQuest = {
        id: 'quest1',
        name: 'Test Quest',
        description: 'A test quest',
        gameId: 'game1',
        objectives: [],
        canAbandon: true,
      };

      service.registerQuest(quest);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await service.startQuest('quest1', 'player1', context);

      const result = await service.abandonQuest('player1', 'quest1');

      expect(result.success).toBe(true);

      const playerQuest = service.getPlayerQuest('player1', 'quest1');
      expect(playerQuest).toBeUndefined();
    });

    it('should not allow abandoning quest when canAbandon is false', async () => {
      const quest: IQuest = {
        id: 'quest1',
        name: 'Test Quest',
        description: 'A test quest',
        gameId: 'game1',
        objectives: [],
        canAbandon: false,
      };

      service.registerQuest(quest);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await service.startQuest('quest1', 'player1', context);

      const result = await service.abandonQuest('player1', 'quest1');

      expect(result.success).toBe(false);
      expect(result.message).toContain('cannot be abandoned');
    });

    it('should emit quest abandoned event', async () => {
      const quest: IQuest = {
        id: 'quest1',
        name: 'Test Quest',
        description: 'A test quest',
        gameId: 'game1',
        objectives: [],
        canAbandon: true,
      };

      service.registerQuest(quest);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await service.startQuest('quest1', 'player1', context);

      eventEmitter.emit.mockClear();

      await service.abandonQuest('player1', 'quest1');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.CUSTOM_EVENT,
        expect.objectContaining({
          action: 'quest_abandoned',
          questId: 'quest1',
        }),
        'game1',
      );
    });

    it('should return error for non-existent quest', async () => {
      const result = await service.abandonQuest('player1', 'nonexistent');

      expect(result.success).toBe(false);
    });
  });

  describe('checkFailConditions', () => {
    it('should fail quest when time limit expires', async () => {
      const quest: IQuest = {
        id: 'quest1',
        name: 'Timed Quest',
        description: 'Must complete quickly',
        gameId: 'game1',
        objectives: [],
        timeLimit: 0.001, // Very short time limit
      };

      service.registerQuest(quest);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await service.startQuest('quest1', 'player1', context);

      // Wait for time limit to expire
      await new Promise((resolve) => setTimeout(resolve, 10));

      const failed = await service.checkFailConditions(
        'player1',
        'quest1',
        context,
      );

      expect(failed).toBe(true);

      const playerQuest = service.getPlayerQuest('player1', 'quest1');
      expect(playerQuest?.state).toBe(QuestState.FAILED);
    });

    it('should not fail quest when time limit has not expired', async () => {
      const quest: IQuest = {
        id: 'quest1',
        name: 'Timed Quest',
        description: 'Must complete quickly',
        gameId: 'game1',
        objectives: [],
        timeLimit: 3600, // 1 hour
      };

      service.registerQuest(quest);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await service.startQuest('quest1', 'player1', context);

      const failed = await service.checkFailConditions(
        'player1',
        'quest1',
        context,
      );

      expect(failed).toBe(false);
    });

    it('should fail quest when fail condition is met', async () => {
      const quest: IQuest = {
        id: 'quest1',
        name: 'Conditional Quest',
        description: 'Fails under certain conditions',
        gameId: 'game1',
        objectives: [],
        failConditions: [
          {
            type: 'flag',
            key: 'failed_flag',
            operator: 'equals',
            value: true,
          },
        ],
      };

      service.registerQuest(quest);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: { failed_flag: true },
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await service.startQuest('quest1', 'player1', {
        ...context,
        playerFlags: {},
      });

      const failed = await service.checkFailConditions(
        'player1',
        'quest1',
        context,
      );

      expect(failed).toBe(true);
    });

    it('should return false for non-existent quest', async () => {
      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      const failed = await service.checkFailConditions(
        'player1',
        'nonexistent',
        context,
      );

      expect(failed).toBe(false);
    });

    it('should return false for non-active quest', async () => {
      const quest: IQuest = {
        id: 'quest1',
        name: 'Test Quest',
        description: 'A test quest',
        gameId: 'game1',
        objectives: [],
      };

      service.registerQuest(quest);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      const failed = await service.checkFailConditions(
        'player1',
        'quest1',
        context,
      );

      expect(failed).toBe(false);
    });
  });

  describe('getPlayerQuest', () => {
    it('should return player quest', async () => {
      const quest: IQuest = {
        id: 'quest1',
        name: 'Test Quest',
        description: 'A test quest',
        gameId: 'game1',
        objectives: [],
      };

      service.registerQuest(quest);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await service.startQuest('quest1', 'player1', context);

      const playerQuest = service.getPlayerQuest('player1', 'quest1');

      expect(playerQuest).toBeDefined();
      expect(playerQuest?.questId).toBe('quest1');
      expect(playerQuest?.playerId).toBe('player1');
    });

    it('should return undefined for non-existent quest', () => {
      const playerQuest = service.getPlayerQuest('player1', 'nonexistent');

      expect(playerQuest).toBeUndefined();
    });
  });

  describe('getPlayerQuests', () => {
    it('should return all player quests', async () => {
      const quest1: IQuest = {
        id: 'quest1',
        name: 'Quest 1',
        description: 'First quest',
        gameId: 'game1',
        objectives: [],
      };

      const quest2: IQuest = {
        id: 'quest2',
        name: 'Quest 2',
        description: 'Second quest',
        gameId: 'game1',
        objectives: [],
      };

      service.registerQuest(quest1);
      service.registerQuest(quest2);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await service.startQuest('quest1', 'player1', context);
      await service.startQuest('quest2', 'player1', context);

      const quests = service.getPlayerQuests('player1');

      expect(quests.length).toBe(2);
    });

    it('should filter quests by state', async () => {
      const quest1: IQuest = {
        id: 'quest1',
        name: 'Quest 1',
        description: 'First quest',
        gameId: 'game1',
        objectives: [
          {
            id: 'obj1',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Complete',
            targetCount: 1,
            completed: false,
          },
        ],
      };

      const quest2: IQuest = {
        id: 'quest2',
        name: 'Quest 2',
        description: 'Second quest',
        gameId: 'game1',
        objectives: [],
      };

      service.registerQuest(quest1);
      service.registerQuest(quest2);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await service.startQuest('quest1', 'player1', context);
      await service.startQuest('quest2', 'player1', context);
      await service.updateObjective('player1', 'quest1', 'obj1', 1, context);

      const activeQuests = service.getPlayerQuests(
        'player1',
        QuestState.ACTIVE,
      );
      const completedQuests = service.getPlayerQuests(
        'player1',
        QuestState.COMPLETED,
      );

      expect(activeQuests.length).toBe(1);
      expect(completedQuests.length).toBe(1);
    });

    it('should return empty array for player with no quests', () => {
      const quests = service.getPlayerQuests('player1');

      expect(quests).toEqual([]);
    });
  });

  describe('getQuest', () => {
    it('should return quest definition', () => {
      const quest: IQuest = {
        id: 'quest1',
        name: 'Test Quest',
        description: 'A test quest',
        gameId: 'game1',
        objectives: [],
      };

      service.registerQuest(quest);

      const retrieved = service.getQuest('quest1');

      expect(retrieved).toEqual(quest);
    });

    it('should return undefined for non-existent quest', () => {
      const retrieved = service.getQuest('nonexistent');

      expect(retrieved).toBeUndefined();
    });
  });

  describe('getGameQuests', () => {
    it('should return all quests for a game', () => {
      const quest1: IQuest = {
        id: 'quest1',
        name: 'Quest 1',
        description: 'First quest',
        gameId: 'game1',
        objectives: [],
      };

      const quest2: IQuest = {
        id: 'quest2',
        name: 'Quest 2',
        description: 'Second quest',
        gameId: 'game1',
        objectives: [],
      };

      const quest3: IQuest = {
        id: 'quest3',
        name: 'Quest 3',
        description: 'Third quest',
        gameId: 'game2',
        objectives: [],
      };

      service.registerQuest(quest1);
      service.registerQuest(quest2);
      service.registerQuest(quest3);

      const game1Quests = service.getGameQuests('game1');

      expect(game1Quests.length).toBe(2);
      expect(game1Quests.every((q) => q.gameId === 'game1')).toBe(true);
    });

    it('should return empty array for game with no quests', () => {
      const quests = service.getGameQuests('game1');

      expect(quests).toEqual([]);
    });
  });

  describe('removeQuest', () => {
    it('should remove a quest definition', () => {
      const quest: IQuest = {
        id: 'quest1',
        name: 'Test Quest',
        description: 'A test quest',
        gameId: 'game1',
        objectives: [],
      };

      service.registerQuest(quest);
      service.removeQuest('quest1');

      const retrieved = service.getQuest('quest1');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('clearAllQuests', () => {
    it('should clear all quest definitions', () => {
      const quest1: IQuest = {
        id: 'quest1',
        name: 'Quest 1',
        description: 'First quest',
        gameId: 'game1',
        objectives: [],
      };

      const quest2: IQuest = {
        id: 'quest2',
        name: 'Quest 2',
        description: 'Second quest',
        gameId: 'game1',
        objectives: [],
      };

      service.registerQuest(quest1);
      service.registerQuest(quest2);

      service.clearAllQuests();

      expect(service.getQuest('quest1')).toBeUndefined();
      expect(service.getQuest('quest2')).toBeUndefined();
    });
  });

  describe('clearPlayerQuests', () => {
    it('should clear all quests for a player', async () => {
      const quest1: IQuest = {
        id: 'quest1',
        name: 'Quest 1',
        description: 'First quest',
        gameId: 'game1',
        objectives: [],
      };

      service.registerQuest(quest1);

      const context: IQuestContext = {
        gameId: 'game1',
        playerId: 'player1',
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await service.startQuest('quest1', 'player1', context);

      service.clearPlayerQuests('player1');

      const quests = service.getPlayerQuests('player1');
      expect(quests).toEqual([]);
    });
  });
});
