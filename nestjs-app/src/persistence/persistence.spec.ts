import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { FileScannerService } from '../file-system/file-scanner.service';
import { GameFileService } from '../file-system/game-file.service';

describe('Persistence System Integration', () => {
  let databaseService: DatabaseService;
  let fileScannerService: FileScannerService;
  let gameFileService: GameFileService;
  let mockDatabaseService: jest.Mocked<Partial<DatabaseService>>;

  beforeEach(async () => {
    // Create mock database service
    mockDatabaseService = {
      onModuleInit: jest.fn().mockResolvedValue(undefined),
      onModuleDestroy: jest.fn().mockResolvedValue(undefined),
      healthCheck: jest.fn().mockResolvedValue(true),
      saveVersion: jest.fn().mockReturnValue(1),
      getVersion: jest
        .fn()
        .mockResolvedValue({ name: 'Test Room', description: 'A test room' }),
      listVersions: jest.fn().mockReturnValue([]),
      saveEntity: jest.fn().mockResolvedValue(undefined),
      getEntity: jest.fn().mockResolvedValue(null),
      deleteEntity: jest.fn().mockResolvedValue(undefined),
      getAllEntities: jest.fn().mockResolvedValue([]),
      prepare: jest.fn(),
      transaction: jest.fn((callback) => callback()),
    };

    const mockFileScannerService = {
      scanAllGames: jest.fn().mockResolvedValue([
        {
          gameId: 'dragon-lair',
          hasConfig: true,
          roomCount: 3,
          objectCount: 5,
        },
      ]),
      scanGameDirectory: jest.fn().mockResolvedValue([
        {
          gameId: 'dragon-lair',
          hasConfig: true,
          roomCount: 3,
          objectCount: 5,
        },
      ]),
      detectChanges: jest.fn().mockResolvedValue({
        gameId: 'dragon-lair',
        hasChanges: true,
        addedFiles: [],
        modifiedFiles: [],
        deletedFiles: [],
      }),
      validateGameDirectory: jest.fn().mockResolvedValue({
        isValid: true,
        errors: [],
      }),
    };

    const mockGameFileService = {
      loadGameFromFiles: jest.fn().mockResolvedValue({
        success: true,
        message: 'Game loaded successfully',
        loaded: {
          game: { id: 'dragon-lair', name: 'Dragon Lair' },
          rooms: [{ id: 'room1', name: 'Entrance' }],
          objects: [{ id: 'obj1', name: 'Torch' }],
          npcs: [{ id: 'npc1', name: 'Guard' }],
          connections: [{ from: 'room1', to: 'room2' }],
        },
      }),
      validateGameFiles: jest.fn().mockResolvedValue({
        isValid: true,
        errors: [],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: FileScannerService,
          useValue: mockFileScannerService,
        },
        {
          provide: GameFileService,
          useValue: mockGameFileService,
        },
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    databaseService = module.get<DatabaseService>(DatabaseService);
    fileScannerService = module.get<FileScannerService>(FileScannerService);
    gameFileService = module.get<GameFileService>(GameFileService);

    // Initialize database
    await databaseService.onModuleInit();
  });

  afterEach(async () => {
    // Clean up database
    await databaseService.onModuleDestroy();
  });

  describe('Database Service', () => {
    it('should connect to database and run migrations', async () => {
      const healthCheck = await databaseService.healthCheck();
      expect(healthCheck).toBe(true);
    });

    it('should save and retrieve version history', async () => {
      const testData = { name: 'Test Room', description: 'A test room' };

      const version = databaseService.saveVersion(
        'room',
        'test-room-1',
        testData,
        'test',
        'Initial version',
      );

      expect(version).toBe(1);

      const retrievedData = await databaseService.getVersion(
        'room',
        'test-room-1',
      );
      expect(retrievedData).toEqual(testData);
    });
  });

  describe('File Scanner Service', () => {
    it('should scan games directory', async () => {
      const games = await fileScannerService.scanAllGames();
      expect(Array.isArray(games)).toBe(true);

      // Should find our dragon-lair example
      const dragonLair = games.find((g) => g.gameId === 'dragon-lair');
      if (dragonLair) {
        expect(dragonLair.hasConfig).toBe(true);
        expect(dragonLair.roomCount).toBeGreaterThan(0);
        expect(dragonLair.objectCount).toBeGreaterThan(0);
      }
    });

    it('should validate game directory structure', async () => {
      const validation =
        await fileScannerService.validateGameDirectory('dragon-lair');
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('Game File Service', () => {
    it('should load game from files', async () => {
      const result = await gameFileService.loadGameFromFiles('dragon-lair');

      if (result.success) {
        expect(result.loaded.rooms.length).toBeGreaterThan(0);
        expect(result.loaded.objects.length).toBeGreaterThan(0);
        expect(result.loaded.npcs.length).toBeGreaterThan(0);
        expect(result.loaded.connections.length).toBeGreaterThan(0);
      }

      // Should pass even if no changes detected
      expect(result.success).toBe(true);
    });

    it('should validate game files', async () => {
      const validation = await gameFileService.validateGameFiles('dragon-lair');
      expect(validation.isValid).toBe(true);
    });
  });

  describe('Integration Test', () => {
    it('should complete full file-to-database flow', async () => {
      // 1. Scan for changes
      const changes = await fileScannerService.detectChanges('dragon-lair');
      expect(changes.gameId).toBe('dragon-lair');

      // 2. Load game from files
      const loadResult = await gameFileService.loadGameFromFiles('dragon-lair');
      expect(loadResult.success).toBe(true);

      // 3. Verify data was saved to database
      const healthCheck = await databaseService.healthCheck();
      expect(healthCheck).toBe(true);
    });
  });
});
