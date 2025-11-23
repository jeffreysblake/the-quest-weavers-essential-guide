import { Test, TestingModule } from '@nestjs/testing';
import { ObjectService } from './object.service';
import { EntityService } from './entity.service';
import { DatabaseService } from '../database/database.service';
import { IObject, ISpatialRelationship } from './object.interface';

describe('ObjectService - Database Persistence', () => {
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

  describe('NULL Safety', () => {
    it('should handle null object gracefully in getObject', () => {
      mockEntityService.getEntity = jest.fn().mockReturnValue(null);

      const result = service.getObject('null-id');

      expect(result).toBeUndefined();
    });

    it('should handle undefined object in updateObject', async () => {
      const result = await service.updateObject('nonexistent', { name: 'Test' });

      expect(result).toBe(false);
    });

    it('should handle null target in placeObject', async () => {
      const item = service.createObject({
        name: 'Item',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      mockEntityService.getEntity = jest.fn((id) => {
        if (id === item.id) return item;
        return null; // Target doesn't exist
      });

      const relationship: ISpatialRelationship = {
        relationshipType: 'inside',
        targetId: 'nonexistent-container',
      };

      const result = await service.placeObject(item.id, relationship);

      expect(result).toBe(false);
    });

    it('should handle null source in placeObject', async () => {
      const container = service.createObject({
        name: 'Container',
        objectType: 'container',
        isContainer: true,
        canContain: true,
        position: { x: 0, y: 0, z: 0 },
      });

      mockEntityService.getEntity = jest.fn((id) => {
        if (id === container.id) return container;
        return null; // Source doesn't exist
      });

      const relationship: ISpatialRelationship = {
        relationshipType: 'inside',
        targetId: container.id,
      };

      const result = await service.placeObject('nonexistent-item', relationship);

      expect(result).toBe(false);
    });

    it('should handle null containedObjects array', () => {
      const container = service.createObject({
        name: 'Container',
        objectType: 'container',
        isContainer: true,
        canContain: true,
        position: { x: 0, y: 0, z: 0 },
      });

      // Force null (simulating corrupted data)
      (container as any).containedObjects = null;

      const contents = service.getContainedObjects(container.id);

      expect(contents).toEqual([]);
    });

    it('should handle null spatialRelationship', () => {
      const object = service.createObject({
        name: 'Object',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      object.spatialRelationship = undefined;

      const relationships = service.getSpatialRelationships(object.id);

      expect(relationships).toEqual([]);
    });

    it('should handle null material properties', () => {
      const object = service.createObject({
        name: 'Object',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      // Material properties should be undefined by default
      expect(object.materialProperties).toBeUndefined();
    });

    it('should handle null state data', () => {
      const object = service.createObject({
        name: 'Object',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      expect(object.state).toBeUndefined();
    });

    it('should handle database returning null', async () => {
      const mockGet = jest.fn().mockReturnValue(null);
      mockDatabaseService.prepare = jest.fn().mockReturnValue({ get: mockGet });

      const result = await service.getObjectWithFallback('nonexistent', 'test-game');

      expect(result).toBeNull();
    });

    it('should handle batch load with missing objects', async () => {
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
        // obj-2 is missing
        {
          id: 'obj-3',
          name: 'Object 3',
          object_type: 'item',
          position_x: 2,
          position_y: 2,
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

      // Should only return found objects
      expect(results).toHaveLength(2);
      expect(results.find((obj) => obj.id === 'obj-1')).toBeDefined();
      expect(results.find((obj) => obj.id === 'obj-3')).toBeDefined();
    });
  });

  describe('Database Persistence', () => {
    it('should save object to database', async () => {
      const object = service.createObject({
        name: 'Test Object',
        objectType: 'item',
        position: { x: 5, y: 10, z: 0 },
        material: 'metal',
        weight: 15,
      });

      const mockRun = jest.fn();
      const mockPrepare = jest.fn().mockReturnValue({ run: mockRun });
      mockDatabaseService.prepare = mockPrepare;

      await service.saveObject(object.id, 'test-game');

      expect(mockPrepare).toHaveBeenCalled();
      expect(mockRun).toHaveBeenCalledWith(
        expect.objectContaining({
          id: object.id,
          name: 'Test Object',
          object_type: 'item',
          position_x: 5,
          position_y: 10,
          position_z: 0,
          material: 'metal',
          weight: 15,
          game_id: 'test-game',
        }),
      );
    });

    it('should serialize material properties as JSON', async () => {
      const object = service.createObject({
        name: 'Wooden Object',
        objectType: 'item',
        material: 'wood',
        position: { x: 0, y: 0, z: 0 },
      });

      const mockRun = jest.fn();
      mockDatabaseService.prepare = jest.fn().mockReturnValue({ run: mockRun });

      await service.saveObject(object.id, 'test-game');

      expect(mockRun).toHaveBeenCalledWith(
        expect.objectContaining({
          material_properties: expect.any(String),
        }),
      );

      const callArgs = mockRun.mock.calls[0][0];
      const parsedProps = JSON.parse(callArgs.material_properties);
      expect(parsedProps.material).toBe('wood');
      expect(parsedProps.flammability).toBe(7);
    });

    it('should serialize state data as JSON', async () => {
      const object = service.createObject({
        name: 'Chest',
        objectType: 'container',
        isContainer: true,
        canContain: true,
        position: { x: 0, y: 0, z: 0 },
        state: { isOpen: true, isLocked: false },
      });

      const mockRun = jest.fn();
      mockDatabaseService.prepare = jest.fn().mockReturnValue({ run: mockRun });

      await service.saveObject(object.id, 'test-game');

      expect(mockRun).toHaveBeenCalledWith(
        expect.objectContaining({
          state_data: JSON.stringify({ isOpen: true, isLocked: false }),
        }),
      );
    });

    it('should serialize properties as JSON', async () => {
      const object = service.createObject({
        name: 'Magic Item',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        properties: { power: 100, element: 'fire' },
      });

      const mockRun = jest.fn();
      mockDatabaseService.prepare = jest.fn().mockReturnValue({ run: mockRun });

      await service.saveObject(object.id, 'test-game');

      expect(mockRun).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: JSON.stringify({ power: 100, element: 'fire' }),
        }),
      );
    });

    it('should convert boolean values to integers for SQLite', async () => {
      const object = service.createObject({
        name: 'Container',
        objectType: 'container',
        isContainer: true,
        canContain: true,
        isPortable: false,
        position: { x: 0, y: 0, z: 0 },
      });

      const mockRun = jest.fn();
      mockDatabaseService.prepare = jest.fn().mockReturnValue({ run: mockRun });

      await service.saveObject(object.id, 'test-game');

      expect(mockRun).toHaveBeenCalledWith(
        expect.objectContaining({
          is_portable: 0,
          is_container: 1,
          can_contain: 1,
        }),
      );
    });

    it('should load object from database and deserialize JSON fields', async () => {
      const mockRow = {
        id: 'obj-1',
        name: 'Database Object',
        object_type: 'item',
        position_x: 5,
        position_y: 10,
        position_z: 2,
        material: 'metal',
        material_properties: JSON.stringify({
          material: 'metal',
          density: 7.85,
          conductivity: 8,
          flammability: 0,
          brittleness: 3,
        }),
        state_data: JSON.stringify({ durability: 90 }),
        properties: JSON.stringify({ enchanted: true }),
        is_portable: 1,
        is_container: 0,
        can_contain: 0,
        game_id: 'test-game',
      };

      const mockGet = jest.fn().mockReturnValue(mockRow);
      mockDatabaseService.prepare = jest.fn().mockReturnValue({ get: mockGet });

      const result = await service.getObjectWithFallback('obj-1', 'test-game');

      expect(result).toBeDefined();
      expect(result?.materialProperties?.material).toBe('metal');
      expect(result?.materialProperties?.density).toBe(7.85);
      expect(result?.state?.durability).toBe(90);
      expect(result?.properties?.enchanted).toBe(true);
    });

    it('should handle database save failure gracefully', async () => {
      const object = service.createObject({
        name: 'Test Object',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      const mockRun = jest.fn().mockImplementation(() => {
        throw new Error('Database error');
      });
      mockDatabaseService.prepare = jest.fn().mockReturnValue({ run: mockRun });

      await expect(service.saveObject(object.id, 'test-game')).rejects.toThrow('Database error');
    });
  });

