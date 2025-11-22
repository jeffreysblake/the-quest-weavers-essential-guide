import { Test, TestingModule } from '@nestjs/testing';
import { ObjectService } from './object.service';
import { EntityService } from './entity.service';
import { DatabaseService } from '../database/database.service';
import { IObject, ISpatialRelationship } from './object.interface';
import { getDefaultMaterialProperties } from './material-properties';

describe('ObjectService', () => {
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

  describe('Spatial Relationships', () => {
    let container: IObject;
    let item: IObject;

    beforeEach(() => {
      container = service.createObject({
        name: 'Chest',
        objectType: 'container',
        isContainer: true,
        canContain: true,
        containerCapacity: 10,
        position: { x: 0, y: 0, z: 0 },
        state: { isOpen: true },
      });

      item = service.createObject({
        name: 'Coin',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });
    });

    it('should place object inside container', async () => {
      mockEntityService.getEntity = jest.fn((id) => {
        if (id === container.id) return container;
        if (id === item.id) return item;
        return null;
      });

      const relationship: ISpatialRelationship = {
        relationshipType: 'inside',
        targetId: container.id,
        description: 'The coin is in the chest',
      };

      const result = await service.placeObject(item.id, relationship);

      expect(result).toBe(true);
      expect(item.spatialRelationship).toEqual(relationship);
      expect(container.containedObjects).toContain(item.id);
    });

    it('should place object on_top_of furniture', async () => {
      const table = service.createObject({
        name: 'Table',
        objectType: 'furniture',
        position: { x: 0, y: 0, z: 0 },
      });

      const book = service.createObject({
        name: 'Book',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      mockEntityService.getEntity = jest.fn((id) => {
        if (id === table.id) return table;
        if (id === book.id) return book;
        return null;
      });

      const relationship: ISpatialRelationship = {
        relationshipType: 'on_top_of',
        targetId: table.id,
      };

      const result = await service.placeObject(book.id, relationship);

      expect(result).toBe(true);
      expect(book.spatialRelationship).toEqual(relationship);
    });

    it('should place object next_to another object', async () => {
      const chair = service.createObject({
        name: 'Chair',
        objectType: 'furniture',
        position: { x: 0, y: 0, z: 0 },
      });

      const lamp = service.createObject({
        name: 'Lamp',
        objectType: 'item',
        position: { x: 1, y: 0, z: 0 },
      });

      mockEntityService.getEntity = jest.fn((id) => {
        if (id === chair.id) return chair;
        if (id === lamp.id) return lamp;
        return null;
      });

      const relationship: ISpatialRelationship = {
        relationshipType: 'next_to',
        targetId: chair.id,
      };

      const result = await service.placeObject(lamp.id, relationship);

      expect(result).toBe(true);
      expect(lamp.spatialRelationship).toEqual(relationship);
    });

    it('should place object underneath another object', async () => {
      const bed = service.createObject({
        name: 'Bed',
        objectType: 'furniture',
        position: { x: 0, y: 0, z: 0 },
      });

      const box = service.createObject({
        name: 'Storage Box',
        objectType: 'container',
        position: { x: 0, y: 0, z: 0 },
      });

      mockEntityService.getEntity = jest.fn((id) => {
        if (id === bed.id) return bed;
        if (id === box.id) return box;
        return null;
      });

      const relationship: ISpatialRelationship = {
        relationshipType: 'underneath',
        targetId: bed.id,
      };

      const result = await service.placeObject(box.id, relationship);

      expect(result).toBe(true);
      expect(box.spatialRelationship).toEqual(relationship);
    });

    it('should place object attached_to another object', async () => {
      const wall = service.createObject({
        name: 'Wall',
        objectType: 'furniture',
        position: { x: 0, y: 0, z: 0 },
      });

      const painting = service.createObject({
        name: 'Painting',
        objectType: 'item',
        position: { x: 0, y: 1, z: 0 },
      });

      mockEntityService.getEntity = jest.fn((id) => {
        if (id === wall.id) return wall;
        if (id === painting.id) return painting;
        return null;
      });

      const relationship: ISpatialRelationship = {
        relationshipType: 'attached_to',
        targetId: wall.id,
      };

      const result = await service.placeObject(painting.id, relationship);

      expect(result).toBe(true);
      expect(painting.spatialRelationship).toEqual(relationship);
    });

    it('should reject placement in closed container', async () => {
      container.state = { isOpen: false };
      mockEntityService.getEntity = jest.fn((id) => {
        if (id === container.id) return container;
        if (id === item.id) return item;
        return null;
      });

      const relationship: ISpatialRelationship = {
        relationshipType: 'inside',
        targetId: container.id,
      };

      const result = await service.placeObject(item.id, relationship);

      expect(result).toBe(false);
    });

    it('should reject placement in locked container', async () => {
      container.state = { isLocked: true, isOpen: true };
      mockEntityService.getEntity = jest.fn((id) => {
        if (id === container.id) return container;
        if (id === item.id) return item;
        return null;
      });

      const relationship: ISpatialRelationship = {
        relationshipType: 'inside',
        targetId: container.id,
      };

      const result = await service.placeObject(item.id, relationship);

      expect(result).toBe(false);
    });

    it('should reject placement on_top_of non-furniture', async () => {
      mockEntityService.getEntity = jest.fn((id) => {
        if (id === item.id) return item;
        return container; // Container is not furniture
      });

      const relationship: ISpatialRelationship = {
        relationshipType: 'on_top_of',
        targetId: container.id,
      };

      const result = await service.placeObject(item.id, relationship);

      expect(result).toBe(false);
    });

    it('should get spatial relationships for object', () => {
      const relationship: ISpatialRelationship = {
        relationshipType: 'inside',
        targetId: container.id,
      };

      item.spatialRelationship = relationship;
      service['objects'].set(item.id, item);

      const relationships = service.getSpatialRelationships(item.id);

      expect(relationships).toHaveLength(1);
      expect(relationships[0]).toEqual(relationship);
    });

    it('should return empty array for object without relationships', () => {
      const relationships = service.getSpatialRelationships(item.id);

      expect(relationships).toHaveLength(0);
    });

    it('should get object location description', () => {
      const relationship: ISpatialRelationship = {
        relationshipType: 'inside',
        targetId: container.id,
        description: 'The coin glitters inside the chest',
      };

      item.spatialRelationship = relationship;
      service['objects'].set(item.id, item);

      const location = service.getObjectLocation(item.id);

      expect(location).toBe('The coin glitters inside the chest');
    });

    it('should generate location description from relationship', () => {
      const relationship: ISpatialRelationship = {
        relationshipType: 'on_top_of',
        targetId: container.id,
      };

      item.spatialRelationship = relationship;
      service['objects'].set(item.id, item);
      mockEntityService.getEntity = jest.fn().mockReturnValue(container);

      const location = service.getObjectLocation(item.id);

      expect(location).toContain('Coin');
      expect(location).toContain('on top'); // Note: only first underscore is replaced
      expect(location).toContain('Chest');
    });
  });

  describe('Container Operations', () => {
    let container: IObject;

    beforeEach(() => {
      container = service.createObject({
        name: 'Backpack',
        objectType: 'container',
        isContainer: true,
        canContain: true,
        containerCapacity: 3,
        position: { x: 0, y: 0, z: 0 },
        state: { isOpen: true },
      });
    });

    it('should respect container capacity', async () => {
      // Fill container to capacity
      const item1 = service.createObject({
        name: 'Item 1',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });
      const item2 = service.createObject({
        name: 'Item 2',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });
      const item3 = service.createObject({
        name: 'Item 3',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });
      const item4 = service.createObject({
        name: 'Item 4',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      container.containedObjects = [item1.id, item2.id, item3.id];

      mockEntityService.getEntity = jest.fn((id) => {
        if (id === container.id) return container;
        if (id === item4.id) return item4;
        return null;
      });

      const relationship: ISpatialRelationship = {
        relationshipType: 'inside',
        targetId: container.id,
      };

      const result = await service.placeObject(item4.id, relationship);

      expect(result).toBe(false); // Container is full
    });

    it('should remove object from container', async () => {
      const item = service.createObject({
        name: 'Item',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        spatialRelationship: {
          relationshipType: 'inside',
          targetId: container.id,
        },
      });

      container.containedObjects = [item.id];
      service['objects'].set(container.id, container);

      const result = await service.removeObjectFromContainer(
        item.id,
        container.id,
      );

      expect(result).toBe(true);
      expect(container.containedObjects).not.toContain(item.id);
      expect(item.spatialRelationship).toBeUndefined();
    });

    it('should get objects in container', () => {
      const item1 = service.createObject({
        name: 'Item 1',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });
      const item2 = service.createObject({
        name: 'Item 2',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      container.containedObjects = [item1.id, item2.id];

      const items = service.getObjectsInContainer(container.id);

      expect(items).toHaveLength(2);
      expect(items[0].name).toBe('Item 1');
      expect(items[1].name).toBe('Item 2');
    });

    it('should return empty array for non-container', () => {
      const nonContainer = service.createObject({
        name: 'Regular Item',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      const items = service.getObjectsInContainer(nonContainer.id);

      expect(items).toEqual([]);
    });

    it('should handle nested containers', async () => {
      const outerContainer = service.createObject({
        name: 'Outer Container',
        objectType: 'container',
        isContainer: true,
        canContain: true,
        containerCapacity: 5,
        state: { isOpen: true },
        position: { x: 0, y: 0, z: 0 },
      });

      const innerContainer = service.createObject({
        name: 'Inner Container',
        objectType: 'container',
        isContainer: true,
        canContain: true,
        containerCapacity: 3,
        state: { isOpen: true },
        position: { x: 0, y: 0, z: 0 },
      });

      mockEntityService.getEntity = jest.fn((id) => {
        if (id === outerContainer.id) return outerContainer;
        if (id === innerContainer.id) return innerContainer;
        return null;
      });

      const relationship: ISpatialRelationship = {
        relationshipType: 'inside',
        targetId: outerContainer.id,
      };

      const result = await service.placeObject(innerContainer.id, relationship);

      expect(result).toBe(true);
      expect(outerContainer.containedObjects).toContain(innerContainer.id);
    });
  });

  describe('Batch Loading (N+1 Prevention)', () => {
    it('should load multiple objects in single batch query', async () => {
      const objectIds = ['obj-1', 'obj-2', 'obj-3'];

      const mockObjectRows = objectIds.map((id, index) => ({
        id,
        name: `Object ${index + 1}`,
        object_type: 'item',
        position_x: index,
        position_y: index,
        position_z: 0,
        is_portable: 1,
        is_container: 0,
        can_contain: 0,
        properties: '{}',
        game_id: 'test-game',
      }));

      const mockAll = jest.fn().mockReturnValue(mockObjectRows);
      const mockPrepare = jest
        .fn()
        .mockReturnValueOnce({ all: mockAll }) // For objects query
        .mockReturnValueOnce({ all: jest.fn().mockReturnValue([]) }); // For relationships query

      mockDatabaseService.prepare = mockPrepare;

      const results = await service.loadMultipleObjects(objectIds);

      expect(results).toHaveLength(3);
      expect(mockPrepare).toHaveBeenCalledTimes(2); // Only 2 queries (objects + relationships)
      expect(results[0].name).toBe('Object 1');
      expect(results[1].name).toBe('Object 2');
      expect(results[2].name).toBe('Object 3');
    });

    it('should batch load spatial relationships', async () => {
      const objectIds = ['obj-1', 'obj-2'];

      const mockObjectRows = objectIds.map((id) => ({
        id,
        name: `Object ${id}`,
        object_type: 'item',
        position_x: 0,
        position_y: 0,
        position_z: 0,
        is_portable: 1,
        is_container: 0,
        can_contain: 0,
        properties: '{}',
        game_id: 'test-game',
      }));

      const mockRelationshipRows = [
        {
          object_id: 'obj-1',
          target_id: 'container-1',
          relationship_type: 'inside',
          description: 'Object 1 is inside container',
        },
        {
          object_id: 'obj-2',
          target_id: 'table-1',
          relationship_type: 'on_top_of',
          description: 'Object 2 is on table',
        },
      ];

      const mockAll = jest
        .fn()
        .mockReturnValueOnce(mockObjectRows)
        .mockReturnValueOnce(mockRelationshipRows);

      mockDatabaseService.prepare = jest
        .fn()
        .mockReturnValue({ all: mockAll });

      const results = await service.loadMultipleObjects(objectIds);

      expect(results).toHaveLength(2);
      expect(results[0].spatialRelationship).toBeDefined();
      expect(results[0].spatialRelationship?.targetId).toBe('container-1');
      expect(results[1].spatialRelationship?.targetId).toBe('table-1');
    });

    it('should return empty array for empty input', async () => {
      const results = await service.loadMultipleObjects([]);

      expect(results).toEqual([]);
      expect(mockDatabaseService.prepare).not.toHaveBeenCalled();
    });

    it('should use batch loading when loading all game objects', async () => {
      const mockIdRows = [{ id: 'obj-1' }, { id: 'obj-2' }, { id: 'obj-3' }];

      const mockObjectRows = mockIdRows.map((row) => ({
        id: row.id,
        name: `Object ${row.id}`,
        object_type: 'item',
        position_x: 0,
        position_y: 0,
        position_z: 0,
        is_portable: 1,
        is_container: 0,
        can_contain: 0,
        properties: '{}',
        game_id: 'test-game',
      }));

      const mockAll = jest
        .fn()
        .mockReturnValueOnce(mockIdRows)
        .mockReturnValueOnce(mockObjectRows)
        .mockReturnValueOnce([]); // relationships

      mockDatabaseService.prepare = jest
        .fn()
        .mockReturnValue({ all: mockAll });

      const results = await service.getAllObjectsForGame('test-game');

      expect(results).toHaveLength(3);
      // Should use batch loading internally
    });
  });

  describe('NULL Safety', () => {
    it('should handle null object gracefully in getObject', () => {
      const result = service.getObject('nonexistent');

      expect(result).toBeUndefined();
    });

    it('should handle missing database service in persistence', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ObjectService,
          { provide: EntityService, useValue: mockEntityService },
          { provide: DatabaseService, useValue: undefined },
        ],
      }).compile();

      const serviceWithoutDb = module.get<ObjectService>(ObjectService);

      await expect(serviceWithoutDb.persistObjects()).resolves.not.toThrow();
    });

    it('should handle missing gameId in getObjectWithFallback', async () => {
      mockEntityService.getEntity = jest.fn().mockReturnValue(null);

      const result = await service.getObjectWithFallback('obj-1');

      expect(result).toBeUndefined();
      expect(mockDatabaseService.prepare).not.toHaveBeenCalled();
    });

    it('should handle null containedObjects array', () => {
      const container = service.createObject({
        name: 'Container',
        objectType: 'container',
        isContainer: true,
        position: { x: 0, y: 0, z: 0 },
      });

      container.containedObjects = undefined;

      const items = service.getObjectsInContainer(container.id);

      expect(items).toEqual([]);
    });

    it('should handle missing target entity in placeObject', async () => {
      const item = service.createObject({
        name: 'Item',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      mockEntityService.getEntity = jest.fn().mockReturnValue(null);

      const relationship: ISpatialRelationship = {
        relationshipType: 'inside',
        targetId: 'nonexistent',
      };

      const result = await service.placeObject(item.id, relationship);

      expect(result).toBe(false);
    });

    it('should handle missing object in removeObjectFromContainer', async () => {
      const result = await service.removeObjectFromContainer(
        'nonexistent-item',
        'nonexistent-container',
      );

      expect(result).toBe(false);
    });

    it('should handle database query failure gracefully', async () => {
      mockEntityService.getEntity = jest.fn().mockReturnValue(null);
      mockDatabaseService.prepare = jest
        .fn()
        .mockImplementation(() => {
          throw new Error('Database error');
        });

      const result = await service.getObjectWithFallback('obj-1', 'test-game');

      expect(result).toBeUndefined();
    });

    it('should handle JSON parse errors in material properties', async () => {
      const mockObjectRow = {
        id: 'obj-1',
        name: 'Broken Object',
        object_type: 'item',
        position_x: 0,
        position_y: 0,
        position_z: 0,
        material_properties: 'invalid json',
        is_portable: 1,
        is_container: 0,
        can_contain: 0,
        properties: '{}',
        game_id: 'test-game',
      };

      const mockGet = jest.fn().mockReturnValue(mockObjectRow);
      mockDatabaseService.prepare = jest.fn().mockReturnValue({ get: mockGet });

      mockEntityService.getEntity = jest.fn().mockReturnValue(null);

      // Should handle gracefully - returns undefined on parse error
      const result = await service.getObjectWithFallback('obj-1', 'test-game');
      expect(result).toBeUndefined();
    });
  });

  describe('Database Persistence', () => {
    it('should persist object to database', async () => {
      const object = service.createObject({
        name: 'Test Object',
        objectType: 'item',
        material: 'metal',
        weight: 5,
        position: { x: 1, y: 2, z: 3 },
        gameId: 'test-game',
      });

      const mockRun = jest.fn();
      const mockPrepare = jest.fn().mockReturnValue({ run: mockRun });
      mockDatabaseService.transaction = jest.fn().mockImplementation(
        async (callback) => {
          await callback({ prepare: mockPrepare });
        },
      );

      await service.persistObjects();

      expect(mockDatabaseService.transaction).toHaveBeenCalled();
      expect(mockPrepare).toHaveBeenCalled();
    });

    it('should persist spatial relationships to database', async () => {
      const container = service.createObject({
        name: 'Container',
        objectType: 'container',
        isContainer: true,
        canContain: true,
        position: { x: 0, y: 0, z: 0 },
        gameId: 'test-game',
      });

      const item = service.createObject({
        name: 'Item',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        gameId: 'test-game',
        spatialRelationship: {
          relationshipType: 'inside',
          targetId: container.id,
          description: 'Inside the container',
        },
      });

      const mockRun = jest.fn();
      const mockPrepare = jest.fn().mockReturnValue({ run: mockRun });
      mockDatabaseService.transaction = jest.fn().mockImplementation(
        async (callback) => {
          await callback({ prepare: mockPrepare });
        },
      );

      await service.persistObjects();

      expect(mockDatabaseService.transaction).toHaveBeenCalled();
      // Should save both object and relationship
      expect(mockPrepare).toHaveBeenCalled();
    });

    it('should load objects from database', async () => {
      const mockObjectRows = [
        {
          id: 'obj-1',
          name: 'Object 1',
          object_type: 'item',
          position_x: 0,
          position_y: 0,
          position_z: 0,
          is_portable: 1,
          is_container: 0,
          can_contain: 0,
          properties: '{}',
          game_id: 'test-game',
        },
      ];

      const mockAll = jest
        .fn()
        .mockReturnValueOnce(mockObjectRows.map((o) => ({ id: o.id })))
        .mockReturnValueOnce(mockObjectRows)
        .mockReturnValueOnce([]);

      mockDatabaseService.prepare = jest
        .fn()
        .mockReturnValue({ all: mockAll });

      await service.loadObjects('test-game');

      expect(service['objects'].size).toBeGreaterThan(0);
    });

    it('should merge in-memory and database objects', async () => {
      // Create in-memory object
      const inMemoryObject = service.createObject({
        name: 'In Memory Object',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        gameId: 'test-game',
      });

      const mockDbRows = [
        {
          id: 'db-obj-1',
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
        },
      ];

      const mockAll = jest
        .fn()
        .mockReturnValueOnce([{ id: 'db-obj-1' }])
        .mockReturnValueOnce(mockDbRows)
        .mockReturnValueOnce([]);

      mockDatabaseService.prepare = jest
        .fn()
        .mockReturnValue({ all: mockAll });

      const result = await service.getAllObjectsForGame('test-game');

      // Should include both in-memory and database objects
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result.some((o) => o.id === inMemoryObject.id)).toBe(true);
    });

    it('should prefer in-memory objects over database objects', async () => {
      const object = service.createObject({
        id: 'obj-1',
        name: 'Updated In Memory',
        objectType: 'item',
        position: { x: 5, y: 5, z: 5 },
        gameId: 'test-game',
      });

      const mockDbRows = [
        {
          id: 'obj-1',
          name: 'Old DB Version',
          object_type: 'item',
          position_x: 0,
          position_y: 0,
          position_z: 0,
          is_portable: 1,
          is_container: 0,
          can_contain: 0,
          properties: '{}',
          game_id: 'test-game',
        },
      ];

      const mockAll = jest
        .fn()
        .mockReturnValueOnce([{ id: 'obj-1' }])
        .mockReturnValueOnce(mockDbRows)
        .mockReturnValueOnce([]);

      mockDatabaseService.prepare = jest
        .fn()
        .mockReturnValue({ all: mockAll });

      const result = await service.getAllObjectsForGame('test-game');

      const foundObject = result.find((o) => o.id === 'obj-1');
      expect(foundObject?.name).toBe('Updated In Memory');
    });
  });

  describe('Version Management', () => {
    it('should save object version', async () => {
      const object = service.createObject({
        name: 'Versioned Object',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      mockDatabaseService.saveVersion = jest.fn().mockResolvedValue(1);

      const version = await service.saveObjectVersion(object.id, 'Test save');

      expect(version).toBe(1);
      expect(mockDatabaseService.saveVersion).toHaveBeenCalledWith(
        'object',
        object.id,
        object,
        'object_service',
        'Test save',
      );
    });

    it('should get object version', async () => {
      const mockVersion: IObject = {
        id: 'obj-1',
        name: 'Old Version',
        type: 'object',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        properties: {},
        containedObjects: [],
        canContain: false,
        isContainer: false,
        isPortable: true,
      };

      mockDatabaseService.getVersion = jest.fn().mockResolvedValue(mockVersion);

      const result = await service.getObjectVersion('obj-1', 1);

      expect(result).toEqual(mockVersion);
      expect(mockDatabaseService.getVersion).toHaveBeenCalledWith(
        'object',
        'obj-1',
        1,
      );
    });

    it('should rollback object to previous version', async () => {
      const currentObject = service.createObject({
        id: 'obj-1',
        name: 'Current Version',
        objectType: 'item',
        position: { x: 5, y: 5, z: 5 },
      });

      const oldVersion: IObject = {
        id: 'obj-1',
        name: 'Old Version',
        type: 'object',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        properties: {},
        containedObjects: [],
        canContain: false,
        isContainer: false,
        isPortable: true,
      };

      mockDatabaseService.getVersion = jest.fn().mockResolvedValue(oldVersion);

      const mockRun = jest.fn();
      const mockPrepare = jest.fn().mockReturnValue({ run: mockRun });
      mockDatabaseService.transaction = jest.fn().mockImplementation(
        async (callback) => {
          await callback({ prepare: mockPrepare });
        },
      );

      const result = await service.rollbackObject('obj-1', 1);

      expect(result).toBe(true);
      expect(service['objects'].get('obj-1')?.name).toBe('Old Version');
    });

    it('should return false when version not found', async () => {
      mockDatabaseService.getVersion = jest.fn().mockResolvedValue(null);

      const result = await service.rollbackObject('obj-1', 1);

      expect(result).toBe(false);
    });

    it('should throw error when saving version without database', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ObjectService,
          { provide: EntityService, useValue: mockEntityService },
          { provide: DatabaseService, useValue: undefined },
        ],
      }).compile();

      const serviceWithoutDb = module.get<ObjectService>(ObjectService);

      const object = serviceWithoutDb.createObject({
        name: 'Test',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      await expect(
        serviceWithoutDb.saveObjectVersion(object.id),
      ).rejects.toThrow('Database service not available');
    });
  });

  describe('Cache Management', () => {
    it('should clear cache', () => {
      service.createObject({
        name: 'Object 1',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });
      service.createObject({
        name: 'Object 2',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      expect(service['objects'].size).toBe(2);

      service.clearCache();

      expect(service['objects'].size).toBe(0);
    });

    it('should get cache statistics', () => {
      const obj1 = service.createObject({
        name: 'Object 1',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });
      const obj2 = service.createObject({
        name: 'Object 2',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      const stats = service.getCacheStats();

      expect(stats.size).toBe(2);
      expect(stats.objects).toContain(obj1.id);
      expect(stats.objects).toContain(obj2.id);
    });

    it('should refresh object from database', async () => {
      const mockObjectRow = {
        id: 'obj-1',
        name: 'Refreshed Object',
        object_type: 'item',
        position_x: 10,
        position_y: 10,
        position_z: 0,
        is_portable: 1,
        is_container: 0,
        can_contain: 0,
        properties: '{}',
        game_id: 'test-game',
      };

      const mockGet = jest.fn().mockReturnValue(mockObjectRow);
      mockDatabaseService.prepare = jest.fn().mockReturnValue({ get: mockGet });

      const result = await service.refreshObject('test-game', 'obj-1');

      expect(result).toBeDefined();
      expect(result?.name).toBe('Refreshed Object');
      expect(service['objects'].get('obj-1')?.name).toBe('Refreshed Object');
    });

    it('should load object on demand', async () => {
      const mockObjectRow = {
        id: 'obj-1',
        name: 'Lazy Loaded',
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

      mockEntityService.getEntity = jest.fn().mockReturnValue(null);
      const mockGet = jest.fn().mockReturnValue(mockObjectRow);
      mockDatabaseService.prepare = jest.fn().mockReturnValue({ get: mockGet });

      const result = await service.loadObjectOnDemand('test-game', 'obj-1');

      expect(result).toBeDefined();
      expect(result?.name).toBe('Lazy Loaded');
    });

    it('should return cached object on demand if already loaded', async () => {
      const object = service.createObject({
        id: 'obj-1',
        name: 'Cached',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      const result = await service.loadObjectOnDemand('test-game', 'obj-1');

      expect(result).toBe(object);
      expect(mockDatabaseService.prepare).not.toHaveBeenCalled();
    });
  });

  describe('Object Updates', () => {
    it('should update object properties', async () => {
      const object = service.createObject({
        name: 'Original Name',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      const result = await service.updateObject(object.id, {
        name: 'Updated Name',
      });

      expect(result).toBe(true);
      expect(mockEntityService.updateEntity).toHaveBeenCalledWith(object.id, {
        name: 'Updated Name',
        type: 'object',
      });
    });

    it('should update object position', async () => {
      const object = service.createObject({
        name: 'Test',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      const newPosition = { x: 10, y: 20, z: 5 };
      const result = await service.updateObjectPosition(object.id, newPosition);

      expect(result).toBe(true);
      expect(mockEntityService.updateEntity).toHaveBeenCalledWith(object.id, {
        position: newPosition,
        type: 'object',
      });
    });

    it('should return false when updating nonexistent object', async () => {
      const result = await service.updateObject('nonexistent', {
        name: 'New Name',
      });

      expect(result).toBe(false);
    });

    it('should place object in room', async () => {
      const object = service.createObject({
        name: 'Test',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      const result = await service.placeInRoom(object.id, 'room-1');

      expect(result).toBe(true);
      expect(object.roomId).toBe('room-1');
      expect(mockEntityService.updateEntity).toHaveBeenCalled();
    });

    it('should return false when placing nonexistent object in room', async () => {
      const result = await service.placeInRoom('nonexistent', 'room-1');

      expect(result).toBe(false);
    });
  });

  describe('Compatibility Methods', () => {
    it('should support findAll alias', () => {
      service.createObject({
        name: 'Object 1',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });
      service.createObject({
        name: 'Object 2',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      const result = service.findAll();

      expect(result).toHaveLength(2);
    });

    it('should support findById alias', () => {
      const object = service.createObject({
        name: 'Test Object',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      const result = service.findById(object.id);

      expect(result).toBe(object);
    });

    it('should support create alias', () => {
      const objectData = {
        name: 'Test Object',
        objectType: 'item' as const,
        position: { x: 0, y: 0, z: 0 },
      };

      const result = service.create(objectData);

      expect(result).toBeDefined();
      expect(result.name).toBe('Test Object');
    });

    it('should support update alias', async () => {
      const object = service.createObject({
        name: 'Original',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      const result = await service.update(object.id, { name: 'Updated' });

      expect(result).toBe(true);
    });

    it('should support getAllObjects', () => {
      service.createObject({
        name: 'Object 1',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      const result = service.getAllObjects();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Object 1');
    });
  });

  describe('Edge Cases and Invariant Preservation', () => {
    it('should not allow object to reference itself in spatial relationship', async () => {
      const object = service.createObject({
        name: 'Self-Referential',
        objectType: 'container',
        isContainer: true,
        canContain: true,
        position: { x: 0, y: 0, z: 0 },
      });

      mockEntityService.getEntity = jest.fn().mockReturnValue(object);

      const relationship: ISpatialRelationship = {
        relationshipType: 'inside',
        targetId: object.id,
      };

      const result = await service.placeObject(object.id, relationship);

      expect(result).toBe(false);
    });

    it('should handle objects with all material types', () => {
      const materials = [
        'wood',
        'metal',
        'stone',
        'glass',
        'cloth',
        'leather',
        'organic',
      ];

      materials.forEach((material) => {
        const object = service.createObject({
          name: `${material} object`,
          objectType: 'item',
          material,
          position: { x: 0, y: 0, z: 0 },
        });

        expect(object.materialProperties).toBeDefined();
        expect(object.materialProperties?.material).toBe(material);
      });
    });

    it('should handle unknown material gracefully', () => {
      const object = service.createObject({
        name: 'Unknown Material Object',
        objectType: 'item',
        material: 'unobtanium',
        position: { x: 0, y: 0, z: 0 },
      });

      expect(object.materialProperties).toBeDefined();
      expect(object.materialProperties?.material).toBe('unobtanium');
      expect(object.materialProperties?.density).toBe(1); // Default value
    });

    it('should not duplicate objects in containedObjects array', async () => {
      const container = service.createObject({
        name: 'Container',
        objectType: 'container',
        isContainer: true,
        canContain: true,
        containerCapacity: 10,
        state: { isOpen: true },
        position: { x: 0, y: 0, z: 0 },
      });

      const item = service.createObject({
        name: 'Item',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      container.containedObjects = [item.id];

      mockEntityService.getEntity = jest.fn((id) => {
        if (id === container.id) return container;
        if (id === item.id) return item;
        return null;
      });

      const relationship: ISpatialRelationship = {
        relationshipType: 'inside',
        targetId: container.id,
      };

      await service.placeObject(item.id, relationship);

      // Should not add duplicate
      expect(container.containedObjects.filter((id) => id === item.id)).toHaveLength(1);
    });

    it('should preserve object properties through cache operations', () => {
      const object = service.createObject({
        name: 'Test Object',
        objectType: 'item',
        material: 'metal',
        weight: 10,
        health: 100,
        maxHealth: 100,
        position: { x: 1, y: 2, z: 3 },
        properties: { durability: 50 },
      });

      const cached = service.getObject(object.id);

      expect(cached).toEqual(object);
      expect(cached?.weight).toBe(10);
      expect(cached?.health).toBe(100);
      expect(cached?.properties?.durability).toBe(50);
    });
  });
});
