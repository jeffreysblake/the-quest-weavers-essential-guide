import { Test, TestingModule } from '@nestjs/testing';
import { GameLogicValidatorService } from './game-logic-validator.service';
import { FileScannerService } from '../file-system/file-scanner.service';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('GameLogicValidatorService', () => {
  let service: GameLogicValidatorService;
  let fileScannerService: FileScannerService;

  const mockFileScannerService = {
    getGamesDirectory: jest.fn().mockReturnValue('/test/games'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameLogicValidatorService,
        { provide: FileScannerService, useValue: mockFileScannerService },
      ],
    }).compile();

    service = module.get<GameLogicValidatorService>(GameLogicValidatorService);
    fileScannerService = module.get<FileScannerService>(FileScannerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Creation', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should inject FileScannerService', () => {
      expect(fileScannerService).toBeDefined();
    });
  });

  describe('validateGameLogic - Valid Game', () => {
    it('should validate a complete valid game', async () => {
      // Setup valid game structure
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms'))
          return ['room1.json', 'room2.json'] as any;
        if (pathStr.includes('objects')) return ['object1.json'] as any;
        if (pathStr.includes('npcs')) return ['npc1.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({
            id: 'test-game',
            name: 'Test Game',
            version: 1,
            starting_room: 'room-1',
          });
        }
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({ id: 'room-1', name: 'Room 1' });
        }
        if (pathStr.includes('room2.json')) {
          return JSON.stringify({ id: 'room-2', name: 'Room 2' });
        }
        if (pathStr.includes('object1.json')) {
          return JSON.stringify({ id: 'object-1', name: 'Object 1' });
        }
        if (pathStr.includes('npc1.json')) {
          return JSON.stringify({ id: 'npc-1', name: 'NPC 1' });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({
            connections: [
              { from_room: 'room-1', to_room: 'room-2', direction: 'north' },
              { from_room: 'room-2', to_room: 'room-1', direction: 'south' },
            ],
          });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.stats).toEqual({
        roomCount: 2,
        objectCount: 1,
        npcCount: 1,
        connectionCount: 2,
        orphanedConnections: 0,
        unreachableRooms: 0,
        duplicateIds: 0,
      });
    });

    it('should validate game with no warnings', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms')) return ['room1.json'] as any;
        if (pathStr.includes('objects')) return ['object1.json'] as any;
        if (pathStr.includes('npcs')) return ['npc1.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({
            starting_room: 'room-1',
          });
        }
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({ id: 'room-1' });
        }
        if (pathStr.includes('object1.json')) {
          return JSON.stringify({ id: 'object-1' });
        }
        if (pathStr.includes('npc1.json')) {
          return JSON.stringify({ id: 'npc-1' });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({ connections: [] });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('Duplicate ID Detection', () => {
    it('should detect duplicate room IDs', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms'))
          return ['room1.json', 'room2.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({ starting_room: 'room-1' });
        }
        if (pathStr.includes('room1.json') || pathStr.includes('room2.json')) {
          return JSON.stringify({ id: 'duplicate-room' });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({ connections: [] });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Duplicate room ID found: duplicate-room',
      );
      expect(result.stats?.duplicateIds).toBe(1);
    });

    it('should detect duplicate object IDs', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms')) return ['room1.json'] as any;
        if (pathStr.includes('objects'))
          return ['object1.json', 'object2.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({ starting_room: 'room-1' });
        }
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({ id: 'room-1' });
        }
        if (
          pathStr.includes('object1.json') ||
          pathStr.includes('object2.json')
        ) {
          return JSON.stringify({ id: 'duplicate-object' });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({ connections: [] });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        'Duplicate object ID found: duplicate-object',
      );
      expect(result.stats?.duplicateIds).toBe(1);
    });

    it('should detect duplicate NPC IDs', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms')) return ['room1.json'] as any;
        if (pathStr.includes('npcs')) return ['npc1.json', 'npc2.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({ starting_room: 'room-1' });
        }
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({ id: 'room-1' });
        }
        if (pathStr.includes('npc1.json') || pathStr.includes('npc2.json')) {
          return JSON.stringify({ id: 'duplicate-npc' });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({ connections: [] });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Duplicate NPC ID found: duplicate-npc');
      expect(result.stats?.duplicateIds).toBe(1);
    });

    it('should detect multiple duplicate IDs across types', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms'))
          return ['room1.json', 'room2.json'] as any;
        if (pathStr.includes('objects'))
          return ['object1.json', 'object2.json'] as any;
        if (pathStr.includes('npcs')) return ['npc1.json', 'npc2.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({ starting_room: 'dup-room' });
        }
        if (pathStr.includes('room1.json') || pathStr.includes('room2.json')) {
          return JSON.stringify({ id: 'dup-room' });
        }
        if (
          pathStr.includes('object1.json') ||
          pathStr.includes('object2.json')
        ) {
          return JSON.stringify({ id: 'dup-object' });
        }
        if (pathStr.includes('npc1.json') || pathStr.includes('npc2.json')) {
          return JSON.stringify({ id: 'dup-npc' });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({ connections: [] });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Duplicate room ID found: dup-room');
      expect(result.errors).toContain('Duplicate object ID found: dup-object');
      expect(result.errors).toContain('Duplicate NPC ID found: dup-npc');
      expect(result.stats?.duplicateIds).toBe(3);
    });
  });

  describe('Orphaned Connection Detection', () => {
    it('should detect orphaned from_room connection', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms')) return ['room1.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({ starting_room: 'room-1' });
        }
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({ id: 'room-1' });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({
            connections: [
              {
                from_room: 'non-existent',
                to_room: 'room-1',
                direction: 'north',
              },
            ],
          });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Orphaned connection #1: from_room 'non-existent' does not exist",
      );
      expect(result.stats?.orphanedConnections).toBeGreaterThan(0);
    });

    it('should detect orphaned to_room connection', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms')) return ['room1.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({ starting_room: 'room-1' });
        }
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({ id: 'room-1' });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({
            connections: [
              {
                from_room: 'room-1',
                to_room: 'non-existent',
                direction: 'north',
              },
            ],
          });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Orphaned connection #1: to_room 'non-existent' does not exist",
      );
    });

    it('should detect both orphaned from_room and to_room', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms')) return ['room1.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({ starting_room: 'room-1' });
        }
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({ id: 'room-1' });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({
            connections: [
              {
                from_room: 'non-existent-1',
                to_room: 'non-existent-2',
                direction: 'north',
              },
            ],
          });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBe(2);
      expect(result.errors).toContain(
        "Orphaned connection #1: from_room 'non-existent-1' does not exist",
      );
      expect(result.errors).toContain(
        "Orphaned connection #1: to_room 'non-existent-2' does not exist",
      );
    });

    it('should handle multiple orphaned connections', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms')) return ['room1.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({ starting_room: 'room-1' });
        }
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({ id: 'room-1' });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({
            connections: [
              {
                from_room: 'non-existent-1',
                to_room: 'room-1',
                direction: 'north',
              },
              {
                from_room: 'room-1',
                to_room: 'non-existent-2',
                direction: 'south',
              },
            ],
          });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBe(2);
    });
  });

  describe('Unreachable Room Detection', () => {
    it('should detect unreachable rooms from starting room', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms'))
          return ['room1.json', 'room2.json', 'room3.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({ starting_room: 'room-1' });
        }
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({ id: 'room-1' });
        }
        if (pathStr.includes('room2.json')) {
          return JSON.stringify({ id: 'room-2' });
        }
        if (pathStr.includes('room3.json')) {
          return JSON.stringify({ id: 'room-3' });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({
            connections: [
              { from_room: 'room-1', to_room: 'room-2', direction: 'north' },
              // room-3 is not connected
            ],
          });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain(
        "1 room(s) are unreachable from starting room 'room-1': room-3",
      );
      expect(result.stats?.unreachableRooms).toBe(1);
    });

    it('should detect all unreachable rooms', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms'))
          return [
            'room1.json',
            'room2.json',
            'room3.json',
            'room4.json',
          ] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({ starting_room: 'room-1' });
        }
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({ id: 'room-1' });
        }
        if (pathStr.includes('room2.json')) {
          return JSON.stringify({ id: 'room-2' });
        }
        if (pathStr.includes('room3.json')) {
          return JSON.stringify({ id: 'room-3' });
        }
        if (pathStr.includes('room4.json')) {
          return JSON.stringify({ id: 'room-4' });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({
            connections: [
              // Only room-1 and room-2 are connected
              { from_room: 'room-1', to_room: 'room-2', direction: 'north' },
            ],
          });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContainEqual(
        expect.stringContaining('2 room(s) are unreachable'),
      );
      expect(result.stats?.unreachableRooms).toBe(2);
    });

    it('should handle bidirectional paths when detecting reachability', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms'))
          return ['room1.json', 'room2.json', 'room3.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({ starting_room: 'room-1' });
        }
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({ id: 'room-1' });
        }
        if (pathStr.includes('room2.json')) {
          return JSON.stringify({ id: 'room-2' });
        }
        if (pathStr.includes('room3.json')) {
          return JSON.stringify({ id: 'room-3' });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({
            connections: [
              { from_room: 'room-1', to_room: 'room-2', direction: 'north' },
              { from_room: 'room-2', to_room: 'room-3', direction: 'east' },
              // All rooms should be reachable from room-1
            ],
          });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(true);
      expect(result.warnings.some((w) => w.includes('unreachable'))).toBe(
        false,
      );
      expect(result.stats?.unreachableRooms).toBe(0);
    });

    it('should warn when no starting room is specified', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms')) return ['room1.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({});
        }
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({ id: 'room-1' });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({ connections: [] });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain(
        'No starting room specified in game config - cannot check for unreachable rooms',
      );
    });

    it('should error when starting room does not exist', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms')) return ['room1.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({ starting_room: 'non-existent' });
        }
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({ id: 'room-1' });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({ connections: [] });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain(
        "Starting room 'non-existent' specified in config does not exist",
      );
    });
  });

  describe('Isolated Room Detection', () => {
    it('should detect rooms with no connections', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms'))
          return ['room1.json', 'room2.json', 'room3.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({ starting_room: 'room-1' });
        }
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({ id: 'room-1' });
        }
        if (pathStr.includes('room2.json')) {
          return JSON.stringify({ id: 'room-2' });
        }
        if (pathStr.includes('room3.json')) {
          return JSON.stringify({ id: 'room-3' });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({
            connections: [
              { from_room: 'room-2', to_room: 'room-3', direction: 'north' },
              // room-1 is starting room but has no connections
              // room-2 and room-3 are connected but isolated from room-1
            ],
          });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(true);
      // Should not count starting room as isolated even if it has no connections
      expect(
        result.warnings.some((w) => w.includes('have no connections')),
      ).toBe(false);
    });

    it('should not count starting room as isolated', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms')) return ['room1.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({ starting_room: 'room-1' });
        }
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({ id: 'room-1' });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({ connections: [] });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(true);
      expect(
        result.warnings.some((w) => w.includes('have no connections')),
      ).toBe(false);
    });

    it('should detect multiple isolated rooms', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms'))
          return [
            'room1.json',
            'room2.json',
            'room3.json',
            'room4.json',
          ] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({ starting_room: 'room-1' });
        }
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({ id: 'room-1' });
        }
        if (pathStr.includes('room2.json')) {
          return JSON.stringify({ id: 'room-2' });
        }
        if (pathStr.includes('room3.json')) {
          return JSON.stringify({ id: 'room-3' });
        }
        if (pathStr.includes('room4.json')) {
          return JSON.stringify({ id: 'room-4' });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({
            connections: [
              { from_room: 'room-1', to_room: 'room-2', direction: 'north' },
              // room-3 and room-4 are isolated
            ],
          });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContainEqual(
        expect.stringContaining('2 room(s) have no connections'),
      );
    });
  });

  describe('Circular Path Detection', () => {
    it('should detect circular paths without errors', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms'))
          return ['room1.json', 'room2.json', 'room3.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({ starting_room: 'room-1' });
        }
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({ id: 'room-1' });
        }
        if (pathStr.includes('room2.json')) {
          return JSON.stringify({ id: 'room-2' });
        }
        if (pathStr.includes('room3.json')) {
          return JSON.stringify({ id: 'room-3' });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({
            connections: [
              { from_room: 'room-1', to_room: 'room-2', direction: 'north' },
              { from_room: 'room-2', to_room: 'room-3', direction: 'east' },
              { from_room: 'room-3', to_room: 'room-1', direction: 'south' },
              // Circular path: room-1 -> room-2 -> room-3 -> room-1
            ],
          });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      // Circular paths are valid in games
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('Bidirectional Connection Detection', () => {
    it('should warn about missing bidirectional connections', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms'))
          return ['room1.json', 'room2.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({ starting_room: 'room-1' });
        }
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({ id: 'room-1' });
        }
        if (pathStr.includes('room2.json')) {
          return JSON.stringify({ id: 'room-2' });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({
            connections: [
              { from_room: 'room-1', to_room: 'room-2', direction: 'north' },
              // Missing return connection from room-2 to room-1
            ],
          });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContainEqual(
        expect.stringContaining('connection(s) may be missing return paths'),
      );
      expect(result.warnings).toContainEqual(
        expect.stringContaining('room-1 -> room-2'),
      );
    });

    it('should not warn when bidirectional connections exist', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms'))
          return ['room1.json', 'room2.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({ starting_room: 'room-1' });
        }
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({ id: 'room-1' });
        }
        if (pathStr.includes('room2.json')) {
          return JSON.stringify({ id: 'room-2' });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({
            connections: [
              { from_room: 'room-1', to_room: 'room-2', direction: 'north' },
              { from_room: 'room-2', to_room: 'room-1', direction: 'south' },
            ],
          });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(true);
      expect(
        result.warnings.some((w) => w.includes('missing return paths')),
      ).toBe(false);
    });

    it('should limit warnings to first 5 missing bidirectional connections', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms'))
          return [
            'room1.json',
            'room2.json',
            'room3.json',
            'room4.json',
            'room5.json',
            'room6.json',
            'room7.json',
          ] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({ starting_room: 'room-1' });
        }
        if (
          pathStr.includes('room1.json') ||
          pathStr.includes('room2.json') ||
          pathStr.includes('room3.json') ||
          pathStr.includes('room4.json') ||
          pathStr.includes('room5.json') ||
          pathStr.includes('room6.json') ||
          pathStr.includes('room7.json')
        ) {
          const match = pathStr.match(/room(\d+)\.json/);
          return JSON.stringify({ id: `room-${match![1]}` });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({
            connections: [
              { from_room: 'room-1', to_room: 'room-2', direction: 'north' },
              { from_room: 'room-2', to_room: 'room-3', direction: 'north' },
              { from_room: 'room-3', to_room: 'room-4', direction: 'north' },
              { from_room: 'room-4', to_room: 'room-5', direction: 'north' },
              { from_room: 'room-5', to_room: 'room-6', direction: 'north' },
              { from_room: 'room-6', to_room: 'room-7', direction: 'north' },
              // 6 one-way connections without return paths
            ],
          });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContainEqual(
        expect.stringContaining('6 connection(s) may be missing return paths'),
      );
      expect(result.warnings).toContainEqual(
        expect.stringContaining('... and 1 more'),
      );
    });
  });

  describe('Empty Game Validation', () => {
    it('should error when game has no rooms', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([] as any);

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({});
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({ connections: [] });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Game has no rooms defined');
    });

    it('should warn when game has only one room', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms')) return ['room1.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({ starting_room: 'room-1' });
        }
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({ id: 'room-1' });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({ connections: [] });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain(
        'Game only has one room - consider adding more content',
      );
    });

    it('should warn when game has no connections with multiple rooms', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms'))
          return ['room1.json', 'room2.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({ starting_room: 'room-1' });
        }
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({ id: 'room-1' });
        }
        if (pathStr.includes('room2.json')) {
          return JSON.stringify({ id: 'room-2' });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({ connections: [] });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('No connections defined between rooms');
    });

    it('should warn when game has no objects or NPCs', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms')) return ['room1.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({ starting_room: 'room-1' });
        }
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({ id: 'room-1' });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({ connections: [] });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain(
        'Game has no objects or NPCs - consider adding interactive elements',
      );
    });
  });

  describe('Statistics Calculation', () => {
    it('should calculate correct statistics', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms'))
          return ['room1.json', 'room2.json', 'room3.json'] as any;
        if (pathStr.includes('objects'))
          return ['object1.json', 'object2.json'] as any;
        if (pathStr.includes('npcs')) return ['npc1.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({ starting_room: 'room-1' });
        }
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({ id: 'room-1' });
        }
        if (pathStr.includes('room2.json')) {
          return JSON.stringify({ id: 'room-2' });
        }
        if (pathStr.includes('room3.json')) {
          return JSON.stringify({ id: 'room-3' });
        }
        if (pathStr.includes('object1.json')) {
          return JSON.stringify({ id: 'object-1' });
        }
        if (pathStr.includes('object2.json')) {
          return JSON.stringify({ id: 'object-2' });
        }
        if (pathStr.includes('npc1.json')) {
          return JSON.stringify({ id: 'npc-1' });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({
            connections: [
              { from_room: 'room-1', to_room: 'room-2', direction: 'north' },
              { from_room: 'room-2', to_room: 'room-1', direction: 'south' },
            ],
          });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.stats).toEqual({
        roomCount: 3,
        objectCount: 2,
        npcCount: 1,
        connectionCount: 2,
        orphanedConnections: 0,
        unreachableRooms: 1, // room-3 is unreachable
        duplicateIds: 0,
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle missing game directory', async () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readdirSync.mockReturnValue([] as any);
      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({});
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({ connections: [] });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Game has no rooms defined');
    });

    it('should handle invalid JSON in entity files', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms')) return ['room1.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({});
        }
        if (pathStr.includes('room1.json')) {
          return 'invalid json{';
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({ connections: [] });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      // Should continue validation even with invalid JSON
      expect(result.isValid).toBe(false);
    });

    it('should handle invalid JSON in connections file', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms')) return ['room1.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({});
        }
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({ id: 'room-1' });
        }
        if (pathStr.includes('connections.json')) {
          return 'invalid json{';
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(true);
      expect(result.stats?.connectionCount).toBe(0);
    });

    it('should handle invalid JSON in game config', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms')) return ['room1.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return 'invalid json{';
        }
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({ id: 'room-1' });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({ connections: [] });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(true);
    });

    it('should handle general validation errors', async () => {
      const originalImplementation = mockFileScannerService.getGamesDirectory;
      mockFileScannerService.getGamesDirectory.mockImplementation(() => {
        throw new Error('Test error');
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Validation failed: Test error');
      expect(result.warnings).toEqual([]);

      // Restore original mock
      mockFileScannerService.getGamesDirectory = originalImplementation;
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      // Ensure mock is reset for edge cases
      mockFileScannerService.getGamesDirectory.mockReturnValue('/test/games');
    });

    it('should handle empty directories', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([] as any);

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({});
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({ connections: [] });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Game has no rooms defined');
    });

    it('should handle missing connections file', async () => {
      mockFs.existsSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        return !pathStr.includes('connections.json');
      });

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms')) return ['room1.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({});
        }
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({ id: 'room-1' });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(true);
      expect(result.stats?.connectionCount).toBe(0);
    });

    it('should handle missing game config file', async () => {
      mockFs.existsSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        return !pathStr.includes('game-config.json');
      });

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms')) return ['room1.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({ id: 'room-1' });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({ connections: [] });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain(
        'No starting room specified in game config - cannot check for unreachable rooms',
      );
    });

    it('should handle entities without id field', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms')) return ['room1.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({});
        }
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({ name: 'Room without ID' });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({ connections: [] });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      // Should handle gracefully
      expect(result).toBeDefined();
    });

    it('should handle connections without required fields', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms')) return ['room1.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({});
        }
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({ id: 'room-1' });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({
            connections: [
              { from_room: 'room-1' }, // missing to_room and direction
            ],
          });
        }
        return '{}';
      });

      const result = await service.validateGameLogic('test-game');

      // Should handle gracefully
      expect(result).toBeDefined();
    });
  });
});
