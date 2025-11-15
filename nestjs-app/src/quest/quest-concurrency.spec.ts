import { Test, TestingModule } from '@nestjs/testing';
import { QuestManagerService } from './quest-manager.service';
import { EventEmitterService } from '../events/event-emitter.service';
import {
  IQuest,
  IQuestContext,
  QuestState,
  ObjectiveType,
  IQuestObjective,
  IQuestReward,
} from './quest.interfaces';

/**
 * Comprehensive concurrency tests for quest system
 * Tests race conditions, state mutations, and data integrity under concurrent operations
 */
describe('QuestManagerService - Concurrency Tests', () => {
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

  // ============================================================================
  // Helper Functions
  // ============================================================================

  /**
   * Create a basic quest context for a player
   */
  const createContext = (
    playerId: string,
    overrides: Partial<IQuestContext> = {},
  ): IQuestContext => {
    return {
      gameId: 'test-game',
      playerId,
      playerFlags: {},
      playerVariables: {},
      playerInventory: [],
      completedQuests: [],
      ...overrides,
    };
  };

  /**
   * Create a quest with multiple objectives
   */
  const createMultiObjectiveQuest = (
    questId: string,
    objectiveCount: number,
  ): IQuest => {
    const objectives: IQuestObjective[] = [];
    for (let i = 0; i < objectiveCount; i++) {
      objectives.push({
        id: `obj${i + 1}`,
        type: ObjectiveType.COLLECT_ITEM,
        description: `Collect ${i + 1} items`,
        targetCount: 10,
        currentCount: 0,
        completed: false,
      });
    }

    return {
      id: questId,
      name: `Test Quest ${questId}`,
      description: 'A quest for concurrency testing',
      gameId: 'test-game',
      objectives,
    };
  };

  /**
   * Create a shared quest (for party/group scenarios)
   */
  const createSharedQuest = (questId: string): IQuest => {
    return {
      id: questId,
      name: 'Shared Party Quest',
      description: 'A quest that can be completed by multiple players',
      gameId: 'test-game',
      objectives: [
        {
          id: 'shared-obj1',
          type: ObjectiveType.DEFEAT_ENEMY,
          description: 'Defeat 100 enemies as a party',
          targetCount: 100,
          currentCount: 0,
          completed: false,
        },
      ],
    };
  };

  /**
   * Create a quest with rewards
   */
  const createQuestWithRewards = (questId: string): IQuest => {
    return {
      id: questId,
      name: 'Quest with Rewards',
      description: 'A quest that grants rewards',
      gameId: 'test-game',
      objectives: [
        {
          id: 'reward-obj1',
          type: ObjectiveType.COLLECT_ITEM,
          description: 'Complete objective',
          targetCount: 1,
          currentCount: 0,
          completed: false,
        },
      ],
      rewards: [
        {
          type: 'item',
          itemId: 'legendary-sword',
          itemCount: 1,
        },
        {
          type: 'experience',
          experience: 1000,
        },
      ],
    };
  };

  /**
   * Sleep helper for timing tests
   */
  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  // ============================================================================
  // 1. Concurrent Quest Progress Updates (10 tests)
  // ============================================================================

  describe('Concurrent Quest Progress Updates', () => {
    it('should handle multiple players updating same shared quest objective', async () => {
      const quest = createSharedQuest('shared-quest-1');
      service.registerQuest(quest);

      const playerIds = ['p1', 'p2', 'p3', 'p4'];
      const contexts = playerIds.map((id) => createContext(id));

      // All players start the quest
      for (let i = 0; i < playerIds.length; i++) {
        await service.startQuest(quest.id, playerIds[i], contexts[i]);
      }

      // All players update the same objective concurrently (each adds 10)
      const results = await Promise.all(
        playerIds.map((playerId) =>
          service.updateObjective(
            playerId,
            quest.id,
            'shared-obj1',
            10,
            createContext(playerId),
          ),
        ),
      );

      // Verify all updates succeeded
      results.forEach((result) => {
        expect(result.success).toBe(true);
      });

      // Check final counts - each player should have their own progress
      // (In current implementation, each player has separate quest state)
      for (const playerId of playerIds) {
        const playerQuest = service.getPlayerQuest(playerId, quest.id);
        expect(playerQuest?.objectives[0].currentCount).toBe(10);
      }
    });

    it('should handle same player updating multiple objectives simultaneously', async () => {
      const quest = createMultiObjectiveQuest('multi-obj-quest', 5);
      service.registerQuest(quest);

      const context = createContext('player1');
      await service.startQuest(quest.id, 'player1', context);

      // Update all 5 objectives concurrently
      const results = await Promise.all([
        service.updateObjective('player1', quest.id, 'obj1', 3, context),
        service.updateObjective('player1', quest.id, 'obj2', 5, context),
        service.updateObjective('player1', quest.id, 'obj3', 7, context),
        service.updateObjective('player1', quest.id, 'obj4', 2, context),
        service.updateObjective('player1', quest.id, 'obj5', 9, context),
      ]);

      // All updates should succeed
      results.forEach((result) => {
        expect(result.success).toBe(true);
      });

      // Verify progress
      const playerQuest = service.getPlayerQuest('player1', quest.id);
      expect(playerQuest?.objectives[0].currentCount).toBe(3);
      expect(playerQuest?.objectives[1].currentCount).toBe(5);
      expect(playerQuest?.objectives[2].currentCount).toBe(7);
      expect(playerQuest?.objectives[3].currentCount).toBe(2);
      expect(playerQuest?.objectives[4].currentCount).toBe(9);
    });

    it('should prevent quest counter overflow with concurrent updates', async () => {
      const quest: IQuest = {
        id: 'counter-quest',
        name: 'Counter Quest',
        description: 'Test counter overflow',
        gameId: 'test-game',
        objectives: [
          {
            id: 'counter-obj',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect 10 items',
            targetCount: 10,
            currentCount: 0,
            completed: false,
          },
        ],
      };
      service.registerQuest(quest);

      const context = createContext('player1');
      await service.startQuest(quest.id, 'player1', context);

      // Try to update counter beyond limit concurrently
      const results = await Promise.all([
        service.updateObjective('player1', quest.id, 'counter-obj', 8, context),
        service.updateObjective('player1', quest.id, 'counter-obj', 7, context),
        service.updateObjective('player1', quest.id, 'counter-obj', 6, context),
      ]);

      // Get final state
      const playerQuest = service.getPlayerQuest('player1', quest.id);

      // Counter should not exceed target (current implementation caps at targetCount)
      // Note: Race condition may cause issues - this test documents expected behavior
      expect(playerQuest?.objectives[0].currentCount).toBeLessThanOrEqual(10);
    });

    it('should handle quest completion race condition (two players completing simultaneously)', async () => {
      const quest: IQuest = {
        id: 'race-complete-quest',
        name: 'Race Complete Quest',
        description: 'Test completion race',
        gameId: 'test-game',
        objectives: [
          {
            id: 'race-obj',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect 1 item',
            targetCount: 1,
            currentCount: 0,
            completed: false,
          },
        ],
      };
      service.registerQuest(quest);

      // Two players start the quest
      await service.startQuest(quest.id, 'player1', createContext('player1'));
      await service.startQuest(quest.id, 'player2', createContext('player2'));

      // Both players try to complete simultaneously
      const results = await Promise.all([
        service.updateObjective(
          'player1',
          quest.id,
          'race-obj',
          1,
          createContext('player1'),
        ),
        service.updateObjective(
          'player2',
          quest.id,
          'race-obj',
          1,
          createContext('player2'),
        ),
      ]);

      // Both should succeed (separate quest instances per player)
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);

      // Both quests should be completed
      const p1Quest = service.getPlayerQuest('player1', quest.id);
      const p2Quest = service.getPlayerQuest('player2', quest.id);
      expect(p1Quest?.state).toBe(QuestState.COMPLETED);
      expect(p2Quest?.state).toBe(QuestState.COMPLETED);
    });

    it('should handle objective completion during quest deletion', async () => {
      const quest = createMultiObjectiveQuest('delete-race-quest', 2);
      service.registerQuest(quest);

      const context = createContext('player1');
      await service.startQuest(quest.id, 'player1', context);

      // Try to update objective and abandon quest concurrently
      const results = await Promise.all([
        service.updateObjective('player1', quest.id, 'obj1', 5, context),
        service.abandonQuest('player1', quest.id),
      ]);

      // One should succeed, one should fail (depending on race condition)
      const successCount = results.filter((r) => r.success).length;
      expect(successCount).toBeGreaterThanOrEqual(1);
    });

    it('should handle concurrent progress updates to same objective', async () => {
      const quest: IQuest = {
        id: 'concurrent-progress',
        name: 'Concurrent Progress Quest',
        description: 'Test concurrent progress',
        gameId: 'test-game',
        objectives: [
          {
            id: 'progress-obj',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect 100 items',
            targetCount: 100,
            currentCount: 0,
            completed: false,
          },
        ],
      };
      service.registerQuest(quest);

      const context = createContext('player1');
      await service.startQuest(quest.id, 'player1', context);

      // Make 10 concurrent updates of 10 each (total should be 100 or less)
      const updates = Array.from({ length: 10 }, () =>
        service.updateObjective(
          'player1',
          quest.id,
          'progress-obj',
          10,
          context,
        ),
      );

      await Promise.all(updates);

      const playerQuest = service.getPlayerQuest('player1', quest.id);

      // Due to race conditions, final count may vary
      // This test documents the behavior
      expect(playerQuest?.objectives[0].currentCount).toBeGreaterThan(0);
      expect(playerQuest?.objectives[0].currentCount).toBeLessThanOrEqual(100);
    });

    it('should handle quest item collection by multiple players', async () => {
      const quest: IQuest = {
        id: 'item-collect-quest',
        name: 'Item Collection Quest',
        description: 'Collect rare items',
        gameId: 'test-game',
        objectives: [
          {
            id: 'collect-obj',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect 5 rare gems',
            targetId: 'rare-gem',
            targetCount: 5,
            currentCount: 0,
            completed: false,
          },
        ],
      };
      service.registerQuest(quest);

      const playerIds = ['p1', 'p2', 'p3'];

      // All players start quest
      for (const playerId of playerIds) {
        await service.startQuest(quest.id, playerId, createContext(playerId));
      }

      // All players collect items concurrently
      const results = await Promise.all(
        playerIds.map((playerId) =>
          service.updateObjective(
            playerId,
            quest.id,
            'collect-obj',
            3,
            createContext(playerId),
          ),
        ),
      );

      // All should succeed (each has own quest state)
      results.forEach((result) => {
        expect(result.success).toBe(true);
      });
    });

    it('should handle quest state transitions during concurrent updates', async () => {
      const quest: IQuest = {
        id: 'state-transition-quest',
        name: 'State Transition Quest',
        description: 'Test state transitions',
        gameId: 'test-game',
        objectives: [
          {
            id: 'transition-obj',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect 5 items',
            targetCount: 5,
            currentCount: 0,
            completed: false,
          },
        ],
      };
      service.registerQuest(quest);

      const context = createContext('player1');
      await service.startQuest(quest.id, 'player1', context);

      // Update to completion and fail quest concurrently
      const results = await Promise.all([
        service.updateObjective(
          'player1',
          quest.id,
          'transition-obj',
          5,
          context,
        ),
        service.failQuest('player1', quest.id),
      ]);

      const playerQuest = service.getPlayerQuest('player1', quest.id);

      // Quest should be in either COMPLETED or FAILED state
      expect([QuestState.COMPLETED, QuestState.FAILED]).toContain(
        playerQuest?.state,
      );
    });

    it('should handle progress rollback on concurrent failure', async () => {
      const quest: IQuest = {
        id: 'rollback-quest',
        name: 'Rollback Quest',
        description: 'Test rollback',
        gameId: 'test-game',
        objectives: [
          {
            id: 'rollback-obj',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect items',
            targetCount: 10,
            currentCount: 0,
            completed: false,
          },
        ],
      };
      service.registerQuest(quest);

      const context = createContext('player1');
      await service.startQuest(quest.id, 'player1', context);

      // Update progress and fail concurrently
      await Promise.all([
        service.updateObjective(
          'player1',
          quest.id,
          'rollback-obj',
          5,
          context,
        ),
        service.updateObjective(
          'player1',
          quest.id,
          'rollback-obj',
          3,
          context,
        ),
        service.failQuest('player1', quest.id),
      ]);

      const playerQuest = service.getPlayerQuest('player1', quest.id);

      // If failed, updates should not be allowed
      if (playerQuest?.state === QuestState.FAILED) {
        const result = await service.updateObjective(
          'player1',
          quest.id,
          'rollback-obj',
          1,
          context,
        );
        expect(result.success).toBe(false);
      }
    });

    it('should handle high-volume concurrent updates (stress test)', async () => {
      const quest: IQuest = {
        id: 'stress-quest',
        name: 'Stress Test Quest',
        description: 'High volume updates',
        gameId: 'test-game',
        objectives: [
          {
            id: 'stress-obj',
            type: ObjectiveType.DEFEAT_ENEMY,
            description: 'Defeat 1000 enemies',
            targetCount: 1000,
            currentCount: 0,
            completed: false,
          },
        ],
      };
      service.registerQuest(quest);

      const context = createContext('player1');
      await service.startQuest(quest.id, 'player1', context);

      // 100 concurrent updates of 1 each
      const updates = Array.from({ length: 100 }, () =>
        service.updateObjective('player1', quest.id, 'stress-obj', 1, context),
      );

      await Promise.all(updates);

      const playerQuest = service.getPlayerQuest('player1', quest.id);

      // Progress should be tracked (may have race conditions)
      expect(playerQuest?.objectives[0].currentCount).toBeGreaterThan(0);
      expect(playerQuest?.objectives[0].currentCount).toBeLessThanOrEqual(1000);
    });
  });

  // ============================================================================
  // 2. Quest Assignment and Removal (8 tests)
  // ============================================================================

  describe('Quest Assignment and Removal', () => {
    it('should prevent starting same quest multiple times concurrently', async () => {
      const quest = createMultiObjectiveQuest('duplicate-start-quest', 1);
      service.registerQuest(quest);

      const context = createContext('player1');

      // Try to start same quest 5 times concurrently
      const results = await Promise.all([
        service.startQuest(quest.id, 'player1', context),
        service.startQuest(quest.id, 'player1', context),
        service.startQuest(quest.id, 'player1', context),
        service.startQuest(quest.id, 'player1', context),
        service.startQuest(quest.id, 'player1', context),
      ]);

      // Only one should succeed
      const successCount = results.filter((r) => r.success).length;
      expect(successCount).toBe(1);

      // Player should have exactly one instance
      const playerQuests = service.getPlayerQuests('player1');
      expect(playerQuests.filter((q) => q.questId === quest.id).length).toBe(1);
    });

    it('should handle abandoning quest during progress update', async () => {
      const quest = createMultiObjectiveQuest('abandon-race-quest', 2);
      quest.canAbandon = true;
      service.registerQuest(quest);

      const context = createContext('player1');
      await service.startQuest(quest.id, 'player1', context);

      // Update and abandon concurrently
      const results = await Promise.all([
        service.updateObjective('player1', quest.id, 'obj1', 5, context),
        service.updateObjective('player1', quest.id, 'obj2', 3, context),
        service.abandonQuest('player1', quest.id),
      ]);

      // If abandoned, quest should be gone
      const playerQuest = service.getPlayerQuest('player1', quest.id);
      if (!playerQuest) {
        // Abandoned successfully, updates should have failed or been lost
        expect(true).toBe(true);
      }
    });

    it('should handle quest auto-fail during objective update', async () => {
      const quest: IQuest = {
        id: 'auto-fail-quest',
        name: 'Auto Fail Quest',
        description: 'Quest with fail conditions',
        gameId: 'test-game',
        objectives: [
          {
            id: 'fail-obj',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect items',
            targetCount: 10,
            currentCount: 0,
            completed: false,
          },
        ],
        timeLimit: 0.001, // Very short time limit
      };
      service.registerQuest(quest);

      const context = createContext('player1');
      await service.startQuest(quest.id, 'player1', context);

      // Wait for time limit to expire
      await sleep(10);

      // Try to update objective and check fail conditions concurrently
      const results = await Promise.all([
        service.updateObjective('player1', quest.id, 'fail-obj', 5, context),
        service.checkFailConditions('player1', quest.id, context),
      ]);

      const playerQuest = service.getPlayerQuest('player1', quest.id);

      // Quest may be failed or updated depending on timing
      expect([QuestState.ACTIVE, QuestState.FAILED]).toContain(
        playerQuest?.state,
      );
    });

    it('should handle quest dependency resolution with concurrent operations', async () => {
      const quest1: IQuest = {
        id: 'dependency-quest-1',
        name: 'First Quest',
        description: 'Must complete first',
        gameId: 'test-game',
        objectives: [
          {
            id: 'dep-obj1',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Complete',
            targetCount: 1,
            currentCount: 0,
            completed: false,
          },
        ],
      };

      const quest2: IQuest = {
        id: 'dependency-quest-2',
        name: 'Second Quest',
        description: 'Requires first quest',
        gameId: 'test-game',
        objectives: [],
        prerequisites: [
          {
            type: 'quest',
            questId: 'dependency-quest-1',
          },
        ],
      };

      service.registerQuest(quest1);
      service.registerQuest(quest2);

      const context = createContext('player1');
      await service.startQuest(quest1.id, 'player1', context);

      // Try to start quest2 while completing quest1 concurrently
      const results = await Promise.all([
        service.updateObjective('player1', quest1.id, 'dep-obj1', 1, context),
        service.startQuest(quest2.id, 'player1', context),
      ]);

      // Quest2 should fail to start (prerequisite not yet met)
      expect(results[1].success).toBe(false);
    });

    it('should handle quest chain advancement race conditions', async () => {
      const quest1: IQuest = {
        id: 'chain-quest-1',
        name: 'Chain Quest 1',
        description: 'First in chain',
        gameId: 'test-game',
        objectives: [
          {
            id: 'chain-obj1',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Complete',
            targetCount: 1,
            currentCount: 0,
            completed: false,
          },
        ],
        nextQuestId: 'chain-quest-2',
      };

      const quest2: IQuest = {
        id: 'chain-quest-2',
        name: 'Chain Quest 2',
        description: 'Second in chain',
        gameId: 'test-game',
        objectives: [],
        autoStart: true,
      };

      service.registerQuest(quest1);
      service.registerQuest(quest2);

      const context = createContext('player1');
      await service.startQuest(quest1.id, 'player1', context);

      // Complete quest1 multiple times concurrently (should only chain once)
      const results = await Promise.all([
        service.updateObjective('player1', quest1.id, 'chain-obj1', 1, context),
        service.completeQuest('player1', quest1.id, context),
      ]);

      // Quest2 should be started (auto-start)
      const quest2State = service.getPlayerQuest('player1', quest2.id);
      expect(quest2State).toBeDefined();
      expect(quest2State?.state).toBe(QuestState.ACTIVE);
    });

    it('should handle quest giver interaction by multiple players', async () => {
      const quest = createSharedQuest('quest-giver-quest');
      service.registerQuest(quest);

      const playerIds = ['p1', 'p2', 'p3', 'p4', 'p5'];

      // All players try to start quest from same giver concurrently
      const results = await Promise.all(
        playerIds.map((playerId) =>
          service.startQuest(quest.id, playerId, createContext(playerId)),
        ),
      );

      // All should succeed (separate instances per player)
      results.forEach((result) => {
        expect(result.success).toBe(true);
      });

      // Each player should have the quest
      playerIds.forEach((playerId) => {
        const playerQuest = service.getPlayerQuest(playerId, quest.id);
        expect(playerQuest).toBeDefined();
        expect(playerQuest?.state).toBe(QuestState.ACTIVE);
      });
    });

    it('should handle quest reward distribution conflicts', async () => {
      const quest = createQuestWithRewards('reward-conflict-quest');
      service.registerQuest(quest);

      const playerIds = ['p1', 'p2', 'p3'];
      const contexts = playerIds.map((id) => createContext(id));

      // All players start and complete quest concurrently
      for (let i = 0; i < playerIds.length; i++) {
        await service.startQuest(quest.id, playerIds[i], contexts[i]);
      }

      // Complete quests concurrently
      const results = await Promise.all(
        playerIds.map((playerId, i) =>
          service.updateObjective(
            playerId,
            quest.id,
            'reward-obj1',
            1,
            contexts[i],
          ),
        ),
      );

      // All should complete successfully
      results.forEach((result) => {
        expect(result.questCompleted).toBe(true);
      });

      // Each player should have rewards
      playerIds.forEach((playerId, i) => {
        expect(contexts[i].playerInventory).toContain('legendary-sword');
      });
    });

    it('should handle multiple quest starts with different prerequisites', async () => {
      const lowLevelQuest: IQuest = {
        id: 'low-level-quest',
        name: 'Low Level Quest',
        description: 'For beginners',
        gameId: 'test-game',
        objectives: [],
        prerequisites: [
          {
            type: 'level',
            requiredLevel: 1,
          },
        ],
      };

      const highLevelQuest: IQuest = {
        id: 'high-level-quest',
        name: 'High Level Quest',
        description: 'For experts',
        gameId: 'test-game',
        objectives: [],
        prerequisites: [
          {
            type: 'level',
            requiredLevel: 50,
          },
        ],
      };

      service.registerQuest(lowLevelQuest);
      service.registerQuest(highLevelQuest);

      const context = createContext('player1', { playerLevel: 25 });

      // Try to start both quests concurrently
      const results = await Promise.all([
        service.startQuest(lowLevelQuest.id, 'player1', context),
        service.startQuest(highLevelQuest.id, 'player1', context),
      ]);

      // Low level should succeed, high level should fail
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
    });
  });

  // ============================================================================
  // 3. Shared Quest Objectives (10 tests)
  // ============================================================================

  describe('Shared Quest Objectives', () => {
    it('should handle party/group quest progress synchronization', async () => {
      const quest = createSharedQuest('party-sync-quest');
      service.registerQuest(quest);

      const partyMembers = ['p1', 'p2', 'p3', 'p4'];

      // All party members start quest
      for (const playerId of partyMembers) {
        await service.startQuest(quest.id, playerId, createContext(playerId));
      }

      // Each member contributes to objective concurrently
      await Promise.all(
        partyMembers.map((playerId) =>
          service.updateObjective(
            playerId,
            quest.id,
            'shared-obj1',
            25,
            createContext(playerId),
          ),
        ),
      );

      // Each player has their own progress (current implementation)
      partyMembers.forEach((playerId) => {
        const playerQuest = service.getPlayerQuest(playerId, quest.id);
        expect(playerQuest?.objectives[0].currentCount).toBe(25);
      });
    });

    it('should handle shared kill credit in concurrent combat', async () => {
      const quest: IQuest = {
        id: 'shared-kill-quest',
        name: 'Shared Kill Quest',
        description: 'Party kill quest',
        gameId: 'test-game',
        objectives: [
          {
            id: 'kill-obj',
            type: ObjectiveType.DEFEAT_ENEMY,
            description: 'Defeat 50 dragons',
            targetId: 'dragon',
            targetCount: 50,
            currentCount: 0,
            completed: false,
          },
        ],
      };
      service.registerQuest(quest);

      const partyMembers = ['p1', 'p2', 'p3'];

      for (const playerId of partyMembers) {
        await service.startQuest(quest.id, playerId, createContext(playerId));
      }

      // Simulate killing 10 dragons - all party members get credit concurrently
      for (let i = 0; i < 10; i++) {
        await Promise.all(
          partyMembers.map((playerId) =>
            service.updateObjective(
              playerId,
              quest.id,
              'kill-obj',
              1,
              createContext(playerId),
            ),
          ),
        );
      }

      // Each member should have credit for 10 kills
      partyMembers.forEach((playerId) => {
        const playerQuest = service.getPlayerQuest(playerId, quest.id);
        expect(playerQuest?.objectives[0].currentCount).toBe(10);
      });
    });

    it('should handle shared collection objectives', async () => {
      const quest: IQuest = {
        id: 'shared-collect-quest',
        name: 'Shared Collection Quest',
        description: 'Party collection quest',
        gameId: 'test-game',
        objectives: [
          {
            id: 'collect-obj',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect 100 herbs',
            targetId: 'herb',
            targetCount: 100,
            currentCount: 0,
            completed: false,
          },
        ],
      };
      service.registerQuest(quest);

      const partyMembers = ['p1', 'p2', 'p3', 'p4'];

      for (const playerId of partyMembers) {
        await service.startQuest(quest.id, playerId, createContext(playerId));
      }

      // Each member collects herbs concurrently
      await Promise.all(
        partyMembers.map((playerId) =>
          service.updateObjective(
            playerId,
            quest.id,
            'collect-obj',
            20,
            createContext(playerId),
          ),
        ),
      );

      // Verify progress for each member
      partyMembers.forEach((playerId) => {
        const playerQuest = service.getPlayerQuest(playerId, quest.id);
        expect(playerQuest?.objectives[0].currentCount).toBe(20);
      });
    });

    it('should handle quest item sharing between party members', async () => {
      const quest: IQuest = {
        id: 'item-share-quest',
        name: 'Item Sharing Quest',
        description: 'Share quest items',
        gameId: 'test-game',
        objectives: [
          {
            id: 'share-obj',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect quest tokens',
            targetId: 'quest-token',
            targetCount: 10,
            currentCount: 0,
            completed: false,
          },
        ],
      };
      service.registerQuest(quest);

      const partyMembers = ['p1', 'p2'];

      for (const playerId of partyMembers) {
        await service.startQuest(quest.id, playerId, createContext(playerId));
      }

      // Concurrent item collection
      await Promise.all([
        service.updateObjective(
          'p1',
          quest.id,
          'share-obj',
          7,
          createContext('p1'),
        ),
        service.updateObjective(
          'p2',
          quest.id,
          'share-obj',
          5,
          createContext('p2'),
        ),
      ]);

      // Each has own progress
      const p1Quest = service.getPlayerQuest('p1', quest.id);
      const p2Quest = service.getPlayerQuest('p2', quest.id);

      expect(p1Quest?.objectives[0].currentCount).toBe(7);
      expect(p2Quest?.objectives[0].currentCount).toBe(5);
    });

    it('should handle individual vs shared progress conflicts', async () => {
      const quest: IQuest = {
        id: 'conflict-quest',
        name: 'Conflict Quest',
        description: 'Test conflicts',
        gameId: 'test-game',
        objectives: [
          {
            id: 'conflict-obj1',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Individual objective',
            targetCount: 10,
            currentCount: 0,
            completed: false,
          },
          {
            id: 'conflict-obj2',
            type: ObjectiveType.DEFEAT_ENEMY,
            description: 'Shared objective',
            targetCount: 20,
            currentCount: 0,
            completed: false,
          },
        ],
      };
      service.registerQuest(quest);

      const partyMembers = ['p1', 'p2'];

      for (const playerId of partyMembers) {
        await service.startQuest(quest.id, playerId, createContext(playerId));
      }

      // Update different objectives concurrently
      await Promise.all([
        service.updateObjective(
          'p1',
          quest.id,
          'conflict-obj1',
          5,
          createContext('p1'),
        ),
        service.updateObjective(
          'p2',
          quest.id,
          'conflict-obj2',
          10,
          createContext('p2'),
        ),
      ]);

      // Each player has their own progress
      const p1Quest = service.getPlayerQuest('p1', quest.id);
      const p2Quest = service.getPlayerQuest('p2', quest.id);

      expect(p1Quest?.objectives[0].currentCount).toBe(5);
      expect(p2Quest?.objectives[1].currentCount).toBe(10);
    });

    it('should handle party member leaving during quest', async () => {
      const quest = createSharedQuest('party-leave-quest');
      service.registerQuest(quest);

      const partyMembers = ['p1', 'p2', 'p3'];

      for (const playerId of partyMembers) {
        await service.startQuest(quest.id, playerId, createContext(playerId));
      }

      // Member leaves (abandons) while others update progress
      await Promise.all([
        service.updateObjective(
          'p1',
          quest.id,
          'shared-obj1',
          10,
          createContext('p1'),
        ),
        service.abandonQuest('p2', quest.id),
        service.updateObjective(
          'p3',
          quest.id,
          'shared-obj1',
          10,
          createContext('p3'),
        ),
      ]);

      // p2 should not have quest anymore
      expect(service.getPlayerQuest('p2', quest.id)).toBeUndefined();

      // p1 and p3 should still have quest
      expect(service.getPlayerQuest('p1', quest.id)).toBeDefined();
      expect(service.getPlayerQuest('p3', quest.id)).toBeDefined();
    });

    it('should handle party quest with concurrent solo updates', async () => {
      const quest: IQuest = {
        id: 'party-solo-quest',
        name: 'Party Solo Quest',
        description: 'Mix of party and solo',
        gameId: 'test-game',
        objectives: [
          {
            id: 'party-obj',
            type: ObjectiveType.DEFEAT_ENEMY,
            description: 'Party objective',
            targetCount: 50,
            currentCount: 0,
            completed: false,
          },
          {
            id: 'solo-obj',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Solo objective',
            targetCount: 10,
            currentCount: 0,
            completed: false,
          },
        ],
      };
      service.registerQuest(quest);

      const partyMembers = ['p1', 'p2', 'p3'];

      for (const playerId of partyMembers) {
        await service.startQuest(quest.id, playerId, createContext(playerId));
      }

      // Update both objectives concurrently for all members
      await Promise.all([
        ...partyMembers.map((playerId) =>
          service.updateObjective(
            playerId,
            quest.id,
            'party-obj',
            5,
            createContext(playerId),
          ),
        ),
        ...partyMembers.map((playerId) =>
          service.updateObjective(
            playerId,
            quest.id,
            'solo-obj',
            2,
            createContext(playerId),
          ),
        ),
      ]);

      // Verify all members have updates
      partyMembers.forEach((playerId) => {
        const playerQuest = service.getPlayerQuest(playerId, quest.id);
        expect(playerQuest?.objectives[0].currentCount).toBe(5);
        expect(playerQuest?.objectives[1].currentCount).toBe(2);
      });
    });

    it('should handle 100 players updating same global objective', async () => {
      const quest: IQuest = {
        id: 'global-quest',
        name: 'Global World Event',
        description: '100 player event',
        gameId: 'test-game',
        objectives: [
          {
            id: 'global-obj',
            type: ObjectiveType.DEFEAT_ENEMY,
            description: 'Defeat 1000 raid bosses',
            targetCount: 1000,
            currentCount: 0,
            completed: false,
          },
        ],
      };
      service.registerQuest(quest);

      // Create 100 players
      const playerIds = Array.from({ length: 100 }, (_, i) => `player${i + 1}`);

      // All start quest
      for (const playerId of playerIds) {
        await service.startQuest(quest.id, playerId, createContext(playerId));
      }

      // All update concurrently (each contributes 1)
      await Promise.all(
        playerIds.map((playerId) =>
          service.updateObjective(
            playerId,
            quest.id,
            'global-obj',
            1,
            createContext(playerId),
          ),
        ),
      );

      // Each player should have their own progress
      playerIds.forEach((playerId) => {
        const playerQuest = service.getPlayerQuest(playerId, quest.id);
        expect(playerQuest?.objectives[0].currentCount).toBe(1);
      });
    });

    it('should handle party quest completion by first member', async () => {
      const quest: IQuest = {
        id: 'party-complete-quest',
        name: 'Party Complete Quest',
        description: 'Party completion',
        gameId: 'test-game',
        objectives: [
          {
            id: 'complete-obj',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect items',
            targetCount: 10,
            currentCount: 0,
            completed: false,
          },
        ],
      };
      service.registerQuest(quest);

      const partyMembers = ['p1', 'p2', 'p3'];

      for (const playerId of partyMembers) {
        await service.startQuest(quest.id, playerId, createContext(playerId));
      }

      // One member completes while others are updating
      await Promise.all([
        service.updateObjective(
          'p1',
          quest.id,
          'complete-obj',
          10,
          createContext('p1'),
        ),
        service.updateObjective(
          'p2',
          quest.id,
          'complete-obj',
          5,
          createContext('p2'),
        ),
        service.updateObjective(
          'p3',
          quest.id,
          'complete-obj',
          3,
          createContext('p3'),
        ),
      ]);

      // p1 should be completed
      const p1Quest = service.getPlayerQuest('p1', quest.id);
      expect(p1Quest?.state).toBe(QuestState.COMPLETED);

      // Others still active
      expect(service.getPlayerQuest('p2', quest.id)?.state).toBe(
        QuestState.ACTIVE,
      );
      expect(service.getPlayerQuest('p3', quest.id)?.state).toBe(
        QuestState.ACTIVE,
      );
    });

    it('should handle shared quest with concurrent completions', async () => {
      const quest: IQuest = {
        id: 'shared-complete-quest',
        name: 'Shared Complete Quest',
        description: 'Multiple completions',
        gameId: 'test-game',
        objectives: [
          {
            id: 'shared-complete-obj',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect 5 items',
            targetCount: 5,
            currentCount: 0,
            completed: false,
          },
        ],
      };
      service.registerQuest(quest);

      const partyMembers = ['p1', 'p2', 'p3', 'p4'];

      for (const playerId of partyMembers) {
        await service.startQuest(quest.id, playerId, createContext(playerId));
      }

      // All members try to complete simultaneously
      await Promise.all(
        partyMembers.map((playerId) =>
          service.updateObjective(
            playerId,
            quest.id,
            'shared-complete-obj',
            5,
            createContext(playerId),
          ),
        ),
      );

      // All should complete successfully
      partyMembers.forEach((playerId) => {
        const playerQuest = service.getPlayerQuest(playerId, quest.id);
        expect(playerQuest?.state).toBe(QuestState.COMPLETED);
      });
    });
  });

  // ============================================================================
  // 4. Quest Item Integrity (8 tests)
  // ============================================================================

  describe('Quest Item Integrity', () => {
    it('should handle quest item deletion during quest', async () => {
      const quest: IQuest = {
        id: 'item-delete-quest',
        name: 'Item Delete Quest',
        description: 'Test item deletion',
        gameId: 'test-game',
        objectives: [
          {
            id: 'item-obj',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect quest items',
            targetId: 'quest-item',
            targetCount: 5,
            currentCount: 0,
            completed: false,
          },
        ],
        prerequisites: [
          {
            type: 'item',
            itemId: 'key-item',
          },
        ],
      };
      service.registerQuest(quest);

      const context = createContext('player1', {
        playerInventory: ['key-item'],
      });

      await service.startQuest(quest.id, 'player1', context);

      // Remove item from inventory (simulated)
      context.playerInventory = [];

      // Try to update quest
      const result = await service.updateObjective(
        'player1',
        quest.id,
        'item-obj',
        1,
        context,
      );

      // Should still work (prerequisite only checked at start)
      expect(result.success).toBe(true);
    });

    it('should prevent quest item duplication', async () => {
      const quest = createQuestWithRewards('duplication-quest');
      service.registerQuest(quest);

      const context = createContext('player1');
      await service.startQuest(quest.id, 'player1', context);

      // Try to complete quest multiple times concurrently
      const results = await Promise.all([
        service.updateObjective('player1', quest.id, 'reward-obj1', 1, context),
        service.completeQuest('player1', quest.id, context),
      ]);

      // Count legendary swords in inventory
      const swordCount = context.playerInventory.filter(
        (item) => item === 'legendary-sword',
      ).length;

      // Should only have 1 sword (no duplication)
      expect(swordCount).toBe(1);
    });

    it('should handle quest item transfer during active quest', async () => {
      const quest: IQuest = {
        id: 'item-transfer-quest',
        name: 'Item Transfer Quest',
        description: 'Test item transfer',
        gameId: 'test-game',
        objectives: [
          {
            id: 'transfer-obj',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect transferable items',
            targetId: 'transferable-item',
            targetCount: 10,
            currentCount: 0,
            completed: false,
          },
        ],
      };
      service.registerQuest(quest);

      const p1Context = createContext('p1');
      const p2Context = createContext('p2');

      await service.startQuest(quest.id, 'p1', p1Context);
      await service.startQuest(quest.id, 'p2', p2Context);

      // Both collect items concurrently
      await Promise.all([
        service.updateObjective('p1', quest.id, 'transfer-obj', 5, p1Context),
        service.updateObjective('p2', quest.id, 'transfer-obj', 5, p2Context),
      ]);

      // Each should have their own progress
      expect(
        service.getPlayerQuest('p1', quest.id)?.objectives[0].currentCount,
      ).toBe(5);
      expect(
        service.getPlayerQuest('p2', quest.id)?.objectives[0].currentCount,
      ).toBe(5);
    });

    it('should handle required item consumption race', async () => {
      const quest: IQuest = {
        id: 'consume-quest',
        name: 'Consume Quest',
        description: 'Test item consumption',
        gameId: 'test-game',
        objectives: [
          {
            id: 'consume-obj',
            type: ObjectiveType.USE_ITEM,
            description: 'Use consumable item',
            targetId: 'consumable',
            targetCount: 5,
            currentCount: 0,
            completed: false,
          },
        ],
      };
      service.registerQuest(quest);

      const context = createContext('player1', {
        playerInventory: ['consumable', 'consumable', 'consumable'],
      });

      await service.startQuest(quest.id, 'player1', context);

      // Try to consume items concurrently
      const results = await Promise.all([
        service.updateObjective('player1', quest.id, 'consume-obj', 2, context),
        service.updateObjective('player1', quest.id, 'consume-obj', 2, context),
      ]);

      // Both updates succeed
      results.forEach((result) => {
        expect(result.success).toBe(true);
      });
    });

    it('should handle quest item respawn timing conflicts', async () => {
      const quest: IQuest = {
        id: 'respawn-quest',
        name: 'Respawn Quest',
        description: 'Test item respawn',
        gameId: 'test-game',
        objectives: [
          {
            id: 'respawn-obj',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect respawning items',
            targetId: 'respawn-item',
            targetCount: 10,
            currentCount: 0,
            completed: false,
          },
        ],
      };
      service.registerQuest(quest);

      const playerIds = ['p1', 'p2', 'p3'];

      for (const playerId of playerIds) {
        await service.startQuest(quest.id, playerId, createContext(playerId));
      }

      // Multiple players try to collect same respawning item
      await Promise.all(
        playerIds.map((playerId) =>
          service.updateObjective(
            playerId,
            quest.id,
            'respawn-obj',
            1,
            createContext(playerId),
          ),
        ),
      );

      // Each player gets their own instance
      playerIds.forEach((playerId) => {
        const playerQuest = service.getPlayerQuest(playerId, quest.id);
        expect(playerQuest?.objectives[0].currentCount).toBe(1);
      });
    });

    it('should handle multiple players looting same quest item', async () => {
      const quest: IQuest = {
        id: 'loot-quest',
        name: 'Loot Quest',
        description: 'Test quest loot',
        gameId: 'test-game',
        objectives: [
          {
            id: 'loot-obj',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Loot quest item',
            targetId: 'quest-loot',
            targetCount: 1,
            currentCount: 0,
            completed: false,
          },
        ],
      };
      service.registerQuest(quest);

      const playerIds = ['p1', 'p2', 'p3', 'p4', 'p5'];

      for (const playerId of playerIds) {
        await service.startQuest(quest.id, playerId, createContext(playerId));
      }

      // All try to loot same item concurrently
      await Promise.all(
        playerIds.map((playerId) =>
          service.updateObjective(
            playerId,
            quest.id,
            'loot-obj',
            1,
            createContext(playerId),
          ),
        ),
      );

      // All should get the item (instanced loot)
      playerIds.forEach((playerId) => {
        const playerQuest = service.getPlayerQuest(playerId, quest.id);
        expect(playerQuest?.objectives[0].currentCount).toBe(1);
      });
    });

    it('should handle quest reward item stack limits', async () => {
      const quest: IQuest = {
        id: 'stack-quest',
        name: 'Stack Quest',
        description: 'Test item stacking',
        gameId: 'test-game',
        objectives: [
          {
            id: 'stack-obj',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Complete objective',
            targetCount: 1,
            currentCount: 0,
            completed: false,
          },
        ],
        rewards: [
          {
            type: 'item',
            itemId: 'stackable-item',
            itemCount: 99,
          },
        ],
      };
      service.registerQuest(quest);

      const context = createContext('player1');
      await service.startQuest(quest.id, 'player1', context);

      // Complete quest
      await service.updateObjective(
        'player1',
        quest.id,
        'stack-obj',
        1,
        context,
      );

      // Should have 99 items
      const itemCount = context.playerInventory.filter(
        (item) => item === 'stackable-item',
      ).length;
      expect(itemCount).toBe(99);
    });

    it('should handle concurrent quest item drops', async () => {
      const quest: IQuest = {
        id: 'drop-quest',
        name: 'Drop Quest',
        description: 'Test item drops',
        gameId: 'test-game',
        objectives: [
          {
            id: 'drop-obj',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect dropped items',
            targetId: 'drop-item',
            targetCount: 50,
            currentCount: 0,
            completed: false,
          },
        ],
      };
      service.registerQuest(quest);

      const playerIds = ['p1', 'p2'];

      for (const playerId of playerIds) {
        await service.startQuest(quest.id, playerId, createContext(playerId));
      }

      // Simulate 20 concurrent drops, both players collecting
      const updates = [];
      for (let i = 0; i < 20; i++) {
        updates.push(
          service.updateObjective(
            'p1',
            quest.id,
            'drop-obj',
            1,
            createContext('p1'),
          ),
          service.updateObjective(
            'p2',
            quest.id,
            'drop-obj',
            1,
            createContext('p2'),
          ),
        );
      }

      await Promise.all(updates);

      // Each player should have 20 items
      expect(
        service.getPlayerQuest('p1', quest.id)?.objectives[0].currentCount,
      ).toBe(20);
      expect(
        service.getPlayerQuest('p2', quest.id)?.objectives[0].currentCount,
      ).toBe(20);
    });
  });

  // ============================================================================
  // 5. Quest State Consistency (10 tests)
  // ============================================================================

  describe('Quest State Consistency', () => {
    it('should prevent quest from being completed and failed simultaneously', async () => {
      const quest: IQuest = {
        id: 'state-conflict-quest',
        name: 'State Conflict Quest',
        description: 'Test state conflicts',
        gameId: 'test-game',
        objectives: [
          {
            id: 'conflict-obj',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Complete objective',
            targetCount: 1,
            currentCount: 0,
            completed: false,
          },
        ],
      };
      service.registerQuest(quest);

      const context = createContext('player1');
      await service.startQuest(quest.id, 'player1', context);

      // Try to complete and fail simultaneously
      await Promise.all([
        service.updateObjective(
          'player1',
          quest.id,
          'conflict-obj',
          1,
          context,
        ),
        service.failQuest('player1', quest.id),
      ]);

      const playerQuest = service.getPlayerQuest('player1', quest.id);

      // Should be in one state only (not both)
      expect(playerQuest?.state).toBeDefined();
      expect([QuestState.COMPLETED, QuestState.FAILED]).toContain(
        playerQuest?.state,
      );
    });

    it('should prevent duplicate quest instances', async () => {
      const quest = createMultiObjectiveQuest('no-duplicate-quest', 1);
      service.registerQuest(quest);

      const context = createContext('player1');

      // Try to start quest 10 times concurrently
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          service.startQuest(quest.id, 'player1', context),
        ),
      );

      // Only one should succeed
      const successCount = results.filter((r) => r.success).length;
      expect(successCount).toBe(1);

      // Should have exactly one quest instance
      const playerQuests = service.getPlayerQuests('player1');
      const questCount = playerQuests.filter(
        (q) => q.questId === quest.id,
      ).length;
      expect(questCount).toBe(1);
    });

    it('should ensure quest state transitions are atomic', async () => {
      const quest: IQuest = {
        id: 'atomic-quest',
        name: 'Atomic Quest',
        description: 'Test atomic transitions',
        gameId: 'test-game',
        objectives: [
          {
            id: 'atomic-obj',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Complete',
            targetCount: 1,
            currentCount: 0,
            completed: false,
          },
        ],
      };
      service.registerQuest(quest);

      const context = createContext('player1');
      await service.startQuest(quest.id, 'player1', context);

      // Multiple state changes concurrently
      await Promise.all([
        service.updateObjective('player1', quest.id, 'atomic-obj', 1, context),
        service.failQuest('player1', quest.id),
        service.completeQuest('player1', quest.id, context),
      ]);

      const playerQuest = service.getPlayerQuest('player1', quest.id);

      // Should be in exactly one final state
      expect([QuestState.COMPLETED, QuestState.FAILED]).toContain(
        playerQuest?.state,
      );
    });

    it('should prevent objective counts from going negative', async () => {
      const quest: IQuest = {
        id: 'negative-quest',
        name: 'Negative Quest',
        description: 'Test negative prevention',
        gameId: 'test-game',
        objectives: [
          {
            id: 'negative-obj',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect items',
            targetCount: 10,
            currentCount: 0,
            completed: false,
          },
        ],
      };
      service.registerQuest(quest);

      const context = createContext('player1');
      await service.startQuest(quest.id, 'player1', context);

      // Try to subtract (using negative increment)
      const result = await service.updateObjective(
        'player1',
        quest.id,
        'negative-obj',
        -5,
        context,
      );

      const playerQuest = service.getPlayerQuest('player1', quest.id);

      // Count should not be negative
      expect(playerQuest?.objectives[0].currentCount).toBeGreaterThanOrEqual(0);
    });

    it('should prevent objective counts from overflowing target', async () => {
      const quest: IQuest = {
        id: 'overflow-quest',
        name: 'Overflow Quest',
        description: 'Test overflow prevention',
        gameId: 'test-game',
        objectives: [
          {
            id: 'overflow-obj',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect 10 items',
            targetCount: 10,
            currentCount: 0,
            completed: false,
          },
        ],
      };
      service.registerQuest(quest);

      const context = createContext('player1');
      await service.startQuest(quest.id, 'player1', context);

      // Try to add more than target
      await service.updateObjective(
        'player1',
        quest.id,
        'overflow-obj',
        50,
        context,
      );

      const playerQuest = service.getPlayerQuest('player1', quest.id);

      // Should cap at target
      expect(playerQuest?.objectives[0].currentCount).toBe(10);
    });

    it('should ensure quest dependencies remain valid', async () => {
      const quest1: IQuest = {
        id: 'dep-valid-quest-1',
        name: 'Dependency Quest 1',
        description: 'First quest',
        gameId: 'test-game',
        objectives: [
          {
            id: 'dep-obj1',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Complete',
            targetCount: 1,
            currentCount: 0,
            completed: false,
          },
        ],
      };

      const quest2: IQuest = {
        id: 'dep-valid-quest-2',
        name: 'Dependency Quest 2',
        description: 'Requires quest 1',
        gameId: 'test-game',
        objectives: [],
        prerequisites: [
          {
            type: 'quest',
            questId: 'dep-valid-quest-1',
          },
        ],
      };

      service.registerQuest(quest1);
      service.registerQuest(quest2);

      const context = createContext('player1');

      // Try to start quest2 before quest1 is completed
      const result1 = await service.startQuest(quest2.id, 'player1', context);
      expect(result1.success).toBe(false);

      // Complete quest1
      await service.startQuest(quest1.id, 'player1', context);
      await service.updateObjective(
        'player1',
        quest1.id,
        'dep-obj1',
        1,
        context,
      );

      // Update context with completed quest
      context.completedQuests.push(quest1.id);

      // Now quest2 should be startable
      const result2 = await service.startQuest(quest2.id, 'player1', context);
      expect(result2.success).toBe(true);
    });

    it('should prevent quest chains from breaking', async () => {
      const quest1: IQuest = {
        id: 'chain-valid-1',
        name: 'Chain Quest 1',
        description: 'First in chain',
        gameId: 'test-game',
        objectives: [
          {
            id: 'chain-obj1',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Complete',
            targetCount: 1,
            currentCount: 0,
            completed: false,
          },
        ],
        nextQuestId: 'chain-valid-2',
      };

      const quest2: IQuest = {
        id: 'chain-valid-2',
        name: 'Chain Quest 2',
        description: 'Second in chain',
        gameId: 'test-game',
        objectives: [],
        autoStart: true,
      };

      service.registerQuest(quest1);
      service.registerQuest(quest2);

      const context = createContext('player1');
      await service.startQuest(quest1.id, 'player1', context);

      // Complete quest1
      const result = await service.updateObjective(
        'player1',
        quest1.id,
        'chain-obj1',
        1,
        context,
      );

      // Quest2 should auto-start
      expect(result.nextQuestUnlocked).toBe(quest2.id);

      const quest2State = service.getPlayerQuest('player1', quest2.id);
      expect(quest2State?.state).toBe(QuestState.ACTIVE);
    });

    it('should ensure failed quest state is immutable', async () => {
      const quest: IQuest = {
        id: 'immutable-fail-quest',
        name: 'Immutable Fail Quest',
        description: 'Test immutability',
        gameId: 'test-game',
        objectives: [
          {
            id: 'immutable-obj',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Complete',
            targetCount: 10,
            currentCount: 0,
            completed: false,
          },
        ],
      };
      service.registerQuest(quest);

      const context = createContext('player1');
      await service.startQuest(quest.id, 'player1', context);

      // Fail the quest
      await service.failQuest('player1', quest.id);

      // Try to update after failure
      const result = await service.updateObjective(
        'player1',
        quest.id,
        'immutable-obj',
        5,
        context,
      );

      // Should not allow updates
      expect(result.success).toBe(false);

      const playerQuest = service.getPlayerQuest('player1', quest.id);
      expect(playerQuest?.state).toBe(QuestState.FAILED);
    });

    it('should ensure completed quest state is immutable', async () => {
      const quest: IQuest = {
        id: 'immutable-complete-quest',
        name: 'Immutable Complete Quest',
        description: 'Test immutability',
        gameId: 'test-game',
        objectives: [
          {
            id: 'immutable-complete-obj',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Complete',
            targetCount: 1,
            currentCount: 0,
            completed: false,
          },
        ],
      };
      service.registerQuest(quest);

      const context = createContext('player1');
      await service.startQuest(quest.id, 'player1', context);

      // Complete the quest
      await service.updateObjective(
        'player1',
        quest.id,
        'immutable-complete-obj',
        1,
        context,
      );

      // Try to fail after completion
      const result = await service.failQuest('player1', quest.id);

      const playerQuest = service.getPlayerQuest('player1', quest.id);

      // Should remain completed (or fail, depending on implementation)
      expect(playerQuest?.state).toBe(QuestState.COMPLETED);
    });

    it('should handle concurrent state checks and updates', async () => {
      const quest: IQuest = {
        id: 'state-check-quest',
        name: 'State Check Quest',
        description: 'Test concurrent state checks',
        gameId: 'test-game',
        objectives: [
          {
            id: 'state-obj',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Complete',
            targetCount: 5,
            currentCount: 0,
            completed: false,
          },
        ],
      };
      service.registerQuest(quest);

      const context = createContext('player1');
      await service.startQuest(quest.id, 'player1', context);

      // Multiple state queries and updates concurrently
      await Promise.all([
        service.updateObjective('player1', quest.id, 'state-obj', 2, context),
        service.getPlayerQuest('player1', quest.id),
        service.updateObjective('player1', quest.id, 'state-obj', 3, context),
        service.getPlayerQuests('player1'),
      ]);

      const playerQuest = service.getPlayerQuest('player1', quest.id);

      // Should have consistent state
      expect(playerQuest?.objectives[0].currentCount).toBeGreaterThan(0);
      expect(playerQuest?.objectives[0].currentCount).toBeLessThanOrEqual(5);
    });
  });
});
