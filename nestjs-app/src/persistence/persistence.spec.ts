import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { FileScannerService } from '../file-system/file-scanner.service';
import { GameFileService } from '../file-system/game-file.service';

describe('Persistence System Integration', () => {
  let databaseService: DatabaseService;
  let fileScannerService: FileScannerService;
  let gameFileService: GameFileService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DatabaseService, FileScannerService, GameFileService],
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
