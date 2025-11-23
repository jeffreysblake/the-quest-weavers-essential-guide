import { Test, TestingModule } from '@nestjs/testing';
import { EntityConverterHelper } from './entity-converter.helper';
import {
  GameData,
  RoomData,
  ObjectData,
  NPCData,
  RoomConnection,
} from '../../database/database.interfaces';

describe('EntityConverterHelper', () => {
  let helper: EntityConverterHelper;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EntityConverterHelper],
    }).compile();

    helper = module.get<EntityConverterHelper>(EntityConverterHelper);
  });

  describe('convertToGameData', () => {
    it('should convert raw config with all fields', () => {
      const rawConfig = {
        id: 'game-1',
        name: 'Test Game',
        description: 'A test game',
        version: 2,
        metadata: { difficulty: 'medium', estimatedPlaytime: '2 hours' },
      };

      const result = helper.convertToGameData(rawConfig);

      expect(result).toMatchObject({
        id: 'game-1',
        name: 'Test Game',
        description: 'A test game',
        version: 2,
        metadata: rawConfig.metadata,
        isActive: true,
      });
      expect(result.createdAt).toBeDefined();
      expect(result.updatedAt).toBeDefined();
    });

    it('should use default version 1 and handle missing fields', () => {
      const result = helper.convertToGameData({ id: 'g1', name: 'Game' });
      expect(result.version).toBe(1);
      expect(result.description).toBeUndefined();
    });

    it('should set timestamps to valid ISO format', () => {
      const result = helper.convertToGameData({ id: 'g1', name: 'Test' });
      expect(() => new Date(result.createdAt)).not.toThrow();
      expect(() => new Date(result.updatedAt)).not.toThrow();
    });
  });

  describe('convertToRoomData', () => {
    it('should convert raw room with all fields', () => {
      const rawRoom = {
        id: 'room-1',
        name: 'Test Room',
        description: 'Short desc',
        long_description: 'Long description',
        position: { x: 10, y: 20, z: 30 },
        size: { width: 15, height: 12, depth: 5 },
        environment: { lighting: 'dim', sound: 'quiet' },
      };

      const result = helper.convertToRoomData(rawRoom, 'game-1');

      expect(result).toMatchObject({
        id: 'room-1',
        gameId: 'game-1',
        name: 'Test Room',
        description: 'Short desc',
        longDescription: 'Long description',
        position: { x: 10, y: 20, z: 30 },
        width: 15,
        height: 12,
        depth: 5,
        environmentData: rawRoom.environment,
        version: 1,
      });
      expect(result.createdAt).toBeDefined();
    });

    it('should use defaults for missing position and dimensions', () => {
      const result = helper.convertToRoomData({ id: 'r1', name: 'Room' }, 'g1');
      expect(result.position).toEqual({ x: 0, y: 0, z: 0 });
      expect(result.width).toBe(10);
      expect(result.height).toBe(10);
      expect(result.depth).toBe(3);
    });

    it('should prefer size object over individual dimensions', () => {
      const rawRoom = {
        id: 'r1',
        name: 'Room',
        width: 20,
        height: 25,
        size: { width: 15, height: 12, depth: 5 },
      };
      const result = helper.convertToRoomData(rawRoom, 'g1');
      expect(result.width).toBe(15);
      expect(result.height).toBe(12);
      expect(result.depth).toBe(5);
    });

    it('should use individual dimensions when size object not present', () => {
      const result = helper.convertToRoomData(
        { id: 'r1', name: 'Room', width: 20, height: 25, depth: 4 },
        'g1',
      );
      expect(result.width).toBe(20);
      expect(result.height).toBe(25);
      expect(result.depth).toBe(4);
    });
  });

  describe('convertToObjectData', () => {
    it('should convert raw object with all fields', () => {
      const rawObject = {
        id: 'obj-1',
        name: 'Magic Sword',
        description: 'A powerful sword',
        object_type: 'weapon',
        position: { x: 5, y: 10, z: 2 },
        material: 'steel',
        material_properties: { material: 'steel', density: 7.8 },
        weight: 5,
        health: 100,
        max_health: 100,
        is_portable: true,
        is_container: false,
        can_contain: false,
        container_capacity: 0,
        state_data: { enchanted: true },
        properties: { damage: 50 },
      };

      const result = helper.convertToObjectData(rawObject, 'game-1');

      expect(result).toMatchObject({
        id: 'obj-1',
        gameId: 'game-1',
        name: 'Magic Sword',
        description: 'A powerful sword',
        objectType: 'weapon',
        position: { x: 5, y: 10, z: 2 },
        material: 'steel',
        materialProperties: rawObject.material_properties,
        weight: 5,
        health: 100,
        maxHealth: 100,
        isPortable: true,
        isContainer: false,
        canContain: false,
        containerCapacity: 0,
        stateData: { enchanted: true },
        properties: { damage: 50 },
        version: 1,
      });
    });

    it('should default isPortable to true when not specified', () => {
      const result = helper.convertToObjectData({ id: 'o1', name: 'Item', object_type: 'item' }, 'g1');
      expect(result.isPortable).toBe(true);
    });

    it('should accept is_portable field (snake_case)', () => {
      const result = helper.convertToObjectData(
        { id: 'o1', name: 'Statue', object_type: 'decoration', is_portable: false },
        'g1',
      );
      expect(result.isPortable).toBe(false);
    });

    it('should accept canTake field (legacy)', () => {
      const result = helper.convertToObjectData(
        { id: 'o1', name: 'Item', object_type: 'item', canTake: false },
        'g1',
      );
      expect(result.isPortable).toBe(false);
    });

    it('should accept isPortable field (camelCase)', () => {
      const result = helper.convertToObjectData(
        { id: 'o1', name: 'Item', object_type: 'item', isPortable: false },
        'g1',
      );
      expect(result.isPortable).toBe(false);
    });

    it('should prioritize isPortable over is_portable over canTake', () => {
      const result1 = helper.convertToObjectData(
        { id: 'o1', name: 'Item', object_type: 'item', isPortable: true, is_portable: false },
        'g1',
      );
      expect(result1.isPortable).toBe(true);

      const result2 = helper.convertToObjectData(
        { id: 'o2', name: 'Item', object_type: 'item', is_portable: true, canTake: false },
        'g1',
      );
      expect(result2.isPortable).toBe(true);

      const result3 = helper.convertToObjectData(
        { id: 'o3', name: 'Item', object_type: 'item', isPortable: true, canTake: false },
        'g1',
      );
      expect(result3.isPortable).toBe(true);
    });

    it('should use default values for missing fields', () => {
      const result = helper.convertToObjectData({ id: 'o1', name: 'Item', object_type: 'item' }, 'g1');
      expect(result.position).toEqual({ x: 0, y: 0, z: 0 });
      expect(result.weight).toBe(0);
      expect(result.isContainer).toBe(false);
      expect(result.canContain).toBe(false);
      expect(result.containerCapacity).toBe(0);
    });
  });

  describe('convertToNPCData', () => {
    it('should convert raw NPC with all fields', () => {
      const rawNpc = {
        id: 'npc-1',
        name: 'Guard',
        description: 'A town guard',
        npc_type: 'npc',
        position: { x: 5, y: 10, z: 0 },
        health: 150,
        max_health: 150,
        level: 5,
        experience: 500,
        inventory_data: ['sword-1', 'shield-1'],
        dialogue_tree_data: { greeting: { text: 'Hello!' } },
        behavior_config: { aggressive: false },
        attributes: { strength: 15 },
      };

      const result = helper.convertToNPCData(rawNpc, 'game-1');

      expect(result).toMatchObject({
        id: 'npc-1',
        gameId: 'game-1',
        name: 'Guard',
        description: 'A town guard',
        npcType: 'npc',
        position: { x: 5, y: 10, z: 0 },
        health: 150,
        maxHealth: 150,
        level: 5,
        experience: 500,
        inventoryData: ['sword-1', 'shield-1'],
        dialogueTreeData: { greeting: { text: 'Hello!' } },
        behaviorConfig: { aggressive: false },
        attributes: { strength: 15 },
        version: 1,
      });
    });

    it('should use default values for missing fields', () => {
      const result = helper.convertToNPCData({ id: 'n1', name: 'Villager' }, 'g1');
      expect(result.npcType).toBe('npc');
      expect(result.position).toEqual({ x: 0, y: 0, z: 0 });
      expect(result.health).toBe(100);
      expect(result.maxHealth).toBe(100);
      expect(result.level).toBe(1);
      expect(result.experience).toBe(0);
    });

    it('should use health as maxHealth when maxHealth not specified', () => {
      const result = helper.convertToNPCData({ id: 'n1', name: 'V', health: 75 }, 'g1');
      expect(result.health).toBe(75);
      expect(result.maxHealth).toBe(75);
    });
  });

  describe('convertToRoomConnection', () => {
    it('should convert raw connection with all fields', () => {
      const rawConnection = {
        from_room: 'room-1',
        to_room: 'room-2',
        direction: 'north',
        description: 'A wooden door',
        is_locked: true,
        required_key: 'key-1',
      };

      const result = helper.convertToRoomConnection(rawConnection, 0);

      expect(result).toMatchObject({
        id: 1,
        roomId: 'room-1',
        connectedRoomId: 'room-2',
        direction: 'north',
        description: 'A wooden door',
        isLocked: true,
        requiredKeyId: 'key-1',
      });
      expect(result.createdAt).toBeDefined();
    });

    it('should generate sequential IDs based on index', () => {
      const raw = { from_room: 'r1', to_room: 'r2', direction: 'north' };
      expect(helper.convertToRoomConnection(raw, 0).id).toBe(1);
      expect(helper.convertToRoomConnection(raw, 5).id).toBe(6);
    });

    it('should use default values for missing fields', () => {
      const result = helper.convertToRoomConnection(
        { from_room: 'r1', to_room: 'r2', direction: 'north' },
        0,
      );
      expect(result.isLocked).toBe(false);
      expect(result.requiredKeyId).toBeNull();
    });
  });

  describe('convertGameDataToFile', () => {
    it('should convert GameData to file format', () => {
      const gameData: GameData = {
        id: 'game-1',
        name: 'Test Game',
        description: 'A test game',
        version: 2,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-02T00:00:00.000Z',
        isActive: true,
        metadata: { difficulty: 'medium' },
      };

      const result = helper.convertGameDataToFile(gameData);

      expect(result).toEqual({
        id: 'game-1',
        name: 'Test Game',
        description: 'A test game',
        version: 2,
        metadata: { difficulty: 'medium' },
      });
    });

    it('should handle undefined optional fields', () => {
      const gameData: GameData = {
        id: 'game-1',
        name: 'Test Game',
        version: 1,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-02T00:00:00.000Z',
        isActive: true,
      };

      const result = helper.convertGameDataToFile(gameData);
      expect(result.description).toBeUndefined();
      expect(result.metadata).toBeUndefined();
    });
  });

  describe('convertRoomDataToFile', () => {
    it('should convert RoomData to file format with snake_case', () => {
      const roomData: RoomData = {
        id: 'room-1',
        gameId: 'game-1',
        name: 'Test Room',
        description: 'Short desc',
        longDescription: 'Long description',
        position: { x: 10, y: 20, z: 30 },
        width: 15,
        height: 12,
        depth: 5,
        environmentData: { lighting: 'dim' },
        version: 1,
        createdAt: '2025-01-01T00:00:00.000Z',
      };

      const result = helper.convertRoomDataToFile(roomData);

      expect(result).toEqual({
        id: 'room-1',
        name: 'Test Room',
        description: 'Short desc',
        long_description: 'Long description',
        position: { x: 10, y: 20, z: 30 },
        size: { width: 15, height: 12, depth: 5 },
        width: 15,
        height: 12,
        environment: { lighting: 'dim' },
      });
    });

    it('should preserve both size object and individual dimensions', () => {
      const roomData: RoomData = {
        id: 'room-1',
        gameId: 'game-1',
        name: 'Test Room',
        position: { x: 0, y: 0, z: 0 },
        width: 20,
        height: 25,
        depth: 4,
        version: 1,
        createdAt: '2025-01-01T00:00:00.000Z',
      };

      const result = helper.convertRoomDataToFile(roomData);
      expect(result.size).toEqual({ width: 20, height: 25, depth: 4 });
      expect(result.width).toBe(20);
      expect(result.height).toBe(25);
    });
  });

  describe('convertObjectDataToFile', () => {
    it('should convert ObjectData to file format with snake_case', () => {
      const objectData: ObjectData = {
        id: 'obj-1',
        gameId: 'game-1',
        name: 'Magic Sword',
        description: 'A powerful sword',
        objectType: 'weapon',
        position: { x: 5, y: 10, z: 2 },
        material: 'steel',
        materialProperties: { material: 'steel', density: 7.8, conductivity: 0.8, flammability: 0, brittleness: 0.3 },
        weight: 5,
        health: 100,
        maxHealth: 100,
        isPortable: true,
        isContainer: false,
        canContain: false,
        containerCapacity: 0,
        stateData: { enchanted: true },
        properties: { damage: 50 },
        version: 1,
        createdAt: '2025-01-01T00:00:00.000Z',
      };

      const result = helper.convertObjectDataToFile(objectData);

      expect(result).toEqual({
        id: 'obj-1',
        name: 'Magic Sword',
        description: 'A powerful sword',
        object_type: 'weapon',
        position: { x: 5, y: 10, z: 2 },
        material: 'steel',
        material_properties: objectData.materialProperties,
        weight: 5,
        health: 100,
        max_health: 100,
        is_portable: true,
        is_container: false,
        can_contain: false,
        container_capacity: 0,
        state_data: { enchanted: true },
        properties: { damage: 50 },
      });
    });

    it('should convert isPortable to is_portable (not canTake)', () => {
      const objectData: ObjectData = {
        id: 'obj-1',
        gameId: 'game-1',
        name: 'Heavy Statue',
        objectType: 'decoration',
        position: { x: 0, y: 0, z: 0 },
        weight: 100,
        isPortable: false,
        isContainer: false,
        canContain: false,
        containerCapacity: 0,
        version: 1,
        createdAt: '2025-01-01T00:00:00.000Z',
      };

      const result = helper.convertObjectDataToFile(objectData);
      expect(result.is_portable).toBe(false);
      expect(result.isPortable).toBeUndefined();
      expect(result.canTake).toBeUndefined();
    });
  });

  describe('convertNPCDataToFile', () => {
    it('should convert NPCData to file format with snake_case', () => {
      const npcData: NPCData = {
        id: 'npc-1',
        gameId: 'game-1',
        name: 'Guard',
        description: 'A town guard',
        npcType: 'npc',
        position: { x: 5, y: 10, z: 0 },
        health: 150,
        maxHealth: 150,
        level: 5,
        experience: 500,
        inventoryData: ['sword-1'],
        dialogueTreeData: { greeting: { text: 'Hello!' } },
        behaviorConfig: { aggressive: false },
        attributes: { strength: 15 },
        version: 1,
        createdAt: '2025-01-01T00:00:00.000Z',
      };

      const result = helper.convertNPCDataToFile(npcData);

      expect(result).toEqual({
        id: 'npc-1',
        name: 'Guard',
        description: 'A town guard',
        npc_type: 'npc',
        position: { x: 5, y: 10, z: 0 },
        health: 150,
        max_health: 150,
        level: 5,
        experience: 500,
        inventory_data: ['sword-1'],
        dialogue_tree_data: { greeting: { text: 'Hello!' } },
        behavior_config: { aggressive: false },
        attributes: { strength: 15 },
      });
    });
  });

  describe('convertRoomConnectionToFile', () => {
    it('should convert RoomConnection to file format with snake_case', () => {
      const connection: RoomConnection = {
        id: 1,
        roomId: 'room-1',
        connectedRoomId: 'room-2',
        direction: 'north',
        description: 'A wooden door',
        isLocked: true,
        requiredKeyId: 'key-1',
        createdAt: '2025-01-01T00:00:00.000Z',
      };

      const result = helper.convertRoomConnectionToFile(connection);

      expect(result).toEqual({
        from_room: 'room-1',
        to_room: 'room-2',
        direction: 'north',
        description: 'A wooden door',
        is_locked: true,
        required_key: 'key-1',
      });
    });

    it('should convert unlocked connection with null key', () => {
      const connection: RoomConnection = {
        id: 1,
        roomId: 'room-1',
        connectedRoomId: 'room-2',
        direction: 'south',
        isLocked: false,
        requiredKeyId: null,
        createdAt: '2025-01-01T00:00:00.000Z',
      };

      const result = helper.convertRoomConnectionToFile(connection);
      expect(result.is_locked).toBe(false);
      expect(result.required_key).toBeNull();
    });
  });

  describe('Bidirectional Conversions', () => {
    it('should maintain data integrity for GameData round-trip', () => {
      const raw = { id: 'g1', name: 'Game', description: 'Test', version: 2, metadata: { difficulty: 'hard' } };
      const data = helper.convertToGameData(raw);
      const back = helper.convertGameDataToFile(data);
      expect(back).toEqual(raw);
    });

    it('should maintain data integrity for RoomData round-trip', () => {
      const raw = {
        id: 'r1',
        name: 'Room',
        description: 'Short',
        long_description: 'Long',
        position: { x: 10, y: 20, z: 30 },
        size: { width: 15, height: 12, depth: 5 },
        environment: { lighting: 'dim' },
      };
      const data = helper.convertToRoomData(raw, 'g1');
      const back = helper.convertRoomDataToFile(data);
      expect(back).toMatchObject(raw);
    });

    it('should maintain data integrity for ObjectData round-trip', () => {
      const raw = {
        id: 'o1',
        name: 'Sword',
        description: 'A sword',
        object_type: 'weapon',
        position: { x: 5, y: 10, z: 2 },
        material: 'steel',
        weight: 5,
        is_portable: true,
        is_container: false,
        can_contain: false,
        container_capacity: 0,
      };
      const data = helper.convertToObjectData(raw, 'g1');
      const back = helper.convertObjectDataToFile(data);
      expect(back).toMatchObject(raw);
    });

    it('should maintain data integrity for NPCData round-trip', () => {
      const raw = {
        id: 'n1',
        name: 'Guard',
        description: 'A guard',
        npc_type: 'npc',
        position: { x: 5, y: 10, z: 0 },
        health: 150,
        max_health: 150,
        level: 5,
        experience: 500,
      };
      const data = helper.convertToNPCData(raw, 'g1');
      const back = helper.convertNPCDataToFile(data);
      expect(back).toEqual(raw);
    });

    it('should maintain data integrity for RoomConnection round-trip', () => {
      const raw = {
        from_room: 'r1',
        to_room: 'r2',
        direction: 'north',
        description: 'Door',
        is_locked: true,
        required_key: 'key-1',
      };
      const conn = helper.convertToRoomConnection(raw, 0);
      const back = helper.convertRoomConnectionToFile(conn);
      expect(back).toEqual(raw);
    });
  });
});
