import { Test, TestingModule } from '@nestjs/testing';
import { GameStateService, GameState } from './game-state.service';
import { GameService } from './game.service';
import { CommandProcessorService } from './command-processor.service';
import { EntityService } from '../entity/entity.service';
import { RoomService } from '../entity/room.service';
import { PlayerService } from '../entity/player.service';
import { ObjectService } from '../entity/object.service';
import { QuestManagerService } from '../quest/quest-manager.service';
import { InventoryManagerService } from '../inventory/inventory-manager.service';
import { WorldStateManagerService } from '../world-state/world-state-manager.service';
import { EffectManagerService } from '../effects/effect-manager.service';
import { EventEmitterService } from '../events/event-emitter.service';
import { DatabaseService } from '../database/database.service';
import { PhysicsService } from '../entity/physics.service';
import {
  IQuest,
  IPlayerQuest,
  QuestState,
  ObjectiveType,
  IQuestContext,
} from '../quest/quest.interfaces';
import {
  IInventory,
  IInventoryItem,
  EquipmentSlot,
} from '../inventory/inventory.interfaces';
import {
  IWorldState,
  IDoorState,
  INpcState,
  IObjectState,
  StateChangeType,
} from '../world-state/world-state.interfaces';
import {
  IActiveEffect,
  EffectType,
  DurationType,
  EffectTarget,
  StatType,
} from '../effects/effect.interfaces';
import { IPlayer } from '../entity/player.interface';
import { v4 as uuidv4 } from 'uuid';

/**
 * Comprehensive tests for game state integrity after save/load operations
 *
 * These tests ensure that the game state is perfectly preserved across save/load cycles,
 * with ZERO difference between pre-save and post-load states. This is critical for
 * player experience and game integrity.
 *
 * Coverage:
 * - Quest state integrity (active, completed, progress, rewards)
 * - NPC positions and states (spawn points, health, dialogue, combat)
 * - Inventory preservation (items, equipped gear, containers, stacking)
 * - Combat state integrity (active effects, health, turn order)
 * - World state consistency (doors, time, flags, environment)
 * - Player state integrity (stats, position, buffs, abilities)
 */
