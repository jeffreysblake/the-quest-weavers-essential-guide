import { Test, TestingModule } from '@nestjs/testing';
import { CLIService } from './cli.service';
import { GameManagerService } from './game-manager.service';
import { DatabaseService } from '../database/database.service';
import { FileScannerService } from '../file-system/file-scanner.service';
import { GameFileService } from '../file-system/game-file.service';

describe('CLIService', () => {
  let service: CLIService;
  let gameManagerService: GameManagerService;
  let databaseService: DatabaseService;
  let fileScannerService: FileScannerService;
  let gameFileService: GameFileService;

  // Mock implementations
  const mockGameManagerService = {
    listGames: jest.fn(),
    createGame: jest.fn(),
    createGameFiles: jest.fn(),
    createEntity: jest.fn(),
    listEntities: jest.fn(),
    persistGame: jest.fn(),
    clearAllCaches: jest.fn(),
    getCacheStats: jest.fn(),
  };

  const mockDatabaseService = {
    prepare: jest.fn(),
    transaction: jest.fn(),
    saveVersion: jest.fn(),
    getVersion: jest.fn(),
    listVersions: jest.fn(),
    rollbackToVersion: jest.fn(),
  };

  const mockFileScannerService = {
    scanGameDirectory: jest.fn(),
    detectChanges: jest.fn(),
  };

  const mockGameFileService = {
    loadGameFromFiles: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CLIService,
        { provide: GameManagerService, useValue: mockGameManagerService },
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: FileScannerService, useValue: mockFileScannerService },
        { provide: GameFileService, useValue: mockGameFileService },
      ],
    }).compile();

    service = module.get<CLIService>(CLIService);
    gameManagerService = module.get<GameManagerService>(GameManagerService);
    databaseService = module.get<DatabaseService>(DatabaseService);
    fileScannerService = module.get<FileScannerService>(FileScannerService);
    gameFileService = module.get<GameFileService>(GameFileService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Creation', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have commander program configured', () => {
      expect(service['program']).toBeDefined();
      expect(service['program'].name()).toBe('quest-weaver');
    });
  });

  describe('Game Management Commands', () => {
    it('should list games from database', async () => {
      const mockGames = [
        { id: 'game1', name: 'Test Game 1', createdAt: '2023-01-01' },
        { id: 'game2', name: 'Test Game 2', createdAt: '2023-01-02' },
      ];

      mockGameManagerService.listGames.mockResolvedValue(mockGames);

      // Capture console output
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service['listGames']();

      expect(mockGameManagerService.listGames).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('📂 Available Games:');
      expect(consoleSpy).toHaveBeenCalledWith('💾 From Database:');

      consoleSpy.mockRestore();
    });

    it('should handle game loading', async () => {
      const mockResult = {
        success: true,
        message: 'Success',
        loaded: {
          rooms: [{ id: 'room1' }, { id: 'room2' }],
          objects: [{ id: 'obj1' }],
          npcs: [{ id: 'npc1' }],
          connections: [],
        },
      };

      mockGameFileService.loadGameFromFiles.mockResolvedValue(mockResult);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service['loadGame']('test-game');

      expect(mockGameFileService.loadGameFromFiles).toHaveBeenCalledWith(
        'test-game',
      );
      expect(consoleSpy).toHaveBeenCalledWith('✅ Game loaded successfully!');
      expect(consoleSpy).toHaveBeenCalledWith('   Rooms: 2');
      expect(consoleSpy).toHaveBeenCalledWith('   Objects: 1');
      expect(consoleSpy).toHaveBeenCalledWith('   NPCs: 1');

      consoleSpy.mockRestore();
    });

    it('should handle failed game loading', async () => {
      const mockResult = {
        success: false,
        message: 'Game not found',
        loaded: { rooms: [], objects: [], npcs: [], connections: [] },
      };

      mockGameFileService.loadGameFromFiles.mockResolvedValue(mockResult);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await service['loadGame']('nonexistent-game');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ Failed to load game:',
        'Game not found',
      );

      consoleErrorSpy.mockRestore();
    });

    it('should sync game successfully', async () => {
      const mockResult = {
        success: true,
        message: 'Success',
        loaded: { rooms: [], objects: [], npcs: [], connections: [] },
      };

      mockGameFileService.loadGameFromFiles.mockResolvedValue(mockResult);
      mockGameManagerService.persistGame.mockResolvedValue(undefined);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service['syncGame']('test-game');

      expect(mockGameFileService.loadGameFromFiles).toHaveBeenCalledWith(
        'test-game',
      );
      expect(mockGameManagerService.persistGame).toHaveBeenCalledWith(
        'test-game',
      );
      expect(consoleSpy).toHaveBeenCalledWith('✅ Game synced successfully!');

      consoleSpy.mockRestore();
    });
  });

  describe('Database Management Commands', () => {
    it('should show database status', async () => {
      const mockQuery = jest.fn();
      mockQuery
        .mockReturnValueOnce({ get: () => ({ count: 5 }) }) // games
        .mockReturnValueOnce({ get: () => ({ count: 10 }) }) // rooms
        .mockReturnValueOnce({ get: () => ({ count: 15 }) }) // objects
        .mockReturnValueOnce({ get: () => ({ count: 3 }) }) // npcs
        .mockReturnValueOnce({ get: () => ({ count: 20 }) }); // version_history

      mockDatabaseService.prepare.mockImplementation(() => ({
        get: mockQuery,
      }));

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service['showDatabaseStatus']();

      expect(consoleSpy).toHaveBeenCalledWith('💾 Database Status:');
      expect(mockDatabaseService.prepare).toHaveBeenCalledTimes(5);

      consoleSpy.mockRestore();
    });

    it('should handle database initialization', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service['initDatabase']();

      expect(consoleSpy).toHaveBeenCalledWith('🔧 Initializing database...');
      expect(consoleSpy).toHaveBeenCalledWith(
        '✅ Database initialized successfully!',
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Entity Management Commands', () => {
    it('should list entities for a game', async () => {
      const mockEntities = [
        {
          id: 'room1',
          name: 'Test Room',
          type: 'room',
          description: 'A test room',
        },
        {
          id: 'obj1',
          name: 'Test Object',
          type: 'object',
          description: 'A test object',
        },
        {
          id: 'player1',
          name: 'Test Player',
          type: 'player',
          description: 'A test player',
        },
      ];

      mockGameManagerService.listEntities.mockResolvedValue(mockEntities);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service['listEntities']('test-game');

      expect(mockGameManagerService.listEntities).toHaveBeenCalledWith(
        'test-game',
        undefined,
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        '📋 Entities for game: test-game',
      );

      consoleSpy.mockRestore();
    });

    it('should filter entities by type', async () => {
      const mockRooms = [
        {
          id: 'room1',
          name: 'Test Room',
          type: 'room',
          description: 'A test room',
        },
      ];

      mockGameManagerService.listEntities.mockResolvedValue(mockRooms);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service['listEntities']('test-game', 'room');

      expect(mockGameManagerService.listEntities).toHaveBeenCalledWith(
        'test-game',
        'room',
      );
      expect(consoleSpy).toHaveBeenCalledWith('   Filtered by type: room');

      consoleSpy.mockRestore();
    });

    it('should handle empty entity list', async () => {
      mockGameManagerService.listEntities.mockResolvedValue([]);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service['listEntities']('test-game');

      expect(consoleSpy).toHaveBeenCalledWith('   No entities found.');

      consoleSpy.mockRestore();
    });
  });

  describe('Version Management Commands', () => {
    it('should list versions for an entity', async () => {
      const mockVersions = [
        {
          version: 2,
          createdAt: '2023-01-02',
          createdBy: 'user',
          reason: 'Updated entity',
        },
        {
          version: 1,
          createdAt: '2023-01-01',
          createdBy: 'user',
          reason: 'Created entity',
        },
      ];

      mockDatabaseService.listVersions.mockResolvedValue(mockVersions);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service['listVersions']('room', 'room-1');

      expect(mockDatabaseService.listVersions).toHaveBeenCalledWith(
        'room',
        'room-1',
      );
      expect(consoleSpy).toHaveBeenCalledWith('📚 Versions for room: room-1');

      consoleSpy.mockRestore();
    });

    it('should handle successful rollback', async () => {
      mockDatabaseService.rollbackToVersion.mockResolvedValue(true);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service['rollbackVersion']('room', 'room-1', 1);

      expect(mockDatabaseService.rollbackToVersion).toHaveBeenCalledWith(
        'room',
        'room-1',
        1,
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        '✅ Rollback completed successfully!',
      );

      consoleSpy.mockRestore();
    });

    it('should handle failed rollback', async () => {
      mockDatabaseService.rollbackToVersion.mockResolvedValue(false);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service['rollbackVersion']('room', 'room-1', 1);

      expect(consoleSpy).toHaveBeenCalledWith('❌ Rollback failed.');

      consoleSpy.mockRestore();
    });
  });

  describe('Cache Management Commands', () => {
    it('should clear all caches', async () => {
      mockGameManagerService.clearAllCaches.mockResolvedValue(undefined);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service['clearCaches']();

      expect(mockGameManagerService.clearAllCaches).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        '✅ All caches cleared successfully!',
      );

      consoleSpy.mockRestore();
    });

    it('should show cache statistics', async () => {
      const mockStats = {
        entities: 10,
        rooms: 5,
        objects: 15,
        players: 3,
      };

      mockGameManagerService.getCacheStats.mockResolvedValue(mockStats);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await service['showCacheStats']();

      expect(mockGameManagerService.getCacheStats).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith('📊 Cache Statistics:');
      expect(consoleSpy).toHaveBeenCalledWith('   Entity cache: 10 items');
      expect(consoleSpy).toHaveBeenCalledWith('   Room cache: 5 items');
      expect(consoleSpy).toHaveBeenCalledWith('   Object cache: 15 items');
      expect(consoleSpy).toHaveBeenCalledWith('   Player cache: 3 items');

      consoleSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      const error = new Error('Service unavailable');
      mockGameManagerService.listGames.mockRejectedValue(error);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await service['listGames']();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ Failed to list games:',
        'Service unavailable',
      );

      consoleErrorSpy.mockRestore();
    });

    it('should handle database errors', async () => {
      const error = new Error('Database connection failed');
      mockDatabaseService.listVersions.mockRejectedValue(error);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await service['listVersions']('room', 'room-1');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ Failed to list versions:',
        'Database connection failed',
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Command Registration', () => {
    it('should register all expected commands', () => {
      const commands = service['program'].commands.map((cmd) => cmd.name());

      const expectedCommands = [
        'game:list',
        'game:create',
        'game:load',
        'game:scan',
        'game:sync',
        'db:init',
        'db:migrate',
        'db:status',
        'entity:create',
        'entity:list',
        'version:list',
        'version:rollback',
        'cache:clear',
        'cache:stats',
      ];

      expectedCommands.forEach((command) => {
        expect(commands).toContain(command);
      });
    });

    it('should have proper command descriptions', () => {
      const gameListCmd = service['program'].commands.find(
        (cmd) => cmd.name() === 'game:list',
      );
      expect(gameListCmd?.description()).toBe('List all available games');

      const dbInitCmd = service['program'].commands.find(
        (cmd) => cmd.name() === 'db:init',
      );
      expect(dbInitCmd?.description()).toBe(
        'Initialize database and run migrations',
      );
    });
  });
});
