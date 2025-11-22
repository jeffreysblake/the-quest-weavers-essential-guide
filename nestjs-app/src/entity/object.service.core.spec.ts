import { Test, TestingModule } from '@nestjs/testing';
import { ObjectService } from './object.service';
import { EntityService } from './entity.service';
import { DatabaseService } from '../database/database.service';
import { IObject, ISpatialRelationship } from './object.interface';
import { getDefaultMaterialProperties } from './material-properties';

describe('ObjectService - Core Operations', () => {
  let service: ObjectService;
  let mockEntityService: jest.Mocked<Partial<EntityService>>;
  let mockDatabaseService: jest.Mocked<Partial<DatabaseService>>;

  beforeEach(async () => {
    // Create mock entity service with entities map
    mockEntityService = {
      entities: new Map(),
      getEntity: jest.fn(),
      updateEntity: jest.fn().mockResolvedValue(true),
      createEntity: jest.fn(),
    };

    // Create mock database service
    mockDatabaseService = {
      transaction: jest.fn(),
      prepare: jest.fn(),
      saveVersion: jest.fn().mockResolvedValue(1),
      getVersion: jest.fn(),
      rollbackToVersion: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ObjectService,
        { provide: EntityService, useValue: mockEntityService },
        { provide: DatabaseService, useValue: mockDatabaseService },
      ],
    }).compile();

    service = module.get<ObjectService>(ObjectService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Object Creation', () => {
    it('should create an object with basic properties', () => {
      const objectData = {
        name: 'Test Sword',
        description: 'A sharp blade',
        objectType: 'weapon' as const,
        position: { x: 0, y: 0, z: 0 },
      };

      const result = service.createObject(objectData);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.name).toBe('Test Sword');
      expect(result.type).toBe('object');
      expect(result.isPortable).toBe(true); // Default value
    });

    it('should create object with custom ID', () => {
      const customId = 'custom-sword-123';
      const objectData = {
        id: customId,
        name: 'Custom Sword',
        objectType: 'weapon' as const,
        position: { x: 0, y: 0, z: 0 },
      };

      const result = service.createObject(objectData);

      expect(result.id).toBe(customId);
      expect(result.name).toBe('Custom Sword');
    });

    it('should auto-generate material properties from material', () => {
      const objectData = {
        name: 'Wooden Shield',
        objectType: 'weapon' as const,
        material: 'wood',
        position: { x: 0, y: 0, z: 0 },
      };

      const result = service.createObject(objectData);

      expect(result.materialProperties).toBeDefined();
      expect(result.materialProperties?.material).toBe('wood');
      expect(result.materialProperties?.flammability).toBe(7);
      expect(result.materialProperties?.density).toBe(0.6);
    });

    it('should use provided material properties over auto-generation', () => {
      const customProps = {
        material: 'wood',
        density: 2.0,
        conductivity: 5,
        flammability: 1,
        brittleness: 1,
        resistances: { fire: 10 },
      };

      const objectData = {
        name: 'Magic Wood',
        objectType: 'item' as const,
        material: 'wood',
        materialProperties: customProps,
        position: { x: 0, y: 0, z: 0 },
      };

      const result = service.createObject(objectData);

      expect(result.materialProperties).toEqual(customProps);
      expect(result.materialProperties?.density).toBe(2.0); // Custom, not default 0.6
    });

    it('should initialize container with empty containedObjects array', () => {
      const objectData = {
        name: 'Chest',
        objectType: 'container' as const,
        isContainer: true,
        canContain: true,
        containerCapacity: 10,
        position: { x: 0, y: 0, z: 0 },
      };

      const result = service.createObject(objectData);

      expect(result.containedObjects).toEqual([]);
      expect(result.isContainer).toBe(true);
      expect(result.canContain).toBe(true);
    });

    it('should set isPortable to false when specified', () => {
      const objectData = {
        name: 'Heavy Table',
        objectType: 'furniture' as const,
        isPortable: false,
        position: { x: 0, y: 0, z: 0 },
      };

      const result = service.createObject(objectData);

      expect(result.isPortable).toBe(false);
    });
  });

  describe('Cache Synchronization', () => {
    it('should store object in local cache', () => {
      const objectData = {
        name: 'Test Item',
        objectType: 'item' as const,
        position: { x: 0, y: 0, z: 0 },
      };

      const result = service.createObject(objectData);

      expect(service.getObject(result.id)).toBe(result);
    });

    it('should register object in EntityService', () => {
      const objectData = {
        name: 'Test Item',
        objectType: 'item' as const,
        position: { x: 0, y: 0, z: 0 },
      };

      const result = service.createObject(objectData);

      expect(mockEntityService.entities?.has(result.id)).toBe(true);
      expect(mockEntityService.entities?.get(result.id)).toBe(result);
    });

    it('should handle EntityService registration failure gracefully', () => {
      // Simulate missing entities map
      mockEntityService.entities = undefined;

      const objectData = {
        name: 'Test Item',
        objectType: 'item' as const,
        position: { x: 0, y: 0, z: 0 },
      };

      // Should not throw error
      const result = service.createObject(objectData);

      expect(result).toBeDefined();
      expect(service.getObject(result.id)).toBe(result);
    });

    it('should sync object to EntityService when loaded from database', async () => {
      const mockObjectRow = {
        id: 'obj-1',
        name: 'DB Object',
        description: 'From database',
        object_type: 'item',
        position_x: 5,
        position_y: 10,
        position_z: 0,
        material: 'metal',
        material_properties: JSON.stringify({
          material: 'metal',
          density: 7.85,
          conductivity: 8,
          flammability: 0,
          brittleness: 3,
        }),
        weight: 10,
        health: 100,
        max_health: 100,
        is_portable: 1,
        is_container: 0,
        can_contain: 0,
        container_capacity: 0,
        state_data: null,
        properties: '{}',
        game_id: 'test-game',
      };

      const mockGet = jest.fn().mockReturnValue(mockObjectRow);
      const mockPrepare = jest.fn().mockReturnValue({ get: mockGet });
      mockDatabaseService.prepare = mockPrepare;

      const result = await service.getObjectWithFallback('obj-1', 'test-game');

      expect(result).toBeDefined();
      expect(result?.name).toBe('DB Object');
      expect(service['objects'].has('obj-1')).toBe(true);
      expect(mockEntityService.entities?.has('obj-1')).toBe(true);
    });

    it('should handle EntityService sync failure when loading from database', async () => {
      mockEntityService.entities = undefined;

      const mockObjectRow = {
        id: 'obj-1',
        name: 'DB Object',
        object_type: 'item',
        position_x: 0,
        position_y: 0,
        position_z: 0,
        is_portable: 1,
        is_container: 0,
        can_contain: 0,
        properties: '{}',
        game_id: 'test-game',
      };

      const mockGet = jest.fn().mockReturnValue(mockObjectRow);
      mockDatabaseService.prepare = jest.fn().mockReturnValue({ get: mockGet });

      const result = await service.getObjectWithFallback('obj-1', 'test-game');

      expect(result).toBeDefined();
      expect(service['objects'].has('obj-1')).toBe(true);
    });
  });

  describe('Object Retrieval', () => {
    it('should get object from local cache first', () => {
      const object: IObject = {
        id: 'obj-1',
        name: 'Cached Object',
        type: 'object',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        properties: {},
        containedObjects: [],
        canContain: false,
        isContainer: false,
        isPortable: true,
      };

      service['objects'].set('obj-1', object);

      const result = service.getObject('obj-1');

      expect(result).toBe(object);
      expect(mockEntityService.getEntity).not.toHaveBeenCalled();
    });

    it('should fallback to EntityService if not in cache', () => {
      const object: IObject = {
        id: 'obj-1',
        name: 'Entity Object',
        type: 'object',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        properties: {},
        containedObjects: [],
        canContain: false,
        isContainer: false,
        isPortable: true,
      };

      mockEntityService.getEntity = jest.fn().mockReturnValue(object);

      const result = service.getObject('obj-1');

      expect(result).toBe(object);
      expect(mockEntityService.getEntity).toHaveBeenCalledWith('obj-1');
    });

    it('should return undefined if object not found anywhere', () => {
      mockEntityService.getEntity = jest.fn().mockReturnValue(null);

      const result = service.getObject('nonexistent');

      expect(result).toBeUndefined();
    });

    it('should load object from database with getObjectWithFallback', async () => {
      mockEntityService.getEntity = jest.fn().mockReturnValue(null);

      const mockObjectRow = {
        id: 'obj-1',
        name: 'Database Object',
        object_type: 'item',
        position_x: 0,
        position_y: 0,
        position_z: 0,
        is_portable: 1,
        is_container: 0,
        can_contain: 0,
        properties: '{}',
        game_id: 'test-game',
      };

      const mockGet = jest.fn().mockReturnValue(mockObjectRow);
      mockDatabaseService.prepare = jest.fn().mockReturnValue({ get: mockGet });

      const result = await service.getObjectWithFallback('obj-1', 'test-game');

      expect(result).toBeDefined();
      expect(result?.name).toBe('Database Object');
    });
  });

  describe('Cache Management', () => {
    it('should clear all cached objects', () => {
      // Create multiple objects
      service.createObject({
        name: 'Object 1',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      service.createObject({
        name: 'Object 2',
        objectType: 'item',
        position: { x: 1, y: 1, z: 0 },
      });

      expect(service['objects'].size).toBeGreaterThan(0);

      service.clearCache();

      expect(service['objects'].size).toBe(0);
    });

    it('should remove specific object from cache', () => {
      const obj = service.createObject({
        name: 'Test Object',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      expect(service['objects'].has(obj.id)).toBe(true);

      service.removeFromCache(obj.id);

      expect(service['objects'].has(obj.id)).toBe(false);
    });

    it('should get all cached objects', () => {
      const obj1 = service.createObject({
        name: 'Object 1',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      const obj2 = service.createObject({
        name: 'Object 2',
        objectType: 'weapon',
        position: { x: 1, y: 1, z: 0 },
      });

      const allObjects = service.getAllObjects();

      expect(allObjects).toHaveLength(2);
      expect(allObjects).toContainEqual(obj1);
      expect(allObjects).toContainEqual(obj2);
    });

    it('should get objects by type', () => {
      service.createObject({
        name: 'Sword',
        objectType: 'weapon',
        position: { x: 0, y: 0, z: 0 },
      });

      service.createObject({
        name: 'Coin',
        objectType: 'item',
        position: { x: 1, y: 1, z: 0 },
      });

      service.createObject({
        name: 'Axe',
        objectType: 'weapon',
        position: { x: 2, y: 2, z: 0 },
      });

      const weapons = service.getObjectsByType('weapon');

      expect(weapons).toHaveLength(2);
      expect(weapons.every((obj) => obj.objectType === 'weapon')).toBe(true);
    });

    it('should handle cache operations on empty cache', () => {
      service.clearCache();

      expect(service.getAllObjects()).toEqual([]);
      expect(service.getObjectsByType('item')).toEqual([]);

      // Should not throw
      service.removeFromCache('nonexistent-id');
    });
  });

  describe('Object Updates', () => {
    it('should update object properties', async () => {
      const obj = service.createObject({
        name: 'Original Name',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      const updates = {
        name: 'Updated Name',
        description: 'New description',
      };

      const result = await service.updateObject(obj.id, updates);

      expect(result).toBe(true);
      expect(obj.name).toBe('Updated Name');
      expect(obj.description).toBe('New description');
    });

    it('should update object position', async () => {
      const obj = service.createObject({
        name: 'Test Object',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      const newPosition = { x: 10, y: 20, z: 5 };
      const result = await service.updateObject(obj.id, { position: newPosition });

      expect(result).toBe(true);
      expect(obj.position).toEqual(newPosition);
    });

    it('should sync updates to EntityService', async () => {
      const obj = service.createObject({
        name: 'Test Object',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      await service.updateObject(obj.id, { name: 'Updated' });

      expect(mockEntityService.updateEntity).toHaveBeenCalledWith(obj.id, expect.any(Object));
    });

    it('should return false for nonexistent object', async () => {
      const result = await service.updateObject('nonexistent', { name: 'Test' });

      expect(result).toBe(false);
    });
  });

  describe('Compatibility Methods', () => {
    it('should get object using getObjectById', () => {
      const obj = service.createObject({
        name: 'Test Object',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      const result = service.getObjectById(obj.id);

      expect(result).toBe(obj);
    });

    it('should check if object exists with hasObject', () => {
      const obj = service.createObject({
        name: 'Test Object',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      expect(service.hasObject(obj.id)).toBe(true);
      expect(service.hasObject('nonexistent')).toBe(false);
    });

    it('should get object count', () => {
      service.createObject({
        name: 'Object 1',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      service.createObject({
        name: 'Object 2',
        objectType: 'item',
        position: { x: 1, y: 1, z: 0 },
      });

      expect(service.getObjectCount()).toBe(2);
    });

    it('should delete object using deleteObject', async () => {
      const obj = service.createObject({
        name: 'Test Object',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      const result = await service.deleteObject(obj.id);

      expect(result).toBe(true);
      expect(service.hasObject(obj.id)).toBe(false);
    });
  });
});
