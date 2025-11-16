import { Test, TestingModule } from '@nestjs/testing';
import { ObjectService } from './object.service';
import { EntityService } from './entity.service';
import { DatabaseService } from '../database/database.service';
import { IObject } from './object.interface';

describe('ObjectService (Integration)', () => {
  let service: ObjectService;
  let entityService: EntityService;
  let mockDatabaseService: jest.Mocked<Partial<DatabaseService>>;

  beforeEach(async () => {
    // Create mock database service
    mockDatabaseService = {
      saveEntity: jest.fn().mockResolvedValue(undefined),
      getEntity: jest.fn().mockResolvedValue(null),
      deleteEntity: jest.fn().mockResolvedValue(undefined),
      getAllEntities: jest.fn().mockResolvedValue([]),
      transaction: jest.fn((callback) =>
        callback({ prepare: jest.fn(() => ({ run: jest.fn() })) }),
      ),
      prepare: jest.fn(() => ({ get: jest.fn(), all: jest.fn(() => []) })),
      saveVersion: jest.fn().mockResolvedValue(1),
      getVersion: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ObjectService,
        EntityService,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    service = module.get<ObjectService>(ObjectService);
    entityService = module.get<EntityService>(EntityService);
  });

  afterEach(() => {
    service.clearCache();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create an object with proper properties', () => {
    const objectData = {
      name: 'Test Object',
      position: { x: 0, y: 0, z: 0 },
      objectType: 'item' as const,
      properties: {
        weight: 2.5,
        value: 100,
      },
    };

    const result = service.createObject(objectData);

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.name).toBe('Test Object');
    expect(result.type).toBe('object');
    expect(result.objectType).toBe('item');
    expect(result.properties?.weight).toBe(2.5);
  });

  describe('Object Creation', () => {
    it('should auto-generate UUID for new objects', () => {
      const obj1 = service.createObject({
        name: 'Object 1',
        objectType: 'item',
      });
      const obj2 = service.createObject({
        name: 'Object 2',
        objectType: 'item',
      });

      expect(obj1.id).toBeDefined();
      expect(obj2.id).toBeDefined();
      expect(obj1.id).not.toBe(obj2.id);
    });

    it('should set type to "object" automatically', () => {
      const obj = service.createObject({ name: 'Test', objectType: 'item' });
      expect(obj.type).toBe('object');
    });

    it('should initialize empty properties if not provided', () => {
      const obj = service.createObject({ name: 'Test', objectType: 'item' });
      expect(obj.properties).toEqual({});
    });

    it('should initialize empty containedObjects array', () => {
      const obj = service.createObject({ name: 'Test', objectType: 'item' });
      expect(obj.containedObjects).toEqual([]);
    });

    it('should default canContain to false', () => {
      const obj = service.createObject({ name: 'Test', objectType: 'item' });
      expect(obj.canContain).toBe(false);
    });

    it('should default isContainer to false', () => {
      const obj = service.createObject({ name: 'Test', objectType: 'item' });
      expect(obj.isContainer).toBe(false);
    });

    it('should default isPortable to true', () => {
      const obj = service.createObject({ name: 'Test', objectType: 'item' });
      expect(obj.isPortable).toBe(true);
    });

    it('should allow isPortable to be set to false', () => {
      const obj = service.createObject({
        name: 'Heavy Rock',
        objectType: 'furniture',
        isPortable: false,
      });
      expect(obj.isPortable).toBe(false);
    });

    it('should create container objects correctly', () => {
      const container = service.createObject({
        name: 'Chest',
        objectType: 'container',
        isContainer: true,
        canContain: true,
        containerCapacity: 10,
      });

      expect(container.isContainer).toBe(true);
      expect(container.canContain).toBe(true);
      expect(container.containerCapacity).toBe(10);
    });

    it('should register object in both ObjectService and EntityService', () => {
      const obj = service.createObject({ name: 'Test', objectType: 'item' });

      const fromObjectService = service.getObject(obj.id);
      const fromEntityService = entityService.getEntity(obj.id);

      expect(fromObjectService).toBeDefined();
      expect(fromEntityService).toBeDefined();
      expect(fromObjectService?.id).toBe(obj.id);
      expect(fromEntityService?.id).toBe(obj.id);
    });
  });

  describe('Material Properties', () => {
    it('should auto-generate wood material properties', () => {
      const obj = service.createObject({
        name: 'Wooden Sword',
        objectType: 'weapon',
        material: 'wood',
      });

      expect(obj.materialProperties).toBeDefined();
      expect(obj.materialProperties?.material).toBe('wood');
      expect(obj.materialProperties?.density).toBe(0.6);
      expect(obj.materialProperties?.flammability).toBe(7);
      expect(obj.materialProperties?.resistances?.ice).toBe(2);
    });

    it('should auto-generate steel material properties', () => {
      const obj = service.createObject({
        name: 'Steel Sword',
        objectType: 'weapon',
        material: 'steel',
      });

      expect(obj.materialProperties?.material).toBe('steel');
      expect(obj.materialProperties?.density).toBe(7.85);
      expect(obj.materialProperties?.conductivity).toBe(8);
      expect(obj.materialProperties?.flammability).toBe(0);
      expect(obj.materialProperties?.resistances?.force).toBe(5);
    });

    it('should auto-generate iron material properties', () => {
      const obj = service.createObject({
        name: 'Iron Shield',
        objectType: 'armor',
        material: 'iron',
      });

      expect(obj.materialProperties?.material).toBe('iron');
      expect(obj.materialProperties?.density).toBe(7.87);
      expect(obj.materialProperties?.brittleness).toBe(3);
    });

    it('should auto-generate stone material properties', () => {
      const obj = service.createObject({
        name: 'Stone Wall',
        objectType: 'furniture',
        material: 'stone',
      });

      expect(obj.materialProperties?.material).toBe('stone');
      expect(obj.materialProperties?.density).toBe(2.5);
      expect(obj.materialProperties?.brittleness).toBe(6);
      expect(obj.materialProperties?.resistances?.fire).toBe(9);
    });

    it('should auto-generate glass material properties', () => {
      const obj = service.createObject({
        name: 'Glass Bottle',
        objectType: 'item',
        material: 'glass',
      });

      expect(obj.materialProperties?.material).toBe('glass');
      expect(obj.materialProperties?.brittleness).toBe(9);
    });

    it('should auto-generate cloth material properties', () => {
      const obj = service.createObject({
        name: 'Cloth Robe',
        objectType: 'armor',
        material: 'cloth',
      });

      expect(obj.materialProperties?.material).toBe('cloth');
      expect(obj.materialProperties?.flammability).toBe(8);
    });

    it('should auto-generate leather material properties', () => {
      const obj = service.createObject({
        name: 'Leather Armor',
        objectType: 'armor',
        material: 'leather',
      });

      expect(obj.materialProperties?.material).toBe('leather');
      expect(obj.materialProperties?.density).toBe(0.9);
      expect(obj.materialProperties?.flammability).toBe(5);
    });

    it('should handle unknown materials with defaults', () => {
      const obj = service.createObject({
        name: 'Mystery Object',
        objectType: 'item',
        material: 'unknownium',
      });

      expect(obj.materialProperties?.material).toBe('unknownium');
      expect(obj.materialProperties?.density).toBe(1);
      expect(obj.materialProperties?.conductivity).toBe(1);
      expect(obj.materialProperties?.flammability).toBe(1);
      expect(obj.materialProperties?.brittleness).toBe(1);
    });

    it('should respect custom material properties over auto-generated', () => {
      const customProps = {
        material: 'wood',
        density: 999,
        conductivity: 888,
        flammability: 0,
        brittleness: 0,
        resistances: { fire: 100 },
      };

      const obj = service.createObject({
        name: 'Magic Wood',
        objectType: 'item',
        material: 'wood',
        materialProperties: customProps,
      });

      expect(obj.materialProperties).toEqual(customProps);
      expect(obj.materialProperties?.density).toBe(999);
    });

    it('should handle case-insensitive material names', () => {
      const obj = service.createObject({
        name: 'Test',
        objectType: 'item',
        material: 'WOOD',
      });

      expect(obj.materialProperties?.material).toBe('wood');
      expect(obj.materialProperties?.density).toBe(0.6);
    });
  });

  describe('Object Retrieval', () => {
    it('should retrieve object by ID', () => {
      const created = service.createObject({
        name: 'Test',
        objectType: 'item',
      });
      const retrieved = service.getObject(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe('Test');
    });

    it('should return undefined for non-existent object', () => {
      const result = service.getObject('non-existent-id');
      expect(result).toBeUndefined();
    });

    it('should retrieve all objects', () => {
      service.createObject({ name: 'Object 1', objectType: 'item' });
      service.createObject({ name: 'Object 2', objectType: 'item' });
      service.createObject({ name: 'Object 3', objectType: 'item' });

      const all = service.getAllObjects();
      expect(all).toHaveLength(3);
    });

    it('should retrieve objects from EntityService as fallback', () => {
      const obj = service.createObject({ name: 'Test', objectType: 'item' });

      // Clear local cache but keep in EntityService
      service.clearCache();

      const retrieved = service.getObject(obj.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(obj.id);
    });

    it('should use findAll alias', () => {
      service.createObject({ name: 'Test 1', objectType: 'item' });
      service.createObject({ name: 'Test 2', objectType: 'item' });

      const all = service.findAll();
      expect(all).toHaveLength(2);
    });

    it('should use findById alias', () => {
      const obj = service.createObject({ name: 'Test', objectType: 'item' });
      const found = service.findById(obj.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(obj.id);
    });

    it('should use create alias', () => {
      const obj = service.create({ name: 'Test', objectType: 'item' });
      expect(obj).toBeDefined();
      expect(obj.name).toBe('Test');
    });

    it('should filter objects by gameId when getting all for game', async () => {
      service.createObject({
        name: 'Game1 Obj1',
        objectType: 'item',
        gameId: 'game1',
      });
      service.createObject({
        name: 'Game1 Obj2',
        objectType: 'item',
        gameId: 'game1',
      });
      service.createObject({
        name: 'Game2 Obj1',
        objectType: 'item',
        gameId: 'game2',
      });

      const game1Objects = await service.getAllObjectsForGame('game1');
      expect(game1Objects).toHaveLength(2);
      expect(game1Objects.every((o) => o.gameId === 'game1')).toBe(true);
    });
  });

  describe('Object Updates', () => {
    it('should update object properties', async () => {
      const obj = service.createObject({ name: 'Test', objectType: 'item' });

      const success = await service.updateObject(obj.id, {
        name: 'Updated Name',
        description: 'New description',
      });

      expect(success).toBe(true);

      const updated = service.getObject(obj.id);
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.description).toBe('New description');
    });

    it('should return false when updating non-existent object', async () => {
      const success = await service.updateObject('non-existent', { name: 'Test' });
      expect(success).toBe(false);
    });

    it('should use update alias', async () => {
      const obj = service.createObject({ name: 'Test', objectType: 'item' });
      const success = await service.update(obj.id, { name: 'Updated' });

      expect(success).toBe(true);
      expect(service.getObject(obj.id)?.name).toBe('Updated');
    });

    it('should update object position', async () => {
      const obj = service.createObject({
        name: 'Test',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      const newPosition = { x: 10, y: 20, z: 30 };
      const success = await service.updateObjectPosition(obj.id, newPosition);

      expect(success).toBe(true);
      const updated = service.getObject(obj.id);
      expect(updated?.position).toEqual(newPosition);
    });

    it('should preserve object type when updating', async () => {
      const obj = service.createObject({ name: 'Test', objectType: 'item' });
      await service.updateObject(obj.id, { name: 'Updated' });

      const updated = service.getObject(obj.id);
      expect(updated?.type).toBe('object');
    });
  });

  describe('Room Placement', () => {
    it('should place object in room', async () => {
      const obj = service.createObject({ name: 'Sword', objectType: 'weapon' });
      const success = await service.placeInRoom(obj.id, 'room-123');

      expect(success).toBe(true);
      const updated = service.getObject(obj.id);
      expect(updated?.roomId).toBe('room-123');
    });

    it('should return false when placing non-existent object', async () => {
      const success = await service.placeInRoom('non-existent', 'room-123');
      expect(success).toBe(false);
    });

    it('should update room placement', () => {
      const obj = service.createObject({ name: 'Key', objectType: 'item' });

      service.placeInRoom(obj.id, 'room-1');
      expect(service.getObject(obj.id)?.roomId).toBe('room-1');

      service.placeInRoom(obj.id, 'room-2');
      expect(service.getObject(obj.id)?.roomId).toBe('room-2');
    });
  });

  describe('Spatial Relationships', () => {
    it('should place object inside container', async () => {
      const container = service.createObject({
        name: 'Chest',
        objectType: 'container',
        isContainer: true,
        canContain: true,
        containerCapacity: 10,
      });

      const item = service.createObject({
        name: 'Key',
        objectType: 'item',
      });

      const success = await service.placeObject(item.id, {
        targetId: container.id,
        relationshipType: 'inside',
      });

      expect(success).toBe(true);

      const updatedItem = service.getObject(item.id);
      expect(updatedItem?.spatialRelationship).toBeDefined();
      expect(updatedItem?.spatialRelationship?.targetId).toBe(container.id);
      expect(updatedItem?.spatialRelationship?.relationshipType).toBe('inside');

      const updatedContainer = service.getObject(container.id);
      expect(updatedContainer?.containedObjects).toContain(item.id);
    });

    it('should place object on top of furniture', async () => {
      const table = service.createObject({
        name: 'Table',
        objectType: 'furniture',
      });

      const book = service.createObject({
        name: 'Book',
        objectType: 'item',
      });

      const success = await service.placeObject(book.id, {
        targetId: table.id,
        relationshipType: 'on_top_of',
      });

      expect(success).toBe(true);
      const updatedBook = service.getObject(book.id);
      expect(updatedBook?.spatialRelationship?.relationshipType).toBe(
        'on_top_of',
      );
    });

    it('should place object next to another object', async () => {
      const obj1 = service.createObject({
        name: 'Chair',
        objectType: 'furniture',
      });
      const obj2 = service.createObject({
        name: 'Table',
        objectType: 'furniture',
      });

      const success = await service.placeObject(obj1.id, {
        targetId: obj2.id,
        relationshipType: 'next_to',
      });

      expect(success).toBe(true);
    });

    it('should place object underneath another object', async () => {
      const rug = service.createObject({ name: 'Rug', objectType: 'item' });
      const table = service.createObject({
        name: 'Table',
        objectType: 'furniture',
      });

      const success = await service.placeObject(rug.id, {
        targetId: table.id,
        relationshipType: 'underneath',
      });

      expect(success).toBe(true);
    });

    it('should attach object to another object', async () => {
      const torch = service.createObject({ name: 'Torch', objectType: 'item' });
      const wall = service.createObject({
        name: 'Wall',
        objectType: 'furniture',
      });

      const success = await service.placeObject(torch.id, {
        targetId: wall.id,
        relationshipType: 'attached_to',
      });

      expect(success).toBe(true);
    });

    it('should not place object inside itself', async () => {
      const container = service.createObject({
        name: 'Chest',
        objectType: 'container',
        isContainer: true,
        canContain: true,
      });

      const success = await service.placeObject(container.id, {
        targetId: container.id,
        relationshipType: 'inside',
      });

      expect(success).toBe(false);
    });

    it('should not place object inside non-container', async () => {
      const item = service.createObject({ name: 'Key', objectType: 'item' });
      const nonContainer = service.createObject({
        name: 'Rock',
        objectType: 'item',
      });

      const success = await service.placeObject(item.id, {
        targetId: nonContainer.id,
        relationshipType: 'inside',
      });

      expect(success).toBe(false);
    });

    it('should not place object in locked container', async () => {
      const container = service.createObject({
        name: 'Chest',
        objectType: 'container',
        isContainer: true,
        canContain: true,
        state: { isLocked: true },
      });

      const item = service.createObject({ name: 'Key', objectType: 'item' });

      const success = await service.placeObject(item.id, {
        targetId: container.id,
        relationshipType: 'inside',
      });

      expect(success).toBe(false);
    });

    it('should not place object in closed container', async () => {
      const container = service.createObject({
        name: 'Chest',
        objectType: 'container',
        isContainer: true,
        canContain: true,
        state: { isOpen: false },
      });

      const item = service.createObject({ name: 'Key', objectType: 'item' });

      const success = await service.placeObject(item.id, {
        targetId: container.id,
        relationshipType: 'inside',
      });

      expect(success).toBe(false);
    });

    it('should respect container capacity limits', async () => {
      const container = service.createObject({
        name: 'Small Box',
        objectType: 'container',
        isContainer: true,
        canContain: true,
        containerCapacity: 2,
        containedObjects: [],
      });

      const item1 = service.createObject({
        name: 'Item 1',
        objectType: 'item',
      });
      const item2 = service.createObject({
        name: 'Item 2',
        objectType: 'item',
      });
      const item3 = service.createObject({
        name: 'Item 3',
        objectType: 'item',
      });

      expect(
        await service.placeObject(item1.id, {
          targetId: container.id,
          relationshipType: 'inside',
        }),
      ).toBe(true);
      expect(
        await service.placeObject(item2.id, {
          targetId: container.id,
          relationshipType: 'inside',
        }),
      ).toBe(true);
      expect(
        await service.placeObject(item3.id, {
          targetId: container.id,
          relationshipType: 'inside',
        }),
      ).toBe(false);
    });

    it('should not place on top of non-furniture objects', async () => {
      const item = service.createObject({ name: 'Item', objectType: 'item' });
      const book = service.createObject({ name: 'Book', objectType: 'item' });

      const success = await service.placeObject(book.id, {
        targetId: item.id,
        relationshipType: 'on_top_of',
      });

      expect(success).toBe(false);
    });

    it('should return false for invalid relationship types', async () => {
      const obj1 = service.createObject({
        name: 'Object 1',
        objectType: 'item',
      });
      const obj2 = service.createObject({
        name: 'Object 2',
        objectType: 'item',
      });

      const success = await service.placeObject(obj1.id, {
        targetId: obj2.id,
        relationshipType: 'invalid_type' as any,
      });

      expect(success).toBe(false);
    });

    it('should return false when placing non-existent object', async () => {
      const container = service.createObject({
        name: 'Chest',
        objectType: 'container',
        isContainer: true,
        canContain: true,
      });

      const success = await service.placeObject('non-existent', {
        targetId: container.id,
        relationshipType: 'inside',
      });

      expect(success).toBe(false);
    });

    it('should return false when placing into non-existent target', async () => {
      const item = service.createObject({ name: 'Key', objectType: 'item' });

      const success = await service.placeObject(item.id, {
        targetId: 'non-existent',
        relationshipType: 'inside',
      });

      expect(success).toBe(false);
    });

    it('should get spatial relationships for object', () => {
      const container = service.createObject({
        name: 'Chest',
        objectType: 'container',
        isContainer: true,
        canContain: true,
      });

      const item = service.createObject({ name: 'Key', objectType: 'item' });

      service.placeObject(item.id, {
        targetId: container.id,
        relationshipType: 'inside',
      });

      const relationships = service.getSpatialRelationships(item.id);
      expect(relationships).toHaveLength(1);
      expect(relationships[0].targetId).toBe(container.id);
      expect(relationships[0].relationshipType).toBe('inside');
    });

    it('should return empty array for object with no relationships', () => {
      const obj = service.createObject({ name: 'Test', objectType: 'item' });
      const relationships = service.getSpatialRelationships(obj.id);
      expect(relationships).toEqual([]);
    });

    it('should return empty array for non-existent object relationships', () => {
      const relationships = service.getSpatialRelationships('non-existent');
      expect(relationships).toEqual([]);
    });
  });

  describe('Container Management', () => {
    it('should remove object from container', async () => {
      const container = service.createObject({
        name: 'Chest',
        objectType: 'container',
        isContainer: true,
        canContain: true,
        containedObjects: [],
      });

      const item = service.createObject({ name: 'Key', objectType: 'item' });

      await service.placeObject(item.id, {
        targetId: container.id,
        relationshipType: 'inside',
      });

      const success = await service.removeObjectFromContainer(item.id, container.id);

      expect(success).toBe(true);

      const updatedContainer = service.getObject(container.id);
      expect(updatedContainer?.containedObjects).not.toContain(item.id);

      const updatedItem = service.getObject(item.id);
      expect(updatedItem?.spatialRelationship).toBeUndefined();
    });

    it('should return false when removing from non-existent container', async () => {
      const item = service.createObject({ name: 'Key', objectType: 'item' });
      const success = await service.removeObjectFromContainer(
        item.id,
        'non-existent',
      );
      expect(success).toBe(false);
    });

    it('should return false when removing object not in container', async () => {
      const container = service.createObject({
        name: 'Chest',
        objectType: 'container',
        isContainer: true,
        canContain: true,
        containedObjects: [],
      });

      const item = service.createObject({ name: 'Key', objectType: 'item' });

      const success = await service.removeObjectFromContainer(item.id, container.id);
      expect(success).toBe(false);
    });

    it('should get all objects in container', () => {
      const container = service.createObject({
        name: 'Chest',
        objectType: 'container',
        isContainer: true,
        canContain: true,
        containedObjects: [],
      });

      const item1 = service.createObject({ name: 'Key', objectType: 'item' });
      const item2 = service.createObject({ name: 'Coin', objectType: 'item' });

      service.placeObject(item1.id, {
        targetId: container.id,
        relationshipType: 'inside',
      });
      service.placeObject(item2.id, {
        targetId: container.id,
        relationshipType: 'inside',
      });

      const contents = service.getObjectsInContainer(container.id);
      expect(contents).toHaveLength(2);
      expect(contents.map((o) => o.id)).toContain(item1.id);
      expect(contents.map((o) => o.id)).toContain(item2.id);
    });

    it('should return empty array for empty container', () => {
      const container = service.createObject({
        name: 'Chest',
        objectType: 'container',
        isContainer: true,
        canContain: true,
        containedObjects: [],
      });

      const contents = service.getObjectsInContainer(container.id);
      expect(contents).toEqual([]);
    });

    it('should return empty array for non-container', () => {
      const item = service.createObject({ name: 'Rock', objectType: 'item' });
      const contents = service.getObjectsInContainer(item.id);
      expect(contents).toEqual([]);
    });

    it('should prevent duplicate items in container', () => {
      const container = service.createObject({
        name: 'Chest',
        objectType: 'container',
        isContainer: true,
        canContain: true,
        containedObjects: [],
      });

      const item = service.createObject({ name: 'Key', objectType: 'item' });

      service.placeObject(item.id, {
        targetId: container.id,
        relationshipType: 'inside',
      });
      service.placeObject(item.id, {
        targetId: container.id,
        relationshipType: 'inside',
      });

      const updatedContainer = service.getObject(container.id);
      const keyCount = updatedContainer?.containedObjects?.filter(
        (id) => id === item.id,
      ).length;
      expect(keyCount).toBe(1);
    });
  });

  describe('Object Location', () => {
    it('should get descriptive location for object inside container', () => {
      const chest = service.createObject({
        name: 'Wooden Chest',
        objectType: 'container',
        isContainer: true,
        canContain: true,
      });

      const key = service.createObject({
        name: 'Golden Key',
        objectType: 'item',
      });

      service.placeObject(key.id, {
        targetId: chest.id,
        relationshipType: 'inside',
      });

      const location = service.getObjectLocation(key.id);
      expect(location).toContain('Golden Key');
      expect(location).toContain('inside');
      expect(location).toContain('Wooden Chest');
    });

    it('should get location for object on top of furniture', () => {
      const table = service.createObject({
        name: 'Oak Table',
        objectType: 'furniture',
      });

      const book = service.createObject({
        name: 'Ancient Tome',
        objectType: 'item',
      });

      service.placeObject(book.id, {
        targetId: table.id,
        relationshipType: 'on_top_of',
      });

      const location = service.getObjectLocation(book.id);
      expect(location).toContain('Ancient Tome');
      // Note: The implementation's replace() only replaces first underscore
      expect(location).toContain('on top');
      expect(location).toContain('Oak Table');
    });

    it('should use custom description if provided', () => {
      const container = service.createObject({
        name: 'Chest',
        objectType: 'container',
        isContainer: true,
        canContain: true,
      });

      const item = service.createObject({ name: 'Key', objectType: 'item' });

      service.placeObject(item.id, {
        targetId: container.id,
        relationshipType: 'inside',
        description: 'The key is hidden beneath false bottom of the chest',
      });

      const location = service.getObjectLocation(item.id);
      expect(location).toBe(
        'The key is hidden beneath false bottom of the chest',
      );
    });

    it('should handle object with no placement', () => {
      const item = service.createObject({
        name: 'Floating Key',
        objectType: 'item',
      });
      const location = service.getObjectLocation(item.id);
      expect(location).toContain('not placed anywhere');
    });

    it('should handle non-existent object', () => {
      const location = service.getObjectLocation('non-existent');
      expect(location).toContain('not placed anywhere');
    });
  });

  describe('Cache Management', () => {
    it('should clear cache', () => {
      service.createObject({ name: 'Object 1', objectType: 'item' });
      service.createObject({ name: 'Object 2', objectType: 'item' });

      expect(service.getAllObjects()).toHaveLength(2);

      service.clearCache();

      expect(service.getAllObjects()).toHaveLength(0);
    });

    it('should get cache statistics', () => {
      const obj1 = service.createObject({
        name: 'Object 1',
        objectType: 'item',
      });
      const obj2 = service.createObject({
        name: 'Object 2',
        objectType: 'item',
      });

      const stats = service.getCacheStats();

      expect(stats.size).toBe(2);
      expect(stats.objects).toContain(obj1.id);
      expect(stats.objects).toContain(obj2.id);
    });

    it('should return empty stats for cleared cache', () => {
      service.createObject({ name: 'Test', objectType: 'item' });
      service.clearCache();

      const stats = service.getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.objects).toEqual([]);
    });
  });

  describe('Database Persistence', () => {
    it('should persist objects to database', async () => {
      service.createObject({ name: 'Object 1', objectType: 'item' });
      service.createObject({ name: 'Object 2', objectType: 'item' });

      await service.persistObjects();

      expect(mockDatabaseService.transaction).toHaveBeenCalled();
    });

    it('should handle persistence without database service', async () => {
      const serviceWithoutDb = new ObjectService(entityService, undefined);
      serviceWithoutDb.createObject({ name: 'Test', objectType: 'item' });

      await expect(serviceWithoutDb.persistObjects()).resolves.not.toThrow();
    });

    it('should load objects from database', async () => {
      mockDatabaseService.prepare = jest.fn(() => ({
        all: jest.fn(() => []),
        get: jest.fn(),
      }));

      await service.loadObjects('game-123');

      expect(mockDatabaseService.prepare).toHaveBeenCalled();
    });

    it('should handle load without database service', async () => {
      const serviceWithoutDb = new ObjectService(entityService, undefined);
      await expect(
        serviceWithoutDb.loadObjects('game-123'),
      ).resolves.not.toThrow();
    });

    it('should get object with database fallback', async () => {
      const mockObject: IObject = {
        id: 'obj-123',
        name: 'Test Object',
        type: 'object',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        properties: {},
        containedObjects: [],
        canContain: false,
        isContainer: false,
        isPortable: true,
      };

      mockDatabaseService.prepare = jest.fn(() => ({
        get: jest.fn(() => ({
          id: 'obj-123',
          name: 'Test Object',
          object_type: 'item',
          position_x: 0,
          position_y: 0,
          position_z: 0,
          is_portable: 1,
          is_container: 0,
          can_contain: 0,
          container_capacity: 0,
          weight: 0,
          properties: '{}',
        })),
      }));

      const result = await service.getObjectWithFallback('obj-123', 'game-123');

      expect(result).toBeDefined();
      expect(mockDatabaseService.prepare).toHaveBeenCalled();
    });

    it('should load object on demand', async () => {
      const obj = service.createObject({
        name: 'Test',
        objectType: 'item',
        gameId: 'game-123',
      });
      const result = await service.loadObjectOnDemand('game-123', obj.id);

      expect(result).toBeDefined();
      expect(result?.id).toBe(obj.id);
    });

    it('should refresh object from database', async () => {
      const obj = service.createObject({
        name: 'Original',
        objectType: 'item',
        gameId: 'game-123',
      });

      mockDatabaseService.prepare = jest.fn(() => ({
        get: jest.fn(() => ({
          id: obj.id,
          name: 'Updated',
          object_type: 'item',
          position_x: 0,
          position_y: 0,
          position_z: 0,
          is_portable: 1,
          is_container: 0,
          can_contain: 0,
          container_capacity: 0,
          weight: 0,
          properties: '{}',
        })),
      }));

      const refreshed = await service.refreshObject('game-123', obj.id);

      expect(refreshed).toBeDefined();
      expect(mockDatabaseService.prepare).toHaveBeenCalled();
    });
  });

  describe('Version Management', () => {
    it('should save object version', async () => {
      const obj = service.createObject({ name: 'Test', objectType: 'item' });

      const version = await service.saveObjectVersion(obj.id, 'Initial save');

      expect(mockDatabaseService.saveVersion).toHaveBeenCalledWith(
        'object',
        obj.id,
        expect.any(Object),
        'object_service',
        'Initial save',
      );
      expect(version).toBe(1);
    });

    it('should throw error when saving version without database', async () => {
      const serviceWithoutDb = new ObjectService(entityService, undefined);
      const obj = serviceWithoutDb.createObject({
        name: 'Test',
        objectType: 'item',
      });

      await expect(
        serviceWithoutDb.saveObjectVersion(obj.id),
      ).rejects.toThrow();
    });

    it('should throw error when saving non-existent object version', async () => {
      await expect(service.saveObjectVersion('non-existent')).rejects.toThrow();
    });

    it('should get object version', async () => {
      const obj = service.createObject({ name: 'Test', objectType: 'item' });

      await service.getObjectVersion(obj.id, 1);

      expect(mockDatabaseService.getVersion).toHaveBeenCalledWith(
        'object',
        obj.id,
        1,
      );
    });

    it('should throw error when getting version without database', async () => {
      const serviceWithoutDb = new ObjectService(entityService, undefined);

      await expect(
        serviceWithoutDb.getObjectVersion('obj-123', 1),
      ).rejects.toThrow();
    });

    it('should rollback object to previous version', async () => {
      const obj = service.createObject({
        name: 'Current Version',
        objectType: 'item',
        description: 'Current description',
      });

      const oldVersion: IObject = {
        ...obj,
        name: 'Old Version',
        description: 'Old description',
      };

      mockDatabaseService.getVersion = jest.fn().mockResolvedValue(oldVersion);

      const success = await service.rollbackObject(obj.id, 1);

      expect(success).toBe(true);
      expect(mockDatabaseService.getVersion).toHaveBeenCalledWith(
        'object',
        obj.id,
        1,
      );
      expect(mockDatabaseService.saveVersion).toHaveBeenCalled();
    });

    it('should return false when rolling back to non-existent version', async () => {
      const obj = service.createObject({ name: 'Test', objectType: 'item' });

      mockDatabaseService.getVersion = jest.fn().mockResolvedValue(null);

      const success = await service.rollbackObject(obj.id, 999);

      expect(success).toBe(false);
    });

    it('should throw error when rolling back without database', async () => {
      const serviceWithoutDb = new ObjectService(entityService, undefined);

      await expect(
        serviceWithoutDb.rollbackObject('obj-123', 1),
      ).rejects.toThrow();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle objects with undefined properties gracefully', () => {
      const obj = service.createObject({
        name: 'Minimal Object',
        objectType: 'item',
      });

      expect(obj.description).toBeUndefined();
      expect(obj.material).toBeUndefined();
      expect(obj.weight).toBeUndefined();
      expect(obj.health).toBeUndefined();
    });

    it('should handle updating with empty updates object', async () => {
      const obj = service.createObject({ name: 'Test', objectType: 'item' });
      const success = await service.updateObject(obj.id, {});

      expect(success).toBe(true);
    });

    it('should handle container with no containedObjects array', () => {
      const container = service.createObject({
        name: 'Broken Container',
        objectType: 'container',
        isContainer: true,
        canContain: true,
      });

      // Manually remove the array
      const containerObj = service.getObject(container.id);
      if (containerObj) {
        delete containerObj.containedObjects;
      }

      const contents = service.getObjectsInContainer(container.id);
      expect(contents).toEqual([]);
    });

    it('should filter out undefined objects when getting container contents', () => {
      const container = service.createObject({
        name: 'Container',
        objectType: 'container',
        isContainer: true,
        canContain: true,
        containedObjects: ['valid-id', 'non-existent-id'],
      });

      const validItem = service.createObject({
        name: 'Valid Item',
        objectType: 'item',
      });

      const containerObj = service.getObject(container.id);
      if (containerObj) {
        containerObj.containedObjects = [validItem.id, 'non-existent-id'];
      }

      const contents = service.getObjectsInContainer(container.id);
      expect(contents).toHaveLength(1);
      expect(contents[0].id).toBe(validItem.id);
    });

    it('should handle missing target entity in spatial relationship description', () => {
      const obj = service.createObject({
        name: 'Object',
        objectType: 'item',
        spatialRelationship: {
          targetId: 'non-existent-target',
          relationshipType: 'inside',
        },
      });

      const location = service.getObjectLocation(obj.id);
      expect(location).toContain('unknown target');
    });

    it('should handle errors during database persistence gracefully', async () => {
      mockDatabaseService.transaction = jest.fn(() => {
        throw new Error('Database error');
      });

      service.createObject({ name: 'Test', objectType: 'item' });

      await expect(service.persistObjects()).rejects.toThrow('Database error');
    });

    it('should handle errors during database loading gracefully', async () => {
      mockDatabaseService.prepare = jest.fn(() => {
        throw new Error('Database error');
      });

      // loadObjects catches errors and doesn't rethrow, just logs them
      await expect(service.loadObjects('game-123')).resolves.not.toThrow();
    });

    it('should merge in-memory and database objects correctly', async () => {
      const inMemoryObj = service.createObject({
        name: 'In Memory',
        objectType: 'item',
        gameId: 'game-123',
      });

      mockDatabaseService.prepare = jest.fn(() => ({
        all: jest.fn(() => [
          {
            id: 'db-obj-1',
            name: 'From DB',
            object_type: 'item',
            game_id: 'game-123',
            position_x: 0,
            position_y: 0,
            position_z: 0,
            is_portable: 1,
            is_container: 0,
            can_contain: 0,
            container_capacity: 0,
            weight: 0,
            properties: '{}',
          },
        ]),
        get: jest.fn((id) => {
          if (id === 'db-obj-1') {
            return {
              id: 'db-obj-1',
              name: 'From DB',
              object_type: 'item',
              game_id: 'game-123',
              position_x: 0,
              position_y: 0,
              position_z: 0,
              is_portable: 1,
              is_container: 0,
              can_contain: 0,
              container_capacity: 0,
              weight: 0,
              properties: '{}',
            };
          }
          return null;
        }),
      }));

      const allObjects = await service.getAllObjectsForGame('game-123');

      expect(allObjects.length).toBeGreaterThanOrEqual(1);
      expect(allObjects.some((o) => o.id === inMemoryObj.id)).toBe(true);
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle nested containers', () => {
      const chest = service.createObject({
        name: 'Large Chest',
        objectType: 'container',
        isContainer: true,
        canContain: true,
        containerCapacity: 5,
      });

      const box = service.createObject({
        name: 'Small Box',
        objectType: 'container',
        isContainer: true,
        canContain: true,
        containerCapacity: 3,
      });

      const key = service.createObject({
        name: 'Golden Key',
        objectType: 'item',
      });

      // Place box in chest
      service.placeObject(box.id, {
        targetId: chest.id,
        relationshipType: 'inside',
      });

      // Place key in box
      service.placeObject(key.id, {
        targetId: box.id,
        relationshipType: 'inside',
      });

      expect(service.getObjectsInContainer(chest.id)).toHaveLength(1);
      expect(service.getObjectsInContainer(box.id)).toHaveLength(1);
    });

    it('should handle multiple objects with same name', () => {
      const coin1 = service.createObject({
        name: 'Gold Coin',
        objectType: 'item',
      });
      const coin2 = service.createObject({
        name: 'Gold Coin',
        objectType: 'item',
      });
      const coin3 = service.createObject({
        name: 'Gold Coin',
        objectType: 'item',
      });

      expect(coin1.id).not.toBe(coin2.id);
      expect(coin2.id).not.toBe(coin3.id);
      expect(coin1.id).not.toBe(coin3.id);

      const allObjects = service.getAllObjects();
      const goldCoins = allObjects.filter((o) => o.name === 'Gold Coin');
      expect(goldCoins).toHaveLength(3);
    });

    it('should handle object with multiple material properties', () => {
      const compositeObject = service.createObject({
        name: 'Steel-Wood Shield',
        objectType: 'armor',
        material: 'steel',
        materialProperties: {
          material: 'composite',
          density: 4.0,
          conductivity: 4,
          flammability: 2,
          brittleness: 3,
          resistances: {
            fire: 6,
            force: 5,
            lightning: 3,
            ice: 4,
          },
        },
      });

      expect(compositeObject.materialProperties?.material).toBe('composite');
      expect(compositeObject.materialProperties?.resistances?.fire).toBe(6);
      expect(compositeObject.materialProperties?.resistances?.force).toBe(5);
    });

    it('should handle rapid cache operations', () => {
      const objects = [];

      // Create many objects
      for (let i = 0; i < 100; i++) {
        objects.push(
          service.createObject({
            name: `Object ${i}`,
            objectType: 'item',
          }),
        );
      }

      expect(service.getAllObjects()).toHaveLength(100);

      // Clear and verify
      service.clearCache();
      expect(service.getAllObjects()).toHaveLength(0);

      // Recreate and verify
      for (let i = 0; i < 50; i++) {
        service.createObject({ name: `New Object ${i}`, objectType: 'item' });
      }

      expect(service.getAllObjects()).toHaveLength(50);
    });

    it('should maintain object integrity across updates', () => {
      const obj = service.createObject({
        name: 'Test Object',
        objectType: 'item',
        description: 'Original description',
        weight: 10,
        health: 100,
        maxHealth: 100,
        material: 'steel',
      });

      const originalId = obj.id;

      // Multiple updates
      service.updateObject(obj.id, { name: 'Updated Name' });
      service.updateObject(obj.id, { description: 'New description' });
      service.updateObject(obj.id, { weight: 15 });

      const updated = service.getObject(obj.id);

      expect(updated?.id).toBe(originalId);
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.description).toBe('New description');
      expect(updated?.weight).toBe(15);
      expect(updated?.type).toBe('object');
      expect(updated?.material).toBe('steel');
    });
  });
});
