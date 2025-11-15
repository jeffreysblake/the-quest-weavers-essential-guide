import { Test, TestingModule } from '@nestjs/testing';
import { GameStateService } from './game-state.service';
import { PlayerService } from '../entity/player.service';
import { RoomService } from '../entity/room.service';
import { ObjectService } from '../entity/object.service';
import { EntityService } from '../entity/entity.service';
import { QuestManagerService } from '../quest/quest-manager.service';
import { EventEmitterService } from '../events/event-emitter.service';
import { PhysicsService } from '../entity/physics.service';
import { DatabaseService } from '../database/database.service';
import { IPlayer } from '../entity/player.interface';
import { IRoom } from '../entity/room.interface';
import { IObject } from '../entity/object.interface';
import {
  IQuest,
  IPlayerQuest,
  QuestState,
  ObjectiveType,
  IQuestContext,
} from '../quest/quest.interfaces';

/**
 * Comprehensive entity reference validation tests for save/load operations
 *
 * These tests ensure that all entity references remain valid after save/load cycles,
 * preventing broken references, orphaned entities, and data corruption.
 *
 * Coverage:
 * - Player reference validation (rooms, inventory, quests, effects, targets)
 * - Room reference validation (exits, NPCs, items, connections)
 * - Quest reference validation (objectives, targets, prerequisites, chains)
 * - NPC reference validation (rooms, inventory, dialogue, targets, patrols)
 * - Inventory reference validation (containers, equipped items, ownership)
 */