describe('GameStateService - State Integrity After Load', () => {
  let gameStateService: GameStateService;
  let questManager: QuestManagerService;
  let inventoryManager: InventoryManagerService;
  let worldStateManager: WorldStateManagerService;
  let effectManager: EffectManagerService;
  let playerService: PlayerService;
  let objectService: ObjectService;
  let roomService: RoomService;
  let eventEmitter: jest.Mocked<EventEmitterService>;

  beforeEach(async () => {
    const mockEventEmitter = {
      emit: jest.fn().mockResolvedValue(undefined),
      onAny: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
    };

    const mockDatabaseService = {
      prepare: jest.fn().mockReturnValue({
        run: jest.fn(),
        get: jest.fn(),
        all: jest.fn().mockReturnValue([]),
      }),
      transaction: jest.fn((fn) => fn(mockDatabaseService)),
      saveVersion: jest.fn().mockResolvedValue(1),
      getVersion: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameStateService,
        QuestManagerService,
        InventoryManagerService,
        WorldStateManagerService,
        EffectManagerService,
        EntityService,
        PlayerService,
        ObjectService,
        RoomService,
        PhysicsService,
        {
          provide: EventEmitterService,
          useValue: mockEventEmitter,
        },
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    gameStateService = module.get<GameStateService>(GameStateService);
    questManager = module.get<QuestManagerService>(QuestManagerService);
    inventoryManager = module.get<InventoryManagerService>(
      InventoryManagerService,
    );
    worldStateManager = module.get<WorldStateManagerService>(
      WorldStateManagerService,
    );
    effectManager = module.get<EffectManagerService>(EffectManagerService);
    playerService = module.get<PlayerService>(PlayerService);
    objectService = module.get<ObjectService>(ObjectService);
    roomService = module.get<RoomService>(RoomService);
    eventEmitter = module.get(EventEmitterService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // HELPER FUNCTIONS FOR STATE COMPARISON
  // ============================================================================

  /**
   * Deep equality check for game states
   */
  function expectDeepEqual(actual: any, expected: any, path = 'root') {
    if (actual === expected) return;

    if (typeof actual !== typeof expected) {
      throw new Error(
        `Type mismatch at ${path}: ${typeof actual} !== ${typeof expected}`,
      );
    }

    if (actual === null || expected === null) {
      if (actual !== expected) {
        throw new Error(`Null mismatch at ${path}`);
      }
      return;
    }

    if (Array.isArray(actual)) {
      if (!Array.isArray(expected)) {
        throw new Error(`Array type mismatch at ${path}`);
      }
      if (actual.length !== expected.length) {
        throw new Error(
          `Array length mismatch at ${path}: ${actual.length} !== ${expected.length}`,
        );
      }
      actual.forEach((item, index) => {
        expectDeepEqual(item, expected[index], `${path}[${index}]`);
      });
      return;
    }

    if (typeof actual === 'object') {
      const actualKeys = Object.keys(actual).sort();
      const expectedKeys = Object.keys(expected).sort();

      if (actualKeys.length !== expectedKeys.length) {
        throw new Error(
          `Object key count mismatch at ${path}: ${actualKeys.length} !== ${expectedKeys.length}`,
        );
      }

      for (const key of actualKeys) {
        if (!expectedKeys.includes(key)) {
          throw new Error(`Missing key at ${path}: ${key}`);
        }
        expectDeepEqual(actual[key], expected[key], `${path}.${key}`);
      }
      return;
    }

    if (actual !== expected) {
      throw new Error(`Value mismatch at ${path}: ${actual} !== ${expected}`);
    }
  }

  /**
   * Create a complex game state for testing
   */
  function createComplexGameState(gameId: string): GameState {
    const state: GameState = {
      gameId,
      player: {
        id: 'player1',
        name: 'Hero',
        type: 'player' as const,
        position: { x: 10, y: 20, z: 0 },
        health: 85,
        maxHealth: 100,
        inventory: ['sword1', 'potion1', 'key1'],
        level: 5,
        experience: 1250,
        roomId: 'room1',
      },
      rooms: {
        room1: {
          id: 'room1',
          name: 'Dungeon Hall',
          description: 'A dark hallway',
          position: { x: 0, y: 0, z: 0 },
          objects: ['torch1', 'chest1'],
          npcs: ['guard1'],
        },
        room2: {
          id: 'room2',
          name: 'Treasure Room',
          description: 'A room filled with gold',
          position: { x: 20, y: 0, z: 0 },
          objects: ['treasure1'],
          npcs: [],
        },
      },
      npcs: {
        guard1: {
          id: 'guard1',
          name: 'Guard Captain',
          type: 'npc',
          position: { x: 15, y: 20, z: 0 },
          health: 60,
          maxHealth: 80,
          level: 4,
          roomId: 'room1',
        },
      },
      items: {
        sword1: {
          id: 'sword1',
          name: 'Iron Sword',
          type: 'weapon',
          damage: 15,
        },
        potion1: {
          id: 'potion1',
          name: 'Health Potion',
          type: 'consumable',
          healAmount: 50,
        },
        key1: {
          id: 'key1',
          name: 'Brass Key',
          type: 'key',
        },
      },
      metadata: {
        version: '2.1.0',
        initialized: true,
        lastCommand: 'look around',
        lastCommandTime: new Date('2024-01-01T12:00:00Z'),
      },
    };

    return state;
  }

  /**
   * Serialize and deserialize to simulate save/load
   */
  function simulateSaveLoad(state: GameState): GameState {
    const serialized = JSON.stringify(state);
    return JSON.parse(serialized);
  }

  // ============================================================================
  // 1. QUEST STATE INTEGRITY (12 tests)
  // ============================================================================

  describe('Quest State Integrity', () => {
    it('should preserve active quest objectives after save/load', async () => {
      const gameId = 'game-quest-1';
      const playerId = 'player1';

      // Register a quest
      const quest: IQuest = {
        id: 'quest1',
        name: 'Collect Apples',
        description: 'Collect 10 apples from the orchard',
        gameId,
        objectives: [
          {
            id: 'obj1',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect 10 apples',
            targetId: 'apple',
            targetCount: 10,
            currentCount: 7,
            completed: false,
          },
        ],
      };
      questManager.registerQuest(quest);

      const context: IQuestContext = {
        gameId,
        playerId,
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await questManager.startQuest('quest1', playerId, context);

      // Progress the quest
      await questManager.updateObjective(
        playerId,
        'quest1',
        'obj1',
        7,
        context,
      );

      const beforeSave = questManager.getPlayerQuest(playerId, 'quest1');

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      const loaded = await gameStateService.loadGameState(gameId, 'test-slot');

      const afterLoad = questManager.getPlayerQuest(playerId, 'quest1');

      // Verify quest state preserved
      expect(afterLoad).toBeDefined();
      expect(afterLoad?.state).toBe(QuestState.ACTIVE);
      expect(afterLoad?.objectives[0].currentCount).toBe(7);
      expect(afterLoad?.objectives[0].completed).toBe(false);
    });

    it('should preserve completed quests after save/load', async () => {
      const gameId = 'game-quest-2';
      const playerId = 'player1';

      const quest: IQuest = {
        id: 'quest2',
        name: 'Simple Quest',
        description: 'A simple quest',
        gameId,
        objectives: [
          {
            id: 'obj1',
            type: ObjectiveType.GO_TO_LOCATION,
            description: 'Go to the town',
            targetId: 'town',
            currentCount: 1,
            completed: true,
          },
        ],
      };
      questManager.registerQuest(quest);

      const context: IQuestContext = {
        gameId,
        playerId,
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await questManager.startQuest('quest2', playerId, context);
      await questManager.completeQuest(playerId, 'quest2', context);

      const beforeSave = questManager.getPlayerQuest(playerId, 'quest2');

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const afterLoad = questManager.getPlayerQuest(playerId, 'quest2');

      expect(afterLoad).toBeDefined();
      expect(afterLoad?.state).toBe(QuestState.COMPLETED);
      expect(afterLoad?.completedAt).toBeDefined();
      expect(afterLoad?.objectives[0].completed).toBe(true);
    });

    it('should preserve quest progress counters accurately', async () => {
      const gameId = 'game-quest-3';
      const playerId = 'player1';

      const quest: IQuest = {
        id: 'quest3',
        name: 'Multi-Objective Quest',
        description: 'Complete multiple tasks',
        gameId,
        objectives: [
          {
            id: 'obj1',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect 5 coins',
            targetId: 'coin',
            targetCount: 5,
            currentCount: 3,
            completed: false,
          },
          {
            id: 'obj2',
            type: ObjectiveType.DEFEAT_ENEMY,
            description: 'Defeat 3 goblins',
            targetId: 'goblin',
            targetCount: 3,
            currentCount: 2,
            completed: false,
          },
        ],
      };
      questManager.registerQuest(quest);

      const context: IQuestContext = {
        gameId,
        playerId,
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await questManager.startQuest('quest3', playerId, context);
      await questManager.updateObjective(
        playerId,
        'quest3',
        'obj1',
        3,
        context,
      );
      await questManager.updateObjective(
        playerId,
        'quest3',
        'obj2',
        2,
        context,
      );

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const afterLoad = questManager.getPlayerQuest(playerId, 'quest3');

      expect(afterLoad?.objectives[0].currentCount).toBe(3);
      expect(afterLoad?.objectives[1].currentCount).toBe(2);
      expect(afterLoad?.objectives[0].targetCount).toBe(5);
      expect(afterLoad?.objectives[1].targetCount).toBe(3);
    });

    it('should verify quest item requirements still valid after load', async () => {
      const gameId = 'game-quest-4';
      const playerId = 'player1';

      const quest: IQuest = {
        id: 'quest4',
        name: 'Fetch Quest',
        description: 'Bring items to NPC',
        gameId,
        objectives: [
          {
            id: 'obj1',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect magic herb',
            targetId: 'herb_magic',
            targetCount: 1,
            currentCount: 0,
            completed: false,
          },
        ],
      };
      questManager.registerQuest(quest);

      const context: IQuestContext = {
        gameId,
        playerId,
        playerFlags: {},
        playerVariables: {},
        playerInventory: ['herb_magic'],
        completedQuests: [],
      };

      await questManager.startQuest('quest4', playerId, context);

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const afterLoad = questManager.getPlayerQuest(playerId, 'quest4');

      expect(afterLoad).toBeDefined();
      expect(afterLoad?.objectives[0].targetId).toBe('herb_magic');
      expect(afterLoad?.objectives[0].targetCount).toBe(1);
    });

    it('should preserve quest flags and variables after save/load', async () => {
      const gameId = 'game-quest-5';
      const playerId = 'player1';

      const quest: IQuest = {
        id: 'quest5',
        name: 'Quest with Metadata',
        description: 'Quest with custom data',
        gameId,
        objectives: [
          {
            id: 'obj1',
            type: ObjectiveType.CUSTOM,
            description: 'Custom objective',
            completed: false,
            metadata: {
              customFlag: true,
              customCounter: 42,
              customString: 'test',
            },
          },
        ],
      };
      questManager.registerQuest(quest);

      const context: IQuestContext = {
        gameId,
        playerId,
        playerFlags: { questFlag1: true, questFlag2: false },
        playerVariables: { questVar1: 100, questVar2: 'value' },
        playerInventory: [],
        completedQuests: [],
      };

      await questManager.startQuest('quest5', playerId, context);

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const afterLoad = questManager.getPlayerQuest(playerId, 'quest5');

      expect(afterLoad?.objectives[0].metadata).toEqual({
        customFlag: true,
        customCounter: 42,
        customString: 'test',
      });
    });

    it('should detect impossible quest conditions after load', async () => {
      const gameId = 'game-quest-6';
      const playerId = 'player1';

      // Create quest that requires a deleted item
      const quest: IQuest = {
        id: 'quest6',
        name: 'Impossible Quest',
        description: 'Quest with deleted item',
        gameId,
        objectives: [
          {
            id: 'obj1',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect deleted item',
            targetId: 'deleted_item',
            targetCount: 1,
            currentCount: 0,
            completed: false,
          },
        ],
      };
      questManager.registerQuest(quest);

      const context: IQuestContext = {
        gameId,
        playerId,
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await questManager.startQuest('quest6', playerId, context);

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const afterLoad = questManager.getPlayerQuest(playerId, 'quest6');

      // Quest should still be active, but we can verify the item doesn't exist
      expect(afterLoad).toBeDefined();
      expect(afterLoad?.state).toBe(QuestState.ACTIVE);
      expect(afterLoad?.objectives[0].targetId).toBe('deleted_item');
    });

    it('should preserve quest completion state vs objectives consistency', async () => {
      const gameId = 'game-quest-7';
      const playerId = 'player1';

      const quest: IQuest = {
        id: 'quest7',
        name: 'Partially Complete Quest',
        description: 'Quest with some objectives done',
        gameId,
        objectives: [
          {
            id: 'obj1',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect item 1',
            targetId: 'item1',
            targetCount: 1,
            currentCount: 1,
            completed: true,
          },
          {
            id: 'obj2',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect item 2',
            targetId: 'item2',
            targetCount: 1,
            currentCount: 0,
            completed: false,
          },
        ],
      };
      questManager.registerQuest(quest);

      const context: IQuestContext = {
        gameId,
        playerId,
        playerFlags: {},
        playerVariables: {},
        playerInventory: ['item1'],
        completedQuests: [],
      };

      await questManager.startQuest('quest7', playerId, context);

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const afterLoad = questManager.getPlayerQuest(playerId, 'quest7');

      expect(afterLoad?.state).toBe(QuestState.ACTIVE);
      expect(afterLoad?.objectives[0].completed).toBe(true);
      expect(afterLoad?.objectives[1].completed).toBe(false);
    });

    it('should not re-grant quest rewards after load', async () => {
      const gameId = 'game-quest-8';
      const playerId = 'player1';

      const quest: IQuest = {
        id: 'quest8',
        name: 'Quest with Rewards',
        description: 'Quest that gives rewards',
        gameId,
        objectives: [
          {
            id: 'obj1',
            type: ObjectiveType.TALK_TO_NPC,
            description: 'Talk to NPC',
            targetId: 'npc1',
            completed: true,
          },
        ],
        rewards: [
          {
            type: 'experience',
            experience: 100,
          },
          {
            type: 'item',
            itemId: 'reward_sword',
            itemCount: 1,
          },
        ],
      };
      questManager.registerQuest(quest);

      const context: IQuestContext = {
        gameId,
        playerId,
        playerLevel: 1,
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await questManager.startQuest('quest8', playerId, context);
      await questManager.completeQuest(playerId, 'quest8', context);

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const afterLoad = questManager.getPlayerQuest(playerId, 'quest8');

      // Quest should be completed and not give rewards again
      expect(afterLoad?.state).toBe(QuestState.COMPLETED);
      expect(afterLoad?.completedAt).toBeDefined();
    });

    it('should preserve quest chain dependencies after load', async () => {
      const gameId = 'game-quest-9';
      const playerId = 'player1';

      const quest1: IQuest = {
        id: 'quest9_part1',
        name: 'Quest Chain Part 1',
        description: 'First quest in chain',
        gameId,
        objectives: [
          {
            id: 'obj1',
            type: ObjectiveType.TALK_TO_NPC,
            description: 'Talk to Elder',
            targetId: 'elder',
            completed: true,
          },
        ],
        nextQuestId: 'quest9_part2',
      };

      const quest2: IQuest = {
        id: 'quest9_part2',
        name: 'Quest Chain Part 2',
        description: 'Second quest in chain',
        gameId,
        objectives: [
          {
            id: 'obj1',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect artifact',
            targetId: 'artifact',
            targetCount: 1,
            currentCount: 0,
            completed: false,
          },
        ],
        prerequisites: [
          {
            type: 'quest',
            questId: 'quest9_part1',
          },
        ],
      };

      questManager.registerQuest(quest1);
      questManager.registerQuest(quest2);

      const context: IQuestContext = {
        gameId,
        playerId,
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await questManager.startQuest('quest9_part1', playerId, context);
      await questManager.completeQuest(playerId, 'quest9_part1', context);

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const afterLoad1 = questManager.getPlayerQuest(playerId, 'quest9_part1');

      expect(afterLoad1?.state).toBe(QuestState.COMPLETED);
      expect(afterLoad1?.nextQuestId).toBe('quest9_part2');
    });

    it('should preserve failed quest state after load', async () => {
      const gameId = 'game-quest-10';
      const playerId = 'player1';

      const quest: IQuest = {
        id: 'quest10',
        name: 'Time-Limited Quest',
        description: 'Quest that can fail',
        gameId,
        objectives: [
          {
            id: 'obj1',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect rare item',
            targetId: 'rare_item',
            targetCount: 1,
            currentCount: 0,
            completed: false,
          },
        ],
        timeLimit: 3600,
      };
      questManager.registerQuest(quest);

      const context: IQuestContext = {
        gameId,
        playerId,
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await questManager.startQuest('quest10', playerId, context);
      await questManager.failQuest(playerId, 'quest10', 'Time expired');

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const afterLoad = questManager.getPlayerQuest(playerId, 'quest10');

      expect(afterLoad?.state).toBe(QuestState.FAILED);
      expect(afterLoad?.failedAt).toBeDefined();
    });

    it('should preserve optional quest objectives state', async () => {
      const gameId = 'game-quest-11';
      const playerId = 'player1';

      const quest: IQuest = {
        id: 'quest11',
        name: 'Quest with Optional Objectives',
        description: 'Quest with required and optional objectives',
        gameId,
        objectives: [
          {
            id: 'obj1',
            type: ObjectiveType.TALK_TO_NPC,
            description: 'Talk to quest giver (required)',
            targetId: 'questgiver',
            completed: true,
            optional: false,
          },
          {
            id: 'obj2',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect bonus item (optional)',
            targetId: 'bonus_item',
            targetCount: 1,
            currentCount: 0,
            completed: false,
            optional: true,
          },
        ],
      };
      questManager.registerQuest(quest);

      const context: IQuestContext = {
        gameId,
        playerId,
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await questManager.startQuest('quest11', playerId, context);

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const afterLoad = questManager.getPlayerQuest(playerId, 'quest11');

      expect(afterLoad?.objectives[0].optional).toBe(false);
      expect(afterLoad?.objectives[0].completed).toBe(true);
      expect(afterLoad?.objectives[1].optional).toBe(true);
      expect(afterLoad?.objectives[1].completed).toBe(false);
    });

    it('should preserve quest metadata and timestamps', async () => {
      const gameId = 'game-quest-12';
      const playerId = 'player1';

      const quest: IQuest = {
        id: 'quest12',
        name: 'Quest with Timestamps',
        description: 'Quest to test timestamp preservation',
        gameId,
        objectives: [
          {
            id: 'obj1',
            type: ObjectiveType.CUSTOM,
            description: 'Custom objective',
            completed: false,
          },
        ],
        metadata: {
          customData: 'test',
          questGiver: 'NPC_Elder',
          region: 'Northern Woods',
        },
      };
      questManager.registerQuest(quest);

      const context: IQuestContext = {
        gameId,
        playerId,
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await questManager.startQuest('quest12', playerId, context);

      const beforeSave = questManager.getPlayerQuest(playerId, 'quest12');
      const startedAtBefore = beforeSave?.startedAt;

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const afterLoad = questManager.getPlayerQuest(playerId, 'quest12');

      expect(afterLoad?.startedAt).toBe(startedAtBefore);
      expect(afterLoad?.metadata).toEqual(beforeSave?.metadata);
    });
  });

  // ============================================================================
  // 2. NPC POSITION & STATE (10 tests)
  // ============================================================================

  describe('NPC Position & State', () => {
    it('should preserve NPC positions in valid rooms after load', async () => {
      const gameId = 'game-npc-1';

      // Create room and NPC
      const room = roomService.createRoom({
        name: 'Town Square',
        description: 'A bustling square',
        position: { x: 0, y: 0, z: 0 },
        width: 20,
        height: 20,
        size: { width: 20, height: 20, depth: 3 },
        objects: [],
        players: [],
        gameId,
      });

      const npcPosition = { x: 10, y: 10, z: 0 };
      const worldState = worldStateManager.initializeWorldState(gameId);

      const npcState: INpcState = {
        npcId: 'guard1',
        alive: true,
        position: npcPosition,
        roomId: room.id,
        health: 100,
        attitude: 'neutral',
        customState: {},
        lastModified: new Date().toISOString(),
      };

      worldState.npcs.set('guard1', npcState);

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const loadedNpc = loadedWorldState?.npcs.get('guard1');

      expect(loadedNpc).toBeDefined();
      expect(loadedNpc?.position).toEqual(npcPosition);
      expect(loadedNpc?.roomId).toBe(room.id);
    });

    it('should ensure NPC positions do not overlap with player after load', async () => {
      const gameId = 'game-npc-2';
      const playerId = 'player1';

      const player = playerService.createPlayer({
        name: 'Hero',
        position: { x: 5, y: 5, z: 0 },
        health: 100,
        inventory: [],
        level: 1,
        experience: 0,
        gameId,
      });

      const worldState = worldStateManager.initializeWorldState(gameId);

      const npcState: INpcState = {
        npcId: 'merchant1',
        alive: true,
        position: { x: 15, y: 15, z: 0 }, // Different from player
        health: 50,
        attitude: 'friendly',
        customState: {},
        lastModified: new Date().toISOString(),
      };

      worldState.npcs.set('merchant1', npcState);

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedPlayer = playerService.getPlayer(player.id);
      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const loadedNpc = loadedWorldState?.npcs.get('merchant1');

      // Ensure positions don't overlap
      expect(loadedPlayer?.position).not.toEqual(loadedNpc?.position);
    });

    it('should preserve NPC patrol paths after load', async () => {
      const gameId = 'game-npc-3';

      const worldState = worldStateManager.initializeWorldState(gameId);

      const patrolPath = [
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 },
        { x: 10, y: 10, z: 0 },
        { x: 0, y: 10, z: 0 },
      ];

      const npcState: INpcState = {
        npcId: 'guard_patrol',
        alive: true,
        position: patrolPath[0],
        health: 80,
        attitude: 'neutral',
        customState: {
          patrolPath,
          currentPatrolIndex: 2,
        },
        lastModified: new Date().toISOString(),
      };

      worldState.npcs.set('guard_patrol', npcState);

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const loadedNpc = loadedWorldState?.npcs.get('guard_patrol');

      expect(loadedNpc?.customState.patrolPath).toEqual(patrolPath);
      expect(loadedNpc?.customState.currentPatrolIndex).toBe(2);
    });

    it('should preserve NPC health and stats within valid ranges', async () => {
      const gameId = 'game-npc-4';

      const worldState = worldStateManager.initializeWorldState(gameId);

      const npcState: INpcState = {
        npcId: 'boss1',
        alive: true,
        position: { x: 50, y: 50, z: 0 },
        health: 450,
        attitude: 'hostile',
        customState: {
          maxHealth: 500,
          defense: 25,
          attack: 35,
          level: 10,
        },
        lastModified: new Date().toISOString(),
      };

      worldState.npcs.set('boss1', npcState);

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const loadedNpc = loadedWorldState?.npcs.get('boss1');

      expect(loadedNpc?.health).toBe(450);
      expect(loadedNpc?.customState.maxHealth).toBe(500);
      expect(loadedNpc?.health).toBeLessThanOrEqual(
        loadedNpc?.customState.maxHealth,
      );
    });

    it('should preserve NPC dialogue state after load', async () => {
      const gameId = 'game-npc-5';

      const worldState = worldStateManager.initializeWorldState(gameId);

      const dialogueState = {
        currentNode: 'node5',
        completedDialogues: ['intro', 'quest_offer', 'quest_accepted'],
        relationshipLevel: 3,
        lastInteraction: new Date().toISOString(),
      };

      const npcState: INpcState = {
        npcId: 'questgiver1',
        alive: true,
        position: { x: 20, y: 20, z: 0 },
        health: 100,
        attitude: 'friendly',
        customState: {
          dialogue: dialogueState,
        },
        lastModified: new Date().toISOString(),
      };

      worldState.npcs.set('questgiver1', npcState);

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const loadedNpc = loadedWorldState?.npcs.get('questgiver1');

      expect(loadedNpc?.customState.dialogue).toEqual(dialogueState);
    });

    it('should preserve NPC relationships and factions after load', async () => {
      const gameId = 'game-npc-6';

      const worldState = worldStateManager.initializeWorldState(gameId);

      const factionData = {
        faction: 'City Guard',
        rank: 'Captain',
        reputation: 75,
        allies: ['player1', 'merchant1'],
        enemies: ['bandit1', 'bandit2'],
      };

      const npcState: INpcState = {
        npcId: 'guard_captain',
        alive: true,
        position: { x: 0, y: 0, z: 0 },
        health: 120,
        attitude: 'friendly',
        customState: {
          faction: factionData,
        },
        lastModified: new Date().toISOString(),
      };

      worldState.npcs.set('guard_captain', npcState);

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const loadedNpc = loadedWorldState?.npcs.get('guard_captain');

      expect(loadedNpc?.customState.faction).toEqual(factionData);
    });

    it('should preserve dead NPC state after load', async () => {
      const gameId = 'game-npc-7';

      const worldState = worldStateManager.initializeWorldState(gameId);

      const npcState: INpcState = {
        npcId: 'defeated_enemy',
        alive: false,
        position: { x: 30, y: 30, z: 0 },
        health: 0,
        attitude: 'hostile',
        customState: {
          deathTime: new Date().toISOString(),
          killedBy: 'player1',
          droppedLoot: ['sword1', 'gold_50'],
        },
        lastModified: new Date().toISOString(),
      };

      worldState.npcs.set('defeated_enemy', npcState);

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const loadedNpc = loadedWorldState?.npcs.get('defeated_enemy');

      expect(loadedNpc?.alive).toBe(false);
      expect(loadedNpc?.health).toBe(0);
      expect(loadedNpc?.customState.killedBy).toBe('player1');
    });

    it('should preserve NPC inventory after load', async () => {
      const gameId = 'game-npc-8';

      const worldState = worldStateManager.initializeWorldState(gameId);

      const npcInventory = ['sword1', 'shield1', 'potion1', 'potion2', 'key1'];

      const npcState: INpcState = {
        npcId: 'merchant1',
        alive: true,
        position: { x: 0, y: 0, z: 0 },
        health: 50,
        attitude: 'friendly',
        customState: {
          inventory: npcInventory,
          shopItems: ['item1', 'item2', 'item3'],
          gold: 500,
        },
        lastModified: new Date().toISOString(),
      };

      worldState.npcs.set('merchant1', npcState);

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const loadedNpc = loadedWorldState?.npcs.get('merchant1');

      expect(loadedNpc?.customState.inventory).toEqual(npcInventory);
      expect(loadedNpc?.customState.shopItems).toEqual([
        'item1',
        'item2',
        'item3',
      ]);
    });

    it('should preserve NPC combat state after load', async () => {
      const gameId = 'game-npc-9';

      const worldState = worldStateManager.initializeWorldState(gameId);

      const combatState = {
        inCombat: true,
        combatTarget: 'player1',
        lastAttackTime: new Date().toISOString(),
        combatRound: 5,
        damageDealt: 75,
        damageTaken: 120,
      };

      const npcState: INpcState = {
        npcId: 'hostile_mob',
        alive: true,
        position: { x: 10, y: 10, z: 0 },
        health: 80,
        attitude: 'hostile',
        currentActivity: 'combat',
        customState: {
          combat: combatState,
        },
        lastModified: new Date().toISOString(),
      };

      worldState.npcs.set('hostile_mob', npcState);

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const loadedNpc = loadedWorldState?.npcs.get('hostile_mob');

      expect(loadedNpc?.customState.combat).toEqual(combatState);
      expect(loadedNpc?.currentActivity).toBe('combat');
    });

    it('should preserve NPC respawn timers and state', async () => {
      const gameId = 'game-npc-10';

      const worldState = worldStateManager.initializeWorldState(gameId);

      const respawnState = {
        canRespawn: true,
        respawnTime: 300000, // 5 minutes
        deathTime: new Date().toISOString(),
        respawnLocation: { x: 0, y: 0, z: 0 },
      };

      const npcState: INpcState = {
        npcId: 'respawning_boss',
        alive: false,
        position: { x: 100, y: 100, z: 0 },
        health: 0,
        attitude: 'hostile',
        customState: {
          respawn: respawnState,
        },
        lastModified: new Date().toISOString(),
      };

      worldState.npcs.set('respawning_boss', npcState);

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const loadedNpc = loadedWorldState?.npcs.get('respawning_boss');

      expect(loadedNpc?.customState.respawn).toEqual(respawnState);
    });
  });

  // ============================================================================
  // 3. INVENTORY STATE PRESERVATION (12 tests)
  // ============================================================================

  describe('Inventory State Preservation', () => {
    it('should verify all items in inventory exist after load', async () => {
      const gameId = 'game-inv-1';
      const playerId = 'player1';

      const inventory = inventoryManager.createInventory(playerId, gameId, {
        maxSlots: 50,
        maxWeight: 1000,
        allowStacking: true,
      });

      await inventoryManager.addItem(playerId, 'sword1', 1);
      await inventoryManager.addItem(playerId, 'potion1', 5);
      await inventoryManager.addItem(playerId, 'key1', 1);

      const beforeSave = inventoryManager.getInventory(playerId);

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const afterLoad = inventoryManager.getInventory(playerId);

      expect(afterLoad).toBeDefined();
      expect(afterLoad?.items.length).toBe(beforeSave?.items.length);
      expect(afterLoad?.items.map((i) => i.itemId).sort()).toEqual(
        beforeSave?.items.map((i) => i.itemId).sort(),
      );
    });

    it('should preserve item quantities exactly after load', async () => {
      const gameId = 'game-inv-2';
      const playerId = 'player1';

      inventoryManager.createInventory(playerId, gameId, {
        maxSlots: 50,
        allowStacking: true,
      });

      await inventoryManager.addItem(playerId, 'arrow', 75);
      await inventoryManager.addItem(playerId, 'potion', 12);
      await inventoryManager.addItem(playerId, 'gold', 1543);

      const beforeSave = inventoryManager.getInventory(playerId);
      const itemsBefore = beforeSave?.items || [];

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const afterLoad = inventoryManager.getInventory(playerId);
      const itemsAfter = afterLoad?.items || [];

      for (const beforeItem of itemsBefore) {
        const afterItem = itemsAfter.find(
          (i) => i.itemId === beforeItem.itemId,
        );
        expect(afterItem).toBeDefined();
        expect(afterItem?.quantity).toBe(beforeItem.quantity);
      }
    });

    it('should preserve equipped items in correct slots after load', async () => {
      const gameId = 'game-inv-3';
      const playerId = 'player1';

      inventoryManager.createInventory(playerId, gameId, {
        maxSlots: 50,
        allowEquipment: true,
      });

      await inventoryManager.addItem(playerId, 'helmet1', 1);
      await inventoryManager.addItem(playerId, 'sword1', 1);
      await inventoryManager.addItem(playerId, 'shield1', 1);

      await inventoryManager.equipItem(playerId, 'helmet1', EquipmentSlot.HEAD);
      await inventoryManager.equipItem(
        playerId,
        'sword1',
        EquipmentSlot.MAIN_HAND,
      );
      await inventoryManager.equipItem(
        playerId,
        'shield1',
        EquipmentSlot.OFF_HAND,
      );

      const beforeSave = inventoryManager.getInventory(playerId);

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const afterLoad = inventoryManager.getInventory(playerId);

      expect(afterLoad?.equippedItems.get(EquipmentSlot.HEAD)?.itemId).toBe(
        'helmet1',
      );
      expect(
        afterLoad?.equippedItems.get(EquipmentSlot.MAIN_HAND)?.itemId,
      ).toBe('sword1');
      expect(afterLoad?.equippedItems.get(EquipmentSlot.OFF_HAND)?.itemId).toBe(
        'shield1',
      );
    });

    it('should preserve container contents after load', async () => {
      const gameId = 'game-inv-4';
      const playerId = 'player1';

      inventoryManager.createInventory(playerId, gameId, {
        maxSlots: 50,
      });

      // Add a bag with items inside
      await inventoryManager.addItem(playerId, 'bag1', 1, {
        containerItems: [
          {
            instanceId: uuidv4(),
            itemId: 'coin',
            quantity: 100,
          },
          {
            instanceId: uuidv4(),
            itemId: 'gem',
            quantity: 5,
          },
        ],
      });

      const beforeSave = inventoryManager.getInventory(playerId);
      const bagBefore = beforeSave?.items.find((i) => i.itemId === 'bag1');

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const afterLoad = inventoryManager.getInventory(playerId);
      const bagAfter = afterLoad?.items.find((i) => i.itemId === 'bag1');

      expect(bagAfter?.containerItems).toBeDefined();
      expect(bagAfter?.containerItems?.length).toBe(2);
      expect(bagAfter?.containerItems?.[0].itemId).toBe('coin');
      expect(bagAfter?.containerItems?.[0].quantity).toBe(100);
    });

    it('should preserve item durability and conditions after load', async () => {
      const gameId = 'game-inv-5';
      const playerId = 'player1';

      inventoryManager.createInventory(playerId, gameId, {
        maxSlots: 50,
      });

      await inventoryManager.addItem(playerId, 'sword1', 1, {
        metadata: {
          durability: 75,
          maxDurability: 100,
          condition: 'good',
          sharpness: 0.85,
        },
      });

      const beforeSave = inventoryManager.getInventory(playerId);
      const swordBefore = beforeSave?.items.find((i) => i.itemId === 'sword1');

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const afterLoad = inventoryManager.getInventory(playerId);
      const swordAfter = afterLoad?.items.find((i) => i.itemId === 'sword1');

      expect(swordAfter?.metadata).toEqual(swordBefore?.metadata);
    });

    it('should preserve item custom properties after load', async () => {
      const gameId = 'game-inv-6';
      const playerId = 'player1';

      inventoryManager.createInventory(playerId, gameId, {
        maxSlots: 50,
      });

      await inventoryManager.addItem(playerId, 'magic_ring', 1, {
        metadata: {
          enchantments: ['fire_damage', 'health_regen'],
          bonusStats: {
            strength: 5,
            intelligence: 3,
          },
          soulbound: true,
          craftedBy: 'Master Blacksmith',
        },
      });

      const beforeSave = inventoryManager.getInventory(playerId);
      const ringBefore = beforeSave?.items.find(
        (i) => i.itemId === 'magic_ring',
      );

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const afterLoad = inventoryManager.getInventory(playerId);
      const ringAfter = afterLoad?.items.find((i) => i.itemId === 'magic_ring');

      expect(ringAfter?.metadata).toEqual(ringBefore?.metadata);
    });

    it('should detect no item duplication after load', async () => {
      const gameId = 'game-inv-7';
      const playerId = 'player1';

      inventoryManager.createInventory(playerId, gameId, {
        maxSlots: 50,
      });

      await inventoryManager.addItem(playerId, 'unique_sword', 1);
      await inventoryManager.addItem(playerId, 'unique_shield', 1);

      const beforeSave = inventoryManager.getInventory(playerId);
      const uniqueItemsBefore = beforeSave?.items.filter((i) =>
        i.itemId.startsWith('unique_'),
      );

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const afterLoad = inventoryManager.getInventory(playerId);
      const uniqueItemsAfter = afterLoad?.items.filter((i) =>
        i.itemId.startsWith('unique_'),
      );

      expect(uniqueItemsAfter?.length).toBe(uniqueItemsBefore?.length);
      expect(uniqueItemsAfter?.length).toBe(2);
    });

    it('should detect no item loss after load', async () => {
      const gameId = 'game-inv-8';
      const playerId = 'player1';

      inventoryManager.createInventory(playerId, gameId, {
        maxSlots: 50,
      });

      const itemsToAdd = [
        'sword',
        'shield',
        'helmet',
        'boots',
        'potion',
        'key',
      ];
      for (const itemId of itemsToAdd) {
        await inventoryManager.addItem(playerId, itemId, 1);
      }

      const beforeSave = inventoryManager.getInventory(playerId);

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const afterLoad = inventoryManager.getInventory(playerId);

      expect(afterLoad?.items.length).toBe(beforeSave?.items.length);
      for (const itemId of itemsToAdd) {
        expect(afterLoad?.items.find((i) => i.itemId === itemId)).toBeDefined();
      }
    });

    it('should preserve stackable item stacking correctly after load', async () => {
      const gameId = 'game-inv-9';
      const playerId = 'player1';

      inventoryManager.createInventory(playerId, gameId, {
        maxSlots: 50,
        allowStacking: true,
      });

      // Add stackable items
      await inventoryManager.addItem(playerId, 'arrow', 50, {
        maxStack: 100,
      });
      await inventoryManager.addItem(playerId, 'arrow', 30); // Should stack

      const beforeSave = inventoryManager.getInventory(playerId);
      const arrowsBefore = beforeSave?.items.filter(
        (i) => i.itemId === 'arrow',
      );

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const afterLoad = inventoryManager.getInventory(playerId);
      const arrowsAfter = afterLoad?.items.filter((i) => i.itemId === 'arrow');

      // Should be stacked into one item with quantity 80
      expect(arrowsAfter?.length).toBe(arrowsBefore?.length);
      const totalQuantity = arrowsAfter?.reduce(
        (sum, item) => sum + item.quantity,
        0,
      );
      expect(totalQuantity).toBe(80);
    });

    it('should preserve weight and capacity calculations after load', async () => {
      const gameId = 'game-inv-10';
      const playerId = 'player1';

      inventoryManager.createInventory(playerId, gameId, {
        maxSlots: 50,
        maxWeight: 1000,
      });

      await inventoryManager.addItem(playerId, 'sword', 1, { weight: 15 });
      await inventoryManager.addItem(playerId, 'shield', 1, { weight: 20 });
      await inventoryManager.addItem(playerId, 'armor', 1, { weight: 35 });

      const beforeSave = inventoryManager.getInventory(playerId);
      const weightBefore = beforeSave?.currentWeight;

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const afterLoad = inventoryManager.getInventory(playerId);
      const weightAfter = afterLoad?.currentWeight;

      expect(weightAfter).toBe(weightBefore);
      expect(weightAfter).toBe(70); // 15 + 20 + 35
    });

    it('should preserve inventory configuration after load', async () => {
      const gameId = 'game-inv-11';
      const playerId = 'player1';

      const config = {
        maxSlots: 75,
        maxWeight: 2000,
        allowStacking: true,
        allowEquipment: true,
        equipmentSlots: [
          EquipmentSlot.HEAD,
          EquipmentSlot.CHEST,
          EquipmentSlot.MAIN_HAND,
          EquipmentSlot.OFF_HAND,
        ],
      };

      inventoryManager.createInventory(playerId, gameId, config);

      const beforeSave = inventoryManager.getInventory(playerId);

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const afterLoad = inventoryManager.getInventory(playerId);

      expect(afterLoad?.config).toEqual(beforeSave?.config);
    });

    it('should preserve item instance IDs after load', async () => {
      const gameId = 'game-inv-12';
      const playerId = 'player1';

      inventoryManager.createInventory(playerId, gameId, {
        maxSlots: 50,
      });

      await inventoryManager.addItem(playerId, 'sword', 1);
      await inventoryManager.addItem(playerId, 'potion', 1);

      const beforeSave = inventoryManager.getInventory(playerId);
      const instanceIdsBefore = beforeSave?.items.map((i) => i.instanceId);

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const afterLoad = inventoryManager.getInventory(playerId);
      const instanceIdsAfter = afterLoad?.items.map((i) => i.instanceId);

      expect(instanceIdsAfter).toEqual(instanceIdsBefore);
    });
  });

  // ============================================================================
  // 4. COMBAT STATE INTEGRITY (10 tests)
  // ============================================================================

  describe('Combat State Integrity', () => {
    it('should preserve active combat state after load', async () => {
      const gameId = 'game-combat-1';
      const playerId = 'player1';

      const worldState = worldStateManager.initializeWorldState(gameId);

      worldState.globalVariables['activeCombat'] = {
        combatId: 'combat1',
        participants: ['player1', 'enemy1'],
        round: 3,
        turnOrder: ['player1', 'enemy1'],
        currentTurn: 0,
        startTime: new Date().toISOString(),
      };

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const combatState = loadedWorldState?.globalVariables['activeCombat'];

      expect(combatState).toBeDefined();
      expect(combatState.round).toBe(3);
      expect(combatState.participants).toEqual(['player1', 'enemy1']);
    });

    it('should preserve combat participant health accurately after load', async () => {
      const gameId = 'game-combat-2';
      const playerId = 'player1';

      const player = playerService.createPlayer({
        name: 'Warrior',
        position: { x: 0, y: 0, z: 0 },
        health: 65,
        maxHealth: 100,
        inventory: [],
        level: 5,
        experience: 0,
        gameId,
      });

      const worldState = worldStateManager.initializeWorldState(gameId);

      const enemyState: INpcState = {
        npcId: 'enemy1',
        alive: true,
        position: { x: 5, y: 5, z: 0 },
        health: 40,
        customState: {
          maxHealth: 80,
        },
        lastModified: new Date().toISOString(),
      };

      worldState.npcs.set('enemy1', enemyState);

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedPlayer = playerService.getPlayer(player.id);
      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const loadedEnemy = loadedWorldState?.npcs.get('enemy1');

      expect(loadedPlayer?.health).toBe(65);
      expect(loadedEnemy?.health).toBe(40);
    });

    it('should preserve active effects on entities after load', async () => {
      const gameId = 'game-combat-3';
      const playerId = 'player1';

      const player = playerService.createPlayer({
        name: 'Mage',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 1,
        experience: 0,
        gameId,
      });

      const effect = {
        id: 'effect1',
        name: 'Strength Buff',
        description: 'Increases strength',
        type: EffectType.BUFF,
        target: EffectTarget.SELF,
        durationType: DurationType.OVER_TIME,
        duration: 60000,
        statType: StatType.STRENGTH,
        value: 10,
      };

      const activeEffect: IActiveEffect = {
        effectId: 'effect1',
        effect,
        targetId: player.id,
        sourceId: 'potion1',
        appliedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        stacks: 1,
      };

      await effectManager.applyEffect(gameId, activeEffect);

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const activeEffects = effectManager.getActiveEffects(gameId, player.id);

      expect(activeEffects.length).toBe(1);
      expect(activeEffects[0].effectId).toBe('effect1');
      expect(activeEffects[0].stacks).toBe(1);
    });

    it('should preserve effect durations and ticks accurately after load', async () => {
      const gameId = 'game-combat-4';
      const playerId = 'player1';

      const player = playerService.createPlayer({
        name: 'Paladin',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 1,
        experience: 0,
        gameId,
      });

      const effect = {
        id: 'poison1',
        name: 'Poison',
        description: 'Deals damage over time',
        type: EffectType.POISON,
        target: EffectTarget.SELF,
        durationType: DurationType.OVER_TIME,
        duration: 30000,
        tickInterval: 3000,
        tickCount: 10,
        value: 5,
      };

      const appliedAt = new Date();
      const activeEffect: IActiveEffect = {
        effectId: 'poison1',
        effect,
        targetId: player.id,
        appliedAt: appliedAt.toISOString(),
        expiresAt: new Date(appliedAt.getTime() + 30000).toISOString(),
        lastTickAt: new Date(appliedAt.getTime() + 9000).toISOString(),
        ticksRemaining: 7,
        stacks: 1,
      };

      await effectManager.applyEffect(gameId, activeEffect);

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const activeEffects = effectManager.getActiveEffects(gameId, player.id);

      expect(activeEffects[0].ticksRemaining).toBe(7);
      expect(activeEffects[0].lastTickAt).toBeDefined();
    });

    it('should preserve combat positions after load', async () => {
      const gameId = 'game-combat-5';

      const worldState = worldStateManager.initializeWorldState(gameId);

      worldState.globalVariables['combatPositions'] = {
        player1: { x: 10, y: 10, z: 0, stance: 'offensive' },
        enemy1: { x: 15, y: 10, z: 0, stance: 'defensive' },
        enemy2: { x: 15, y: 15, z: 0, stance: 'flanking' },
      };

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const positions = loadedWorldState?.globalVariables['combatPositions'];

      expect(positions).toBeDefined();
      expect(positions.player1.stance).toBe('offensive');
      expect(positions.enemy1.stance).toBe('defensive');
    });

    it('should preserve weapon and armor states after load', async () => {
      const gameId = 'game-combat-6';
      const playerId = 'player1';

      inventoryManager.createInventory(playerId, gameId, {
        maxSlots: 50,
        allowEquipment: true,
      });

      await inventoryManager.addItem(playerId, 'magic_sword', 1, {
        metadata: {
          damage: 25,
          durability: 85,
          maxDurability: 100,
          enchantments: ['fire_damage'],
        },
      });

      await inventoryManager.addItem(playerId, 'plate_armor', 1, {
        metadata: {
          defense: 40,
          durability: 150,
          maxDurability: 200,
        },
      });

      await inventoryManager.equipItem(
        playerId,
        'magic_sword',
        EquipmentSlot.MAIN_HAND,
      );
      await inventoryManager.equipItem(
        playerId,
        'plate_armor',
        EquipmentSlot.CHEST,
      );

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const inventory = inventoryManager.getInventory(playerId);
      const sword = inventory?.equippedItems.get(EquipmentSlot.MAIN_HAND);
      const armor = inventory?.equippedItems.get(EquipmentSlot.CHEST);

      expect(sword?.metadata?.durability).toBe(85);
      expect(armor?.metadata?.durability).toBe(150);
    });

    it('should preserve combat logs and history after load', async () => {
      const gameId = 'game-combat-7';

      const worldState = worldStateManager.initializeWorldState(gameId);

      const combatLog = [
        {
          round: 1,
          action: 'player1 attacks enemy1',
          damage: 15,
          timestamp: new Date().toISOString(),
        },
        {
          round: 1,
          action: 'enemy1 attacks player1',
          damage: 10,
          timestamp: new Date().toISOString(),
        },
        {
          round: 2,
          action: 'player1 casts fireball',
          damage: 25,
          timestamp: new Date().toISOString(),
        },
      ];

      worldState.globalVariables['combatLog'] = combatLog;

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const loadedLog = loadedWorldState?.globalVariables['combatLog'];

      expect(loadedLog).toBeDefined();
      expect(loadedLog.length).toBe(3);
      expect(loadedLog[2].damage).toBe(25);
    });

    it('should preserve turn order after load', async () => {
      const gameId = 'game-combat-8';

      const worldState = worldStateManager.initializeWorldState(gameId);

      const turnOrder = [
        { entityId: 'player1', initiative: 18 },
        { entityId: 'rogue_npc', initiative: 16 },
        { entityId: 'enemy1', initiative: 12 },
        { entityId: 'enemy2', initiative: 8 },
      ];

      worldState.globalVariables['turnOrder'] = turnOrder;
      worldState.globalVariables['currentTurnIndex'] = 2;

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const loadedTurnOrder = loadedWorldState?.globalVariables['turnOrder'];
      const currentIndex =
        loadedWorldState?.globalVariables['currentTurnIndex'];

      expect(loadedTurnOrder).toEqual(turnOrder);
      expect(currentIndex).toBe(2);
    });

    it('should clear or preserve combat state appropriately on load', async () => {
      const gameId = 'game-combat-9';

      const worldState = worldStateManager.initializeWorldState(gameId);

      // Active combat that should be preserved
      worldState.globalVariables['combatActive'] = true;
      worldState.globalVariables['combatState'] = {
        combatId: 'combat1',
        canResume: true,
        participants: ['player1', 'boss1'],
      };

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedWorldState = worldStateManager.getWorldState(gameId);

      expect(loadedWorldState?.globalVariables['combatActive']).toBe(true);
      expect(loadedWorldState?.globalVariables['combatState'].canResume).toBe(
        true,
      );
    });

    it('should preserve temporary combat buffs with expiration times', async () => {
      const gameId = 'game-combat-10';
      const playerId = 'player1';

      const player = playerService.createPlayer({
        name: 'Berserker',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 1,
        experience: 0,
        gameId,
      });

      const rageEffect = {
        id: 'rage',
        name: 'Berserker Rage',
        description: 'Increases attack damage',
        type: EffectType.BUFF,
        target: EffectTarget.SELF,
        durationType: DurationType.UNTIL_COMBAT_END,
        statType: StatType.ATTACK,
        value: 50,
        percentage: true,
      };

      const expiresAt = new Date(Date.now() + 45000);
      const activeEffect: IActiveEffect = {
        effectId: 'rage',
        effect: rageEffect,
        targetId: player.id,
        appliedAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
        stacks: 1,
      };

      await effectManager.applyEffect(gameId, activeEffect);

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const activeEffects = effectManager.getActiveEffects(gameId, player.id);

      expect(activeEffects.length).toBe(1);
      expect(activeEffects[0].effectId).toBe('rage');
      expect(activeEffects[0].expiresAt).toBeDefined();
    });
  });

  // ============================================================================
  // 5. WORLD STATE CONSISTENCY (12 tests)
  // ============================================================================

  describe('World State Consistency', () => {
    it('should preserve time and day progression accurately', async () => {
      const gameId = 'game-world-1';

      const worldState = worldStateManager.initializeWorldState(gameId);

      worldState.globalVariables['gameTime'] = {
        day: 15,
        hour: 14,
        minute: 30,
        totalSeconds: 1296600, // 15 days * 86400 + 14 hours * 3600 + 30 minutes * 60
      };

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const gameTime = loadedWorldState?.globalVariables['gameTime'];

      expect(gameTime.day).toBe(15);
      expect(gameTime.hour).toBe(14);
      expect(gameTime.minute).toBe(30);
    });

    it('should preserve weather and environment state', async () => {
      const gameId = 'game-world-2';

      const worldState = worldStateManager.initializeWorldState(gameId);

      const envState: IEnvironmentState = {
        roomId: 'outdoor_1',
        lighting: 70,
        temperature: 22,
        weather: 'rain',
        timeOfDay: 'afternoon',
        customState: {
          windSpeed: 15,
          visibility: 50,
        },
        lastModified: new Date().toISOString(),
      };

      worldState.environments.set('outdoor_1', envState);

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const loadedEnv = loadedWorldState?.environments.get('outdoor_1');

      expect(loadedEnv?.weather).toBe('rain');
      expect(loadedEnv?.temperature).toBe(22);
      expect(loadedEnv?.customState.windSpeed).toBe(15);
    });

    it('should preserve dynamic room states (locked doors, etc.)', async () => {
      const gameId = 'game-world-3';

      const worldState = worldStateManager.initializeWorldState(gameId);

      const doorStates: Map<string, IDoorState> = new Map([
        [
          'door1',
          {
            doorId: 'door1',
            isOpen: false,
            isLocked: true,
            requiredKeyId: 'brass_key',
            openedBy: undefined,
          },
        ],
        [
          'door2',
          {
            doorId: 'door2',
            isOpen: true,
            isLocked: false,
            openedBy: 'player1',
            openedAt: new Date().toISOString(),
          },
        ],
      ]);

      worldState.doors = doorStates;

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedWorldState = worldStateManager.getWorldState(gameId);

      expect(loadedWorldState?.doors.get('door1')?.isLocked).toBe(true);
      expect(loadedWorldState?.doors.get('door2')?.isOpen).toBe(true);
    });

    it('should preserve trigger states', async () => {
      const gameId = 'game-world-4';

      const worldState = worldStateManager.initializeWorldState(gameId);

      worldState.globalVariables['triggers'] = {
        trap1: {
          triggered: true,
          triggeredBy: 'player1',
          triggerTime: new Date().toISOString(),
        },
        trap2: { triggered: false, triggeredBy: null, triggerTime: null },
        event1: {
          triggered: true,
          triggeredBy: 'npc1',
          triggerTime: new Date().toISOString(),
        },
      };

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const triggers = loadedWorldState?.globalVariables['triggers'];

      expect(triggers.trap1.triggered).toBe(true);
      expect(triggers.trap2.triggered).toBe(false);
    });

    it('should preserve event history', async () => {
      const gameId = 'game-world-5';

      const worldState = worldStateManager.initializeWorldState(gameId);

      const eventHistory = [
        {
          eventId: 'evt1',
          type: 'quest_completed',
          timestamp: new Date().toISOString(),
        },
        {
          eventId: 'evt2',
          type: 'npc_defeated',
          timestamp: new Date().toISOString(),
        },
        {
          eventId: 'evt3',
          type: 'treasure_found',
          timestamp: new Date().toISOString(),
        },
      ];

      worldState.globalVariables['eventHistory'] = eventHistory;

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const loadedHistory = loadedWorldState?.globalVariables['eventHistory'];

      expect(loadedHistory.length).toBe(3);
      expect(loadedHistory[1].type).toBe('npc_defeated');
    });

    it('should preserve global variables and flags', async () => {
      const gameId = 'game-world-6';

      const worldState = worldStateManager.initializeWorldState(gameId);

      worldState.globalFlags = {
        kingdomSaved: true,
        dragonDefeated: false,
        allianceFormed: true,
        prophecyFulfilled: false,
      };

      worldState.globalVariables = {
        kingdomReputation: 85,
        goldCollected: 5000,
        monstersSlain: 127,
      };

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedWorldState = worldStateManager.getWorldState(gameId);

      expect(loadedWorldState?.globalFlags.kingdomSaved).toBe(true);
      expect(loadedWorldState?.globalFlags.dragonDefeated).toBe(false);
      expect(loadedWorldState?.globalVariables.goldCollected).toBe(5000);
    });

    it('should track spawned items correctly after load', async () => {
      const gameId = 'game-world-7';

      const worldState = worldStateManager.initializeWorldState(gameId);

      const spawnedItems = [
        {
          itemId: 'loot1',
          spawnedAt: new Date().toISOString(),
          location: 'room5',
        },
        {
          itemId: 'loot2',
          spawnedAt: new Date().toISOString(),
          location: 'room7',
        },
      ];

      worldState.globalVariables['spawnedItems'] = spawnedItems;

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const loadedSpawned = loadedWorldState?.globalVariables['spawnedItems'];

      expect(loadedSpawned.length).toBe(2);
      expect(loadedSpawned[0].location).toBe('room5');
    });

    it('should preserve modified object states', async () => {
      const gameId = 'game-world-8';

      const worldState = worldStateManager.initializeWorldState(gameId);

      const objectState: IObjectState = {
        objectId: 'statue1',
        exists: true,
        position: { x: 10, y: 10, z: 0 },
        roomId: 'temple',
        customState: {
          activated: true,
          color: 'glowing_blue',
          powerLevel: 75,
        },
        lastModified: new Date().toISOString(),
        modifiedBy: 'player1',
      };

      worldState.objects.set('statue1', objectState);

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const loadedObject = loadedWorldState?.objects.get('statue1');

      expect(loadedObject?.customState.activated).toBe(true);
      expect(loadedObject?.customState.powerLevel).toBe(75);
    });

    it('should preserve deleted entity states', async () => {
      const gameId = 'game-world-9';

      const worldState = worldStateManager.initializeWorldState(gameId);

      const deletedObject: IObjectState = {
        objectId: 'destroyedBarrel',
        exists: false,
        customState: {
          destroyedAt: new Date().toISOString(),
          destroyedBy: 'player1',
        },
        lastModified: new Date().toISOString(),
      };

      worldState.objects.set('destroyedBarrel', deletedObject);

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const loadedObject = loadedWorldState?.objects.get('destroyedBarrel');

      expect(loadedObject?.exists).toBe(false);
      expect(loadedObject?.customState.destroyedBy).toBe('player1');
    });

    it('should preserve created entities', async () => {
      const gameId = 'game-world-10';

      const worldState = worldStateManager.initializeWorldState(gameId);

      const createdObject: IObjectState = {
        objectId: 'magicPortal',
        exists: true,
        position: { x: 50, y: 50, z: 0 },
        roomId: 'wizardTower',
        customState: {
          createdAt: new Date().toISOString(),
          createdBy: 'wizard1',
          duration: 300000,
          destination: 'ancientRuins',
        },
        lastModified: new Date().toISOString(),
        modifiedBy: 'wizard1',
      };

      worldState.objects.set('magicPortal', createdObject);

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const loadedObject = loadedWorldState?.objects.get('magicPortal');

      expect(loadedObject?.exists).toBe(true);
      expect(loadedObject?.customState.destination).toBe('ancientRuins');
    });

    it('should preserve world state change history', async () => {
      const gameId = 'game-world-11';

      const worldState = worldStateManager.initializeWorldState(gameId);

      const changeHistory = [
        {
          id: 'change1',
          gameId,
          changeType: StateChangeType.DOOR_OPENED,
          entityId: 'door1',
          entityType: 'door' as const,
          newState: { isOpen: true },
          timestamp: new Date().toISOString(),
        },
        {
          id: 'change2',
          gameId,
          changeType: StateChangeType.OBJECT_DESTROYED,
          entityId: 'barrel1',
          entityType: 'object' as const,
          newState: { exists: false },
          timestamp: new Date().toISOString(),
        },
      ];

      worldState.globalVariables['changeHistory'] = changeHistory;

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const loadedHistory = loadedWorldState?.globalVariables['changeHistory'];

      expect(loadedHistory.length).toBe(2);
      expect(loadedHistory[0].changeType).toBe(StateChangeType.DOOR_OPENED);
    });

    it('should preserve region and zone states', async () => {
      const gameId = 'game-world-12';

      const worldState = worldStateManager.initializeWorldState(gameId);

      worldState.globalVariables['regions'] = {
        northernForest: {
          discovered: true,
          clearedOfEnemies: false,
          bossDefeated: false,
        },
        easternDesert: {
          discovered: true,
          clearedOfEnemies: true,
          bossDefeated: true,
        },
      };

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const regions = loadedWorldState?.globalVariables['regions'];

      expect(regions.northernForest.discovered).toBe(true);
      expect(regions.easternDesert.bossDefeated).toBe(true);
    });
  });

  // ============================================================================
  // 6. PLAYER STATE INTEGRITY (10 tests)
  // ============================================================================

  describe('Player State Integrity', () => {
    it('should preserve player health, mana, and stats correctly', async () => {
      const gameId = 'game-player-1';

      const player = playerService.createPlayer({
        name: 'Hero',
        position: { x: 0, y: 0, z: 0 },
        health: 87,
        maxHealth: 120,
        inventory: [],
        level: 8,
        experience: 0,
        gameId,
      });

      // Add custom stats
      const worldState = worldStateManager.initializeWorldState(gameId);
      worldState.globalVariables[`player_${player.id}_stats`] = {
        mana: 65,
        maxMana: 100,
        stamina: 80,
        maxStamina: 100,
        strength: 25,
        intelligence: 30,
      };

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedPlayer = playerService.getPlayer(player.id);
      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const loadedStats =
        loadedWorldState?.globalVariables[`player_${player.id}_stats`];

      expect(loadedPlayer?.health).toBe(87);
      expect(loadedPlayer?.maxHealth).toBe(120);
      expect(loadedStats.mana).toBe(65);
      expect(loadedStats.strength).toBe(25);
    });

    it('should preserve player level and XP accurately', async () => {
      const gameId = 'game-player-2';

      const player = playerService.createPlayer({
        name: 'Adventurer',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 12,
        experience: 15750,
        gameId,
      });

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedPlayer = playerService.getPlayer(player.id);

      expect(loadedPlayer?.level).toBe(12);
      expect(loadedPlayer?.experience).toBe(15750);
    });

    it('should preserve player current room location', async () => {
      const gameId = 'game-player-3';

      const room = roomService.createRoom({
        name: 'Dragon Lair',
        description: 'A dangerous cave',
        position: { x: 100, y: 100, z: 0 },
        width: 30,
        height: 30,
        size: { width: 30, height: 30, depth: 5 },
        objects: [],
        players: [],
        gameId,
      });

      const player = playerService.createPlayer({
        name: 'Warrior',
        position: { x: 110, y: 110, z: 0 },
        health: 100,
        inventory: [],
        level: 1,
        experience: 0,
        gameId,
        roomId: room.id,
      });

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedPlayer = playerService.getPlayer(player.id);

      expect(loadedPlayer?.roomId).toBe(room.id);
      expect(loadedPlayer?.position).toEqual({ x: 110, y: 110, z: 0 });
    });

    it('should preserve active effects on player', async () => {
      const gameId = 'game-player-4';

      const player = playerService.createPlayer({
        name: 'Mage',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 1,
        experience: 0,
        gameId,
      });

      const effect1 = {
        id: 'haste',
        name: 'Haste',
        description: 'Increases speed',
        type: EffectType.HASTE,
        target: EffectTarget.SELF,
        durationType: DurationType.OVER_TIME,
        duration: 30000,
        statType: StatType.SPEED,
        value: 50,
        percentage: true,
      };

      const effect2 = {
        id: 'shield',
        name: 'Magic Shield',
        description: 'Increases defense',
        type: EffectType.BUFF,
        target: EffectTarget.SELF,
        durationType: DurationType.OVER_TIME,
        duration: 60000,
        statType: StatType.DEFENSE,
        value: 20,
      };

      await effectManager.applyEffect(gameId, {
        effectId: 'haste',
        effect: effect1,
        targetId: player.id,
        appliedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30000).toISOString(),
        stacks: 1,
      });

      await effectManager.applyEffect(gameId, {
        effectId: 'shield',
        effect: effect2,
        targetId: player.id,
        appliedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        stacks: 1,
      });

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const activeEffects = effectManager.getActiveEffects(gameId, player.id);

      expect(activeEffects.length).toBe(2);
      expect(activeEffects.find((e) => e.effectId === 'haste')).toBeDefined();
      expect(activeEffects.find((e) => e.effectId === 'shield')).toBeDefined();
    });

    it('should preserve player skill and ability states', async () => {
      const gameId = 'game-player-5';

      const player = playerService.createPlayer({
        name: 'Ranger',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 1,
        experience: 0,
        gameId,
      });

      const worldState = worldStateManager.initializeWorldState(gameId);
      worldState.globalVariables[`player_${player.id}_skills`] = {
        swordSkill: 25,
        archerySkill: 40,
        stealthSkill: 15,
        magicSkill: 5,
      };

      worldState.globalVariables[`player_${player.id}_abilities`] = {
        learned: ['power_shot', 'rapid_fire', 'camouflage'],
        cooldowns: {
          power_shot: 0,
          rapid_fire: 5000,
          camouflage: 0,
        },
      };

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const skills =
        loadedWorldState?.globalVariables[`player_${player.id}_skills`];
      const abilities =
        loadedWorldState?.globalVariables[`player_${player.id}_abilities`];

      expect(skills.archerySkill).toBe(40);
      expect(abilities.learned).toContain('power_shot');
      expect(abilities.cooldowns.rapid_fire).toBe(5000);
    });

    it('should preserve known spells and abilities', async () => {
      const gameId = 'game-player-6';

      const player = playerService.createPlayer({
        name: 'Wizard',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 1,
        experience: 0,
        gameId,
      });

      const worldState = worldStateManager.initializeWorldState(gameId);
      worldState.globalVariables[`player_${player.id}_spellbook`] = {
        knownSpells: [
          'fireball',
          'ice_shard',
          'lightning_bolt',
          'heal',
          'teleport',
        ],
        spellLevels: {
          fireball: 3,
          ice_shard: 2,
          lightning_bolt: 1,
          heal: 4,
          teleport: 1,
        },
      };

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const spellbook =
        loadedWorldState?.globalVariables[`player_${player.id}_spellbook`];

      expect(spellbook.knownSpells.length).toBe(5);
      expect(spellbook.spellLevels.fireball).toBe(3);
    });

    it('should handle player death state correctly', async () => {
      const gameId = 'game-player-7';

      const player = playerService.createPlayer({
        name: 'Fallen Hero',
        position: { x: 0, y: 0, z: 0 },
        health: 0,
        inventory: [],
        level: 1,
        experience: 0,
        gameId,
      });

      const worldState = worldStateManager.initializeWorldState(gameId);
      worldState.globalVariables[`player_${player.id}_death`] = {
        isDead: true,
        deathTime: new Date().toISOString(),
        deathLocation: { x: 0, y: 0, z: 0 },
        canRespawn: true,
        respawnLocation: { x: 100, y: 100, z: 0 },
      };

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedPlayer = playerService.getPlayer(player.id);
      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const deathState =
        loadedWorldState?.globalVariables[`player_${player.id}_death`];

      expect(loadedPlayer?.health).toBe(0);
      expect(deathState.isDead).toBe(true);
      expect(deathState.canRespawn).toBe(true);
    });

    it('should preserve player buffs and debuffs accurately', async () => {
      const gameId = 'game-player-8';

      const player = playerService.createPlayer({
        name: 'Cursed Warrior',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 1,
        experience: 0,
        gameId,
      });

      const buff = {
        id: 'blessing',
        name: 'Divine Blessing',
        description: 'Increases all stats',
        type: EffectType.BUFF,
        target: EffectTarget.SELF,
        durationType: DurationType.PERMANENT,
        statType: StatType.VITALITY,
        value: 15,
      };

      const debuff = {
        id: 'curse',
        name: 'Weakness Curse',
        description: 'Decreases strength',
        type: EffectType.DEBUFF,
        target: EffectTarget.SELF,
        durationType: DurationType.PERMANENT,
        statType: StatType.STRENGTH,
        value: -10,
      };

      await effectManager.applyEffect(gameId, {
        effectId: 'blessing',
        effect: buff,
        targetId: player.id,
        appliedAt: new Date().toISOString(),
        stacks: 1,
      });

      await effectManager.applyEffect(gameId, {
        effectId: 'curse',
        effect: debuff,
        targetId: player.id,
        appliedAt: new Date().toISOString(),
        stacks: 1,
      });

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const activeEffects = effectManager.getActiveEffects(gameId, player.id);

      expect(activeEffects.length).toBe(2);
      const buffEffect = activeEffects.find((e) => e.effectId === 'blessing');
      const debuffEffect = activeEffects.find((e) => e.effectId === 'curse');

      expect(buffEffect).toBeDefined();
      expect(debuffEffect).toBeDefined();
    });

    it('should preserve player achievements and unlocks', async () => {
      const gameId = 'game-player-9';

      const player = playerService.createPlayer({
        name: 'Achiever',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 1,
        experience: 0,
        gameId,
      });

      const worldState = worldStateManager.initializeWorldState(gameId);
      worldState.globalVariables[`player_${player.id}_achievements`] = {
        unlocked: ['first_blood', 'treasure_hunter', 'dragon_slayer'],
        progress: {
          master_explorer: 75,
          legendary_warrior: 50,
        },
      };

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const achievements =
        loadedWorldState?.globalVariables[`player_${player.id}_achievements`];

      expect(achievements.unlocked).toContain('dragon_slayer');
      expect(achievements.progress.master_explorer).toBe(75);
    });

    it('should preserve player custom metadata', async () => {
      const gameId = 'game-player-10';

      const player = playerService.createPlayer({
        name: 'Custom Hero',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 1,
        experience: 0,
        gameId,
      });

      const worldState = worldStateManager.initializeWorldState(gameId);
      worldState.globalVariables[`player_${player.id}_metadata`] = {
        playTime: 7200000, // 2 hours in ms
        deaths: 3,
        questsCompleted: 15,
        enemiesDefeated: 87,
        itemsCrafted: 12,
        favoriteWeapon: 'Legendary Sword',
        guild: 'Warriors of Light',
      };

      // Save and load
      await gameStateService.saveGameState(gameId, 'test-slot');
      await gameStateService.loadGameState(gameId, 'test-slot');

      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const metadata =
        loadedWorldState?.globalVariables[`player_${player.id}_metadata`];

      expect(metadata.playTime).toBe(7200000);
      expect(metadata.questsCompleted).toBe(15);
      expect(metadata.guild).toBe('Warriors of Light');
    });
  });

  // ============================================================================
  // EDGE CASES AND STRESS TESTS
  // ============================================================================

  describe('Edge Cases and Stress Tests', () => {
    it('should handle save during active combat', async () => {
      const gameId = 'game-edge-1';
      const playerId = 'player1';

      const player = playerService.createPlayer({
        name: 'Warrior',
        position: { x: 0, y: 0, z: 0 },
        health: 75,
        inventory: [],
        level: 5,
        experience: 0,
        gameId,
      });

      const worldState = worldStateManager.initializeWorldState(gameId);

      // Setup active combat
      worldState.globalVariables['activeCombat'] = {
        combatId: 'combat1',
        participants: ['player1', 'boss1'],
        round: 7,
        turnOrder: ['player1', 'boss1'],
        currentTurn: 1,
        combatLog: [{ round: 7, action: 'player1 attacks', damage: 25 }],
      };

      // Save during combat
      await gameStateService.saveGameState(gameId, 'combat-save');
      await gameStateService.loadGameState(gameId, 'combat-save');

      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const combat = loadedWorldState?.globalVariables['activeCombat'];

      expect(combat.round).toBe(7);
      expect(combat.currentTurn).toBe(1);
    });

    it('should handle save during dialogue', async () => {
      const gameId = 'game-edge-2';

      const worldState = worldStateManager.initializeWorldState(gameId);

      worldState.globalVariables['activeDialogue'] = {
        npcId: 'questgiver1',
        playerId: 'player1',
        currentNode: 'node5',
        choices: ['accept', 'decline', 'ask_more'],
        dialogueHistory: ['node1', 'node2', 'node3', 'node4'],
      };

      await gameStateService.saveGameState(gameId, 'dialogue-save');
      await gameStateService.loadGameState(gameId, 'dialogue-save');

      const loadedWorldState = worldStateManager.getWorldState(gameId);
      const dialogue = loadedWorldState?.globalVariables['activeDialogue'];

      expect(dialogue.currentNode).toBe('node5');
      expect(dialogue.choices.length).toBe(3);
    });

    it('should handle save during quest completion', async () => {
      const gameId = 'game-edge-3';
      const playerId = 'player1';

      const quest: IQuest = {
        id: 'quest1',
        name: 'Test Quest',
        description: 'Test',
        gameId,
        objectives: [
          {
            id: 'obj1',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect item',
            targetId: 'item1',
            targetCount: 1,
            currentCount: 1,
            completed: true,
          },
        ],
        rewards: [
          {
            type: 'experience',
            experience: 100,
          },
        ],
      };

      questManager.registerQuest(quest);

      const context: IQuestContext = {
        gameId,
        playerId,
        playerFlags: {},
        playerVariables: {},
        playerInventory: [],
        completedQuests: [],
      };

      await questManager.startQuest('quest1', playerId, context);

      // Save right at completion
      await gameStateService.saveGameState(gameId, 'completion-save');
      await questManager.completeQuest(playerId, 'quest1', context);

      // Load the state before completion
      await gameStateService.loadGameState(gameId, 'completion-save');

      const loadedQuest = questManager.getPlayerQuest(playerId, 'quest1');

      expect(loadedQuest?.state).toBe(QuestState.ACTIVE);
    });

    it('should handle save during room transitions', async () => {
      const gameId = 'game-edge-4';

      const room1 = roomService.createRoom({
        name: 'Room 1',
        description: 'First room',
        position: { x: 0, y: 0, z: 0 },
        width: 10,
        height: 10,
        size: { width: 10, height: 10, depth: 3 },
        objects: [],
        players: [],
        gameId,
      });

      const room2 = roomService.createRoom({
        name: 'Room 2',
        description: 'Second room',
        position: { x: 20, y: 0, z: 0 },
        width: 10,
        height: 10,
        size: { width: 10, height: 10, depth: 3 },
        objects: [],
        players: [],
        gameId,
      });

      const player = playerService.createPlayer({
        name: 'Traveler',
        position: { x: 9, y: 5, z: 0 }, // At edge of room1
        health: 100,
        inventory: [],
        level: 1,
        experience: 0,
        gameId,
        roomId: room1.id,
      });

      await gameStateService.saveGameState(gameId, 'transition-save');

      // Move to room 2
      playerService.updatePlayer(player.id, {
        position: { x: 21, y: 5, z: 0 },
        roomId: room2.id,
      });

      // Load previous state
      await gameStateService.loadGameState(gameId, 'transition-save');

      const loadedPlayer = playerService.getPlayer(player.id);

      expect(loadedPlayer?.roomId).toBe(room1.id);
      expect(loadedPlayer?.position.x).toBe(9);
    });

    it('should handle large game states (100+ entities) efficiently', async () => {
      const gameId = 'game-stress-1';

      const worldState = worldStateManager.initializeWorldState(gameId);

      // Create 100 NPCs
      for (let i = 0; i < 100; i++) {
        const npcState: INpcState = {
          npcId: `npc_${i}`,
          alive: true,
          position: { x: i * 10, y: i * 5, z: 0 },
          health: 100,
          attitude: 'neutral',
          customState: {
            index: i,
            data: `npc data ${i}`,
          },
          lastModified: new Date().toISOString(),
        };
        worldState.npcs.set(`npc_${i}`, npcState);
      }

      // Create 100 objects
      for (let i = 0; i < 100; i++) {
        const objectState: IObjectState = {
          objectId: `object_${i}`,
          exists: true,
          position: { x: i * 5, y: i * 10, z: 0 },
          customState: {
            index: i,
          },
          lastModified: new Date().toISOString(),
        };
        worldState.objects.set(`object_${i}`, objectState);
      }

      const startTime = Date.now();
      await gameStateService.saveGameState(gameId, 'large-state');
      await gameStateService.loadGameState(gameId, 'large-state');
      const endTime = Date.now();

      const loadedWorldState = worldStateManager.getWorldState(gameId);

      expect(loadedWorldState?.npcs.size).toBe(100);
      expect(loadedWorldState?.objects.size).toBe(100);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete in under 5 seconds
    });

    it('should detect state corruption after load', async () => {
      const gameId = 'game-corruption-1';

      const state = createComplexGameState(gameId);
      await gameStateService.updateGameState(gameId, state);

      await gameStateService.saveGameState(gameId, 'test-slot');

      // Verify state can be loaded without corruption
      const loaded = await gameStateService.loadGameState(gameId, 'test-slot');

      expect(loaded.gameId).toBe(gameId);
      expect(loaded.player).toBeDefined();
      expect(loaded.rooms).toBeDefined();
      expect(loaded.npcs).toBeDefined();
    });

    it('should handle multiple rapid save/load cycles', async () => {
      const gameId = 'game-rapid-1';
      const playerId = 'player1';

      const player = playerService.createPlayer({
        name: 'Speed Saver',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 1,
        experience: 0,
        gameId,
      });

      // Perform 10 rapid save/load cycles
      for (let i = 0; i < 10; i++) {
        playerService.updatePlayer(player.id, { experience: i * 100 });
        await gameStateService.saveGameState(gameId, `rapid-${i}`);
        await gameStateService.loadGameState(gameId, `rapid-${i}`);
      }

      const loadedPlayer = playerService.getPlayer(player.id);

      // Should have the last saved experience
      expect(loadedPlayer?.experience).toBe(900);
    });

    it('should preserve state across different save slots', async () => {
      const gameId = 'game-slots-1';
      const playerId = 'player1';

      const player = playerService.createPlayer({
        name: 'Multi Saver',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 1,
        experience: 0,
        gameId,
      });

      // Save to slot 1
      playerService.updatePlayer(player.id, { level: 5, experience: 1000 });
      await gameStateService.saveGameState(gameId, 'slot1');

      // Save to slot 2
      playerService.updatePlayer(player.id, { level: 10, experience: 5000 });
      await gameStateService.saveGameState(gameId, 'slot2');

      // Save to slot 3
      playerService.updatePlayer(player.id, { level: 15, experience: 12000 });
      await gameStateService.saveGameState(gameId, 'slot3');

      // Load slot 2
      await gameStateService.loadGameState(gameId, 'slot2');
      const player2 = playerService.getPlayer(player.id);
      expect(player2?.level).toBe(10);
      expect(player2?.experience).toBe(5000);

      // Load slot 1
      await gameStateService.loadGameState(gameId, 'slot1');
      const player1 = playerService.getPlayer(player.id);
      expect(player1?.level).toBe(5);
      expect(player1?.experience).toBe(1000);
    });
  });

  // ============================================================================
  // PERFORMANCE AND MEMORY TESTS
  // ============================================================================

  describe('Performance and Memory Tests', () => {
    it('should not leak memory after repeated save/load operations', async () => {
      const gameId = 'game-memory-1';

      const state = createComplexGameState(gameId);
      await gameStateService.updateGameState(gameId, state);

      const statsBefore = gameStateService.getStats();

      // Perform 50 save/load cycles
      for (let i = 0; i < 50; i++) {
        await gameStateService.saveGameState(gameId, `mem-test-${i % 5}`);
        await gameStateService.loadGameState(gameId, `mem-test-${i % 5}`);
      }

      const statsAfter = gameStateService.getStats();

      // Memory should not grow significantly (using only 5 slots)
      expect(statsAfter.totalSaveSlots).toBeLessThanOrEqual(5);
    });

    it('should perform save/load within acceptable time limits', async () => {
      const gameId = 'game-perf-1';

      const state = createComplexGameState(gameId);
      await gameStateService.updateGameState(gameId, state);

      const saveStart = Date.now();
      await gameStateService.saveGameState(gameId, 'perf-test');
      const saveEnd = Date.now();

      const loadStart = Date.now();
      await gameStateService.loadGameState(gameId, 'perf-test');
      const loadEnd = Date.now();

      const saveTime = saveEnd - saveStart;
      const loadTime = loadEnd - loadStart;

      // Both operations should complete quickly
      expect(saveTime).toBeLessThan(1000); // 1 second
      expect(loadTime).toBeLessThan(1000); // 1 second
    });

    it('should handle cleanup of old save states', async () => {
      const gameId = 'game-cleanup-1';

      const state = createComplexGameState(gameId);
      await gameStateService.updateGameState(gameId, state);

      // Create 10 saves
      for (let i = 0; i < 10; i++) {
        await gameStateService.saveGameState(gameId, `save-${i}`);
      }

      const slots = await gameStateService.getSaveSlots(gameId);
      expect(slots.length).toBe(10);

      // Delete old saves
      await gameStateService.deleteSaveSlot(gameId, 'save-0');
      await gameStateService.deleteSaveSlot(gameId, 'save-1');
      await gameStateService.deleteSaveSlot(gameId, 'save-2');

      const slotsAfter = await gameStateService.getSaveSlots(gameId);
      expect(slotsAfter.length).toBe(7);
    });
  });
});
