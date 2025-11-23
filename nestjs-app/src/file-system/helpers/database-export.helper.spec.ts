import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseExportHelper } from './database-export.helper';
import { DatabaseService } from '../../database/database.service';
import { FileScannerService } from '../file-scanner.service';
import {
  GameData,
  RoomData,
  ObjectData,
  NPCData,
  RoomConnection,
} from '../../database/database.interfaces';

describe('DatabaseExportHelper', () => {
  let helper: DatabaseExportHelper;
  let mockDatabaseService: jest.Mocked<Partial<DatabaseService>>;
  let mockFileScannerService: jest.Mocked<Partial<FileScannerService>>;

  const createMockGameData = (overrides: Partial<GameData> = {}): GameData => ({
    id: 'game-1',
    name: 'Test Game',
    description: 'A test game',
    version: 1,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    isActive: true,
    metadata: { difficulty: 'normal', estimatedPlaytime: '10 hours' },
    ...overrides,
  });

  const createMockRoomData = (overrides: Partial<RoomData> = {}): RoomData => ({
    id: 'room-1',
    gameId: 'game-1',
    name: 'Test Room',
    description: 'A test room',
    longDescription: 'A long description',
    position: { x: 0, y: 0, z: 0 },
    width: 10,
    height: 10,
    depth: 3,
    version: 1,
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  });

  const createMockObjectData = (overrides: Partial<ObjectData> = {}): ObjectData => ({
    id: 'object-1',
    gameId: 'game-1',
    name: 'Test Object',
    description: 'A test object',
    objectType: 'item',
    position: { x: 0, y: 0, z: 0 },
    material: 'wood',
    weight: 1,
    isPortable: true,
    isContainer: false,
    canContain: false,
    containerCapacity: 0,
    version: 1,
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  });

  const createMockNPCData = (overrides: Partial<NPCData> = {}): NPCData => ({
    id: 'npc-1',
    gameId: 'game-1',
    name: 'Test NPC',
    description: 'A test NPC',
    npcType: 'npc',
    position: { x: 0, y: 0, z: 0 },
    health: 100,
    maxHealth: 100,
    level: 1,
    experience: 0,
    version: 1,
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  });

  const createMockConnection = (overrides: Partial<RoomConnection> = {}): RoomConnection => ({
    id: 'conn-1',
    roomId: 'room-1',
    connectedRoomId: 'room-2',
    direction: 'north',
    description: 'A door to the north',
    isLocked: false,
    requiredKeyId: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  });

  beforeEach(async () => {
    mockDatabaseService = { prepare: jest.fn() };
    mockFileScannerService = { writeFileContent: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseExportHelper,
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: FileScannerService, useValue: mockFileScannerService },
      ],
    }).compile();

    helper = module.get<DatabaseExportHelper>(DatabaseExportHelper);
  });

  afterEach(() => jest.clearAllMocks());

  // ============================================================================
  // QUERY GAME CONFIG (6 tests)
  // ============================================================================
  describe('queryGameConfig', () => {
    it('should query and return game config with all fields', async () => {
      const mockRow = {
        id: 'game-1',
        name: 'Test Game',
        description: 'A test game',
        version: 1,
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
        is_active: 1,
        metadata: JSON.stringify({ difficulty: 'normal', estimatedPlaytime: '10 hours' }),
      };

      mockDatabaseService.prepare = jest.fn().mockReturnValue({
        get: jest.fn().mockReturnValue(mockRow),
      });

      const result = await helper.queryGameConfig('game-1');

      expect(mockDatabaseService.prepare).toHaveBeenCalledWith('SELECT * FROM games WHERE id = ?');
      expect(result).toEqual({
        id: 'game-1',
        name: 'Test Game',
        description: 'A test game',
        version: 1,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        isActive: true,
        metadata: { difficulty: 'normal', estimatedPlaytime: '10 hours' },
      });
    });

    it('should return null when game config not found', async () => {
      mockDatabaseService.prepare = jest.fn().mockReturnValue({
        get: jest.fn().mockReturnValue(undefined),
      });
      const result = await helper.queryGameConfig('non-existent');
      expect(result).toBeNull();
    });

    it('should handle game config without metadata', async () => {
      mockDatabaseService.prepare = jest.fn().mockReturnValue({
        get: jest.fn().mockReturnValue({
          id: 'game-1', name: 'Test Game', description: 'A test game', version: 1,
          created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z',
          is_active: 1, metadata: null,
        }),
      });
      const result = await helper.queryGameConfig('game-1');
      expect(result.metadata).toBeUndefined();
    });

    it('should convert is_active to boolean (0 = false, 1 = true)', async () => {
      mockDatabaseService.prepare = jest.fn().mockReturnValue({
        get: jest.fn().mockReturnValue({
          id: 'game-1', name: 'Inactive Game', description: '', version: 1,
          created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z',
          is_active: 0, metadata: null,
        }),
      });
      const result = await helper.queryGameConfig('game-1');
      expect(result.isActive).toBe(false);
    });

    it('should return null on database error', async () => {
      mockDatabaseService.prepare = jest.fn().mockImplementation(() => {
        throw new Error('Database error');
      });
      const result = await helper.queryGameConfig('game-1');
      expect(result).toBeNull();
    });

    it('should parse complex metadata with victory conditions', async () => {
      const complexMetadata = {
        difficulty: 'hard',
        themes: ['fantasy', 'adventure'],
        victoryConditions: [{ type: 'obtain_item', itemId: 'key', description: 'Find key' }],
      };
      mockDatabaseService.prepare = jest.fn().mockReturnValue({
        get: jest.fn().mockReturnValue({
          id: 'game-1', name: 'Game', description: '', version: 1,
          created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z',
          is_active: 1, metadata: JSON.stringify(complexMetadata),
        }),
      });
      const result = await helper.queryGameConfig('game-1');
      expect(result.metadata).toEqual(complexMetadata);
    });
  });

  // ============================================================================
  // QUERY ROOMS (5 tests)
  // ============================================================================
  describe('queryRooms', () => {
    it('should query and return multiple rooms with positions', async () => {
      const mockRows = [
        { id: 'room-1', game_id: 'game-1', name: 'Room 1', description: 'First room',
          long_description: 'Long 1', position_x: 0, position_y: 0, position_z: 0,
          width: 10, height: 10, depth: 3, environment_data: null, version: 1,
          created_at: '2025-01-01T00:00:00.000Z' },
        { id: 'room-2', game_id: 'game-1', name: 'Room 2', description: 'Second room',
          long_description: 'Long 2', position_x: 100, position_y: 200, position_z: 50,
          width: 15, height: 15, depth: 4, environment_data: null, version: 1,
          created_at: '2025-01-01T00:00:00.000Z' },
      ];

      mockDatabaseService.prepare = jest.fn().mockReturnValue({
        all: jest.fn().mockReturnValue(mockRows),
      });

      const result = await helper.queryRooms('game-1');

      expect(mockDatabaseService.prepare).toHaveBeenCalledWith(
        'SELECT * FROM rooms WHERE game_id = ?',
      );
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('room-1');
      expect(result[1].position).toEqual({ x: 100, y: 200, z: 50 });
    });

    it('should return empty array when no rooms found', async () => {
      mockDatabaseService.prepare = jest.fn().mockReturnValue({
        all: jest.fn().mockReturnValue([]),
      });
      const result = await helper.queryRooms('game-1');
      expect(result).toEqual([]);
    });

    it('should parse environment data correctly', async () => {
      const environmentData = { lighting: 'dim', sound: 'quiet', temperature: 'cold' };
      mockDatabaseService.prepare = jest.fn().mockReturnValue({
        all: jest.fn().mockReturnValue([{
          id: 'room-1', game_id: 'game-1', name: 'Room 1', description: 'First room',
          long_description: 'Long', position_x: 0, position_y: 0, position_z: 0,
          width: 10, height: 10, depth: 3, environment_data: JSON.stringify(environmentData),
          version: 1, created_at: '2025-01-01T00:00:00.000Z',
        }]),
      });
      const result = await helper.queryRooms('game-1');
      expect(result[0].environmentData).toEqual(environmentData);
    });

    it('should handle null environment data', async () => {
      mockDatabaseService.prepare = jest.fn().mockReturnValue({
        all: jest.fn().mockReturnValue([{
          id: 'room-1', game_id: 'game-1', name: 'Room 1', description: 'First room',
          long_description: 'Long', position_x: 0, position_y: 0, position_z: 0,
          width: 10, height: 10, depth: 3, environment_data: null, version: 1,
          created_at: '2025-01-01T00:00:00.000Z',
        }]),
      });
      const result = await helper.queryRooms('game-1');
      expect(result[0].environmentData).toBeUndefined();
    });

    it('should correctly map all dimension fields', async () => {
      mockDatabaseService.prepare = jest.fn().mockReturnValue({
        all: jest.fn().mockReturnValue([{
          id: 'room-1', game_id: 'game-1', name: 'Large Room', description: 'Big',
          long_description: 'Very big', position_x: 0, position_y: 0, position_z: 0,
          width: 100, height: 50, depth: 25, environment_data: null, version: 1,
          created_at: '2025-01-01T00:00:00.000Z',
        }]),
      });
      const result = await helper.queryRooms('game-1');
      expect(result[0].width).toBe(100);
      expect(result[0].height).toBe(50);
      expect(result[0].depth).toBe(25);
    });
  });

  // ============================================================================
  // QUERY OBJECTS (5 tests)
  // ============================================================================
  describe('queryObjects', () => {
    it('should query and return objects with boolean conversions', async () => {
      mockDatabaseService.prepare = jest.fn().mockReturnValue({
        all: jest.fn().mockReturnValue([{
          id: 'object-1', game_id: 'game-1', name: 'Chest', description: 'A chest',
          object_type: 'container', position_x: 0, position_y: 0, position_z: 0,
          material: 'wood', material_properties: null, weight: 50, health: 100, max_health: 100,
          is_portable: 0, is_container: 1, can_contain: 1, container_capacity: 10,
          state_data: null, properties: null, version: 1, created_at: '2025-01-01T00:00:00.000Z',
        }]),
      });
      const result = await helper.queryObjects('game-1');
      expect(result[0].isPortable).toBe(false);
      expect(result[0].isContainer).toBe(true);
      expect(result[0].canContain).toBe(true);
    });

    it('should return empty array when no objects found', async () => {
      mockDatabaseService.prepare = jest.fn().mockReturnValue({
        all: jest.fn().mockReturnValue([]),
      });
      const result = await helper.queryObjects('game-1');
      expect(result).toEqual([]);
    });

    it('should parse material properties correctly', async () => {
      const materialProperties = { material: 'steel', density: 7.85, conductivity: 0.45 };
      mockDatabaseService.prepare = jest.fn().mockReturnValue({
        all: jest.fn().mockReturnValue([{
          id: 'object-1', game_id: 'game-1', name: 'Sword', description: 'Steel sword',
          object_type: 'weapon', position_x: 0, position_y: 0, position_z: 0, material: 'steel',
          material_properties: JSON.stringify(materialProperties), weight: 5, health: 100,
          max_health: 100, is_portable: 1, is_container: 0, can_contain: 0, container_capacity: 0,
          state_data: null, properties: null, version: 1, created_at: '2025-01-01T00:00:00.000Z',
        }]),
      });
      const result = await helper.queryObjects('game-1');
      expect(result[0].materialProperties).toEqual(materialProperties);
    });

    it('should parse state data and properties', async () => {
      const stateData = { isOpen: true, isLocked: false };
      const properties = { enchantment: 'fire', damage: 10 };
      mockDatabaseService.prepare = jest.fn().mockReturnValue({
        all: jest.fn().mockReturnValue([{
          id: 'object-1', game_id: 'game-1', name: 'Magic Sword', description: 'Enchanted',
          object_type: 'weapon', position_x: 0, position_y: 0, position_z: 0, material: 'steel',
          material_properties: null, weight: 5, health: 100, max_health: 100, is_portable: 1,
          is_container: 0, can_contain: 0, container_capacity: 0,
          state_data: JSON.stringify(stateData), properties: JSON.stringify(properties),
          version: 1, created_at: '2025-01-01T00:00:00.000Z',
        }]),
      });
      const result = await helper.queryObjects('game-1');
      expect(result[0].stateData).toEqual(stateData);
      expect(result[0].properties).toEqual(properties);
    });

    it('should handle null JSON fields', async () => {
      mockDatabaseService.prepare = jest.fn().mockReturnValue({
        all: jest.fn().mockReturnValue([{
          id: 'object-1', game_id: 'game-1', name: 'Simple', description: 'Simple object',
          object_type: 'item', position_x: 0, position_y: 0, position_z: 0, material: 'wood',
          material_properties: null, weight: 1, health: 100, max_health: 100, is_portable: 1,
          is_container: 0, can_contain: 0, container_capacity: 0, state_data: null,
          properties: null, version: 1, created_at: '2025-01-01T00:00:00.000Z',
        }]),
      });
      const result = await helper.queryObjects('game-1');
      expect(result[0].materialProperties).toBeUndefined();
      expect(result[0].stateData).toBeUndefined();
      expect(result[0].properties).toBeUndefined();
    });
  });

  // ============================================================================
  // QUERY NPCS (5 tests)
  // ============================================================================
  describe('queryNPCs', () => {
    it('should query and return NPCs with correct types', async () => {
      mockDatabaseService.prepare = jest.fn().mockReturnValue({
        all: jest.fn().mockReturnValue([{
          id: 'npc-1', game_id: 'game-1', name: 'Guard', description: 'Town guard',
          npc_type: 'npc', position_x: 10, position_y: 10, position_z: 0, health: 100,
          max_health: 100, level: 5, experience: 500, inventory_data: null,
          dialogue_tree_data: null, behavior_config: null, attributes: null, version: 1,
          created_at: '2025-01-01T00:00:00.000Z',
        }]),
      });
      const result = await helper.queryNPCs('game-1');
      expect(result).toHaveLength(1);
      expect(result[0].npcType).toBe('npc');
    });

    it('should return empty array when no NPCs found', async () => {
      mockDatabaseService.prepare = jest.fn().mockReturnValue({
        all: jest.fn().mockReturnValue([]),
      });
      const result = await helper.queryNPCs('game-1');
      expect(result).toEqual([]);
    });

    it('should parse inventory and dialogue data', async () => {
      const inventoryData = ['sword-1', 'shield-1'];
      const dialogueTreeData = { 'node-1': { text: 'Hello!', choices: [] } };
      mockDatabaseService.prepare = jest.fn().mockReturnValue({
        all: jest.fn().mockReturnValue([{
          id: 'npc-1', game_id: 'game-1', name: 'Merchant', description: 'Traveling merchant',
          npc_type: 'vendor', position_x: 10, position_y: 10, position_z: 0, health: 100,
          max_health: 100, level: 5, experience: 500,
          inventory_data: JSON.stringify(inventoryData),
          dialogue_tree_data: JSON.stringify(dialogueTreeData),
          behavior_config: null, attributes: null, version: 1, created_at: '2025-01-01T00:00:00.000Z',
        }]),
      });
      const result = await helper.queryNPCs('game-1');
      expect(result[0].inventoryData).toEqual(inventoryData);
      expect(result[0].dialogueTreeData).toEqual(dialogueTreeData);
    });

    it('should parse behavior config and attributes', async () => {
      const behaviorConfig = { movementPattern: 'patrol', aggressionLevel: 'defensive' };
      const attributes = { strength: 10, intelligence: 5 };
      mockDatabaseService.prepare = jest.fn().mockReturnValue({
        all: jest.fn().mockReturnValue([{
          id: 'npc-1', game_id: 'game-1', name: 'Guard', description: 'Town guard',
          npc_type: 'npc', position_x: 10, position_y: 10, position_z: 0, health: 100,
          max_health: 100, level: 5, experience: 500, inventory_data: null, dialogue_tree_data: null,
          behavior_config: JSON.stringify(behaviorConfig), attributes: JSON.stringify(attributes),
          version: 1, created_at: '2025-01-01T00:00:00.000Z',
        }]),
      });
      const result = await helper.queryNPCs('game-1');
      expect(result[0].behaviorConfig).toEqual(behaviorConfig);
      expect(result[0].attributes).toEqual(attributes);
    });

    it('should handle null JSON fields', async () => {
      mockDatabaseService.prepare = jest.fn().mockReturnValue({
        all: jest.fn().mockReturnValue([{
          id: 'npc-1', game_id: 'game-1', name: 'Simple NPC', description: 'Simple',
          npc_type: 'npc', position_x: 10, position_y: 10, position_z: 0, health: 100,
          max_health: 100, level: 1, experience: 0, inventory_data: null, dialogue_tree_data: null,
          behavior_config: null, attributes: null, version: 1, created_at: '2025-01-01T00:00:00.000Z',
        }]),
      });
      const result = await helper.queryNPCs('game-1');
      expect(result[0].inventoryData).toBeUndefined();
      expect(result[0].dialogueTreeData).toBeUndefined();
      expect(result[0].behaviorConfig).toBeUndefined();
      expect(result[0].attributes).toBeUndefined();
    });
  });

  // ============================================================================
  // QUERY CONNECTIONS (4 tests)
  // ============================================================================
  describe('queryConnections', () => {
    it('should query and return connections with locked status', async () => {
      mockDatabaseService.prepare = jest.fn().mockReturnValue({
        all: jest.fn().mockReturnValue([
          { id: 'conn-1', room_id: 'room-1', connected_room_id: 'room-2', direction: 'north',
            description: 'Unlocked door', is_locked: 0, required_key_id: null,
            created_at: '2025-01-01T00:00:00.000Z' },
          { id: 'conn-2', room_id: 'room-2', connected_room_id: 'room-3', direction: 'east',
            description: 'Locked door', is_locked: 1, required_key_id: 'key-1',
            created_at: '2025-01-01T00:00:00.000Z' },
        ]),
      });
      const result = await helper.queryConnections('game-1');
      expect(result).toHaveLength(2);
      expect(result[0].isLocked).toBe(false);
      expect(result[1].isLocked).toBe(true);
      expect(result[1].requiredKeyId).toBe('key-1');
    });

    it('should return empty array when no connections found', async () => {
      mockDatabaseService.prepare = jest.fn().mockReturnValue({
        all: jest.fn().mockReturnValue([]),
      });
      const result = await helper.queryConnections('game-1');
      expect(result).toEqual([]);
    });

    it('should use correct SQL join query', async () => {
      mockDatabaseService.prepare = jest.fn().mockReturnValue({
        all: jest.fn().mockReturnValue([]),
      });
      await helper.queryConnections('game-1');
      expect(mockDatabaseService.prepare).toHaveBeenCalledWith(
        expect.stringContaining('SELECT rc.* FROM room_connections rc'),
      );
      expect(mockDatabaseService.prepare).toHaveBeenCalledWith(
        expect.stringContaining('JOIN rooms r ON rc.room_id = r.id'),
      );
    });

    it('should handle null required key ID', async () => {
      mockDatabaseService.prepare = jest.fn().mockReturnValue({
        all: jest.fn().mockReturnValue([{
          id: 'conn-1', room_id: 'room-1', connected_room_id: 'room-2', direction: 'north',
          description: 'Open passage', is_locked: 0, required_key_id: null,
          created_at: '2025-01-01T00:00:00.000Z',
        }]),
      });
      const result = await helper.queryConnections('game-1');
      expect(result[0].requiredKeyId).toBeNull();
    });
  });

  // ============================================================================
  // EXPORT GAME CONFIG (4 tests)
  // ============================================================================
  describe('exportGameConfig', () => {
    it('should export game config excluding sensitive fields', async () => {
      const gameData = createMockGameData();
      await helper.exportGameConfig(gameData, '/export');

      expect(mockFileScannerService.writeFileContent).toHaveBeenCalledWith(
        '/export/game-config.json',
        expect.any(String),
      );

      const writtenContent = (mockFileScannerService.writeFileContent as jest.Mock).mock.calls[0][1];
      expect(writtenContent).toContain('"id": "game-1"');
      expect(writtenContent).toContain('"name": "Test Game"');
      expect(writtenContent).not.toContain('createdAt');
      expect(writtenContent).not.toContain('isActive');
    });

    it('should include metadata in export', async () => {
      const gameData = createMockGameData({
        metadata: { difficulty: 'hard', themes: ['fantasy'] },
      });
      await helper.exportGameConfig(gameData, '/export');
      const writtenContent = (mockFileScannerService.writeFileContent as jest.Mock).mock.calls[0][1];
      expect(writtenContent).toContain('"difficulty": "hard"');
      expect(writtenContent).toContain('"fantasy"');
    });

    it('should format JSON with 2-space indentation', async () => {
      const gameData = createMockGameData();
      await helper.exportGameConfig(gameData, '/export');
      const writtenContent = (mockFileScannerService.writeFileContent as jest.Mock).mock.calls[0][1];
      const parsed = JSON.parse(writtenContent);
      expect(writtenContent).toBe(JSON.stringify(parsed, null, 2));
    });

    it('should handle undefined metadata', async () => {
      const gameData = createMockGameData({ metadata: undefined });
      await helper.exportGameConfig(gameData, '/export');
      const writtenContent = (mockFileScannerService.writeFileContent as jest.Mock).mock.calls[0][1];
      const parsed = JSON.parse(writtenContent);
      expect(parsed.metadata).toBeUndefined();
    });
  });

  // ============================================================================
  // EXPORT ROOMS (4 tests)
  // ============================================================================
  describe('exportRooms', () => {
    it('should export multiple rooms with sanitized filenames', async () => {
      const rooms = [
        createMockRoomData({ id: 'Room With Spaces', name: 'Room 1' }),
        createMockRoomData({ id: 'Room@Special#Chars', name: 'Room 2' }),
      ];
      await helper.exportRooms(rooms, '/export');

      expect(mockFileScannerService.writeFileContent).toHaveBeenCalledTimes(2);
      expect(mockFileScannerService.writeFileContent).toHaveBeenCalledWith(
        '/export/rooms/room-with-spaces.json',
        expect.any(String),
      );
      expect(mockFileScannerService.writeFileContent).toHaveBeenCalledWith(
        '/export/rooms/room-special-chars.json',
        expect.any(String),
      );
    });

    it('should handle empty room array', async () => {
      await helper.exportRooms([], '/export');
      expect(mockFileScannerService.writeFileContent).not.toHaveBeenCalled();
    });

    it('should convert field names to snake_case and include environment', async () => {
      const rooms = [
        createMockRoomData({
          id: 'room-1',
          longDescription: 'Very long',
          environmentData: { lighting: 'bright', sound: 'loud' },
        }),
      ];
      await helper.exportRooms(rooms, '/export');
      const content = (mockFileScannerService.writeFileContent as jest.Mock).mock.calls[0][1];
      expect(content).toContain('"long_description"');
      expect(content).toContain('"lighting": "bright"');
      expect(content).not.toContain('"longDescription"');
    });

    it('should include size object with dimensions', async () => {
      const rooms = [createMockRoomData({ width: 100, height: 50, depth: 25 })];
      await helper.exportRooms(rooms, '/export');
      const content = (mockFileScannerService.writeFileContent as jest.Mock).mock.calls[0][1];
      const parsed = JSON.parse(content);
      expect(parsed.size).toEqual({ width: 100, height: 50, depth: 25 });
    });
  });

  // ============================================================================
  // EXPORT OBJECTS (3 tests)
  // ============================================================================
  describe('exportObjects', () => {
    it('should export objects with snake_case field names', async () => {
      const objects = [
        createMockObjectData({
          objectType: 'weapon',
          isPortable: true,
          maxHealth: 100,
          materialProperties: { material: 'steel', density: 7.85 },
        }),
      ];
      await helper.exportObjects(objects, '/export');
      const content = (mockFileScannerService.writeFileContent as jest.Mock).mock.calls[0][1];
      expect(content).toContain('"object_type"');
      expect(content).toContain('"is_portable"');
      expect(content).toContain('"max_health"');
      expect(content).toContain('"material_properties"');
    });

    it('should handle empty object array', async () => {
      await helper.exportObjects([], '/export');
      expect(mockFileScannerService.writeFileContent).not.toHaveBeenCalled();
    });

    it('should include state data and properties', async () => {
      const objects = [
        createMockObjectData({
          stateData: { isOpen: true },
          properties: { enchantment: 'fire' },
        }),
      ];
      await helper.exportObjects(objects, '/export');
      const content = (mockFileScannerService.writeFileContent as jest.Mock).mock.calls[0][1];
      expect(content).toContain('"state_data"');
      expect(content).toContain('"isOpen": true');
      expect(content).toContain('"enchantment": "fire"');
    });
  });

  // ============================================================================
  // EXPORT NPCS (3 tests)
  // ============================================================================
  describe('exportNPCs', () => {
    it('should export NPCs with snake_case field names', async () => {
      const npcs = [
        createMockNPCData({
          npcType: 'vendor',
          maxHealth: 100,
          inventoryData: ['sword-1'],
          dialogueTreeData: { 'node-1': { text: 'Hello!', choices: [] } },
        }),
      ];
      await helper.exportNPCs(npcs, '/export');
      const content = (mockFileScannerService.writeFileContent as jest.Mock).mock.calls[0][1];
      expect(content).toContain('"npc_type"');
      expect(content).toContain('"max_health"');
      expect(content).toContain('"inventory_data"');
      expect(content).toContain('"dialogue_tree_data"');
    });

    it('should handle empty NPC array', async () => {
      await helper.exportNPCs([], '/export');
      expect(mockFileScannerService.writeFileContent).not.toHaveBeenCalled();
    });

    it('should include behavior config and attributes', async () => {
      const npcs = [
        createMockNPCData({
          behaviorConfig: { movementPattern: 'patrol' },
          attributes: { strength: 10 },
        }),
      ];
      await helper.exportNPCs(npcs, '/export');
      const content = (mockFileScannerService.writeFileContent as jest.Mock).mock.calls[0][1];
      expect(content).toContain('"behavior_config"');
      expect(content).toContain('"movementPattern": "patrol"');
      expect(content).toContain('"strength": 10');
    });
  });

  // ============================================================================
  // EXPORT CONNECTIONS (3 tests)
  // ============================================================================
  describe('exportConnections', () => {
    it('should export all connections to single file with snake_case', async () => {
      const connections = [
        createMockConnection({
          roomId: 'room-1',
          connectedRoomId: 'room-2',
          isLocked: true,
          requiredKeyId: 'key-1',
        }),
      ];
      await helper.exportConnections(connections, '/export');

      expect(mockFileScannerService.writeFileContent).toHaveBeenCalledWith(
        '/export/connections.json',
        expect.any(String),
      );
      const content = (mockFileScannerService.writeFileContent as jest.Mock).mock.calls[0][1];
      expect(content).toContain('"from_room"');
      expect(content).toContain('"to_room"');
      expect(content).toContain('"is_locked"');
      expect(content).toContain('"required_key"');
    });

    it('should handle empty connections array', async () => {
      await helper.exportConnections([], '/export');
      const content = (mockFileScannerService.writeFileContent as jest.Mock).mock.calls[0][1];
      const parsed = JSON.parse(content);
      expect(parsed.connections).toEqual([]);
    });

    it('should set required_key to null when not specified', async () => {
      const connections = [createMockConnection({ requiredKeyId: null })];
      await helper.exportConnections(connections, '/export');
      const content = (mockFileScannerService.writeFileContent as jest.Mock).mock.calls[0][1];
      expect(content).toContain('"required_key": null');
    });
  });
});
