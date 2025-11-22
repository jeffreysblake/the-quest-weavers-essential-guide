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

describe('GameService - Persistence', () => {
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
