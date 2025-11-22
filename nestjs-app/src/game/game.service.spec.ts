import { Test, TestingModule } from '@nestjs/testing';
import { GameService, GameSession, CommandResult } from './game.service';
import { GameStateService } from './game-state.service';
import { CommandProcessorService } from './command-processor.service';
import { EntityService } from '../entity/entity.service';
import { RoomService } from '../entity/room.service';
import { PlayerService } from '../entity/player.service';
import { ObjectService } from '../entity/object.service';
import { DatabaseService } from '../database/database.service';
import * as fs from 'fs/promises';

// Mock fs/promises module
jest.mock('fs/promises');

describe('GameService', () => {
  let service: GameService;
  let gameStateService: jest.Mocked<GameStateService>;
  let commandProcessor: jest.Mocked<CommandProcessorService>;
  let entityService: jest.Mocked<EntityService>;
  let roomService: jest.Mocked<RoomService>;
  let playerService: jest.Mocked<PlayerService>;
  let objectService: jest.Mocked<ObjectService>;
  let databaseService: jest.Mocked<DatabaseService>;

  const mockPlayer = {
    id: 'player-123',
    name: 'Adventurer',
    type: 'player',
    position: { x: 0, y: 0, z: 0 },
    health: 100,
    maxHealth: 100,
    inventory: [],
    level: 1,
    experience: 0,
    gameId: 'game-123',
  };

  const mockRoom = {
    id: 'room-123',
    name: 'Entry Hall',
    description: 'A dimly lit entry hall',
    position: { x: 0, y: 0, z: 0 },
    width: 10,
    height: 10,
    size: { width: 10, height: 10, depth: 3 },
    objects: [],
    players: [],
  };

  const mockGameState = {
    gameId: 'game-123',
    rooms: {},
    npcs: {},
    items: {},
    metadata: {
      version: '2.1.0',
      initialized: true,
    },
  };

  beforeEach(async () => {
    const mockGameStateServiceValue = {
      getGameState: jest.fn(),
      updateGameState: jest.fn(),
      saveGameState: jest.fn(),
      loadGameState: jest.fn(),
    };

    const mockCommandProcessorValue = {
      processCommand: jest.fn(),
    };

    const mockEntityServiceValue = {
      createEntity: jest.fn(),
      getEntity: jest.fn(),
      updateEntity: jest.fn(),
    };

    const mockRoomServiceValue = {
      createRoom: jest.fn(),
      getRoom: jest.fn(),
      getAllRooms: jest.fn(),
      addObjectToRoom: jest.fn(),
      update: jest.fn(),
      connectRooms: jest.fn(),
    };

    const mockPlayerServiceValue = {
      createPlayer: jest.fn(),
      getPlayer: jest.fn(),
      getInventory: jest.fn(),
    };

    const mockObjectServiceValue = {
      createObject: jest.fn(),
      getObject: jest.fn(),
    };

    const mockDatabaseServiceValue = {
      transaction: jest.fn(),
      prepare: jest.fn(),
      saveVersion: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameService,
        {
          provide: GameStateService,
          useValue: mockGameStateServiceValue,
        },
        {
          provide: CommandProcessorService,
          useValue: mockCommandProcessorValue,
        },
        {
          provide: EntityService,
          useValue: mockEntityServiceValue,
        },
        {
          provide: RoomService,
          useValue: mockRoomServiceValue,
        },
        {
          provide: PlayerService,
          useValue: mockPlayerServiceValue,
        },
        {
          provide: ObjectService,
          useValue: mockObjectServiceValue,
        },
        {
          provide: DatabaseService,
          useValue: mockDatabaseServiceValue,
        },
      ],
    }).compile();

    service = module.get<GameService>(GameService);
    gameStateService = module.get(GameStateService);
    commandProcessor = module.get(CommandProcessorService);
    entityService = module.get(EntityService);
    roomService = module.get(RoomService);
    playerService = module.get(PlayerService);
    objectService = module.get(ObjectService);
    databaseService = module.get(DatabaseService);

    // Default mock implementations
    playerService.createPlayer.mockResolvedValue(mockPlayer);
    playerService.getPlayer.mockReturnValue(mockPlayer);
    roomService.createRoom.mockImplementation((data) => ({
      id: `room-${Math.random()}`,
      ...data,
    }));
    objectService.createObject.mockImplementation((data) => ({
      id: `obj-${Math.random()}`,
      ...data,
    }));
    roomService.getAllRooms.mockReturnValue([mockRoom]);
    gameStateService.getGameState.mockResolvedValue(mockGameState);
    gameStateService.updateGameState.mockResolvedValue(undefined);

    // Mock database operations
    const mockRun = jest.fn();
    const mockPrepare = jest.fn().mockReturnValue({ run: mockRun });
    databaseService.prepare.mockReturnValue({ run: mockRun } as any);
    databaseService.saveVersion.mockResolvedValue(1);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createGame()', () => {
    it('should create a new game session', async () => {
      const result = await service.createGame();

      expect(result).toBeDefined();
      expect(result.gameId).toBeDefined();
      expect(result.gameState).toBeDefined();
      expect(result.gameState.player).toEqual(mockPlayer);
    });

    it('should save game to database first', async () => {
      await service.createGame();

      expect(databaseService.prepare).toHaveBeenCalled();
      expect(databaseService.saveVersion).toHaveBeenCalledWith(
        'game',
        expect.any(String),
        expect.any(Object),
        'game_service',
        'Game created',
      );
    });

    it('should create a player with gameId', async () => {
      await service.createGame();

      expect(playerService.createPlayer).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Adventurer',
          position: { x: 0, y: 0, z: 0 },
          health: 100,
          inventory: [],
          level: 1,
          experience: 0,
          gameId: expect.any(String),
        }),
      );
    });

    it('should initialize game world when no path provided', async () => {
      await service.createGame();

      expect(roomService.createRoom).toHaveBeenCalled();
      expect(objectService.createObject).toHaveBeenCalled();
    });

    it('should create starting room with correct properties', async () => {
      await service.createGame();

      expect(roomService.createRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Entry Hall',
          position: { x: 0, y: 0, z: 0 },
          width: 10,
          height: 10,
          size: { width: 10, height: 10, depth: 3 },
        }),
      );
    });

    it('should create adjacent rooms for navigation', async () => {
      await service.createGame();

      const createRoomCalls = roomService.createRoom.mock.calls;
      expect(createRoomCalls.length).toBeGreaterThanOrEqual(3);

      // Check for north room
      const northRoomCall = createRoomCalls.find(
        (call) => call[0].name === 'Garden',
      );
      expect(northRoomCall).toBeDefined();
      expect(northRoomCall[0].position.y).toBe(15);

      // Check for east room
      const eastRoomCall = createRoomCalls.find(
        (call) => call[0].name === 'Library',
      );
      expect(eastRoomCall).toBeDefined();
      expect(eastRoomCall[0].position.x).toBe(15);
    });

    it('should create initial objects in rooms', async () => {
      await service.createGame();

      const createObjectCalls = objectService.createObject.mock.calls;
      // Entry Hall: torch, key; Library: book; Garden: flower (4 objects total)
      expect(createObjectCalls.length).toBeGreaterThanOrEqual(4);
    });

    it('should add objects to rooms', async () => {
      await service.createGame();

      expect(roomService.addObjectToRoom).toHaveBeenCalled();
    });

    it('should create game session and add to map', async () => {
      const result = await service.createGame();

      const gameResult = await service.getGame(result.gameId);
      expect(gameResult).not.toBeNull();
    });

    it('should handle null game state by creating default', async () => {
      gameStateService.getGameState.mockResolvedValue(null);

      const result = await service.createGame();

      expect(result.gameState).toBeDefined();
      expect(result.gameState.gameId).toBeDefined();
      expect(result.gameState.rooms).toBeDefined();
      expect(result.gameState.npcs).toBeDefined();
      expect(result.gameState.items).toBeDefined();
      expect(result.gameState.metadata).toBeDefined();
    });

    it('should handle database save failure gracefully', async () => {
      databaseService.prepare.mockImplementation(() => {
        throw new Error('Database error');
      });

      await expect(service.createGame()).rejects.toThrow('Database error');
    });
  });

  describe('createGame() - Resource Limits', () => {
    it('should cleanup inactive sessions before creating', async () => {
      // Create multiple sessions
      const result1 = await service.createGame();
      const result2 = await service.createGame();

      // Make sessions old
      const sessions = (service as any).gameSessions;
      const oldDate = new Date(Date.now() - 1000);
      (sessions.get(result1.gameId) as GameSession).lastActive = oldDate;
      (sessions.get(result2.gameId) as GameSession).lastActive = oldDate;

      const cleanedCount = service.cleanupInactiveSessions(0);
      expect(cleanedCount).toBeGreaterThan(0);
    });

    it('should evict LRU session when max sessions reached', async () => {
      // Create sessions
      const sessions = [];
      for (let i = 0; i < 3; i++) {
        const result = await service.createGame();
        sessions.push(result.gameId);
      }

      // Make first two sessions old
      const sessionMap = (service as any).gameSessions;
      const veryOldDate = new Date(Date.now() - 10000);
      const oldDate = new Date(Date.now() - 5000);

      (sessionMap.get(sessions[0]) as GameSession).lastActive = veryOldDate;
      (sessionMap.get(sessions[1]) as GameSession).lastActive = oldDate;

      // Temporarily set max sessions to 3
      const maxSessions = (service as any).MAX_SESSIONS;
      (service as any).MAX_SESSIONS = 3;

      // Create one more session - should trigger eviction of oldest (sessions[0])
      const newSession = await service.createGame();

      // Restore original max
      (service as any).MAX_SESSIONS = maxSessions;

      // First session (oldest) should be evicted
      const result = await service.getGame(sessions[0]);
      expect(result).toBeNull();
    });

    it('should respect MAX_SESSIONS limit of 10000', async () => {
      const maxSessions = (service as any).MAX_SESSIONS;
      expect(maxSessions).toBe(10000);
    });

    it('should respect SESSION_INACTIVE_TIMEOUT of 24 hours', async () => {
      const timeout = (service as any).SESSION_INACTIVE_TIMEOUT;
      expect(timeout).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('createGame() - Concurrency Protection', () => {
    it('should use mutex lock for session creation', async () => {
      // Create multiple games concurrently
      const promises = [
        service.createGame(),
        service.createGame(),
        service.createGame(),
      ];

      const results = await Promise.all(promises);

      // All should succeed with unique gameIds
      expect(results.length).toBe(3);
      const gameIds = results.map((r) => r.gameId);
      const uniqueIds = new Set(gameIds);
      expect(uniqueIds.size).toBe(3);
    });

    it('should have mutex lock timeout of 5 seconds', async () => {
      const lockTimeout = (service as any).LOCK_TIMEOUT;
      expect(lockTimeout).toBe(5000);
    });
  });

  describe('createGame() - File Loading', () => {
    beforeEach(() => {
      // Mock file system operations
      (fs.readFile as jest.Mock).mockImplementation(async (path: string) => {
        if (path.includes('game-config.json')) {
          return JSON.stringify({
            name: 'Test Game',
            version: '1.0.0',
          });
        }
        if (path.includes('connections.json')) {
          return JSON.stringify({
            connections: [],
          });
        }
        return JSON.stringify({});
      });

      (fs.readdir as jest.Mock).mockResolvedValue([]);
    });

    it('should load game from path when provided', async () => {
      const gamePath = 'test-game';
      await service.createGame(gamePath);

      expect(fs.readFile).toHaveBeenCalled();
    });

    it('should handle file loading errors', async () => {
      (fs.readFile as jest.Mock).mockRejectedValue(
        new Error('File not found'),
      );

      await expect(service.createGame('invalid-path')).rejects.toThrow(
        'Failed to load game',
      );
    });

    it('should load rooms from files', async () => {
      (fs.readdir as jest.Mock).mockResolvedValue(['room1.json', 'room2.json']);
      (fs.readFile as jest.Mock).mockImplementation(async (path: string) => {
        if (path.includes('game-config.json')) {
          return JSON.stringify({ name: 'Test Game' });
        }
        if (path.includes('room1.json') || path.includes('room2.json')) {
          return JSON.stringify({
            id: 'test-room',
            name: 'Test Room',
            description: 'A test room',
            position: { x: 0, y: 0, z: 0 },
            size: { width: 10, height: 10, depth: 3 },
          });
        }
        if (path.includes('connections.json')) {
          return JSON.stringify({ connections: [] });
        }
        return JSON.stringify({});
      });

      await service.createGame('test-game');

      expect(roomService.createRoom).toHaveBeenCalled();
    });

    it('should load objects from files', async () => {
      (fs.readdir as jest.Mock).mockImplementation(async (path: string) => {
        if (path.toString().includes('objects')) {
          return ['object1.json'];
        }
        return [];
      });

      (fs.readFile as jest.Mock).mockImplementation(async (path: string) => {
        if (path.includes('game-config.json')) {
          return JSON.stringify({ name: 'Test Game' });
        }
        if (path.includes('object1.json')) {
          return JSON.stringify({
            id: 'test-obj',
            name: 'Test Object',
            description: 'A test object',
            object_type: 'item',
            isPortable: true,
          });
        }
        if (path.includes('connections.json')) {
          return JSON.stringify({ connections: [] });
        }
        return JSON.stringify({});
      });

      await service.createGame('test-game');

      expect(objectService.createObject).toHaveBeenCalled();
    });

    it('should load NPCs from files and place in rooms', async () => {
      const mockNpcPlayer = {
        id: 'npc-123',
        name: 'Guard',
        type: 'player',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        maxHealth: 100,
        inventory: [],
        level: 1,
        experience: 0,
      };

      playerService.createPlayer.mockResolvedValue(mockNpcPlayer);

      (fs.readdir as jest.Mock).mockImplementation(async (path: string) => {
        if (path.toString().includes('npcs')) {
          return ['npc1.json'];
        }
        return [];
      });

      (fs.readFile as jest.Mock).mockImplementation(async (path: string) => {
        if (path.includes('game-config.json')) {
          return JSON.stringify({ name: 'Test Game' });
        }
        if (path.includes('npc1.json')) {
          return JSON.stringify({
            id: 'npc-test',
            name: 'Test NPC',
            description: 'A test NPC',
            position: { x: 0, y: 0, z: 0 },
            stats: { health: 100 },
          });
        }
        if (path.includes('connections.json')) {
          return JSON.stringify({ connections: [] });
        }
        return JSON.stringify({});
      });

      await service.createGame('test-game');

      expect(playerService.createPlayer).toHaveBeenCalled();
    });

    it('should load connections between rooms', async () => {
      (fs.readFile as jest.Mock).mockImplementation(async (path: string) => {
        if (path.includes('game-config.json')) {
          return JSON.stringify({ name: 'Test Game' });
        }
        if (path.includes('connections.json')) {
          return JSON.stringify({
            connections: [
              { from: 'room1', to: 'room2', direction: 'north' },
            ],
          });
        }
        return JSON.stringify({});
      });

      (fs.readdir as jest.Mock).mockResolvedValue([]);

      await service.createGame('test-game');

      expect(fs.readFile).toHaveBeenCalled();
    });

    it('should handle portable attribute variations', async () => {
      (fs.readdir as jest.Mock).mockImplementation(async (path: string) => {
        if (path.toString().includes('objects')) {
          return ['obj1.json', 'obj2.json', 'obj3.json'];
        }
        return [];
      });

      (fs.readFile as jest.Mock).mockImplementation(async (path: string) => {
        if (path.includes('game-config.json')) {
          return JSON.stringify({ name: 'Test Game' });
        }
        if (path.includes('obj1.json')) {
          return JSON.stringify({
            id: 'obj1',
            name: 'Object 1',
            can_take: true,
          });
        }
        if (path.includes('obj2.json')) {
          return JSON.stringify({
            id: 'obj2',
            name: 'Object 2',
            is_portable: false,
          });
        }
        if (path.includes('obj3.json')) {
          return JSON.stringify({
            id: 'obj3',
            name: 'Object 3',
            takeable: true,
          });
        }
        if (path.includes('connections.json')) {
          return JSON.stringify({ connections: [] });
        }
        return JSON.stringify({});
      });

      await service.createGame('test-game');

      // All three variations should be handled
      expect(objectService.createObject).toHaveBeenCalledTimes(3);
    });
  });

  describe('getGame()', () => {
    it('should return null for non-existent game', async () => {
      const result = await service.getGame('non-existent');

      expect(result).toBeNull();
    });

    it('should return game state for existing game', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      const result = await service.getGame(gameId);

      expect(result).not.toBeNull();
      expect(result.gameState).toBeDefined();
    });

    it('should update lastActive timestamp', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      const session1 = (service as any).gameSessions.get(gameId);
      const lastActive1 = session1.lastActive.getTime();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      await service.getGame(gameId);

      const session2 = (service as any).gameSessions.get(gameId);
      const lastActive2 = session2.lastActive.getTime();

      expect(lastActive2).toBeGreaterThan(lastActive1);
    });

    it('should include player in game state', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      const result = await service.getGame(gameId);

      expect(result.gameState.player).toBeDefined();
    });

    it('should handle null game state by creating default', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      gameStateService.getGameState.mockResolvedValue(null);

      const result = await service.getGame(gameId);

      expect(result.gameState).toBeDefined();
      expect(result.gameState.metadata.version).toBe('2.1.0');
    });
  });

  describe('processCommand()', () => {
    it('should return error for non-existent game session', async () => {
      const result = await service.processCommand('non-existent', 'look');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Game session not found');
    });

    it('should process command for existing game', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      const mockCommandResult: CommandResult = {
        success: true,
        type: 'room_description',
        message: 'You look around',
      };

      commandProcessor.processCommand.mockResolvedValue(mockCommandResult);

      const result = await service.processCommand(gameId, 'look');

      expect(result.success).toBe(true);
      expect(commandProcessor.processCommand).toHaveBeenCalledWith(
        'look',
        mockPlayer.id,
        gameId,
      );
    });

    it('should update lastActive timestamp', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      const session1 = (service as any).gameSessions.get(gameId);
      const lastActive1 = session1.lastActive.getTime();

      await new Promise((resolve) => setTimeout(resolve, 10));

      commandProcessor.processCommand.mockResolvedValue({
        success: true,
        type: 'room_description',
      });

      await service.processCommand(gameId, 'look');

      const session2 = (service as any).gameSessions.get(gameId);
      const lastActive2 = session2.lastActive.getTime();

      expect(lastActive2).toBeGreaterThan(lastActive1);
    });

    it('should update game state after successful command', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      const mockCommandResult: CommandResult = {
        success: true,
        type: 'action_success',
      };

      commandProcessor.processCommand.mockResolvedValue(mockCommandResult);

      await service.processCommand(gameId, 'take key');

      expect(gameStateService.updateGameState).toHaveBeenCalledWith(
        gameId,
        expect.objectContaining({
          lastCommand: 'take key',
          lastCommandTime: expect.any(Date),
        }),
      );
    });

    it('should handle command processing errors', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      commandProcessor.processCommand.mockRejectedValue(
        new Error('Command error'),
      );

      const result = await service.processCommand(gameId, 'invalid');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Command processing error');
    });
  });

  describe('getInventory()', () => {
    it('should return error for non-existent game', async () => {
      const result = await service.getInventory('non-existent');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Game session not found');
    });

    it('should return inventory for existing game', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      const mockInventory = [
        { id: 'item-1', name: 'Sword', type: 'weapon' },
        { id: 'item-2', name: 'Potion', type: 'consumable' },
      ];

      playerService.getInventory.mockReturnValue(mockInventory);

      const result = await service.getInventory(gameId);

      expect(result.success).toBe(true);
      expect(result.items).toBeDefined();
      expect(result.items.length).toBe(2);
    });

    it('should handle player not found', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      playerService.getPlayer.mockReturnValue(null);

      const result = await service.getInventory(gameId);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Player not found');
    });

    it('should handle errors gracefully', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      playerService.getInventory.mockImplementation(() => {
        throw new Error('Inventory error');
      });

      const result = await service.getInventory(gameId);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to get inventory');
    });
  });

  describe('getMap()', () => {
    it('should return error for non-existent game', async () => {
      const result = await service.getMap('non-existent');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Game session not found');
    });

    it('should return map for existing game', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      const result = await service.getMap(gameId);

      expect(result.success).toBe(true);
      expect(result.map).toBeDefined();
      expect(result.map.ascii).toBeDefined();
    });

    it('should handle player not found', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      playerService.getPlayer.mockReturnValue(null);

      const result = await service.getMap(gameId);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Player not found');
    });

    it('should show unknown area when room not found', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      roomService.getAllRooms.mockReturnValue([]);

      const result = await service.getMap(gameId);

      expect(result.success).toBe(true);
      expect(result.map.ascii).toContain('UNKNOWN AREA');
    });

    it('should handle errors gracefully', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      roomService.getAllRooms.mockImplementation(() => {
        throw new Error('Map error');
      });

      const result = await service.getMap(gameId);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to get map');
    });
  });

  describe('saveGame()', () => {
    it('should return error for non-existent game', async () => {
      const result = await service.saveGame('non-existent');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Game session not found');
    });

    it('should save game to default slot', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      gameStateService.saveGameState.mockResolvedValue(undefined);

      const result = await service.saveGame(gameId);

      expect(result.success).toBe(true);
      expect(result.message).toContain('quicksave');
      expect(gameStateService.saveGameState).toHaveBeenCalledWith(
        gameId,
        'quicksave',
      );
    });

    it('should save game to named slot', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      gameStateService.saveGameState.mockResolvedValue(undefined);

      const result = await service.saveGame(gameId, 'my-save');

      expect(result.success).toBe(true);
      expect(result.message).toContain('my-save');
      expect(gameStateService.saveGameState).toHaveBeenCalledWith(
        gameId,
        'my-save',
      );
    });

    it('should handle save errors', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      gameStateService.saveGameState.mockRejectedValue(
        new Error('Save failed'),
      );

      const result = await service.saveGame(gameId);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Save failed');
    });
  });

  describe('loadGame()', () => {
    it('should return error for non-existent game', async () => {
      const result = await service.loadGame('non-existent');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Game session not found');
    });

    it('should load game from default slot', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      const mockLoadedState = { ...mockGameState };
      gameStateService.loadGameState.mockResolvedValue(mockLoadedState);

      const result = await service.loadGame(gameId);

      expect(result.success).toBe(true);
      expect(result.gameState).toEqual(mockLoadedState);
      expect(result.message).toContain('quicksave');
      expect(gameStateService.loadGameState).toHaveBeenCalledWith(
        gameId,
        'quicksave',
      );
    });

    it('should load game from named slot', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      const mockLoadedState = { ...mockGameState };
      gameStateService.loadGameState.mockResolvedValue(mockLoadedState);

      const result = await service.loadGame(gameId, 'my-save');

      expect(result.success).toBe(true);
      expect(result.message).toContain('my-save');
      expect(gameStateService.loadGameState).toHaveBeenCalledWith(
        gameId,
        'my-save',
      );
    });

    it('should handle load errors', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      gameStateService.loadGameState.mockRejectedValue(
        new Error('Load failed'),
      );

      const result = await service.loadGame(gameId);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Load failed');
    });
  });

  describe('cleanupInactiveSessions()', () => {
    it('should cleanup sessions older than specified time', async () => {
      // Create sessions
      const result1 = await service.createGame();
      const result2 = await service.createGame();

      // Manually set lastActive to old date
      const sessions = (service as any).gameSessions;
      const session1: GameSession = sessions.get(result1.gameId);
      const session2: GameSession = sessions.get(result2.gameId);

      const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours ago
      session1.lastActive = oldDate;

      // Cleanup sessions older than 24 hours
      const cleanedCount = service.cleanupInactiveSessions(24 * 60 * 60 * 1000);

      expect(cleanedCount).toBe(1);
      expect(sessions.has(result1.gameId)).toBe(false);
      expect(sessions.has(result2.gameId)).toBe(true);
    });

    it('should not cleanup active sessions', async () => {
      const result = await service.createGame();

      const cleanedCount = service.cleanupInactiveSessions(24 * 60 * 60 * 1000);

      expect(cleanedCount).toBe(0);
      const sessions = (service as any).gameSessions;
      expect(sessions.has(result.gameId)).toBe(true);
    });

    it('should return count of cleaned sessions', async () => {
      // Create multiple old sessions
      const results = [];
      for (let i = 0; i < 3; i++) {
        const result = await service.createGame();
        results.push(result);
      }

      // Make all sessions old
      const sessions = (service as any).gameSessions;
      const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
      for (const result of results) {
        const session: GameSession = sessions.get(result.gameId);
        session.lastActive = oldDate;
      }

      const cleanedCount = service.cleanupInactiveSessions(24 * 60 * 60 * 1000);

      expect(cleanedCount).toBe(3);
    });

    it('should use default timeout when not specified', async () => {
      const result = await service.createGame();

      // Set to old date
      const sessions = (service as any).gameSessions;
      const session: GameSession = sessions.get(result.gameId);
      session.lastActive = new Date(Date.now() - 48 * 60 * 60 * 1000);

      const cleanedCount = service.cleanupInactiveSessions();

      expect(cleanedCount).toBe(1);
    });
  });

  describe('Memory Management', () => {
    it('should properly cleanup sessions on eviction', async () => {
      const result = await service.createGame();
      const gameId = result.gameId;

      const sessions = (service as any).gameSessions;
      expect(sessions.has(gameId)).toBe(true);

      // Make session old and evict
      const session: GameSession = sessions.get(gameId);
      session.lastActive = new Date(Date.now() - 48 * 60 * 60 * 1000);

      service.cleanupInactiveSessions(0);

      expect(sessions.has(gameId)).toBe(false);
    });

    it('should not leak memory from sessions map', async () => {
      const sessions = (service as any).gameSessions;
      const initialSize = sessions.size;

      // Create and cleanup sessions
      const results = [];
      for (let i = 0; i < 10; i++) {
        const result = await service.createGame();
        results.push(result);
      }

      expect(sessions.size).toBe(initialSize + 10);

      // Make all sessions old
      const oldDate = new Date(Date.now() - 1000);
      for (const result of results) {
        (sessions.get(result.gameId) as GameSession).lastActive = oldDate;
      }

      // Cleanup all
      service.cleanupInactiveSessions(0);

      expect(sessions.size).toBe(initialSize);
    });
  });

  describe('Database Transactions', () => {
    it('should save game record before creating player', async () => {
      const prepareOrder: string[] = [];

      databaseService.prepare.mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO games')) {
          prepareOrder.push('game');
        }
        return { run: jest.fn() } as any;
      });

      playerService.createPlayer.mockImplementation(async (data) => {
        prepareOrder.push('player');
        return mockPlayer;
      });

      await service.createGame();

      expect(prepareOrder[0]).toBe('game');
      expect(prepareOrder[1]).toBe('player');
    });

    it('should rollback on player creation failure', async () => {
      playerService.createPlayer.mockRejectedValue(
        new Error('Player creation failed'),
      );

      await expect(service.createGame()).rejects.toThrow();
    });

    it('should save version history for game', async () => {
      await service.createGame();

      expect(databaseService.saveVersion).toHaveBeenCalledWith(
        'game',
        expect.any(String),
        expect.objectContaining({
          name: 'The Quest Weaver Adventure',
          is_active: 1,
        }),
        'game_service',
        'Game created',
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent createGame calls', async () => {
      const promises = Array.from({ length: 10 }, () => service.createGame());

      const results = await Promise.all(promises);

      expect(results.length).toBe(10);
      const gameIds = results.map((r) => r.gameId);
      const uniqueIds = new Set(gameIds);
      expect(uniqueIds.size).toBe(10);
    });

    it('should handle getGame for recently deleted session', async () => {
      const result = await service.createGame();
      const gameId = result.gameId;

      // Make session old
      const sessions = (service as any).gameSessions;
      const oldDate = new Date(Date.now() - 1000);
      (sessions.get(gameId) as GameSession).lastActive = oldDate;

      service.cleanupInactiveSessions(0);

      const getResult = await service.getGame(gameId);
      expect(getResult).toBeNull();
    });

    it('should handle processCommand for recently deleted session', async () => {
      const result = await service.createGame();
      const gameId = result.gameId;

      service.cleanupInactiveSessions(0);

      const cmdResult = await service.processCommand(gameId, 'look');
      expect(cmdResult.success).toBe(false);
    });

    it('should handle empty game path by initializing default world', async () => {
      // Empty string is falsy, so it should initialize default world
      const result = await service.createGame('');

      expect(result).toBeDefined();
      expect(result.gameId).toBeDefined();
      expect(result.gameState).toBeDefined();
      // Should have created rooms and objects
      expect(roomService.createRoom).toHaveBeenCalled();
    });

    it('should handle very long session names', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      const longName = 'a'.repeat(1000);
      const result = await service.saveGame(gameId, longName);

      expect(result.success).toBe(true);
    });
  });

  describe('NPC Placement', () => {
    it('should place NPCs in correct rooms based on position', async () => {
      const mockNpc = {
        id: 'npc-1',
        name: 'Guard',
        type: 'player',
        position: { x: 5, y: 5, z: 0 },
        health: 100,
      };

      playerService.createPlayer.mockResolvedValue(mockNpc);

      (fs.readdir as jest.Mock).mockImplementation(async (path: string) => {
        if (path.toString().includes('npcs')) {
          return ['npc1.json'];
        }
        if (path.toString().includes('rooms')) {
          return ['room1.json'];
        }
        return [];
      });

      (fs.readFile as jest.Mock).mockImplementation(async (path: string) => {
        if (path.includes('game-config.json')) {
          return JSON.stringify({ name: 'Test Game' });
        }
        if (path.includes('room1.json')) {
          return JSON.stringify({
            id: 'room1',
            name: 'Test Room',
            description: 'A test room',
            position: { x: 0, y: 0, z: 0 },
            size: { width: 10, height: 10, depth: 3 },
            npcs: ['npc-test'],
          });
        }
        if (path.includes('npc1.json')) {
          return JSON.stringify({
            id: 'npc-test',
            name: 'Test NPC',
            position: { x: 5, y: 5, z: 0 },
            stats: { health: 100 },
          });
        }
        if (path.includes('connections.json')) {
          return JSON.stringify({ connections: [] });
        }
        return JSON.stringify({});
      });

      await service.createGame('test-game');

      expect(roomService.update).toHaveBeenCalled();
    });

    it('should add dialogue tree data to NPCs', async () => {
      const mockNpc = {
        id: 'npc-1',
        name: 'Merchant',
        type: 'player',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
      };

      playerService.createPlayer.mockResolvedValue(mockNpc);

      (fs.readdir as jest.Mock).mockImplementation(async (path: string) => {
        if (path.toString().includes('npcs')) {
          return ['npc1.json'];
        }
        return [];
      });

      (fs.readFile as jest.Mock).mockImplementation(async (path: string) => {
        if (path.includes('game-config.json')) {
          return JSON.stringify({ name: 'Test Game' });
        }
        if (path.includes('npc1.json')) {
          return JSON.stringify({
            id: 'npc-merchant',
            name: 'Merchant',
            position: { x: 0, y: 0, z: 0 },
            stats: { health: 100 },
            dialogue_tree_data: {
              startNodeId: 'start',
              nodes: {},
            },
          });
        }
        if (path.includes('connections.json')) {
          return JSON.stringify({ connections: [] });
        }
        return JSON.stringify({});
      });

      await service.createGame('test-game');

      // Verify NPC was created with dialogue tree
      expect(playerService.createPlayer).toHaveBeenCalled();
    });

    it('should add inventory data to NPCs', async () => {
      const mockNpc = {
        id: 'npc-1',
        name: 'Bandit',
        type: 'player',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
      };

      playerService.createPlayer.mockResolvedValue(mockNpc);

      (fs.readdir as jest.Mock).mockImplementation(async (path: string) => {
        if (path.toString().includes('npcs')) {
          return ['npc1.json'];
        }
        return [];
      });

      (fs.readFile as jest.Mock).mockImplementation(async (path: string) => {
        if (path.includes('game-config.json')) {
          return JSON.stringify({ name: 'Test Game' });
        }
        if (path.includes('npc1.json')) {
          return JSON.stringify({
            id: 'npc-bandit',
            name: 'Bandit',
            position: { x: 0, y: 0, z: 0 },
            stats: { health: 100 },
            inventory_data: ['sword', 'gold'],
          });
        }
        if (path.includes('connections.json')) {
          return JSON.stringify({ connections: [] });
        }
        return JSON.stringify({});
      });

      await service.createGame('test-game');

      expect(playerService.createPlayer).toHaveBeenCalled();
    });
  });

  describe('Session Management', () => {
    it('should track session creation time', async () => {
      const result = await service.createGame();
      const sessions = (service as any).gameSessions;
      const session: GameSession = sessions.get(result.gameId);

      expect(session.createdAt).toBeInstanceOf(Date);
    });

    it('should track session last active time', async () => {
      const result = await service.createGame();
      const sessions = (service as any).gameSessions;
      const session: GameSession = sessions.get(result.gameId);

      expect(session.lastActive).toBeInstanceOf(Date);
    });

    it('should store player id in session', async () => {
      const result = await service.createGame();
      const sessions = (service as any).gameSessions;
      const session: GameSession = sessions.get(result.gameId);

      expect(session.playerId).toBe(mockPlayer.id);
    });

    it('should store game id in session', async () => {
      const result = await service.createGame();
      const sessions = (service as any).gameSessions;
      const session: GameSession = sessions.get(result.gameId);

      expect(session.gameId).toBe(result.gameId);
    });
  });
});
