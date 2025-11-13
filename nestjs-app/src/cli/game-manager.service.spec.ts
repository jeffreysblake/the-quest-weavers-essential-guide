import { Test, TestingModule } from '@nestjs/testing';
import { GameManagerService } from './game-manager.service';
import { DatabaseService } from '../database/database.service';
import { EntityService } from '../entity/entity.service';
import { RoomService } from '../entity/room.service';
import { ObjectService } from '../entity/object.service';
import { PlayerService } from '../entity/player.service';
import { GameFileService } from '../file-system/game-file.service';
import { FileScannerService } from '../file-system/file-scanner.service';
import { GameData } from '../database/database.interfaces';

describe('GameManagerService', () => {
  let service: GameManagerService;
  let databaseService: DatabaseService;
  let entityService: EntityService;
  let roomService: RoomService;
  let objectService: ObjectService;
  let playerService: PlayerService;
  let gameFileService: GameFileService;

  // Mock implementations
  const mockDatabaseService = {
    transaction: jest.fn().mockResolvedValue(undefined),
    prepare: jest.fn(),
    saveVersion: jest.fn(),
    getVersion: jest.fn(),
    listVersions: jest.fn(),
    rollbackToVersion: jest.fn(),
  };

  const mockEntityService = {
    createEntity: jest.fn(),
    clearCache: jest.fn(),
    getCacheStats: jest.fn().mockReturnValue({ size: 10, entities: [] }),
  };

  const mockRoomService = {
    createRoom: jest.fn(),
    getAllRoomsForGame: jest.fn(),
    persistRooms: jest.fn(),
    loadRooms: jest.fn(),
    clearCache: jest.fn(),
    getCacheStats: jest.fn().mockReturnValue({ size: 5, rooms: [] }),
    saveRoomVersion: jest.fn(),
    rollbackRoom: jest.fn(),
  };

  const mockObjectService = {
    createObject: jest.fn(),
    getAllObjectsForGame: jest.fn(),
    persistObjects: jest.fn(),
    loadObjects: jest.fn(),
    clearCache: jest.fn(),
    getCacheStats: jest.fn().mockReturnValue({ size: 15, objects: [] }),
    saveObjectVersion: jest.fn(),
    rollbackObject: jest.fn(),
  };

  const mockPlayerService = {
    createPlayer: jest.fn(),
    getAllPlayersForGame: jest.fn(),
    persistPlayers: jest.fn(),
    loadPlayers: jest.fn(),
    clearCache: jest.fn(),
    getCacheStats: jest.fn().mockReturnValue({ size: 3, players: [] }),
    savePlayerVersion: jest.fn(),
    rollbackPlayer: jest.fn(),
  };

  const mockGameFileService = {
    loadGameFromFiles: jest.fn(),
  };

  const mockFileScannerService = {
    scanGameDirectory: jest.fn(),
    detectChanges: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameManagerService,
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: EntityService, useValue: mockEntityService },
        { provide: RoomService, useValue: mockRoomService },
        { provide: ObjectService, useValue: mockObjectService },
        { provide: PlayerService, useValue: mockPlayerService },
        { provide: GameFileService, useValue: mockGameFileService },
        { provide: FileScannerService, useValue: mockFileScannerService },
      ],
    }).compile();

    service = module.get<GameManagerService>(GameManagerService);
    databaseService = module.get<DatabaseService>(DatabaseService);
    entityService = module.get<EntityService>(EntityService);
    roomService = module.get<RoomService>(RoomService);
    objectService = module.get<ObjectService>(ObjectService);
    playerService = module.get<PlayerService>(PlayerService);
    gameFileService = module.get<GameFileService>(GameFileService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Creation', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('Game Management', () => {
    it('should create a new game', async () => {
      const gameData = {
        name: 'Test Game',
        description: 'A test game',
        gameId: 'test-game',
      };

      const mockRun = jest.fn();
      const mockPrepare = jest.fn().mockReturnValue({ run: mockRun });
      mockDatabaseService.prepare.mockImplementation(mockPrepare);
      mockDatabaseService.transaction.mockImplementation(async (callback) => {
        await callback({ prepare: mockPrepare });
      });

      const result = await service.createGame(gameData);

      expect(result).toEqual({
        id: 'test-game',
        name: 'Test Game',
        description: 'A test game',
        version: 1,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        isActive: true,
      });

      expect(mockDatabaseService.transaction).toHaveBeenCalled();
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO games'),
      );
    });

    it('should list games from database', async () => {
      const mockGames = [
        {
          id: 'game1',
          name: 'Game 1',
          description: 'First game',
          version: 1,
          created_at: '2023-01-01',
        },
        {
          id: 'game2',
          name: 'Game 2',
          description: 'Second game',
          version: 1,
          created_at: '2023-01-02',
        },
      ];

      const mockAll = jest.fn().mockReturnValue(mockGames);
      const mockPrepare = jest.fn().mockReturnValue({ all: mockAll });
      mockDatabaseService.prepare.mockImplementation(mockPrepare);

      const result = await service.listGames();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'game1',
        name: 'Game 1',
        description: 'First game',
        version: 1,
        createdAt: '2023-01-01',
        updatedAt: '2023-01-01',
        isActive: true,
      });

      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM games'),
      );
    });
  });

  describe('Entity Management', () => {
    it('should create a room entity', async () => {
      const mockRoom = {
        id: 'room-1',
        name: 'Test Room',
        type: 'room',
        position: { x: 0, y: 0, z: 0 },
      };

      mockRoomService.createRoom.mockReturnValue(mockRoom);

      const result = await service.createEntity('test-game', 'room', {
        name: 'Test Room',
        description: 'A test room',
      });

      expect(result).toEqual(mockRoom);
      expect(mockRoomService.createRoom).toHaveBeenCalledWith({
        name: 'Test Room',
        description: 'A test room',
        position: { x: 0, y: 0, z: 0 },
        gameId: 'test-game',
        width: 10,
        height: 10,
        size: { width: 10, height: 10, depth: 3 },
        objects: [],
        players: [],
      });
    });

    it('should create an object entity', async () => {
      const mockObject = {
        id: 'obj-1',
        name: 'Test Object',
        type: 'object',
        position: { x: 0, y: 0, z: 0 },
      };

      mockObjectService.createObject.mockReturnValue(mockObject);

      const result = await service.createEntity('test-game', 'object', {
        name: 'Test Object',
        description: 'A test object',
      });

      expect(result).toEqual(mockObject);
      expect(mockObjectService.createObject).toHaveBeenCalled();
    });

    it('should create a player entity', async () => {
      const mockPlayer = {
        id: 'player-1',
        name: 'Test Player',
        type: 'player',
        position: { x: 0, y: 0, z: 0 },
      };

      mockPlayerService.createPlayer.mockReturnValue(mockPlayer);

      const result = await service.createEntity('test-game', 'player', {
        name: 'Test Player',
        description: 'A test player',
      });

      expect(result).toEqual(mockPlayer);
      expect(mockPlayerService.createPlayer).toHaveBeenCalledWith({
        name: 'Test Player',
        description: 'A test player',
        position: { x: 0, y: 0, z: 0 },
        gameId: 'test-game',
        health: 100,
        level: 1,
        experience: 0,
        inventory: [],
      });
    });

    it('should throw error for unknown entity type', async () => {
      await expect(
        service.createEntity('test-game', 'unknown', { name: 'Test' }),
      ).rejects.toThrow('Unknown entity type: unknown');
    });

    it('should list entities for a game', async () => {
      const mockRooms = [{ id: 'room1', name: 'Room 1', type: 'room' }];
      const mockObjects = [{ id: 'obj1', name: 'Object 1', type: 'object' }];
      const mockPlayers = [{ id: 'player1', name: 'Player 1', type: 'player' }];

      mockRoomService.getAllRoomsForGame.mockResolvedValue(mockRooms);
      mockObjectService.getAllObjectsForGame.mockResolvedValue(mockObjects);
      mockPlayerService.getAllPlayersForGame.mockResolvedValue(mockPlayers);

      const result = await service.listEntities('test-game');

      expect(result).toHaveLength(3);
      expect(result).toContainEqual(mockRooms[0]);
      expect(result).toContainEqual(mockObjects[0]);
      expect(result).toContainEqual(mockPlayers[0]);
    });

    it('should filter entities by type', async () => {
      const mockRooms = [{ id: 'room1', name: 'Room 1', type: 'room' }];

      mockRoomService.getAllRoomsForGame.mockResolvedValue(mockRooms);

      const result = await service.listEntities('test-game', 'room');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockRooms[0]);
      expect(mockObjectService.getAllObjectsForGame).not.toHaveBeenCalled();
      expect(mockPlayerService.getAllPlayersForGame).not.toHaveBeenCalled();
    });
  });

  describe('Persistence Operations', () => {
    it('should persist game data', async () => {
      mockRoomService.persistRooms.mockResolvedValue(undefined);
      mockObjectService.persistObjects.mockResolvedValue(undefined);
      mockPlayerService.persistPlayers.mockResolvedValue(undefined);

      await service.persistGame('test-game');

      expect(mockRoomService.persistRooms).toHaveBeenCalled();
      expect(mockObjectService.persistObjects).toHaveBeenCalled();
      expect(mockPlayerService.persistPlayers).toHaveBeenCalled();
    });

    it('should load game data', async () => {
      mockRoomService.loadRooms.mockResolvedValue(undefined);
      mockObjectService.loadObjects.mockResolvedValue(undefined);
      mockPlayerService.loadPlayers.mockResolvedValue(undefined);

      await service.loadGame('test-game');

      expect(mockRoomService.loadRooms).toHaveBeenCalledWith('test-game');
      expect(mockObjectService.loadObjects).toHaveBeenCalledWith('test-game');
      expect(mockPlayerService.loadPlayers).toHaveBeenCalledWith('test-game');
    });

    it('should sync game with files', async () => {
      const mockResult = {
        success: true,
        message: 'Success',
        loaded: { rooms: [], objects: [], npcs: [], connections: [] },
      };

      mockGameFileService.loadGameFromFiles.mockResolvedValue(mockResult);
      mockRoomService.persistRooms.mockResolvedValue(undefined);
      mockObjectService.persistObjects.mockResolvedValue(undefined);
      mockPlayerService.persistPlayers.mockResolvedValue(undefined);

      await service.syncGameWithFiles('test-game');

      expect(mockGameFileService.loadGameFromFiles).toHaveBeenCalledWith(
        'test-game',
      );
      expect(mockRoomService.persistRooms).toHaveBeenCalled();
    });

    it('should handle sync failure', async () => {
      const mockResult = {
        success: false,
        message: 'File not found',
        loaded: { rooms: [], objects: [], npcs: [], connections: [] },
      };

      mockGameFileService.loadGameFromFiles.mockResolvedValue(mockResult);

      await expect(service.syncGameWithFiles('test-game')).rejects.toThrow(
        'File not found',
      );
    });
  });

  describe('Cache Management', () => {
    it('should clear all caches', async () => {
      await service.clearAllCaches();

      expect(mockEntityService.clearCache).toHaveBeenCalled();
      expect(mockRoomService.clearCache).toHaveBeenCalled();
      expect(mockObjectService.clearCache).toHaveBeenCalled();
      expect(mockPlayerService.clearCache).toHaveBeenCalled();
    });

    it('should get cache statistics', async () => {
      const stats = await service.getCacheStats();

      expect(stats).toEqual({
        entities: 10,
        rooms: 5,
        objects: 15,
        players: 3,
      });

      expect(mockEntityService.getCacheStats).toHaveBeenCalled();
      expect(mockRoomService.getCacheStats).toHaveBeenCalled();
      expect(mockObjectService.getCacheStats).toHaveBeenCalled();
      expect(mockPlayerService.getCacheStats).toHaveBeenCalled();
    });
  });

  describe('Backup and Restore', () => {
    it('should create game backup', async () => {
      const mockEntities = [
        { id: 'room1', name: 'Room 1', type: 'room' },
        { id: 'obj1', name: 'Object 1', type: 'object' },
        { id: 'player1', name: 'Player 1', type: 'player' },
      ];

      mockRoomService.getAllRoomsForGame.mockResolvedValue([mockEntities[0]]);
      mockObjectService.getAllObjectsForGame.mockResolvedValue([
        mockEntities[1],
      ]);
      mockPlayerService.getAllPlayersForGame.mockResolvedValue([
        mockEntities[2],
      ]);

      mockRoomService.saveRoomVersion.mockResolvedValue(1);
      mockObjectService.saveObjectVersion.mockResolvedValue(1);
      mockPlayerService.savePlayerVersion.mockResolvedValue(1);

      const timestamp = await service.backupGame('test-game');

      expect(timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
      expect(mockRoomService.saveRoomVersion).toHaveBeenCalled();
      expect(mockObjectService.saveObjectVersion).toHaveBeenCalled();
      expect(mockPlayerService.savePlayerVersion).toHaveBeenCalled();
    });

    it('should restore game from backup', async () => {
      const mockEntities = [
        { id: 'room1', name: 'Room 1', type: 'room' },
        { id: 'obj1', name: 'Object 1', type: 'object' },
      ];

      const mockVersions = [
        {
          version: 1,
          reason: 'Full game backup - 2023-01-01T10-00-00',
          createdAt: '2023-01-01',
        },
      ];

      mockRoomService.getAllRoomsForGame.mockResolvedValue([mockEntities[0]]);
      mockObjectService.getAllObjectsForGame.mockResolvedValue([
        mockEntities[1],
      ]);
      mockPlayerService.getAllPlayersForGame.mockResolvedValue([]);

      mockDatabaseService.listVersions.mockResolvedValue(mockVersions);
      mockRoomService.rollbackRoom.mockResolvedValue(true);
      mockObjectService.rollbackObject.mockResolvedValue(true);

      await service.restoreGame('test-game', '2023-01-01T10-00-00');

      expect(mockDatabaseService.listVersions).toHaveBeenCalledTimes(2);
      expect(mockRoomService.rollbackRoom).toHaveBeenCalledWith('room1', 1);
      expect(mockObjectService.rollbackObject).toHaveBeenCalledWith('obj1', 1);
    });
  });

  describe('File Operations', () => {
    it('should create game file structure', async () => {
      // Mock fs operations would go here if we were testing actual file creation
      // For now, we'll just verify the method doesn't throw
      await expect(service.createGameFiles('test-game')).resolves.not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors in game creation', async () => {
      mockDatabaseService.transaction.mockImplementationOnce(() => {
        throw new Error('Database error');
      });

      await expect(
        service.createGame({
          name: 'Test Game',
          gameId: 'test-game',
        }),
      ).rejects.toThrow('Database error');
    });

    it('should handle service errors in entity listing', async () => {
      mockRoomService.getAllRoomsForGame.mockImplementationOnce(async () => {
        throw new Error('Service error');
      });

      await expect(service.listEntities('test-game')).rejects.toThrow(
        'Service error',
      );
    });
  });
});