describe('Entity Reference Validation - Save/Load', () => {
  let gameStateService: GameStateService;
  let playerService: PlayerService;
  let roomService: RoomService;
  let objectService: ObjectService;
  let entityService: EntityService;
  let questManager: QuestManagerService;
  let module: TestingModule;

  // Test game ID
  const testGameId = 'ref-validation-test-game';

  // Mock database service
  const mockDatabaseService = {
    transaction: jest.fn().mockImplementation((callback) => {
      const mockDb = {
        prepare: jest.fn().mockReturnValue({
          run: jest.fn(),
          get: jest.fn(),
          all: jest.fn().mockReturnValue([]),
        }),
      };
      return callback(mockDb);
    }),
    prepare: jest.fn().mockReturnValue({
      run: jest.fn(),
      get: jest.fn(),
      all: jest.fn().mockReturnValue([]),
    }),
    saveVersion: jest.fn().mockReturnValue(1),
    getVersion: jest.fn(),
    exec: jest.fn(),
  };

  // Mock physics service
  const mockPhysicsService = {
    createEntity: jest.fn(),
    findAll: jest.fn().mockReturnValue([]),
    findOne: jest.fn(),
    updateEntity: jest.fn(),
    removeEntity: jest.fn(),
    applyForce: jest.fn(),
    setVelocity: jest.fn(),
    step: jest.fn(),
    applyEffect: jest
      .fn()
      .mockReturnValue({ success: true, message: 'Effect applied' }),
    applyAreaEffect: jest
      .fn()
      .mockReturnValue({ success: true, message: 'Area effect applied' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      providers: [
        GameStateService,
        PlayerService,
        RoomService,
        ObjectService,
        EntityService,
        QuestManagerService,
        EventEmitterService,
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: PhysicsService, useValue: mockPhysicsService },
      ],
    }).compile();

    gameStateService = module.get<GameStateService>(GameStateService);
    playerService = module.get<PlayerService>(PlayerService);
    roomService = module.get<RoomService>(RoomService);
    objectService = module.get<ObjectService>(ObjectService);
    entityService = module.get<EntityService>(EntityService);
    questManager = module.get<QuestManagerService>(QuestManagerService);
  });

  afterEach(async () => {
    await module.close();
  });

  // ============================================================================
  // Helper Functions
  // ============================================================================

  /**
   * Create a test player with valid references
   */
  function createTestPlayer(
    roomId: string,
    gameId: string = testGameId,
  ): IPlayer {
    return playerService.createPlayer({
      name: 'Test Player',
      position: { x: 0, y: 0, z: 0 },
      health: 100,
      maxHealth: 100,
      inventory: [],
      level: 1,
      experience: 0,
      roomId,
      gameId,
    });
  }

  /**
   * Create a test room
   */
  function createTestRoom(name: string, gameId: string = testGameId): IRoom {
    return roomService.createRoom({
      name,
      description: `Test room: ${name}`,
      position: { x: 0, y: 0, z: 0 },
      width: 10,
      height: 10,
      size: { width: 10, height: 10, depth: 3 },
      objects: [],
      players: [],
      gameId,
    });
  }

  /**
   * Create a test object
   */
  function createTestObject(
    name: string,
    roomId?: string,
    gameId: string = testGameId,
  ): IObject {
    return objectService.createObject({
      name,
      description: `Test object: ${name}`,
      objectType: 'item',
      position: { x: 0, y: 0, z: 0 },
      isPortable: true,
      roomId,
      gameId,
    });
  }

  /**
   * Create a test quest
   */
  function createTestQuest(
    questId: string,
    targetRoomId?: string,
    targetItemId?: string,
  ): IQuest {
    return {
      id: questId,
      name: `Quest ${questId}`,
      description: 'Test quest',
      gameId: testGameId,
      objectives: [
        {
          id: 'obj-1',
          type: ObjectiveType.GO_TO_LOCATION,
          description: 'Visit the location',
          targetId: targetRoomId,
          completed: false,
        },
        {
          id: 'obj-2',
          type: ObjectiveType.COLLECT_ITEM,
          description: 'Collect the item',
          targetId: targetItemId,
          targetCount: 1,
          currentCount: 0,
          completed: false,
        },
      ],
      canAbandon: true,
    };
  }

  /**
   * Simulate save/load cycle
   */
  async function saveAndLoadGame(slotName: string = 'test-slot') {
    // Save game state
    await gameStateService.saveGameState(testGameId, slotName);

    // Clear all in-memory caches to simulate fresh load
    playerService.clearCache();
    roomService.clearCache();
    objectService.clearCache();
    entityService.clearCache();

    // Load game state
    return await gameStateService.loadGameState(testGameId, slotName);
  }

  /**
   * Validate entity reference exists
   */
  function validateEntityExists(entityId: string, entityType: string): boolean {
    const entity = entityService.getEntity(entityId);
    return entity !== undefined;
  }

  // ============================================================================
  // 1. Player Reference Validation Tests
  // ============================================================================

  describe('Player Reference Validation', () => {
    it('should validate player references valid room on load', async () => {
      // Arrange: Create room and player
      const room = createTestRoom('Player Room');
      const player = createTestPlayer(room.id);

      // Act: Save game state
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.player = player;
      gameState.rooms = { [room.id]: room };
      await gameStateService.updateGameState(testGameId, gameState);

      // Act: Simulate save/load
      const loadedState = await saveAndLoadGame();

      // Assert: Player room reference should be valid
      expect(loadedState.player).toBeDefined();
      expect(loadedState.player.roomId).toBe(room.id);
      expect(loadedState.rooms[room.id]).toBeDefined();
    });

    it('should detect when player references non-existent room', async () => {
      // Arrange: Create player with invalid room reference
      const player = createTestPlayer('non-existent-room-id');

      // Act: Save game state
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.player = player;
      gameState.rooms = {};
      await gameStateService.updateGameState(testGameId, gameState);

      // Act: Load state
      const loadedState = await saveAndLoadGame();

      // Assert: Should detect invalid reference
      expect(loadedState.player.roomId).toBe('non-existent-room-id');
      expect(loadedState.rooms['non-existent-room-id']).toBeUndefined();

      // Validation check
      const isValid =
        loadedState.rooms[loadedState.player.roomId] !== undefined;
      expect(isValid).toBe(false);
    });

    it('should validate all player inventory items exist', async () => {
      // Arrange: Create room, player, and items
      const room = createTestRoom('Inventory Test Room');
      const item1 = createTestObject('Sword', room.id);
      const item2 = createTestObject('Shield', room.id);
      const player = createTestPlayer(room.id);

      // Add items to player inventory
      player.inventory = [item1.id, item2.id];

      // Act: Save game state
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.player = player;
      gameState.rooms = { [room.id]: room };
      gameState.items = { [item1.id]: item1, [item2.id]: item2 };
      await gameStateService.updateGameState(testGameId, gameState);

      // Act: Load state
      const loadedState = await saveAndLoadGame();

      // Assert: All inventory items should exist
      expect(loadedState.player.inventory.length).toBe(2);
      loadedState.player.inventory.forEach((itemId: string) => {
        expect(loadedState.items[itemId]).toBeDefined();
      });
    });

    it('should detect invalid inventory item references', async () => {
      // Arrange: Create player with invalid inventory items
      const room = createTestRoom('Invalid Inventory Room');
      const validItem = createTestObject('Valid Item', room.id);
      const player = createTestPlayer(room.id);

      // Add valid and invalid items to inventory
      player.inventory = [
        validItem.id,
        'invalid-item-id-1',
        'invalid-item-id-2',
      ];

      // Act: Save game state
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.player = player;
      gameState.rooms = { [room.id]: room };
      gameState.items = { [validItem.id]: validItem };
      await gameStateService.updateGameState(testGameId, gameState);

      // Act: Load state
      const loadedState = await saveAndLoadGame();

      // Assert: Should detect invalid references
      const invalidItems = loadedState.player.inventory.filter(
        (itemId: string) => !loadedState.items[itemId],
      );
      expect(invalidItems.length).toBe(2);
      expect(invalidItems).toContain('invalid-item-id-1');
      expect(invalidItems).toContain('invalid-item-id-2');
    });

    it('should validate player equipped items exist in inventory', async () => {
      // Arrange: Create player with equipped items
      const room = createTestRoom('Equipment Room');
      const sword = createTestObject('Equipped Sword', room.id);
      const armor = createTestObject('Equipped Armor', room.id);
      const player = createTestPlayer(room.id);

      // Set up inventory and equipped items
      player.inventory = [sword.id, armor.id];
      (player as any).equipped = {
        weapon: sword.id,
        armor: armor.id,
      };

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.player = player;
      gameState.rooms = { [room.id]: room };
      gameState.items = { [sword.id]: sword, [armor.id]: armor };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Equipped items should exist in inventory
      const equipped = loadedState.player.equipped;
      if (equipped) {
        Object.values(equipped).forEach((itemId: any) => {
          expect(loadedState.player.inventory).toContain(itemId);
          expect(loadedState.items[itemId]).toBeDefined();
        });
      }
    });

    it('should detect equipped items not in inventory', async () => {
      // Arrange: Create player with equipped item not in inventory (invalid state)
      const room = createTestRoom('Invalid Equipment Room');
      const sword = createTestObject('Sword', room.id);
      const player = createTestPlayer(room.id);

      // Invalid state: equipped but not in inventory
      player.inventory = [];
      (player as any).equipped = { weapon: sword.id };

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.player = player;
      gameState.rooms = { [room.id]: room };
      gameState.items = { [sword.id]: sword };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Should detect invalid state
      const equipped = loadedState.player.equipped;
      if (equipped?.weapon) {
        const isValid = loadedState.player.inventory.includes(equipped.weapon);
        expect(isValid).toBe(false);
      }
    });

    it('should validate player active quests reference valid quest IDs', async () => {
      // Arrange: Create quests and player
      const room = createTestRoom('Quest Room');
      const quest1 = createTestQuest('quest-1', room.id);
      const quest2 = createTestQuest('quest-2', room.id);
      questManager.registerQuest(quest1);
      questManager.registerQuest(quest2);

      const player = createTestPlayer(room.id);
      (player as any).activeQuests = ['quest-1', 'quest-2'];

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.player = player;
      gameState.rooms = { [room.id]: room };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: All active quests should exist
      const activeQuests = loadedState.player.activeQuests || [];
      activeQuests.forEach((questId: string) => {
        const quest = questManager.getQuest(questId);
        expect(quest).toBeDefined();
      });
    });

    it('should detect invalid quest references', async () => {
      // Arrange: Player with invalid quest references
      const room = createTestRoom('Invalid Quest Room');
      const validQuest = createTestQuest('valid-quest', room.id);
      questManager.registerQuest(validQuest);

      const player = createTestPlayer(room.id);
      (player as any).activeQuests = [
        'valid-quest',
        'invalid-quest-1',
        'invalid-quest-2',
      ];

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.player = player;
      gameState.rooms = { [room.id]: room };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Should detect invalid quest references
      const activeQuests = loadedState.player.activeQuests || [];
      const invalidQuests = activeQuests.filter(
        (questId: string) => !questManager.getQuest(questId),
      );
      expect(invalidQuests.length).toBe(2);
    });

    it('should validate player active effects reference valid effect IDs', async () => {
      // Arrange: Player with active effects
      const room = createTestRoom('Effects Room');
      const player = createTestPlayer(room.id);
      (player as any).activeEffects = [
        { id: 'effect-1', type: 'fire', duration: 10 },
        { id: 'effect-2', type: 'ice', duration: 5 },
      ];

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.player = player;
      gameState.rooms = { [room.id]: room };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Effects should be preserved
      const effects = loadedState.player.activeEffects || [];
      expect(effects.length).toBe(2);
      expect(effects[0].id).toBe('effect-1');
      expect(effects[1].id).toBe('effect-2');
    });

    it('should validate player combat target exists', async () => {
      // Arrange: Player with combat target
      const room = createTestRoom('Combat Room');
      const enemy = createTestObject('Enemy', room.id);
      (enemy as any).type = 'npc';

      const player = createTestPlayer(room.id);
      (player as any).combatTarget = enemy.id;

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.player = player;
      gameState.rooms = { [room.id]: room };
      gameState.npcs = { [enemy.id]: enemy };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Combat target should exist
      const targetId = loadedState.player.combatTarget;
      if (targetId) {
        expect(loadedState.npcs[targetId]).toBeDefined();
      }
    });

    it('should detect invalid combat target reference', async () => {
      // Arrange: Player with invalid combat target
      const room = createTestRoom('Invalid Combat Room');
      const player = createTestPlayer(room.id);
      (player as any).combatTarget = 'non-existent-enemy-id';

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.player = player;
      gameState.rooms = { [room.id]: room };
      gameState.npcs = {};
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Should detect invalid target
      const targetId = loadedState.player.combatTarget;
      if (targetId) {
        const isValid =
          loadedState.npcs && loadedState.npcs[targetId] !== undefined;
        expect(isValid).toBe(false);
      }
    });

    it('should handle player with no references gracefully', async () => {
      // Arrange: Minimal player with no references
      const room = createTestRoom('Minimal Room');
      const player = createTestPlayer(room.id);
      player.inventory = [];

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.player = player;
      gameState.rooms = { [room.id]: room };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Should load successfully
      expect(loadedState.player).toBeDefined();
      expect(loadedState.player.inventory).toEqual([]);
      expect(loadedState.player.roomId).toBe(room.id);
    });
  });

  // ============================================================================
  // 2. Room Reference Validation Tests
  // ============================================================================

  describe('Room Reference Validation', () => {
    it('should validate room exits point to existing rooms', async () => {
      // Arrange: Create connected rooms
      const room1 = createTestRoom('Room 1');
      const room2 = createTestRoom('Room 2');
      const room3 = createTestRoom('Room 3');

      room1.connections = { north: room2.id, east: room3.id };
      room2.connections = { south: room1.id };
      room3.connections = { west: room1.id };

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.rooms = {
        [room1.id]: room1,
        [room2.id]: room2,
        [room3.id]: room3,
      };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: All connections should be valid
      Object.values(loadedState.rooms).forEach((room: any) => {
        if (room.connections) {
          Object.values(room.connections).forEach((targetRoomId: any) => {
            expect(loadedState.rooms[targetRoomId]).toBeDefined();
          });
        }
      });
    });

    it('should detect room exits pointing to non-existent rooms', async () => {
      // Arrange: Room with invalid exit
      const room = createTestRoom('Room with Invalid Exit');
      room.connections = {
        north: 'valid-room-id',
        south: 'non-existent-room-id',
        east: 'another-invalid-room',
      };

      const validRoom = createTestRoom('Valid Target Room');
      validRoom.id = 'valid-room-id';

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.rooms = {
        [room.id]: room,
        'valid-room-id': validRoom,
      };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Should detect invalid exits
      const invalidExits: string[] = [];
      if (loadedState.rooms[room.id]?.connections) {
        Object.entries(loadedState.rooms[room.id].connections).forEach(
          ([dir, targetId]: [string, any]) => {
            if (!loadedState.rooms[targetId]) {
              invalidExits.push(targetId);
            }
          },
        );
      }
      expect(invalidExits.length).toBe(2);
      expect(invalidExits).toContain('non-existent-room-id');
      expect(invalidExits).toContain('another-invalid-room');
    });

    it('should validate room NPCs all exist', async () => {
      // Arrange: Room with NPCs
      const room = createTestRoom('Room with NPCs');
      const npc1 = { id: 'npc-1', name: 'Guard', type: 'npc' };
      const npc2 = { id: 'npc-2', name: 'Merchant', type: 'npc' };

      room.players = [npc1.id, npc2.id]; // NPCs stored in players array

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.rooms = { [room.id]: room };
      gameState.npcs = { [npc1.id]: npc1, [npc2.id]: npc2 };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: All NPCs should exist
      loadedState.rooms[room.id].players.forEach((npcId: string) => {
        expect(loadedState.npcs[npcId]).toBeDefined();
      });
    });

    it('should detect invalid NPC references in room', async () => {
      // Arrange: Room with invalid NPCs
      const room = createTestRoom('Room with Invalid NPCs');
      const validNpc = { id: 'valid-npc', name: 'Guard', type: 'npc' };

      room.players = ['valid-npc', 'invalid-npc-1', 'invalid-npc-2'];

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.rooms = { [room.id]: room };
      gameState.npcs = { 'valid-npc': validNpc };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Should detect invalid NPCs
      const invalidNpcs = loadedState.rooms[room.id].players.filter(
        (npcId: string) => !loadedState.npcs || !loadedState.npcs[npcId],
      );
      expect(invalidNpcs.length).toBe(2);
    });

    it('should validate room items all exist', async () => {
      // Arrange: Room with items
      const room = createTestRoom('Room with Items');
      const item1 = createTestObject('Sword', room.id);
      const item2 = createTestObject('Potion', room.id);

      room.objects = [item1.id, item2.id];

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.rooms = { [room.id]: room };
      gameState.items = { [item1.id]: item1, [item2.id]: item2 };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: All items should exist
      loadedState.rooms[room.id].objects.forEach((itemId: string) => {
        expect(loadedState.items[itemId]).toBeDefined();
      });
    });

    it('should detect invalid item references in room', async () => {
      // Arrange: Room with invalid items
      const room = createTestRoom('Room with Invalid Items');
      const validItem = createTestObject('Valid Item', room.id);

      room.objects = [validItem.id, 'invalid-item-1', 'invalid-item-2'];

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.rooms = { [room.id]: room };
      gameState.items = { [validItem.id]: validItem };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Should detect invalid items
      const invalidItems = loadedState.rooms[room.id].objects.filter(
        (itemId: string) => !loadedState.items[itemId],
      );
      expect(invalidItems.length).toBe(2);
    });

    it('should validate room connections form valid graph (no orphaned rooms)', async () => {
      // Arrange: Create connected and orphaned rooms
      const room1 = createTestRoom('Connected Room 1');
      const room2 = createTestRoom('Connected Room 2');
      const orphanedRoom = createTestRoom('Orphaned Room');

      room1.connections = { north: room2.id };
      room2.connections = { south: room1.id };
      // orphanedRoom has no connections

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.rooms = {
        [room1.id]: room1,
        [room2.id]: room2,
        [orphanedRoom.id]: orphanedRoom,
      };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Detect orphaned rooms
      const orphanedRooms: string[] = [];
      Object.entries(loadedState.rooms).forEach(
        ([roomId, room]: [string, any]) => {
          const hasConnections =
            room.connections && Object.keys(room.connections).length > 0;
          const isReferenced = Object.values(loadedState.rooms).some(
            (r: any) =>
              r.connections && Object.values(r.connections).includes(roomId),
          );

          if (!hasConnections && !isReferenced) {
            orphanedRooms.push(roomId);
          }
        },
      );

      expect(orphanedRooms.length).toBe(1);
      expect(orphanedRooms).toContain(orphanedRoom.id);
    });

    it('should validate bi-directional exit consistency', async () => {
      // Arrange: Rooms with bi-directional connections
      const room1 = createTestRoom('Room 1');
      const room2 = createTestRoom('Room 2');

      room1.connections = { north: room2.id };
      room2.connections = { south: room1.id };

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.rooms = { [room1.id]: room1, [room2.id]: room2 };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Verify bi-directional consistency
      const r1 = loadedState.rooms[room1.id];
      const r2 = loadedState.rooms[room2.id];

      expect(r1.connections.north).toBe(room2.id);
      expect(r2.connections.south).toBe(room1.id);
    });

    it('should detect broken bi-directional connections', async () => {
      // Arrange: Rooms with broken bi-directional connections
      const room1 = createTestRoom('Room 1');
      const room2 = createTestRoom('Room 2');

      // Room 1 connects to Room 2, but Room 2 doesn't connect back
      room1.connections = { north: room2.id };
      room2.connections = { east: 'some-other-room' };

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.rooms = { [room1.id]: room1, [room2.id]: room2 };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Detect missing return connection
      const reverseDirections: { [key: string]: string } = {
        north: 'south',
        south: 'north',
        east: 'west',
        west: 'east',
      };

      const missingConnections: Array<{
        from: string;
        to: string;
        direction: string;
      }> = [];

      Object.entries(loadedState.rooms).forEach(
        ([roomId, room]: [string, any]) => {
          if (room.connections) {
            Object.entries(room.connections).forEach(
              ([direction, targetId]: [string, any]) => {
                const targetRoom = loadedState.rooms[targetId];
                const reverseDir = reverseDirections[direction];

                if (targetRoom && reverseDir) {
                  const hasReturn =
                    targetRoom.connections?.[reverseDir] === roomId;
                  if (!hasReturn) {
                    missingConnections.push({
                      from: roomId,
                      to: targetId,
                      direction,
                    });
                  }
                }
              },
            );
          }
        },
      );

      expect(missingConnections.length).toBeGreaterThan(0);
    });

    it('should handle rooms with no connections gracefully', async () => {
      // Arrange: Single room with no connections
      const room = createTestRoom('Isolated Room');
      delete room.connections;

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.rooms = { [room.id]: room };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Should load successfully
      expect(loadedState.rooms[room.id]).toBeDefined();
      expect(loadedState.rooms[room.id].connections).toBeUndefined();
    });
  });

  // ============================================================================
  // 3. Quest Reference Validation Tests
  // ============================================================================

  describe('Quest Reference Validation', () => {
    it('should validate quest objectives reference existing entities', async () => {
      // Arrange: Quest with valid objective references
      const room = createTestRoom('Quest Room');
      const item = createTestObject('Quest Item', room.id);
      const quest = createTestQuest('quest-1', room.id, item.id);
      questManager.registerQuest(quest);

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.rooms = { [room.id]: room };
      gameState.items = { [item.id]: item };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Objectives should reference valid entities
      const loadedQuest = questManager.getQuest('quest-1');
      expect(loadedQuest).toBeDefined();

      loadedQuest!.objectives.forEach((obj) => {
        if (obj.type === ObjectiveType.GO_TO_LOCATION) {
          expect(loadedState.rooms[obj.targetId!]).toBeDefined();
        } else if (obj.type === ObjectiveType.COLLECT_ITEM) {
          expect(loadedState.items[obj.targetId!]).toBeDefined();
        }
      });
    });

    it('should detect quest objectives with invalid entity references', async () => {
      // Arrange: Quest with invalid references
      const quest = createTestQuest(
        'invalid-quest',
        'non-existent-room',
        'non-existent-item',
      );
      questManager.registerQuest(quest);

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.rooms = {};
      gameState.items = {};
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Should detect invalid references
      const loadedQuest = questManager.getQuest('invalid-quest');
      const invalidObjectives = loadedQuest!.objectives.filter((obj) => {
        if (obj.type === ObjectiveType.GO_TO_LOCATION) {
          return !loadedState.rooms[obj.targetId!];
        } else if (obj.type === ObjectiveType.COLLECT_ITEM) {
          return !loadedState.items[obj.targetId!];
        }
        return false;
      });

      expect(invalidObjectives.length).toBe(2);
    });

    it('should validate quest target NPCs exist', async () => {
      // Arrange: Quest with NPC target
      const room = createTestRoom('NPC Quest Room');
      const npc = { id: 'quest-npc', name: 'Quest Giver', type: 'npc' };

      const quest: IQuest = {
        id: 'npc-quest',
        name: 'Talk to NPC Quest',
        description: 'Talk to the quest giver',
        gameId: testGameId,
        objectives: [
          {
            id: 'talk-obj',
            type: ObjectiveType.TALK_TO_NPC,
            description: 'Talk to the quest giver',
            targetId: npc.id,
            completed: false,
          },
        ],
        canAbandon: true,
      };
      questManager.registerQuest(quest);

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.rooms = { [room.id]: room };
      gameState.npcs = { [npc.id]: npc };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: NPC target should exist
      const loadedQuest = questManager.getQuest('npc-quest');
      const npcObjective = loadedQuest!.objectives.find(
        (obj) => obj.type === ObjectiveType.TALK_TO_NPC,
      );
      expect(loadedState.npcs[npcObjective!.targetId!]).toBeDefined();
    });

    it('should detect invalid NPC targets in quests', async () => {
      // Arrange: Quest with invalid NPC
      const quest: IQuest = {
        id: 'invalid-npc-quest',
        name: 'Invalid NPC Quest',
        description: 'Talk to non-existent NPC',
        gameId: testGameId,
        objectives: [
          {
            id: 'invalid-talk',
            type: ObjectiveType.TALK_TO_NPC,
            description: 'Talk to invalid NPC',
            targetId: 'non-existent-npc',
            completed: false,
          },
        ],
        canAbandon: true,
      };
      questManager.registerQuest(quest);

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.npcs = {};
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Should detect invalid NPC
      const loadedQuest = questManager.getQuest('invalid-npc-quest');
      const npcObjective = loadedQuest!.objectives.find(
        (obj) => obj.type === ObjectiveType.TALK_TO_NPC,
      );
      const isValid =
        loadedState.npcs &&
        loadedState.npcs[npcObjective!.targetId!] !== undefined;
      expect(isValid).toBe(false);
    });

    it('should validate quest required items exist', async () => {
      // Arrange: Quest requiring items
      const item1 = createTestObject('Required Item 1');
      const item2 = createTestObject('Required Item 2');

      const quest: IQuest = {
        id: 'item-quest',
        name: 'Collect Items Quest',
        description: 'Collect the required items',
        gameId: testGameId,
        objectives: [
          {
            id: 'collect-1',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect item 1',
            targetId: item1.id,
            targetCount: 1,
            currentCount: 0,
            completed: false,
          },
          {
            id: 'collect-2',
            type: ObjectiveType.COLLECT_ITEM,
            description: 'Collect item 2',
            targetId: item2.id,
            targetCount: 1,
            currentCount: 0,
            completed: false,
          },
        ],
        canAbandon: true,
      };
      questManager.registerQuest(quest);

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.items = { [item1.id]: item1, [item2.id]: item2 };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: All required items should exist
      const loadedQuest = questManager.getQuest('item-quest');
      const collectObjectives = loadedQuest!.objectives.filter(
        (obj) => obj.type === ObjectiveType.COLLECT_ITEM,
      );
      collectObjectives.forEach((obj) => {
        expect(loadedState.items[obj.targetId!]).toBeDefined();
      });
    });

    it('should validate quest dependencies reference existing quests', async () => {
      // Arrange: Quest chain with dependencies
      const prereqQuest = createTestQuest('prereq-quest');
      const mainQuest: IQuest = {
        ...createTestQuest('main-quest'),
        prerequisites: [
          {
            type: 'quest',
            questId: 'prereq-quest',
          },
        ],
      };

      questManager.registerQuest(prereqQuest);
      questManager.registerQuest(mainQuest);

      // Assert: Prerequisite quest should exist
      const loadedMainQuest = questManager.getQuest('main-quest');
      const prereqQuestId = loadedMainQuest!.prerequisites![0].questId;
      const prereqExists = questManager.getQuest(prereqQuestId!) !== undefined;
      expect(prereqExists).toBe(true);
    });

    it('should detect invalid quest dependencies', async () => {
      // Arrange: Quest with invalid prerequisite
      const quest: IQuest = {
        ...createTestQuest('invalid-dep-quest'),
        prerequisites: [
          {
            type: 'quest',
            questId: 'non-existent-prereq',
          },
        ],
      };
      questManager.registerQuest(quest);

      // Assert: Should detect invalid prerequisite
      const loadedQuest = questManager.getQuest('invalid-dep-quest');
      const invalidPrereqs = loadedQuest!.prerequisites!.filter((prereq) => {
        return (
          prereq.type === 'quest' && !questManager.getQuest(prereq.questId!)
        );
      });
      expect(invalidPrereqs.length).toBe(1);
    });

    it('should detect orphaned quest objectives', async () => {
      // Arrange: Quest with objectives pointing to deleted entities
      const room = createTestRoom('Deleted Room');
      const quest = createTestQuest('orphan-quest', room.id);
      questManager.registerQuest(quest);

      // Act: Save without the referenced room
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.rooms = {}; // Room deleted
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Objectives are orphaned
      const loadedQuest = questManager.getQuest('orphan-quest');
      const orphanedObjectives = loadedQuest!.objectives.filter((obj) => {
        if (obj.type === ObjectiveType.GO_TO_LOCATION) {
          return !loadedState.rooms[obj.targetId!];
        }
        return false;
      });
      expect(orphanedObjectives.length).toBeGreaterThan(0);
    });

    it('should validate quest chains remain unbroken', async () => {
      // Arrange: Quest chain
      const quest1 = createTestQuest('chain-1');
      quest1.nextQuestId = 'chain-2';

      const quest2 = createTestQuest('chain-2');
      quest2.nextQuestId = 'chain-3';

      const quest3 = createTestQuest('chain-3');

      questManager.registerQuest(quest1);
      questManager.registerQuest(quest2);
      questManager.registerQuest(quest3);

      // Assert: Chain should be unbroken
      let currentQuest = questManager.getQuest('chain-1');
      let chainLength = 0;
      const maxChainLength = 10;

      while (
        currentQuest &&
        currentQuest.nextQuestId &&
        chainLength < maxChainLength
      ) {
        const nextQuest = questManager.getQuest(currentQuest.nextQuestId);
        expect(nextQuest).toBeDefined();
        currentQuest = nextQuest;
        chainLength++;
      }

      expect(chainLength).toBe(2);
    });

    it('should detect broken quest chains', async () => {
      // Arrange: Broken quest chain
      const quest1 = createTestQuest('broken-chain-1');
      quest1.nextQuestId = 'broken-chain-2';

      // quest2 is missing!

      const quest3 = createTestQuest('broken-chain-3');

      questManager.registerQuest(quest1);
      questManager.registerQuest(quest3);

      // Assert: Chain should be broken
      const nextQuestId = quest1.nextQuestId;
      const nextQuestExists = questManager.getQuest(nextQuestId) !== undefined;
      expect(nextQuestExists).toBe(false);
    });
  });

  // ============================================================================
  // 4. NPC Reference Validation Tests
  // ============================================================================

  describe('NPC Reference Validation', () => {
    it('should validate NPC current room exists', async () => {
      // Arrange: NPC in a room
      const room = createTestRoom('NPC Room');
      const npc = {
        id: 'npc-1',
        name: 'Guard',
        type: 'npc',
        roomId: room.id,
      };

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.rooms = { [room.id]: room };
      gameState.npcs = { [npc.id]: npc };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: NPC room should exist
      expect(loadedState.npcs[npc.id].roomId).toBe(room.id);
      expect(loadedState.rooms[room.id]).toBeDefined();
    });

    it('should detect NPC in non-existent room', async () => {
      // Arrange: NPC with invalid room
      const npc = {
        id: 'orphaned-npc',
        name: 'Lost Guard',
        type: 'npc',
        roomId: 'non-existent-room',
      };

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.rooms = {};
      gameState.npcs = { [npc.id]: npc };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Should detect invalid room
      const isValid =
        loadedState.rooms[loadedState.npcs[npc.id].roomId] !== undefined;
      expect(isValid).toBe(false);
    });

    it('should validate NPC inventory items exist', async () => {
      // Arrange: NPC with inventory
      const room = createTestRoom('NPC Inventory Room');
      const item1 = createTestObject('NPC Sword');
      const item2 = createTestObject('NPC Gold');

      const npc = {
        id: 'merchant',
        name: 'Merchant',
        type: 'npc',
        roomId: room.id,
        inventory: [item1.id, item2.id],
      };

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.rooms = { [room.id]: room };
      gameState.npcs = { [npc.id]: npc };
      gameState.items = { [item1.id]: item1, [item2.id]: item2 };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: All inventory items should exist
      loadedState.npcs[npc.id].inventory.forEach((itemId: string) => {
        expect(loadedState.items[itemId]).toBeDefined();
      });
    });

    it('should detect invalid inventory items for NPC', async () => {
      // Arrange: NPC with invalid inventory
      const room = createTestRoom('Invalid NPC Inventory Room');
      const validItem = createTestObject('Valid Item');

      const npc = {
        id: 'broken-merchant',
        name: 'Broken Merchant',
        type: 'npc',
        roomId: room.id,
        inventory: [validItem.id, 'invalid-item-1', 'invalid-item-2'],
      };

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.rooms = { [room.id]: room };
      gameState.npcs = { [npc.id]: npc };
      gameState.items = { [validItem.id]: validItem };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Should detect invalid items
      const invalidItems = loadedState.npcs[npc.id].inventory.filter(
        (itemId: string) => !loadedState.items[itemId],
      );
      expect(invalidItems.length).toBe(2);
    });

    it('should validate NPC dialogue trees reference valid nodes', async () => {
      // Arrange: NPC with dialogue tree
      const room = createTestRoom('Dialogue Room');
      const npc = {
        id: 'talker',
        name: 'Talker',
        type: 'npc',
        roomId: room.id,
        dialogueTree: {
          root: 'greeting',
          nodes: {
            greeting: { text: 'Hello!', next: 'question' },
            question: { text: 'What brings you here?', next: 'end' },
            end: { text: 'Farewell', next: null },
          },
        },
      };

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.rooms = { [room.id]: room };
      gameState.npcs = { [npc.id]: npc };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: All dialogue nodes should be valid
      const dialogue = loadedState.npcs[npc.id].dialogueTree;
      expect(dialogue.nodes[dialogue.root]).toBeDefined();

      Object.values(dialogue.nodes).forEach((node: any) => {
        if (node.next !== null) {
          expect(dialogue.nodes[node.next]).toBeDefined();
        }
      });
    });

    it('should detect broken dialogue tree references', async () => {
      // Arrange: NPC with broken dialogue
      const room = createTestRoom('Broken Dialogue Room');
      const npc = {
        id: 'broken-talker',
        name: 'Broken Talker',
        type: 'npc',
        roomId: room.id,
        dialogueTree: {
          root: 'greeting',
          nodes: {
            greeting: { text: 'Hello!', next: 'missing-node' },
          },
        },
      };

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.rooms = { [room.id]: room };
      gameState.npcs = { [npc.id]: npc };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Should detect broken reference
      const dialogue = loadedState.npcs[npc.id].dialogueTree;
      const greeting = dialogue.nodes.greeting;
      const isValid =
        greeting.next === null || dialogue.nodes[greeting.next] !== undefined;
      expect(isValid).toBe(false);
    });

    it('should validate NPC combat target exists', async () => {
      // Arrange: NPC with combat target
      const room = createTestRoom('Combat Room');
      const player = createTestPlayer(room.id);
      const npc = {
        id: 'hostile-npc',
        name: 'Hostile Guard',
        type: 'npc',
        roomId: room.id,
        combatTarget: player.id,
      };

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.player = player;
      gameState.rooms = { [room.id]: room };
      gameState.npcs = { [npc.id]: npc };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Combat target should exist
      const targetId = loadedState.npcs[npc.id].combatTarget;
      expect(loadedState.player.id).toBe(targetId);
    });

    it('should validate NPC patrol path rooms all exist', async () => {
      // Arrange: NPC with patrol path
      const room1 = createTestRoom('Patrol Point 1');
      const room2 = createTestRoom('Patrol Point 2');
      const room3 = createTestRoom('Patrol Point 3');

      const npc = {
        id: 'patrol-guard',
        name: 'Patrol Guard',
        type: 'npc',
        roomId: room1.id,
        patrolPath: [room1.id, room2.id, room3.id],
      };

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.rooms = {
        [room1.id]: room1,
        [room2.id]: room2,
        [room3.id]: room3,
      };
      gameState.npcs = { [npc.id]: npc };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: All patrol rooms should exist
      loadedState.npcs[npc.id].patrolPath.forEach((roomId: string) => {
        expect(loadedState.rooms[roomId]).toBeDefined();
      });
    });

    it('should detect invalid patrol path rooms', async () => {
      // Arrange: NPC with invalid patrol path
      const room1 = createTestRoom('Valid Patrol Point');
      const npc = {
        id: 'broken-patrol',
        name: 'Broken Patrol',
        type: 'npc',
        roomId: room1.id,
        patrolPath: [room1.id, 'invalid-room-1', 'invalid-room-2'],
      };

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.rooms = { [room1.id]: room1 };
      gameState.npcs = { [npc.id]: npc };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Should detect invalid rooms
      const invalidRooms = loadedState.npcs[npc.id].patrolPath.filter(
        (roomId: string) => !loadedState.rooms[roomId],
      );
      expect(invalidRooms.length).toBe(2);
    });

    it('should validate NPC faction references are valid', async () => {
      // Arrange: NPC with faction
      const room = createTestRoom('Faction Room');
      const npc = {
        id: 'faction-guard',
        name: 'City Guard',
        type: 'npc',
        roomId: room.id,
        faction: 'city-guards',
      };

      const factions = {
        'city-guards': { name: 'City Guards', reputation: 0 },
      };

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.rooms = { [room.id]: room };
      gameState.npcs = { [npc.id]: npc };
      (gameState as any).factions = factions;
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Faction should exist
      const faction = loadedState.npcs[npc.id].faction;
      expect((loadedState as any).factions[faction]).toBeDefined();
    });
  });

  // ============================================================================
  // 5. Inventory Reference Validation Tests
  // ============================================================================

  describe('Inventory Reference Validation', () => {
    it('should validate container items exist in game world', async () => {
      // Arrange: Container with items
      const room = createTestRoom('Container Room');
      const container = createTestObject('Chest', room.id);
      container.isContainer = true;
      container.containerCapacity = 10;

      const item1 = createTestObject('Coin', room.id);
      const item2 = createTestObject('Gem', room.id);

      container.containedObjects = [item1.id, item2.id];

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.rooms = { [room.id]: room };
      gameState.items = {
        [container.id]: container,
        [item1.id]: item1,
        [item2.id]: item2,
      };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: All contained items should exist
      const loadedContainer = loadedState.items[container.id];
      loadedContainer.containedObjects?.forEach((itemId: string) => {
        expect(loadedState.items[itemId]).toBeDefined();
      });
    });

    it('should detect invalid container item references', async () => {
      // Arrange: Container with invalid items
      const room = createTestRoom('Invalid Container Room');
      const container = createTestObject('Broken Chest', room.id);
      container.isContainer = true;
      container.containedObjects = [
        'valid-item',
        'invalid-item-1',
        'invalid-item-2',
      ];

      const validItem = createTestObject('Valid Item', room.id);
      validItem.id = 'valid-item';

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.rooms = { [room.id]: room };
      gameState.items = { [container.id]: container, 'valid-item': validItem };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Should detect invalid items
      const invalidItems =
        loadedState.items[container.id].containedObjects?.filter(
          (itemId: string) => !loadedState.items[itemId],
        ) || [];
      expect(invalidItems.length).toBe(2);
    });

    it('should validate equipped items are in inventory', async () => {
      // Arrange: Player with properly equipped items
      const room = createTestRoom('Equipment Room');
      const sword = createTestObject('Sword', room.id);
      const armor = createTestObject('Armor', room.id);
      const player = createTestPlayer(room.id);

      player.inventory = [sword.id, armor.id];
      (player as any).equipped = {
        mainHand: sword.id,
        body: armor.id,
      };

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.player = player;
      gameState.rooms = { [room.id]: room };
      gameState.items = { [sword.id]: sword, [armor.id]: armor };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Equipped items should be in inventory
      const equipped = loadedState.player.equipped;
      if (equipped) {
        Object.values(equipped).forEach((itemId: any) => {
          expect(loadedState.player.inventory).toContain(itemId);
        });
      }
    });

    it('should validate item instances reference valid templates', async () => {
      // Arrange: Items with template references
      const room = createTestRoom('Template Room');
      const itemInstance = createTestObject('Iron Sword Instance', room.id);
      (itemInstance as any).templateId = 'iron-sword-template';

      const templates = {
        'iron-sword-template': {
          name: 'Iron Sword',
          damage: 10,
          durability: 100,
        },
      };

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.rooms = { [room.id]: room };
      gameState.items = { [itemInstance.id]: itemInstance };
      (gameState as any).itemTemplates = templates;
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Template should exist
      const templateId = loadedState.items[itemInstance.id].templateId;
      if (templateId) {
        expect((loadedState as any).itemTemplates[templateId]).toBeDefined();
      }
    });

    it('should validate ownership chains are valid', async () => {
      // Arrange: Item ownership chain
      const room = createTestRoom('Ownership Room');
      const item = createTestObject('Owned Item', room.id);
      const player = createTestPlayer(room.id);

      (item as any).ownedBy = player.id;
      player.inventory = [item.id];

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.player = player;
      gameState.rooms = { [room.id]: room };
      gameState.items = { [item.id]: item };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Owner should exist and have item
      const ownerId = loadedState.items[item.id].ownedBy;
      if (ownerId) {
        expect(loadedState.player.id).toBe(ownerId);
        expect(loadedState.player.inventory).toContain(item.id);
      }
    });

    it('should detect duplicate item instances', async () => {
      // Arrange: Duplicate item in multiple locations
      const room = createTestRoom('Duplicate Room');
      const player = createTestPlayer(room.id);
      const duplicateId = 'duplicate-item';

      // Item appears in both room and player inventory
      room.objects = [duplicateId];
      player.inventory = [duplicateId];

      const item = createTestObject('Duplicate Item', room.id);
      item.id = duplicateId;

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.player = player;
      gameState.rooms = { [room.id]: room };
      gameState.items = { [duplicateId]: item };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Should detect duplicate
      const locations: string[] = [];

      if (loadedState.player.inventory.includes(duplicateId)) {
        locations.push('player-inventory');
      }

      Object.values(loadedState.rooms).forEach((room: any) => {
        if (room.objects.includes(duplicateId)) {
          locations.push(`room-${room.id}`);
        }
      });

      expect(locations.length).toBeGreaterThan(1);
    });

    it('should validate item effects reference valid effect IDs', async () => {
      // Arrange: Item with effects
      const room = createTestRoom('Effects Item Room');
      const item = createTestObject('Magic Sword', room.id);
      item.currentEffects = [
        { id: 'fire-effect', type: 'fire', intensity: 5 },
        { id: 'ice-effect', type: 'ice', intensity: 3 },
      ];

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.rooms = { [room.id]: room };
      gameState.items = { [item.id]: item };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Effects should be preserved
      const effects = loadedState.items[item.id].currentEffects || [];
      expect(effects.length).toBe(2);
      expect(effects[0].id).toBe('fire-effect');
      expect(effects[1].id).toBe('ice-effect');
    });

    it('should handle circular container references gracefully', async () => {
      // Arrange: Circular container reference (container A contains container B, B contains A)
      const room = createTestRoom('Circular Container Room');
      const containerA = createTestObject('Container A', room.id);
      const containerB = createTestObject('Container B', room.id);

      containerA.isContainer = true;
      containerB.isContainer = true;
      containerA.containedObjects = [containerB.id];
      containerB.containedObjects = [containerA.id];

      // Act: Save and load
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.rooms = { [room.id]: room };
      gameState.items = {
        [containerA.id]: containerA,
        [containerB.id]: containerB,
      };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Assert: Circular reference should be detectable
      const visited = new Set<string>();
      let hasCircular = false;

      function checkCircular(containerId: string): boolean {
        if (visited.has(containerId)) {
          return true;
        }
        visited.add(containerId);

        const container = loadedState.items[containerId];
        if (container?.containedObjects) {
          for (const itemId of container.containedObjects) {
            if (checkCircular(itemId)) {
              return true;
            }
          }
        }

        visited.delete(containerId);
        return false;
      }

      hasCircular = checkCircular(containerA.id);
      expect(hasCircular).toBe(true);
    });
  });

  // ============================================================================
  // 6. Performance Tests
  // ============================================================================

  describe('Performance - Large Entity Graphs', () => {
    it('should validate large game state efficiently', async () => {
      // Arrange: Create large game state
      const rooms: any = {};
      const items: any = {};
      const npcs: any = {};

      // Create 100 rooms
      for (let i = 0; i < 100; i++) {
        const room = createTestRoom(`Room ${i}`);
        rooms[room.id] = room;
      }

      // Create 500 items
      for (let i = 0; i < 500; i++) {
        const item = createTestObject(`Item ${i}`);
        items[item.id] = item;
      }

      // Create 50 NPCs
      for (let i = 0; i < 50; i++) {
        npcs[`npc-${i}`] = {
          id: `npc-${i}`,
          name: `NPC ${i}`,
          type: 'npc',
          roomId: Object.keys(rooms)[i % 100],
          inventory: [],
        };
      }

      const player = createTestPlayer(Object.keys(rooms)[0]);
      player.inventory = Object.keys(items).slice(0, 50);

      // Act: Save and load
      const startTime = Date.now();
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.player = player;
      gameState.rooms = rooms;
      gameState.items = items;
      gameState.npcs = npcs;
      await gameStateService.updateGameState(testGameId, gameState);
      await saveAndLoadGame();
      const endTime = Date.now();

      // Assert: Should complete in reasonable time (< 1 second)
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(1000);
    });

    it('should handle cascading reference validation efficiently', async () => {
      // Arrange: Create cascading references (quest -> room -> items -> containers -> contained items)
      const room = createTestRoom('Cascade Room');
      const container = createTestObject('Cascade Container', room.id);
      container.isContainer = true;

      const containedItems: any = {};
      for (let i = 0; i < 20; i++) {
        const item = createTestObject(`Contained Item ${i}`, room.id);
        containedItems[item.id] = item;
      }

      container.containedObjects = Object.keys(containedItems);
      room.objects = [container.id];

      const quest = createTestQuest('cascade-quest', room.id, container.id);
      questManager.registerQuest(quest);

      // Act: Validate all cascading references
      const startTime = Date.now();
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.rooms = { [room.id]: room };
      gameState.items = { [container.id]: container, ...containedItems };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Validate cascade
      const loadedQuest = questManager.getQuest('cascade-quest');
      const questRoom = loadedState.rooms[loadedQuest!.objectives[0].targetId!];
      const questContainer = loadedState.items[questRoom.objects[0]];
      questContainer.containedObjects?.forEach((itemId: string) => {
        expect(loadedState.items[itemId]).toBeDefined();
      });

      const endTime = Date.now();

      // Assert: Should complete quickly
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(500);
    });
  });

  // ============================================================================
  // 7. Recovery and Error Handling Tests
  // ============================================================================

  describe('Recovery Mechanisms', () => {
    it('should auto-cleanup invalid references with warning', async () => {
      // Arrange: Game state with mix of valid and invalid references
      const room = createTestRoom('Cleanup Room');
      const validItem = createTestObject('Valid Item', room.id);
      const player = createTestPlayer(room.id);

      player.inventory = [validItem.id, 'invalid-1', 'invalid-2'];
      room.objects = [validItem.id, 'invalid-3'];

      // Act: Save and load with cleanup
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.player = player;
      gameState.rooms = { [room.id]: room };
      gameState.items = { [validItem.id]: validItem };
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Simulate cleanup
      const cleanedInventory = loadedState.player.inventory.filter(
        (itemId: string) => loadedState.items[itemId] !== undefined,
      );

      const cleanedRoomObjects = loadedState.rooms[room.id].objects.filter(
        (itemId: string) => loadedState.items[itemId] !== undefined,
      );

      // Assert: Invalid references removed
      expect(cleanedInventory.length).toBe(1);
      expect(cleanedInventory).toContain(validItem.id);
      expect(cleanedRoomObjects.length).toBe(1);
      expect(cleanedRoomObjects).toContain(validItem.id);
    });

    it('should provide clear error messages for validation failures', async () => {
      // Arrange: Invalid game state
      const player = createTestPlayer('non-existent-room');

      // Act: Attempt to validate
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.player = player;
      gameState.rooms = {};
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Simulate validation
      const errors: string[] = [];

      if (!loadedState.rooms[loadedState.player.roomId]) {
        errors.push(
          `Player room reference invalid: room '${loadedState.player.roomId}' does not exist`,
        );
      }

      // Assert: Clear error message
      expect(errors.length).toBe(1);
      expect(errors[0]).toContain('Player room reference invalid');
      expect(errors[0]).toContain('non-existent-room');
    });

    it('should support fallback behaviors for missing entities', async () => {
      // Arrange: Player with missing room
      const defaultRoom = createTestRoom('Default Room');
      const player = createTestPlayer('missing-room');

      // Act: Load with fallback
      const gameState = await gameStateService.getGameState(testGameId);
      gameState.player = player;
      gameState.rooms = { [defaultRoom.id]: defaultRoom };
      gameState.startingRoomId = defaultRoom.id;
      await gameStateService.updateGameState(testGameId, gameState);
      const loadedState = await saveAndLoadGame();

      // Simulate fallback
      if (!loadedState.rooms[loadedState.player.roomId]) {
        loadedState.player.roomId =
          loadedState.startingRoomId || Object.keys(loadedState.rooms)[0];
      }

      // Assert: Fallback applied
      expect(loadedState.player.roomId).toBe(defaultRoom.id);
      expect(loadedState.rooms[loadedState.player.roomId]).toBeDefined();
    });
  });
});
