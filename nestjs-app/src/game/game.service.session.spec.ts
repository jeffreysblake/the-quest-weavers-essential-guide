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

describe('GameService - Session Management', () => {
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
});
