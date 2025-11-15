import { Test, TestingModule } from '@nestjs/testing';
import { ValidationService } from './validation.service';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('ValidationService', () => {
  let service: ValidationService;

  // Mock schema files
  const mockGameConfigSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'game-config.schema.json',
    title: 'Game Configuration',
    type: 'object',
    required: ['id', 'name', 'version'],
    properties: {
      id: {
        type: 'string',
        pattern: '^[a-z0-9-]+$',
        minLength: 1,
        maxLength: 100,
      },
      name: {
        type: 'string',
        minLength: 1,
        maxLength: 200,
      },
      description: {
        type: 'string',
        maxLength: 2000,
      },
      version: {
        type: 'integer',
        minimum: 1,
      },
      starting_room: {
        type: 'string',
      },
    },
    additionalProperties: false,
  };

  const mockRoomSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'room.schema.json',
    title: 'Room',
    type: 'object',
    required: ['id', 'name', 'description', 'position', 'size'],
    properties: {
      id: {
        type: 'string',
        pattern: '^[a-z0-9-]+$',
        minLength: 1,
        maxLength: 100,
      },
      name: {
        type: 'string',
        minLength: 1,
        maxLength: 200,
      },
      description: {
        type: 'string',
        minLength: 1,
        maxLength: 1000,
      },
      position: {
        type: 'object',
        required: ['x', 'y', 'z'],
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          z: { type: 'number' },
        },
        additionalProperties: false,
      },
      size: {
        type: 'object',
        required: ['width', 'height', 'depth'],
        properties: {
          width: { type: 'number', minimum: 0 },
          height: { type: 'number', minimum: 0 },
          depth: { type: 'number', minimum: 0 },
        },
        additionalProperties: false,
      },
    },
    additionalProperties: false,
  };

  const mockObjectSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'object.schema.json',
    title: 'Object',
    type: 'object',
    required: ['id', 'name', 'description'],
    properties: {
      id: {
        type: 'string',
        pattern: '^[a-z0-9-]+$',
        minLength: 1,
        maxLength: 100,
      },
      name: {
        type: 'string',
        minLength: 1,
        maxLength: 200,
      },
      description: {
        type: 'string',
        minLength: 1,
        maxLength: 1000,
      },
      is_takeable: {
        type: 'boolean',
      },
    },
    additionalProperties: false,
  };

  const mockNPCSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'npc.schema.json',
    title: 'NPC',
    type: 'object',
    required: ['id', 'name', 'description'],
    properties: {
      id: {
        type: 'string',
        pattern: '^[a-z0-9-]+$',
        minLength: 1,
        maxLength: 100,
      },
      name: {
        type: 'string',
        minLength: 1,
        maxLength: 200,
      },
      description: {
        type: 'string',
        minLength: 1,
        maxLength: 1000,
      },
      personality: {
        type: 'string',
      },
    },
    additionalProperties: false,
  };

  const mockConnectionSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'connection.schema.json',
    title: 'Room Connections',
    type: 'object',
    required: ['connections'],
    properties: {
      connections: {
        type: 'array',
        items: {
          type: 'object',
          required: ['from_room', 'to_room', 'direction'],
          properties: {
            from_room: {
              type: 'string',
              pattern: '^[a-z0-9-]+$',
              minLength: 1,
              maxLength: 100,
            },
            to_room: {
              type: 'string',
              pattern: '^[a-z0-9-]+$',
              minLength: 1,
              maxLength: 100,
            },
            direction: {
              type: 'string',
              enum: ['north', 'south', 'east', 'west', 'up', 'down'],
            },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Mock existsSync to return true for all schema files
    mockFs.existsSync.mockReturnValue(true);

    // Mock readFileSync to return appropriate schema content
    mockFs.readFileSync.mockImplementation((filePath: any) => {
      const fileName = path.basename(filePath.toString());
      switch (fileName) {
        case 'game-config.schema.json':
          return JSON.stringify(mockGameConfigSchema);
        case 'room.schema.json':
          return JSON.stringify(mockRoomSchema);
        case 'object.schema.json':
          return JSON.stringify(mockObjectSchema);
        case 'npc.schema.json':
          return JSON.stringify(mockNPCSchema);
        case 'connection.schema.json':
          return JSON.stringify(mockConnectionSchema);
        default:
          throw new Error(`File not found: ${fileName}`);
      }
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [ValidationService],
    }).compile();

    service = module.get<ValidationService>(ValidationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Creation', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should load all schemas on initialization', () => {
      expect(mockFs.existsSync).toHaveBeenCalled();
      expect(mockFs.readFileSync).toHaveBeenCalled();
    });

    it('should handle missing schema files gracefully', () => {
      jest.clearAllMocks();
      mockFs.existsSync.mockReturnValue(false);

      const newService = new ValidationService();
      expect(newService).toBeDefined();
    });

    it('should handle invalid JSON in schema files', () => {
      jest.clearAllMocks();
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json{');

      const newService = new ValidationService();
      expect(newService).toBeDefined();
    });
  });

  describe('validateGameConfig', () => {
    it('should validate valid game config', () => {
      const validConfig = {
        id: 'test-game',
        name: 'Test Game',
        version: 1,
      };

      const result = service.validateGameConfig(validConfig);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject game config without required id', () => {
      const invalidConfig = {
        name: 'Test Game',
        version: 1,
      };

      const result = service.validateGameConfig(invalidConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("missing required property 'id'");
    });

    it('should reject game config without required name', () => {
      const invalidConfig = {
        id: 'test-game',
        version: 1,
      };

      const result = service.validateGameConfig(invalidConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("missing required property 'name'");
    });

    it('should reject game config without required version', () => {
      const invalidConfig = {
        id: 'test-game',
        name: 'Test Game',
      };

      const result = service.validateGameConfig(invalidConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("missing required property 'version'");
    });

    it('should reject game config with invalid id pattern', () => {
      const invalidConfig = {
        id: 'Test Game!',
        name: 'Test Game',
        version: 1,
      };

      const result = service.validateGameConfig(invalidConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('must match pattern');
    });

    it('should reject game config with id too long', () => {
      const invalidConfig = {
        id: 'a'.repeat(101),
        name: 'Test Game',
        version: 1,
      };

      const result = service.validateGameConfig(invalidConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject game config with name too long', () => {
      const invalidConfig = {
        id: 'test-game',
        name: 'a'.repeat(201),
        version: 1,
      };

      const result = service.validateGameConfig(invalidConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject game config with invalid version type', () => {
      const invalidConfig = {
        id: 'test-game',
        name: 'Test Game',
        version: 'one',
      };

      const result = service.validateGameConfig(invalidConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('must be integer');
    });

    it('should reject game config with version less than minimum', () => {
      const invalidConfig = {
        id: 'test-game',
        name: 'Test Game',
        version: 0,
      };

      const result = service.validateGameConfig(invalidConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('must be >=');
    });

    it('should reject game config with additional properties', () => {
      const invalidConfig = {
        id: 'test-game',
        name: 'Test Game',
        version: 1,
        invalid_property: 'value',
      };

      const result = service.validateGameConfig(invalidConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('unexpected property');
    });

    it('should validate game config with optional properties', () => {
      const validConfig = {
        id: 'test-game',
        name: 'Test Game',
        version: 1,
        description: 'A test game',
        starting_room: 'start-room',
      };

      const result = service.validateGameConfig(validConfig);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('validateRoom', () => {
    it('should validate valid room data', () => {
      const validRoom = {
        id: 'test-room',
        name: 'Test Room',
        description: 'A test room',
        position: { x: 0, y: 0, z: 0 },
        size: { width: 10, height: 10, depth: 10 },
      };

      const result = service.validateRoom(validRoom);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject room without required id', () => {
      const invalidRoom = {
        name: 'Test Room',
        description: 'A test room',
        position: { x: 0, y: 0, z: 0 },
        size: { width: 10, height: 10, depth: 10 },
      };

      const result = service.validateRoom(invalidRoom);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("missing required property 'id'");
    });

    it('should reject room without required name', () => {
      const invalidRoom = {
        id: 'test-room',
        description: 'A test room',
        position: { x: 0, y: 0, z: 0 },
        size: { width: 10, height: 10, depth: 10 },
      };

      const result = service.validateRoom(invalidRoom);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("missing required property 'name'");
    });

    it('should reject room without required description', () => {
      const invalidRoom = {
        id: 'test-room',
        name: 'Test Room',
        position: { x: 0, y: 0, z: 0 },
        size: { width: 10, height: 10, depth: 10 },
      };

      const result = service.validateRoom(invalidRoom);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("missing required property 'description'");
    });

    it('should reject room without required position', () => {
      const invalidRoom = {
        id: 'test-room',
        name: 'Test Room',
        description: 'A test room',
        size: { width: 10, height: 10, depth: 10 },
      };

      const result = service.validateRoom(invalidRoom);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("missing required property 'position'");
    });

    it('should reject room without required size', () => {
      const invalidRoom = {
        id: 'test-room',
        name: 'Test Room',
        description: 'A test room',
        position: { x: 0, y: 0, z: 0 },
      };

      const result = service.validateRoom(invalidRoom);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("missing required property 'size'");
    });

    it('should reject room with invalid position (missing z)', () => {
      const invalidRoom = {
        id: 'test-room',
        name: 'Test Room',
        description: 'A test room',
        position: { x: 0, y: 0 },
        size: { width: 10, height: 10, depth: 10 },
      };

      const result = service.validateRoom(invalidRoom);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject room with invalid size (negative width)', () => {
      const invalidRoom = {
        id: 'test-room',
        name: 'Test Room',
        description: 'A test room',
        position: { x: 0, y: 0, z: 0 },
        size: { width: -10, height: 10, depth: 10 },
      };

      const result = service.validateRoom(invalidRoom);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('must be >=');
    });

    it('should reject room with additional properties', () => {
      const invalidRoom = {
        id: 'test-room',
        name: 'Test Room',
        description: 'A test room',
        position: { x: 0, y: 0, z: 0 },
        size: { width: 10, height: 10, depth: 10 },
        invalid_property: 'value',
      };

      const result = service.validateRoom(invalidRoom);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('unexpected property');
    });

    it('should reject room with invalid id pattern', () => {
      const invalidRoom = {
        id: 'Test Room!',
        name: 'Test Room',
        description: 'A test room',
        position: { x: 0, y: 0, z: 0 },
        size: { width: 10, height: 10, depth: 10 },
      };

      const result = service.validateRoom(invalidRoom);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('must match pattern');
    });
  });

  describe('validateObject', () => {
    it('should validate valid object data', () => {
      const validObject = {
        id: 'test-object',
        name: 'Test Object',
        description: 'A test object',
      };

      const result = service.validateObject(validObject);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject object without required id', () => {
      const invalidObject = {
        name: 'Test Object',
        description: 'A test object',
      };

      const result = service.validateObject(invalidObject);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("missing required property 'id'");
    });

    it('should reject object without required name', () => {
      const invalidObject = {
        id: 'test-object',
        description: 'A test object',
      };

      const result = service.validateObject(invalidObject);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("missing required property 'name'");
    });

    it('should reject object without required description', () => {
      const invalidObject = {
        id: 'test-object',
        name: 'Test Object',
      };

      const result = service.validateObject(invalidObject);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("missing required property 'description'");
    });

    it('should validate object with optional properties', () => {
      const validObject = {
        id: 'test-object',
        name: 'Test Object',
        description: 'A test object',
        is_takeable: true,
      };

      const result = service.validateObject(validObject);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject object with additional properties', () => {
      const invalidObject = {
        id: 'test-object',
        name: 'Test Object',
        description: 'A test object',
        invalid_property: 'value',
      };

      const result = service.validateObject(invalidObject);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('unexpected property');
    });
  });

  describe('validateNPC', () => {
    it('should validate valid NPC data', () => {
      const validNPC = {
        id: 'test-npc',
        name: 'Test NPC',
        description: 'A test NPC',
      };

      const result = service.validateNPC(validNPC);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject NPC without required id', () => {
      const invalidNPC = {
        name: 'Test NPC',
        description: 'A test NPC',
      };

      const result = service.validateNPC(invalidNPC);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("missing required property 'id'");
    });

    it('should reject NPC without required name', () => {
      const invalidNPC = {
        id: 'test-npc',
        description: 'A test NPC',
      };

      const result = service.validateNPC(invalidNPC);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("missing required property 'name'");
    });

    it('should reject NPC without required description', () => {
      const invalidNPC = {
        id: 'test-npc',
        name: 'Test NPC',
      };

      const result = service.validateNPC(invalidNPC);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("missing required property 'description'");
    });

    it('should validate NPC with optional properties', () => {
      const validNPC = {
        id: 'test-npc',
        name: 'Test NPC',
        description: 'A test NPC',
        personality: 'friendly',
      };

      const result = service.validateNPC(validNPC);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject NPC with additional properties', () => {
      const invalidNPC = {
        id: 'test-npc',
        name: 'Test NPC',
        description: 'A test NPC',
        invalid_property: 'value',
      };

      const result = service.validateNPC(invalidNPC);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('unexpected property');
    });
  });

  describe('validateConnections', () => {
    it('should validate valid connections data', () => {
      const validConnections = {
        connections: [
          {
            from_room: 'room-1',
            to_room: 'room-2',
            direction: 'north',
          },
        ],
      };

      const result = service.validateConnections(validConnections);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should validate empty connections array', () => {
      const validConnections = {
        connections: [],
      };

      const result = service.validateConnections(validConnections);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should reject connections without required connections property', () => {
      const invalidConnections = {};

      const result = service.validateConnections(invalidConnections);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain("missing required property 'connections'");
    });

    it('should reject connection without required from_room', () => {
      const invalidConnections = {
        connections: [
          {
            to_room: 'room-2',
            direction: 'north',
          },
        ],
      };

      const result = service.validateConnections(invalidConnections);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject connection without required to_room', () => {
      const invalidConnections = {
        connections: [
          {
            from_room: 'room-1',
            direction: 'north',
          },
        ],
      };

      const result = service.validateConnections(invalidConnections);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject connection without required direction', () => {
      const invalidConnections = {
        connections: [
          {
            from_room: 'room-1',
            to_room: 'room-2',
          },
        ],
      };

      const result = service.validateConnections(invalidConnections);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should reject connection with invalid direction enum', () => {
      const invalidConnections = {
        connections: [
          {
            from_room: 'room-1',
            to_room: 'room-2',
            direction: 'invalid',
          },
        ],
      };

      const result = service.validateConnections(invalidConnections);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('must be one of');
    });

    it('should validate multiple connections', () => {
      const validConnections = {
        connections: [
          {
            from_room: 'room-1',
            to_room: 'room-2',
            direction: 'north',
          },
          {
            from_room: 'room-2',
            to_room: 'room-1',
            direction: 'south',
          },
        ],
      };

      const result = service.validateConnections(validConnections);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('validateGameFiles', () => {
    it('should validate complete game directory', async () => {
      const gameDir = '/test/games/test-game';

      // Mock directory structure
      mockFs.existsSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) return true;
        if (pathStr.includes('connections.json')) return true;
        if (pathStr.includes('rooms')) return true;
        if (pathStr.includes('objects')) return true;
        if (pathStr.includes('npcs')) return true;
        return false;
      });

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
            id: 'test-game',
            name: 'Test Game',
            version: 1,
          });
        }
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({
            id: 'room-1',
            name: 'Room 1',
            description: 'Test room',
            position: { x: 0, y: 0, z: 0 },
            size: { width: 10, height: 10, depth: 10 },
          });
        }
        if (pathStr.includes('object1.json')) {
          return JSON.stringify({
            id: 'object-1',
            name: 'Object 1',
            description: 'Test object',
          });
        }
        if (pathStr.includes('npc1.json')) {
          return JSON.stringify({
            id: 'npc-1',
            name: 'NPC 1',
            description: 'Test NPC',
          });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({
            connections: [],
          });
        }
        // Return schema content for schema files
        if (pathStr.includes('.schema.json')) {
          const fileName = path.basename(pathStr);
          switch (fileName) {
            case 'game-config.schema.json':
              return JSON.stringify(mockGameConfigSchema);
            case 'room.schema.json':
              return JSON.stringify(mockRoomSchema);
            case 'object.schema.json':
              return JSON.stringify(mockObjectSchema);
            case 'npc.schema.json':
              return JSON.stringify(mockNPCSchema);
            case 'connection.schema.json':
              return JSON.stringify(mockConnectionSchema);
          }
        }
        throw new Error(`Unexpected file: ${pathStr}`);
      });

      const result = await service.validateGameFiles('test-game', gameDir);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should report missing game-config.json', async () => {
      const gameDir = '/test/games/test-game';

      mockFs.existsSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        return !pathStr.includes('game-config.json');
      });

      mockFs.readdirSync.mockReturnValue([] as any);

      const result = await service.validateGameFiles('test-game', gameDir);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('game-config.json: File not found');
    });

    it('should report invalid JSON in game-config.json', async () => {
      const gameDir = '/test/games/test-game';

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([] as any);

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return 'invalid json{';
        }
        // Return schema content for schema files
        if (pathStr.includes('.schema.json')) {
          const fileName = path.basename(pathStr);
          switch (fileName) {
            case 'game-config.schema.json':
              return JSON.stringify(mockGameConfigSchema);
            case 'room.schema.json':
              return JSON.stringify(mockRoomSchema);
            case 'object.schema.json':
              return JSON.stringify(mockObjectSchema);
            case 'npc.schema.json':
              return JSON.stringify(mockNPCSchema);
            case 'connection.schema.json':
              return JSON.stringify(mockConnectionSchema);
          }
        }
        return '{}';
      });

      const result = await service.validateGameFiles('test-game', gameDir);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Invalid JSON');
    });

    it('should report validation errors in room files', async () => {
      const gameDir = '/test/games/test-game';

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms')) return ['invalid-room.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({
            id: 'test-game',
            name: 'Test Game',
            version: 1,
          });
        }
        if (pathStr.includes('invalid-room.json')) {
          return JSON.stringify({
            id: 'room-1',
            // Missing required fields
          });
        }
        // Return schema content for schema files
        if (pathStr.includes('.schema.json')) {
          const fileName = path.basename(pathStr);
          switch (fileName) {
            case 'game-config.schema.json':
              return JSON.stringify(mockGameConfigSchema);
            case 'room.schema.json':
              return JSON.stringify(mockRoomSchema);
            case 'object.schema.json':
              return JSON.stringify(mockObjectSchema);
            case 'npc.schema.json':
              return JSON.stringify(mockNPCSchema);
            case 'connection.schema.json':
              return JSON.stringify(mockConnectionSchema);
          }
        }
        return '{}';
      });

      const result = await service.validateGameFiles('test-game', gameDir);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes('invalid-room.json'))).toBe(
        true,
      );
    });

    it('should handle non-existent directories gracefully', async () => {
      const gameDir = '/test/games/test-game';

      mockFs.existsSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        // Only game-config exists
        return pathStr.includes('game-config.json');
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({
            id: 'test-game',
            name: 'Test Game',
            version: 1,
          });
        }
        // Return schema content for schema files
        if (pathStr.includes('.schema.json')) {
          const fileName = path.basename(pathStr);
          switch (fileName) {
            case 'game-config.schema.json':
              return JSON.stringify(mockGameConfigSchema);
            case 'room.schema.json':
              return JSON.stringify(mockRoomSchema);
            case 'object.schema.json':
              return JSON.stringify(mockObjectSchema);
            case 'npc.schema.json':
              return JSON.stringify(mockNPCSchema);
            case 'connection.schema.json':
              return JSON.stringify(mockConnectionSchema);
          }
        }
        return '{}';
      });

      const result = await service.validateGameFiles('test-game', gameDir);

      expect(result.isValid).toBe(true);
    });

    it('should validate multiple files of each type', async () => {
      const gameDir = '/test/games/test-game';

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms')) return ['room1.json', 'room2.json'] as any;
        if (pathStr.includes('objects'))
          return ['object1.json', 'object2.json'] as any;
        if (pathStr.includes('npcs')) return ['npc1.json', 'npc2.json'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({
            id: 'test-game',
            name: 'Test Game',
            version: 1,
          });
        }
        if (pathStr.includes('room1.json') || pathStr.includes('room2.json')) {
          return JSON.stringify({
            id: 'room-1',
            name: 'Room 1',
            description: 'Test room',
            position: { x: 0, y: 0, z: 0 },
            size: { width: 10, height: 10, depth: 10 },
          });
        }
        if (
          pathStr.includes('object1.json') ||
          pathStr.includes('object2.json')
        ) {
          return JSON.stringify({
            id: 'object-1',
            name: 'Object 1',
            description: 'Test object',
          });
        }
        if (pathStr.includes('npc1.json') || pathStr.includes('npc2.json')) {
          return JSON.stringify({
            id: 'npc-1',
            name: 'NPC 1',
            description: 'Test NPC',
          });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({
            connections: [],
          });
        }
        // Return schema content for schema files
        if (pathStr.includes('.schema.json')) {
          const fileName = path.basename(pathStr);
          switch (fileName) {
            case 'game-config.schema.json':
              return JSON.stringify(mockGameConfigSchema);
            case 'room.schema.json':
              return JSON.stringify(mockRoomSchema);
            case 'object.schema.json':
              return JSON.stringify(mockObjectSchema);
            case 'npc.schema.json':
              return JSON.stringify(mockNPCSchema);
            case 'connection.schema.json':
              return JSON.stringify(mockConnectionSchema);
          }
        }
        return '{}';
      });

      const result = await service.validateGameFiles('test-game', gameDir);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should skip non-JSON files in directories', async () => {
      const gameDir = '/test/games/test-game';

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('rooms'))
          return ['room1.json', 'readme.txt'] as any;
        return [] as any;
      });

      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('game-config.json')) {
          return JSON.stringify({
            id: 'test-game',
            name: 'Test Game',
            version: 1,
          });
        }
        if (pathStr.includes('room1.json')) {
          return JSON.stringify({
            id: 'room-1',
            name: 'Room 1',
            description: 'Test room',
            position: { x: 0, y: 0, z: 0 },
            size: { width: 10, height: 10, depth: 10 },
          });
        }
        if (pathStr.includes('connections.json')) {
          return JSON.stringify({
            connections: [],
          });
        }
        // Return schema content for schema files
        if (pathStr.includes('.schema.json')) {
          const fileName = path.basename(pathStr);
          switch (fileName) {
            case 'game-config.schema.json':
              return JSON.stringify(mockGameConfigSchema);
            case 'room.schema.json':
              return JSON.stringify(mockRoomSchema);
            case 'object.schema.json':
              return JSON.stringify(mockObjectSchema);
            case 'npc.schema.json':
              return JSON.stringify(mockNPCSchema);
            case 'connection.schema.json':
              return JSON.stringify(mockConnectionSchema);
          }
        }
        return '{}';
      });

      const result = await service.validateGameFiles('test-game', gameDir);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('Error Formatting', () => {
    it('should format required field errors', () => {
      const invalidConfig = {
        name: 'Test Game',
        version: 1,
      };

      const result = service.validateGameConfig(invalidConfig);

      expect(result.errors[0]).toContain('missing required property');
    });

    it('should format type errors', () => {
      const invalidConfig = {
        id: 'test-game',
        name: 'Test Game',
        version: 'invalid',
      };

      const result = service.validateGameConfig(invalidConfig);

      expect(result.errors[0]).toContain('must be');
    });

    it('should format enum errors', () => {
      const invalidConnections = {
        connections: [
          {
            from_room: 'room-1',
            to_room: 'room-2',
            direction: 'invalid',
          },
        ],
      };

      const result = service.validateConnections(invalidConnections);

      expect(result.errors[0]).toContain('must be one of');
    });

    it('should format pattern errors', () => {
      const invalidConfig = {
        id: 'Invalid ID!',
        name: 'Test Game',
        version: 1,
      };

      const result = service.validateGameConfig(invalidConfig);

      expect(result.errors[0]).toContain('must match pattern');
    });

    it('should format minimum errors', () => {
      const invalidRoom = {
        id: 'room-1',
        name: 'Room 1',
        description: 'Test room',
        position: { x: 0, y: 0, z: 0 },
        size: { width: -10, height: 10, depth: 10 },
      };

      const result = service.validateRoom(invalidRoom);

      expect(result.errors[0]).toContain('must be >=');
    });

    it('should format additionalProperties errors', () => {
      const invalidConfig = {
        id: 'test-game',
        name: 'Test Game',
        version: 1,
        unexpected: 'value',
      };

      const result = service.validateGameConfig(invalidConfig);

      expect(result.errors[0]).toContain('unexpected property');
    });
  });

  describe('Edge Cases', () => {
    it('should handle null data', () => {
      const result = service.validateGameConfig(null);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle undefined data', () => {
      const result = service.validateGameConfig(undefined);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle empty object', () => {
      const result = service.validateGameConfig({});

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle array instead of object', () => {
      const result = service.validateGameConfig([]);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return error for non-existent schema', () => {
      // Access private method through any to test error handling
      const result = (service as any).validate('non-existent-schema', {});

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Schema not found: non-existent-schema');
    });
  });
});
