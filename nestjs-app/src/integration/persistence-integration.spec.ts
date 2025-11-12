import { Test, TestingModule } from '@nestjs/testing';
import { CLIModule } from '../cli/cli.module';
import { CLIService } from '../cli/cli.service';
import { GameManagerService } from '../cli/game-manager.service';
import { DatabaseService } from '../database/database.service';
import { RoomService } from '../entity/room.service';
import { ObjectService } from '../entity/object.service';
import { PlayerService } from '../entity/player.service';
import { GameFileService } from '../file-system/game-file.service';
import * as fs from 'fs';
import * as path from 'path';

describe('Persistence System Integration', () => {
  let module: TestingModule;
  let cliService: CLIService;
  let gameManagerService: GameManagerService;
  let databaseService: DatabaseService;
  let roomService: RoomService;
  let objectService: ObjectService;
  let playerService: PlayerService;
  let gameFileService: GameFileService;
  let testDbPath: string;

  beforeAll(async () => {
    // Setup test database
    testDbPath = path.join(
      __dirname,
      '../../test-integration-' +
        Date.now() +
        '-' +
        Math.random().toString(36).substr(2, 9) +
        '.db',
    );

    // Clean up if exists
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    module = await Test.createTestingModule({
      imports: [CLIModule],
    })
      .overrideProvider(DatabaseService)
      .useFactory({
        factory: () => {
          const service = new DatabaseService();
          service.setDatabasePath(testDbPath);
          return service;
        },
      })
      .compile();

    cliService = module.get<CLIService>(CLIService);
    gameManagerService = module.get<GameManagerService>(GameManagerService);
    databaseService = module.get<DatabaseService>(DatabaseService);
    roomService = module.get<RoomService>(RoomService);
    objectService = module.get<ObjectService>(ObjectService);
    playerService = module.get<PlayerService>(PlayerService);
    gameFileService = module.get<GameFileService>(GameFileService);

    // Initialize database
    await databaseService.onModuleInit();
  });

  afterAll(async () => {
    await databaseService.disconnect();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    await module.close();
  });

  afterEach(async () => {
    // Clear caches between tests
    await gameManagerService.clearAllCaches();
  });

  describe('End-to-End Game Creation and Management', () => {
    it('should create a complete game with entities and persist it', async () => {
      const gameId =
        'integration-test-e2e-' +
        Date.now() +
        '-' +
        Math.random().toString(36).substr(2, 9);

      // 1. Create a new game
      const gameData = await gameManagerService.createGame({
        name: 'Integration Test Game',
        description: 'A game for testing the complete system',
        gameId: gameId,
      });

      expect(gameData.id).toBe(gameId);
      expect(gameData.name).toBe('Integration Test Game');

      // 2. Create entities for the game
      const room = await gameManagerService.createEntity(gameId, 'room', {
        name: 'Test Room',
        description: 'A room for testing',
        position: { x: 0, y: 0, z: 0 },
      });

      const object = await gameManagerService.createEntity(gameId, 'object', {
        name: 'Test Sword',
        description: 'A mighty sword',
        position: { x: 1, y: 1, z: 0 },
      });

      const player = await gameManagerService.createEntity(gameId, 'player', {
        name: 'Test Hero',
        description: 'A brave hero',
        position: { x: 0, y: 0, z: 0 },
      });

      expect(room.name).toBe('Test Room');
      expect(object.name).toBe('Test Sword');
      expect(player.name).toBe('Test Hero');

      // 3. Persist the game
      await gameManagerService.persistGame(gameId);

      // 4. Verify persistence by clearing caches and reloading
      await gameManagerService.clearAllCaches();

      const entities = await gameManagerService.listEntities(gameId);
      expect(entities).toHaveLength(3);

      const rooms = entities.filter((e) => e.type === 'room');
      const objects = entities.filter((e) => e.type === 'object');
      const players = entities.filter((e) => e.type === 'player');

      expect(rooms).toHaveLength(1);
      expect(objects).toHaveLength(1);
      expect(players).toHaveLength(1);
    });
  });

  describe('Version Management Integration', () => {
    it('should create versions and rollback entities', async () => {
      const gameId =
        'integration-test-version-' +
        Date.now() +
        '-' +
        Math.random().toString(36).substr(2, 9);

      // Clean up existing data first
      databaseService
        .prepare('DELETE FROM rooms WHERE game_id = ?')
        .run(gameId);
      databaseService
        .prepare('DELETE FROM objects WHERE game_id = ?')
        .run(gameId);
      databaseService.prepare('DELETE FROM npcs WHERE game_id = ?').run(gameId);
      databaseService.prepare('DELETE FROM games WHERE id = ?').run(gameId);

      // Create the game record first
      const insertGame = databaseService.prepare(`
        INSERT INTO games (id, name, description, version, created_at, updated_at, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const now = new Date().toISOString();
      insertGame.run(
        gameId,
        'Integration Test Game',
        'Test game description',
        1,
        now,
        now,
        1,
      );

      // Create a room
      const room = roomService.createRoom({
        name: 'Versioned Room',
        description: 'Original description',
        position: { x: 0, y: 0, z: 0 },
        width: 10,
        height: 10,
        size: { width: 10, height: 10, depth: 3 },
        objects: [],
        players: [],
        gameId: gameId,
      });

      // Save initial version
      const version1 = await roomService.saveRoomVersion(
        room.id,
        'Initial creation',
      );
      expect(version1).toBe(1);

      // Modify room
      roomService.updateEntity(room.id, {
        description: 'Updated description',
        name: 'Updated Room Name',
      });

      // Save second version
      const version2 = await roomService.saveRoomVersion(
        room.id,
        'Updated room',
      );
      expect(version2).toBe(2);

      // Verify current state
      const currentRoom = roomService.getRoom(room.id);
      expect(currentRoom?.description).toBe('Updated description');

      // Rollback to version 1
      const rollbackSuccess = await roomService.rollbackRoom(room.id, 1);
      expect(rollbackSuccess).toBeTruthy();

      // Verify rollback
      const rolledBackRoom = roomService.getRoom(room.id);
      expect(rolledBackRoom?.description).toBe('Original description');
      expect(rolledBackRoom?.name).toBe('Versioned Room');

      // List versions
      const versions = await databaseService.listVersions('room', room.id);
      expect(versions).toHaveLength(3); // Original + Update + Rollback
    });
  });

  describe('Player Interaction System', () => {
    it('should handle complex player interactions with persistence', async () => {
      const gameId =
        'integration-test-interaction-' +
        Date.now() +
        '-' +
        Math.random().toString(36).substr(2, 9);

      // Clean up existing data first
      databaseService
        .prepare('DELETE FROM rooms WHERE game_id = ?')
        .run(gameId);
      databaseService
        .prepare('DELETE FROM objects WHERE game_id = ?')
        .run(gameId);
      databaseService.prepare('DELETE FROM npcs WHERE game_id = ?').run(gameId);
      databaseService.prepare('DELETE FROM games WHERE id = ?').run(gameId);

      // Create the game record first
      const insertGame = databaseService.prepare(`
        INSERT INTO games (id, name, description, version, created_at, updated_at, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const now = new Date().toISOString();
      insertGame.run(
        gameId,
        'Integration Test Game',
        'Test game description',
        1,
        now,
        now,
        1,
      );

      // Create game environment
      const room = roomService.createRoom({
        name: 'Treasure Room',
        description: 'A room filled with treasures',
        position: { x: 0, y: 0, z: 0 },
        width: 15,
        height: 15,
        size: { width: 15, height: 15, depth: 3 },
        objects: [],
        players: [],
        gameId: gameId,
      });

      const sword = objectService.createObject({
        name: 'Magic Sword',
        description: 'A glowing magical sword',
        objectType: 'weapon',
        material: 'steel',
        isPortable: true,
        isContainer: false,
        position: { x: 5, y: 5, z: 0 },
        state: {},
        gameId: gameId,
      });

      const chest = objectService.createObject({
        name: 'Treasure Chest',
        description: 'A wooden chest with iron bands',
        objectType: 'container',
        material: 'wood',
        isPortable: false,
        isContainer: true,
        position: { x: 10, y: 10, z: 0 },
        state: { isOpen: false, isLocked: false },
        gameId: gameId,
      });

      const player = playerService.createPlayer({
        name: 'Adventurer',
        description: 'A skilled adventurer',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        level: 5,
        experience: 1000,
        inventory: [],
        gameId: gameId,
      });

      // Player interactions

      // 1. Examine the sword
      const examineResult = playerService.interactWithObject(
        player.id,
        sword.id,
        'examine',
      );
      expect(examineResult.success).toBeTruthy();
      expect(examineResult.message).toContain('Magic Sword');

      // 2. Take the sword
      const takeResult = playerService.interactWithObject(
        player.id,
        sword.id,
        'take',
      );
      expect(takeResult.success).toBeTruthy();
      expect(takeResult.message).toContain('You take the Magic Sword');

      // 3. Check inventory
      const inventory = playerService.getInventory(player.id);
      expect(inventory).toHaveLength(1);
      expect(inventory[0].name).toBe('Magic Sword');

      // 4. Open the chest
      const openResult = playerService.interactWithObject(
        player.id,
        chest.id,
        'open',
      );
      expect(openResult.success).toBeTruthy();
      expect(openResult.message).toContain('You open the Treasure Chest');

      // 5. Cast a spell
      const spellResult = playerService.castSpell(
        player.id,
        'fire',
        chest.id,
        3,
      );
      expect(spellResult.success).toBeTruthy();
      expect(spellResult.message).toContain('Adventurer casts Fireball!');

      // Persist everything
      await gameManagerService.persistGame(gameId);

      // Clear cache and verify persistence
      await gameManagerService.clearAllCaches();

      const reloadedPlayer = await playerService.getPlayerWithFallback(
        player.id,
        gameId,
      );
      expect(reloadedPlayer).toBeDefined();
      expect(reloadedPlayer?.name).toBe('Adventurer');
      expect(reloadedPlayer?.inventory).toHaveLength(1);
    });
  });

  describe('Cache Performance', () => {
    it('should demonstrate cache performance benefits', async () => {
      const gameId =
        'integration-test-cache-' +
        Date.now() +
        '-' +
        Math.random().toString(36).substr(2, 9);

      // Clean up existing data first
      databaseService
        .prepare('DELETE FROM rooms WHERE game_id = ?')
        .run(gameId);
      databaseService
        .prepare('DELETE FROM objects WHERE game_id = ?')
        .run(gameId);
      databaseService.prepare('DELETE FROM npcs WHERE game_id = ?').run(gameId);
      databaseService.prepare('DELETE FROM games WHERE id = ?').run(gameId);

      // Create the game record first
      const insertGame = databaseService.prepare(`
        INSERT INTO games (id, name, description, version, created_at, updated_at, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const now = new Date().toISOString();
      insertGame.run(
        gameId,
        'Integration Test Game',
        'Test game description',
        1,
        now,
        now,
        1,
      );

      // Create multiple entities
      const entities = [];
      for (let i = 0; i < 10; i++) {
        const room = roomService.createRoom({
          name: `Performance Room ${i}`,
          description: `Room ${i} for performance testing`,
          position: { x: i, y: i, z: 0 },
          width: 10,
          height: 10,
          size: { width: 10, height: 10, depth: 3 },
          objects: [],
          players: [],
          gameId: gameId,
        });
        entities.push(room);
      }

      // Measure cache access time
      const startTime = Date.now();
      for (const entity of entities) {
        const retrieved = roomService.getRoom(entity.id);
        expect(retrieved).toBeDefined();
      }
      const cacheTime = Date.now() - startTime;

      // Clear cache and measure database access time
      roomService.clearCache();

      const dbStartTime = Date.now();
      for (const entity of entities) {
        const retrieved = await roomService.getRoomWithFallback(
          entity.id,
          gameId,
        );
        expect(retrieved).toBeDefined();
      }
      const dbTime = Date.now() - dbStartTime;

      // Cache should be significantly faster (though timing may vary in tests)
      expect(cacheTime).toBeLessThan(dbTime + 50); // Allow some margin for test variance

      // Verify cache is populated
      const cacheStats = roomService.getCacheStats();
      expect(cacheStats.size).toBeGreaterThan(0);
    });
  });

  describe('Database Consistency', () => {
    it('should maintain referential integrity across services', async () => {
      const gameId =
        'integration-test-consistency-' +
        Date.now() +
        '-' +
        Math.random().toString(36).substr(2, 9);

      // Clean up existing data first
      databaseService
        .prepare('DELETE FROM rooms WHERE game_id = ?')
        .run(gameId);
      databaseService
        .prepare('DELETE FROM objects WHERE game_id = ?')
        .run(gameId);
      databaseService.prepare('DELETE FROM npcs WHERE game_id = ?').run(gameId);
      databaseService.prepare('DELETE FROM games WHERE id = ?').run(gameId);

      // Create the game record first
      const insertGame = databaseService.prepare(`
        INSERT INTO games (id, name, description, version, created_at, updated_at, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const now = new Date().toISOString();
      insertGame.run(
        gameId,
        'Integration Test Game',
        'Test game description',
        1,
        now,
        now,
        1,
      );

      // Create related entities
      const room = roomService.createRoom({
        name: 'Container Room',
        description: 'Room with containers and items',
        position: { x: 0, y: 0, z: 0 },
        width: 10,
        height: 10,
        size: { width: 10, height: 10, depth: 3 },
        objects: [],
        players: [],
        gameId: gameId,
      });

      const container = objectService.createObject({
        name: 'Storage Box',
        description: 'A box for storing items',
        objectType: 'container',
        material: 'wood',
        isPortable: false,
        isContainer: true,
        position: { x: 5, y: 5, z: 0 },
        state: { isOpen: true },
        gameId: gameId,
      });

      const item = objectService.createObject({
        name: 'Golden Coin',
        description: 'A shiny gold coin',
        objectType: 'item',
        material: 'gold',
        isPortable: true,
        isContainer: false,
        position: { x: 5, y: 5, z: 0 },
        state: {},
        spatialRelationship: {
          relationshipType: 'inside',
          targetId: container.id,
          description: 'The coin is inside the storage box',
        },
        gameId: gameId,
      });

      // Add objects to room
      roomService.addObjectToRoom(room.id, container.id);
      roomService.addObjectToRoom(room.id, item.id);

      // Persist and verify relationships
      await gameManagerService.persistGame(gameId);

      // Clear cache
      await gameManagerService.clearAllCaches();

      // Reload and verify relationships are maintained
      const reloadedRoom = await roomService.getRoomWithFallback(
        room.id,
        gameId,
      );
      expect(reloadedRoom?.objects).toContain(container.id);
      expect(reloadedRoom?.objects).toContain(item.id);

      const reloadedItem = await objectService.getObjectWithFallback(
        item.id,
        gameId,
      );
      expect(reloadedItem?.spatialRelationship?.targetId).toBe(container.id);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle service failures gracefully', async () => {
      const gameId =
        'integration-test-recovery-' +
        Date.now() +
        '-' +
        Math.random().toString(36).substr(2, 9);

      // Clean up existing data first
      databaseService
        .prepare('DELETE FROM rooms WHERE game_id = ?')
        .run(gameId);
      databaseService
        .prepare('DELETE FROM objects WHERE game_id = ?')
        .run(gameId);
      databaseService.prepare('DELETE FROM npcs WHERE game_id = ?').run(gameId);
      databaseService.prepare('DELETE FROM games WHERE id = ?').run(gameId);

      // Create the game record first
      const insertGame = databaseService.prepare(`
        INSERT INTO games (id, name, description, version, created_at, updated_at, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const now = new Date().toISOString();
      insertGame.run(
        gameId,
        'Integration Test Game',
        'Test game description',
        1,
        now,
        now,
        1,
      );

      // Create entities that will succeed
      const room = roomService.createRoom({
        name: 'Resilient Room',
        description: 'A room that survives failures',
        position: { x: 0, y: 0, z: 0 },
        width: 10,
        height: 10,
        size: { width: 10, height: 10, depth: 3 },
        objects: [],
        players: [],
        gameId: gameId,
      });

      // Simulate partial failure in persistence
      const originalTransaction = databaseService.transaction;
      let callCount = 0;

      databaseService.transaction = jest
        .fn()
        .mockImplementation(async (callback) => {
          callCount++;
          if (callCount === 2) {
            // Fail on second call
            throw new Error('Simulated database failure');
          }
          return originalTransaction.call(databaseService, callback);
        });

      // Attempt to persist - some may fail
      try {
        await gameManagerService.persistGame(gameId);
      } catch (error) {
        // Expected to fail partially
      }

      // Restore normal operation
      databaseService.transaction = originalTransaction;

      // Verify that entities still exist in cache
      const cachedRoom = roomService.getRoom(room.id);
      expect(cachedRoom).toBeDefined();
      expect(cachedRoom?.name).toBe('Resilient Room');

      // System should recover and work normally
      await gameManagerService.persistGame(gameId);

      const entities = await gameManagerService.listEntities(gameId);
      expect(entities.some((e) => e.id === room.id)).toBeTruthy();
    });
  });

  describe('System Integration Validation', () => {
    it('should validate the complete system workflow', async () => {
      const gameId =
        'integration-test-workflow-' +
        Date.now() +
        '-' +
        Math.random().toString(36).substr(2, 9);

      // First create a test game for this workflow
      await gameManagerService.createGame({
        name: 'Workflow Test Game',
        description: 'A game for testing the workflow',
        gameId: gameId,
      });

      // 1. List games (should include our test game)
      const games = await gameManagerService.listGames();
      expect(games.some((game) => game.id === gameId)).toBeTruthy();

      // 2. Get cache statistics
      const cacheStats = await gameManagerService.getCacheStats();
      expect(cacheStats.entities).toBeGreaterThanOrEqual(0);
      expect(cacheStats.rooms).toBeGreaterThanOrEqual(0);
      expect(cacheStats.objects).toBeGreaterThanOrEqual(0);
      expect(cacheStats.players).toBeGreaterThanOrEqual(0);

      // 3. Create backup
      const backupTimestamp = await gameManagerService.backupGame(gameId);
      expect(backupTimestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);

      // 4. Verify all major services are working
      expect(() => roomService.getAllRooms()).not.toThrow();
      expect(() => objectService.getAllObjects()).not.toThrow();
      expect(() => playerService.getAllPlayersForGame(gameId)).not.toThrow();

      // 5. Clear all caches
      await gameManagerService.clearAllCaches();

      const clearedStats = await gameManagerService.getCacheStats();
      expect(clearedStats.entities).toBe(0);
      expect(clearedStats.rooms).toBe(0);
      expect(clearedStats.objects).toBe(0);
      expect(clearedStats.players).toBe(0);

      // 6. Reload game
      await gameManagerService.loadGame(gameId);

      const reloadedStats = await gameManagerService.getCacheStats();
      expect(
        reloadedStats.entities +
          reloadedStats.rooms +
          reloadedStats.objects +
          reloadedStats.players,
      ).toBeGreaterThan(0);
    });
  });
});
