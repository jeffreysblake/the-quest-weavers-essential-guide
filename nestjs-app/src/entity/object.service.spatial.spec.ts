import { Test, TestingModule } from '@nestjs/testing';
import { ObjectService } from './object.service';
import { EntityService } from './entity.service';
import { DatabaseService } from '../database/database.service';
import { IObject, ISpatialRelationship } from './object.interface';

describe('ObjectService - Spatial Operations', () => {
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
      mockEntityService.getEntity = jest.fn((id) => {
        if (id === container.id) return container;
        return null;
      });

      const location = service.getObjectLocation(item.id);

      expect(location).toContain('on top of');
      expect(location).toContain(container.name);
    });
  });

  describe('Container Operations', () => {
    let container: IObject;
    let item: IObject;

    beforeEach(() => {
      container = service.createObject({
        name: 'Backpack',
        objectType: 'container',
        isContainer: true,
        canContain: true,
        containerCapacity: 5,
        position: { x: 0, y: 0, z: 0 },
        state: { isOpen: true },
      });

      item = service.createObject({
        name: 'Key',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      mockEntityService.getEntity = jest.fn((id) => {
        if (id === container.id) return container;
        if (id === item.id) return item;
        return null;
      });
    });

    it('should get contained objects', () => {
      container.containedObjects = [item.id];

      const contents = service.getContainedObjects(container.id);

      expect(contents).toEqual([item.id]);
    });

    it('should return empty array for non-container', () => {
      const contents = service.getContainedObjects(item.id);

      expect(contents).toEqual([]);
    });

    it('should check if container is full', () => {
      container.containedObjects = ['item1', 'item2', 'item3', 'item4', 'item5'];
      container.containerCapacity = 5;

      const isFull = service.isContainerFull(container.id);

      expect(isFull).toBe(true);
    });

    it('should check if container has space', () => {
      container.containedObjects = ['item1', 'item2'];
      container.containerCapacity = 5;

      const isFull = service.isContainerFull(container.id);

      expect(isFull).toBe(false);
    });

    it('should reject adding to full container', async () => {
      container.containedObjects = ['item1', 'item2', 'item3', 'item4', 'item5'];
      container.containerCapacity = 5;

      const relationship: ISpatialRelationship = {
        relationshipType: 'inside',
        targetId: container.id,
      };

      const result = await service.placeObject(item.id, relationship);

      expect(result).toBe(false);
    });

    it('should remove object from previous container when moved', async () => {
      const chest = service.createObject({
        name: 'Chest',
        objectType: 'container',
        isContainer: true,
        canContain: true,
        containerCapacity: 10,
        position: { x: 0, y: 0, z: 0 },
        state: { isOpen: true },
      });

      mockEntityService.getEntity = jest.fn((id) => {
        if (id === container.id) return container;
        if (id === chest.id) return chest;
        if (id === item.id) return item;
        return null;
      });

      // Place item in backpack first
      const relationship1: ISpatialRelationship = {
        relationshipType: 'inside',
        targetId: container.id,
      };
      await service.placeObject(item.id, relationship1);

      expect(container.containedObjects).toContain(item.id);

      // Move item to chest
      const relationship2: ISpatialRelationship = {
        relationshipType: 'inside',
        targetId: chest.id,
      };
      await service.placeObject(item.id, relationship2);

      expect(container.containedObjects).not.toContain(item.id);
      expect(chest.containedObjects).toContain(item.id);
    });

    it('should handle container capacity of 0', () => {
      container.containerCapacity = 0;
      container.containedObjects = [];

      const isFull = service.isContainerFull(container.id);

      expect(isFull).toBe(true);
    });

    it('should handle undefined container capacity', () => {
      container.containerCapacity = undefined;
      container.containedObjects = ['item1', 'item2', 'item3', 'item4', 'item5', 'item6'];

      // Should not be considered full without capacity limit
      const isFull = service.isContainerFull(container.id);

      expect(isFull).toBe(false);
    });
  });

  describe('Batch Loading (N+1 Prevention)', () => {
    it('should load multiple objects in a single query', async () => {
      const objectIds = ['obj-1', 'obj-2', 'obj-3'];
      const mockRows = [
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
        },
        {
          id: 'obj-2',
          name: 'Object 2',
          object_type: 'weapon',
          position_x: 1,
          position_y: 1,
          position_z: 0,
          is_portable: 1,
          is_container: 0,
          can_contain: 0,
          properties: '{}',
        },
        {
          id: 'obj-3',
          name: 'Object 3',
          object_type: 'container',
          position_x: 2,
          position_y: 2,
          position_z: 0,
          is_portable: 1,
          is_container: 1,
          can_contain: 1,
          container_capacity: 10,
          properties: '{}',
        },
      ];

      const mockAll = jest.fn().mockReturnValue(mockRows);
      const mockPrepare = jest.fn().mockReturnValue({ all: mockAll });
      mockDatabaseService.prepare = mockPrepare;

      const results = await service.batchLoadObjects(objectIds, 'test-game');

      expect(results).toHaveLength(3);
      expect(results[0].name).toBe('Object 1');
      expect(results[1].name).toBe('Object 2');
      expect(results[2].name).toBe('Object 3');
      expect(mockPrepare).toHaveBeenCalledTimes(1);
    });

    it('should cache batch loaded objects', async () => {
      const objectIds = ['obj-1', 'obj-2'];
      const mockRows = [
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
        },
        {
          id: 'obj-2',
          name: 'Object 2',
          object_type: 'item',
          position_x: 1,
          position_y: 1,
          position_z: 0,
          is_portable: 1,
          is_container: 0,
          can_contain: 0,
          properties: '{}',
        },
      ];

      const mockAll = jest.fn().mockReturnValue(mockRows);
      mockDatabaseService.prepare = jest.fn().mockReturnValue({ all: mockAll });

      await service.batchLoadObjects(objectIds, 'test-game');

      // Objects should be in cache
      expect(service['objects'].has('obj-1')).toBe(true);
      expect(service['objects'].has('obj-2')).toBe(true);
    });

    it('should skip already cached objects in batch load', async () => {
      // Pre-cache one object
      const cachedObj = service.createObject({
        id: 'obj-1',
        name: 'Cached Object',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      const objectIds = ['obj-1', 'obj-2'];
      const mockRows = [
        {
          id: 'obj-2',
          name: 'Object 2',
          object_type: 'item',
          position_x: 1,
          position_y: 1,
          position_z: 0,
          is_portable: 1,
          is_container: 0,
          can_contain: 0,
          properties: '{}',
        },
      ];

      const mockAll = jest.fn().mockReturnValue(mockRows);
      mockDatabaseService.prepare = jest.fn().mockReturnValue({ all: mockAll });

      const results = await service.batchLoadObjects(objectIds, 'test-game');

      expect(results).toHaveLength(2);
      expect(results[0]).toBe(cachedObj); // From cache
      expect(results[1].name).toBe('Object 2'); // From database
    });

    it('should handle empty batch load request', async () => {
      const results = await service.batchLoadObjects([], 'test-game');

      expect(results).toEqual([]);
      expect(mockDatabaseService.prepare).not.toHaveBeenCalled();
    });
  });
});
