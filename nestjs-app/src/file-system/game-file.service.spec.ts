import { Test, TestingModule } from '@nestjs/testing';
import { GameFileService } from './game-file.service';
import { FileScannerService } from './file-scanner.service';
import { DatabaseService } from '../database/database.service';
import { EntityService } from '../entity/entity.service';
import { RoomService } from '../entity/room.service';
import { ObjectService } from '../entity/object.service';
import { PlayerService } from '../entity/player.service';
import { ValidationService } from '../validation/validation.service';
import { GameLogicValidatorService } from '../validation/game-logic-validator.service';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('GameFileService', () => {
  let service: GameFileService;
  let databaseService: DatabaseService;
  let entityService: EntityService;
  let roomService: RoomService;
  let objectService: ObjectService;
  let playerService: PlayerService;

  const mockDatabaseService = {
    transaction: jest.fn(),
    prepare: jest.fn(),
    saveVersion: jest.fn(),
  };

  const mockEntityService = {
    createEntity: jest.fn(),
  };

  const mockRoomService = {
    createRoom: jest.fn(),
  };

  const mockObjectService = {
    createObject: jest.fn(),
  };

  const mockPlayerService = {
    createPlayer: jest.fn(),
  };

  const mockFileScannerService = {

  const mockValidationService = {
    validateData: jest.fn(),
  };

  const mockGameLogicValidatorService = {
    validateGameLogic: jest.fn(),
  };
    scanGameDirectory: jest.fn(),

  const mockValidationService = {
    validateData: jest.fn(),
  };

  const mockGameLogicValidatorService = {
    validateGameLogic: jest.fn(),
  };
    detectChanges: jest.fn(),

  const mockValidationService = {
    validateData: jest.fn(),
  };

  const mockGameLogicValidatorService = {
    validateGameLogic: jest.fn(),
  };
    validateGameDirectory: jest.fn(),

  const mockValidationService = {
    validateData: jest.fn(),
  };

  const mockGameLogicValidatorService = {
    validateGameLogic: jest.fn(),
  };
  };

  const mockValidationService = {
    validateData: jest.fn(),
  };

  const mockGameLogicValidatorService = {
    validateGameLogic: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameFileService,
        { provide: FileScannerService, useValue: mockFileScannerService },
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: EntityService, useValue: mockEntityService },
        { provide: RoomService, useValue: mockRoomService },
        { provide: ObjectService, useValue: mockObjectService },
        { provide: PlayerService, useValue: mockPlayerService },
        { provide: ValidationService, useValue: mockValidationService },
        { provide: GameLogicValidatorService, useValue: mockGameLogicValidatorService },
      ],
    }).compile();

    service = module.get<GameFileService>(GameFileService);
    databaseService = module.get<DatabaseService>(DatabaseService);
    entityService = module.get<EntityService>(EntityService);
    roomService = module.get<RoomService>(RoomService);
    objectService = module.get<ObjectService>(ObjectService);
    playerService = module.get<PlayerService>(PlayerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Creation', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('Game File Loading', () => {
    const mockGameDirectory = '/test/games/test-game';
    const mockGameData = {
      id: 'test-game',
      name: 'Test Game',
      description: 'A test game',
      version: 1,
    };

    const mockRoomData = {
      id: 'room-1',
      name: 'Test Room',
      description: 'A test room',
      position: { x: 0, y: 0, z: 0 },
      width: 10,
      height: 10,
      depth: 3,
      objects: [],
      npcs: [],
    };

    const mockObjectData = {
      id: 'obj-1',
      name: 'Test Object',
      description: 'A test object',
      objectType: 'item',
      material: 'wood',
      isPortable: true,
      position: { x: 0, y: 0, z: 0 },
    };

    const mockNPCData = {
      id: 'npc-1',
      name: 'Test NPC',
      description: 'A test NPC',
      npcType: 'npc',
      position: { x: 0, y: 0, z: 0 },
      health: 100,
      level: 1,
    };

    beforeEach(() => {
      // Mock file system structure
      mockFs.existsSync.mockImplementation((filePath: string) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('test-game') && !pathStr.includes('nonexistent')) {
          return true;
        }
        return false;
      });

      mockFs.readdirSync.mockImplementation((dirPath: string) => {
        const pathStr = dirPath.toString();
        if (pathStr.includes('rooms')) {
          return ['room-1.json'] as any;
        } else if (pathStr.includes('objects')) {
          return ['obj-1.json'] as any;
        } else if (pathStr.includes('npcs')) {
          return ['npc-1.json'] as any;
        }
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((filePath: string) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('game.json')) {
          return JSON.stringify(mockGameData);
        } else if (pathStr.includes('room-1.json')) {
          return JSON.stringify(mockRoomData);
        } else if (pathStr.includes('obj-1.json')) {
          return JSON.stringify(mockObjectData);
        } else if (pathStr.includes('npc-1.json')) {
          return JSON.stringify(mockNPCData);
        } else if (pathStr.includes('connections.json')) {
          return JSON.stringify({ rooms: {}, objects: {}, npcs: {} });
        }
        return '';
      });
    });

    it('should load game successfully', async () => {
      mockDatabaseService.transaction.mockImplementation(async (callback) => {
        await callback({
          prepare: jest.fn().mockReturnValue({ run: jest.fn() }),
        });
      });

      const result = await service.loadGameFromFiles('test-game');

      expect(result.success).toBeTruthy();
      expect(result.loaded.game).toEqual(mockGameData);
      expect(result.loaded.rooms).toHaveLength(1);
      expect(result.loaded.objects).toHaveLength(1);
      expect(result.loaded.npcs).toHaveLength(1);
    });

    it('should handle missing game directory', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = await service.loadGameFromFiles('nonexistent-game');

      expect(result.success).toBeFalsy();
      expect(result.message).toContain('does not exist');
    });

    it('should handle missing game.json', async () => {
      mockFs.existsSync.mockImplementation((filePath: string) => {
        return !filePath.toString().includes('game.json');
      });

      const result = await service.loadGameFromFiles('test-game');

      expect(result.success).toBeFalsy();
      expect(result.message).toContain('game.json not found');
    });

    it('should handle invalid JSON files', async () => {
      mockFs.readFileSync.mockImplementation((filePath: string) => {
        if (filePath.toString().includes('game.json')) {
          return 'invalid json';
        }
        return JSON.stringify({});
      });

      const result = await service.loadGameFromFiles('test-game');

      expect(result.success).toBeFalsy();
      expect(result.message).toContain('Failed to parse');
    });

    it('should handle database transaction failure', async () => {
      mockDatabaseService.transaction.mockRejectedValue(
        new Error('Database error'),
      );

      const result = await service.loadGameFromFiles('test-game');

      expect(result.success).toBeFalsy();
      expect(result.message).toContain('Database error');
    });

    it('should skip invalid entity files', async () => {
      mockFs.readdirSync.mockImplementation((dirPath: string) => {
        const pathStr = dirPath.toString();
        if (pathStr.includes('rooms')) {
          return ['room-1.json', 'invalid-room.json'] as any;
        }
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((filePath: string) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('game.json')) {
          return JSON.stringify(mockGameData);
        } else if (pathStr.includes('room-1.json')) {
          return JSON.stringify(mockRoomData);
        } else if (pathStr.includes('invalid-room.json')) {
          return 'invalid json';
        } else if (pathStr.includes('connections.json')) {
          return JSON.stringify({ rooms: {}, objects: {}, npcs: {} });
        }
        return '';
      });

      const result = await service.loadGameFromFiles('test-game');

      expect(result.success).toBeTruthy();
      expect(result.loaded.rooms).toHaveLength(1); // Only valid room loaded
    });

    it('should handle missing subdirectories gracefully', async () => {
      mockFs.existsSync.mockImplementation((filePath: string) => {
        const pathStr = filePath.toString();
        // Only game.json and connections.json exist
        return (
          pathStr.includes('game.json') ||
          pathStr.includes('connections.json') ||
          pathStr.includes('test-game')
        );
      });

      mockFs.readdirSync.mockImplementation(() => {
        return [] as any;
      });

      const result = await service.loadGameFromFiles('test-game');

      expect(result.success).toBeTruthy();
      expect(result.loaded.rooms).toHaveLength(0);
      expect(result.loaded.objects).toHaveLength(0);
      expect(result.loaded.npcs).toHaveLength(0);
    });
  });

  describe('File Validation', () => {
    it('should validate room data structure', async () => {
      const invalidRoomData = {
        id: 'room-1',
        // Missing required fields like name, position
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dirPath: string) => {
        const pathStr = dirPath.toString();
        if (pathStr.includes('rooms')) {
          return ['invalid-room.json'] as any;
        }
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((filePath: string) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('game.json')) {
          return JSON.stringify({ id: 'test', name: 'Test', version: 1 });
        } else if (pathStr.includes('invalid-room.json')) {
          return JSON.stringify(invalidRoomData);
        } else if (pathStr.includes('connections.json')) {
          return JSON.stringify({ rooms: {}, objects: {}, npcs: {} });
        }
        return '';
      });

      const result = await service.loadGameFromFiles('test-game');

      expect(result.success).toBeTruthy();
      expect(result.loaded.rooms).toHaveLength(0); // Invalid room should be skipped
    });

    it('should validate object data structure', async () => {
      const invalidObjectData = {
        id: 'obj-1',
        // Missing required fields
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dirPath: string) => {
        const pathStr = dirPath.toString();
        if (pathStr.includes('objects')) {
          return ['invalid-obj.json'] as any;
        }
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((filePath: string) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('game.json')) {
          return JSON.stringify({ id: 'test', name: 'Test', version: 1 });
        } else if (pathStr.includes('invalid-obj.json')) {
          return JSON.stringify(invalidObjectData);
        } else if (pathStr.includes('connections.json')) {
          return JSON.stringify({ rooms: {}, objects: {}, npcs: {} });
        }
        return '';
      });

      const result = await service.loadGameFromFiles('test-game');

      expect(result.success).toBeTruthy();
      expect(result.loaded.objects).toHaveLength(0); // Invalid object should be skipped
    });
  });

  describe('Database Integration', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([]);
      mockFs.readFileSync.mockImplementation((filePath: string) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('game.json')) {
          return JSON.stringify({ id: 'test', name: 'Test', version: 1 });
        } else if (pathStr.includes('connections.json')) {
          return JSON.stringify({ rooms: {}, objects: {}, npcs: {} });
        }
        return '';
      });
    });

    it('should save game data to database', async () => {
      const mockPrepare = jest.fn().mockReturnValue({ run: jest.fn() });
      mockDatabaseService.transaction.mockImplementation(async (callback) => {
        await callback({ prepare: mockPrepare });
      });

      const result = await service.loadGameFromFiles('test-game');

      expect(result.success).toBeTruthy();
      expect(mockDatabaseService.transaction).toHaveBeenCalled();
    });

    it('should create version history entries', async () => {
      const mockPrepare = jest.fn().mockReturnValue({ run: jest.fn() });
      mockDatabaseService.transaction.mockImplementation(async (callback) => {
        await callback({ prepare: mockPrepare });
      });
      mockDatabaseService.saveVersion.mockResolvedValue(1);

      const result = await service.loadGameFromFiles('test-game');

      expect(result.success).toBeTruthy();
      expect(mockDatabaseService.saveVersion).toHaveBeenCalled();
    });
  });

  describe('Performance and Batch Operations', () => {
    it('should handle large numbers of files efficiently', async () => {
      const manyFiles = Array.from({ length: 100 }, (_, i) => `room-${i}.json`);

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dirPath: string) => {
        const pathStr = dirPath.toString();
        if (pathStr.includes('rooms')) {
          return manyFiles as any;
        }
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((filePath: string) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('game.json')) {
          return JSON.stringify({ id: 'test', name: 'Test', version: 1 });
        } else if (pathStr.includes('room-') && pathStr.includes('.json')) {
          const roomId = path.basename(pathStr, '.json');
          return JSON.stringify({
            id: roomId,
            name: `Room ${roomId}`,
            position: { x: 0, y: 0, z: 0 },
            width: 10,
            height: 10,
            objects: [],
            npcs: [],
          });
        } else if (pathStr.includes('connections.json')) {
          return JSON.stringify({ rooms: {}, objects: {}, npcs: {} });
        }
        return '';
      });

      const mockPrepare = jest.fn().mockReturnValue({ run: jest.fn() });
      mockDatabaseService.transaction.mockImplementation(async (callback) => {
        await callback({ prepare: mockPrepare });
      });

      const result = await service.loadGameFromFiles('test-game');

      expect(result.success).toBeTruthy();
      expect(result.loaded.rooms).toHaveLength(100);
      expect(mockDatabaseService.transaction).toHaveBeenCalled();
    });
  });

  describe('Error Recovery', () => {
    it('should continue loading after encountering corrupt files', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((dirPath: string) => {
        const pathStr = dirPath.toString();
        if (pathStr.includes('rooms')) {
          return [
            'good-room.json',
            'corrupt-room.json',
            'another-good-room.json',
          ] as any;
        }
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((filePath: string) => {
        const pathStr = filePath.toString();
        if (pathStr.includes('game.json')) {
          return JSON.stringify({ id: 'test', name: 'Test', version: 1 });
        } else if (pathStr.includes('good-room.json')) {
          return JSON.stringify({
            id: 'good-room',
            name: 'Good Room',
            position: { x: 0, y: 0, z: 0 },
            width: 10,
            height: 10,
            objects: [],
            npcs: [],
          });
        } else if (pathStr.includes('another-good-room.json')) {
          return JSON.stringify({
            id: 'another-good-room',
            name: 'Another Good Room',
            position: { x: 1, y: 1, z: 0 },
            width: 10,
            height: 10,
            objects: [],
            npcs: [],
          });
        } else if (pathStr.includes('corrupt-room.json')) {
          return 'corrupted json data {{{';
        } else if (pathStr.includes('connections.json')) {
          return JSON.stringify({ rooms: {}, objects: {}, npcs: {} });
        }
        return '';
      });

      const mockPrepare = jest.fn().mockReturnValue({ run: jest.fn() });
      mockDatabaseService.transaction.mockImplementation(async (callback) => {
        await callback({ prepare: mockPrepare });
      });

      const result = await service.loadGameFromFiles('test-game');

      expect(result.success).toBeTruthy();
      expect(result.loaded.rooms).toHaveLength(2); // Only the good rooms should be loaded
      expect(result.loaded.rooms[0].id).toBe('good-room');
      expect(result.loaded.rooms[1].id).toBe('another-good-room');
    });
  });
});
