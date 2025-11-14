import { Test, TestingModule } from '@nestjs/testing';
import { GameFileService } from './game-file.service';
import { FileScannerService } from './file-scanner.service';
import { DatabaseService } from '../database/database.service';
import { ValidationService } from '../validation/validation.service';
import { GameLogicValidatorService } from '../validation/game-logic-validator.service';
import * as fs from 'fs';
import * as path from 'path';

describe('GameFileService - Export Functionality', () => {
  let service: GameFileService;
  let fileScannerService: FileScannerService;
  let databaseService: DatabaseService;
  let testDbPath: string;

  beforeEach(async () => {
    // Create test database
    testDbPath = path.join(__dirname, '../../test-export.db');

    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    databaseService = new DatabaseService();
    databaseService.setDatabasePath(testDbPath);
    await databaseService.onModuleInit();

    const mockValidationService = {
      validateData: jest.fn(),
    };

    const mockGameLogicValidatorService = {
      validateGameLogic: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameFileService,
        FileScannerService,
        {
          provide: DatabaseService,
          useValue: databaseService,
        },
        {
          provide: ValidationService,
          useValue: mockValidationService,
        },
        {
          provide: GameLogicValidatorService,
          useValue: mockGameLogicValidatorService,
        },
      ],
    }).compile();

    service = module.get<GameFileService>(GameFileService);
    fileScannerService = module.get<FileScannerService>(FileScannerService);
  });

  afterEach(async () => {
    await databaseService.disconnect();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('exportGameToFiles', () => {
    it('should export game data from database to files', async () => {
      // 1. Setup: Create test game data in database
      const testGameId = 'test-export-game';

      databaseService.transaction((db) => {
        // Insert game
        db.prepare(
          `INSERT INTO games (id, name, description, version, created_at, updated_at, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          testGameId,
          'Test Export Game',
          'A game for testing export',
          1,
          new Date().toISOString(),
          new Date().toISOString(),
          1,
        );

        // Insert test rooms
        db.prepare(
          `INSERT INTO rooms (id, game_id, name, description, long_description, position_x, position_y, position_z, width, height, depth, version, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          'test-room-1',
          testGameId,
          'Test Room 1',
          'A test room',
          'This is a longer description',
          0,
          0,
          0,
          10,
          10,
          3,
          1,
          new Date().toISOString(),
        );

        db.prepare(
          `INSERT INTO rooms (id, game_id, name, description, long_description, position_x, position_y, position_z, width, height, depth, version, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          'test-room-2',
          testGameId,
          'Test Room 2',
          'Another test room',
          'This is the second room',
          10,
          0,
          0,
          10,
          10,
          3,
          1,
          new Date().toISOString(),
        );

        // Insert a test object
        db.prepare(
          `INSERT INTO objects (id, game_id, name, description, object_type, position_x, position_y, position_z, material, weight, is_portable, is_container, can_contain, container_capacity, version, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          'test-object-1',
          testGameId,
          'Test Sword',
          'A test sword',
          'weapon',
          1,
          1,
          0,
          'iron',
          5,
          1,
          0,
          0,
          0,
          1,
          new Date().toISOString(),
        );

        // Insert a test NPC
        db.prepare(
          `INSERT INTO npcs (id, game_id, name, description, npc_type, position_x, position_y, position_z, health, max_health, level, experience, version, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          'test-npc-1',
          testGameId,
          'Test Guard',
          'A test guard',
          'npc',
          2,
          2,
          0,
          100,
          100,
          5,
          0,
          1,
          new Date().toISOString(),
        );

        // Insert connection
        db.prepare(
          `INSERT INTO room_connections (room_id, connected_room_id, direction, description, is_locked, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(
          'test-room-1',
          'test-room-2',
          'north',
          'A path to the north',
          0,
          new Date().toISOString(),
        );
      });

      // 2. Action: Export the game
      const exportDir = path.join(
        __dirname,
        '../../games-test-export',
        testGameId,
      );

      // Clean up export directory if it exists
      if (fs.existsSync(exportDir)) {
        fs.rmSync(exportDir, { recursive: true, force: true });
      }

      const result = await service.exportGameToFiles(testGameId, exportDir);

      // 3. Assertions
      expect(result.success).toBe(true);
      expect(result.exportPath).toBe(exportDir);

      // Check directory structure
      expect(fs.existsSync(exportDir)).toBe(true);
      expect(fs.existsSync(path.join(exportDir, 'game-config.json'))).toBe(
        true,
      );
      expect(fs.existsSync(path.join(exportDir, 'connections.json'))).toBe(
        true,
      );
      expect(fs.existsSync(path.join(exportDir, 'rooms'))).toBe(true);
      expect(fs.existsSync(path.join(exportDir, 'objects'))).toBe(true);
      expect(fs.existsSync(path.join(exportDir, 'npcs'))).toBe(true);

      // Check game config content
      const gameConfig = JSON.parse(
        fs.readFileSync(path.join(exportDir, 'game-config.json'), 'utf-8'),
      );
      expect(gameConfig.id).toBe(testGameId);
      expect(gameConfig.name).toBe('Test Export Game');

      // Check rooms were exported
      const roomFiles = fs
        .readdirSync(path.join(exportDir, 'rooms'))
        .filter((f) => f.endsWith('.json'));
      expect(roomFiles.length).toBe(2);

      const room1 = JSON.parse(
        fs.readFileSync(path.join(exportDir, 'rooms', roomFiles[0]), 'utf-8'),
      );
      expect(room1.id).toBeDefined();
      expect(room1.name).toBeDefined();
      expect(room1.position).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) }));
      expect(room1.size).toEqual(expect.objectContaining({ width: expect.any(Number), height: expect.any(Number), depth: expect.any(Number) }));

      // Check object was exported
      const objectFiles = fs
        .readdirSync(path.join(exportDir, 'objects'))
        .filter((f) => f.endsWith('.json'));
      expect(objectFiles.length).toBe(1);

      const object = JSON.parse(
        fs.readFileSync(
          path.join(exportDir, 'objects', objectFiles[0]),
          'utf-8',
        ),
      );
      expect(object.id).toBe('test-object-1');
      expect(object.name).toBe('Test Sword');
      expect(object.object_type).toBe('weapon');

      // Check NPC was exported
      const npcFiles = fs
        .readdirSync(path.join(exportDir, 'npcs'))
        .filter((f) => f.endsWith('.json'));
      expect(npcFiles.length).toBe(1);

      const npc = JSON.parse(
        fs.readFileSync(path.join(exportDir, 'npcs', npcFiles[0]), 'utf-8'),
      );
      expect(npc.id).toBe('test-npc-1');
      expect(npc.name).toBe('Test Guard');
      expect(npc.npc_type).toBe('npc');

      // Check connections were exported
      const connections = JSON.parse(
        fs.readFileSync(path.join(exportDir, 'connections.json'), 'utf-8'),
      );
      expect(connections.connections).toHaveLength(1);
      expect(connections.connections[0].from_room).toBe('test-room-1');
      expect(connections.connections[0].direction).toBe('north');

      // Cleanup
      fs.rmSync(exportDir, { recursive: true, force: true });
    });

    it('should handle missing game gracefully', async () => {
      const result = await service.exportGameToFiles('non-existent-game');

      // Should still succeed but with no game config
      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully exported');
    });
  });
});
