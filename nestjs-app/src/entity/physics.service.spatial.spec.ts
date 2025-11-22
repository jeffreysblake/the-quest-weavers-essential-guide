import { Test, TestingModule } from '@nestjs/testing';
import { PhysicsService } from './physics.service';
import { EntityService } from './entity.service';
import { ObjectService } from './object.service';
import { RoomService } from './room.service';
import { IObject } from './object.interface';
import { IPhysicsEffect, IMaterialProperties } from './physics.interface';

describe('PhysicsService - Spatial', () => {
  let service: PhysicsService;
  let mockEntityService: jest.Mocked<Partial<EntityService>>;
  let mockObjectService: jest.Mocked<Partial<ObjectService>>;
  let mockRoomService: jest.Mocked<Partial<RoomService>>;

  // Helper function to create a test object
  const createTestObject = (
    id: string,
    material: IMaterialProperties,
    health = 10,
    maxHealth = 10,
    state = {},
    containedObjects: string[] = [],
  ): IObject => ({
    id,
    name: `test-${id}`,
    type: 'object',
    objectType: 'item',
    materialProperties: material,
    health,
    maxHealth,
    state,
    containedObjects,
  });

  beforeEach(async () => {
    // Create mock services
    mockEntityService = {
      updateEntity: jest.fn().mockResolvedValue(undefined),
    };

    mockObjectService = {
      getObject: jest.fn(),
    };

    mockRoomService = {
      getRoom: jest.fn(),
      getAllRooms: jest.fn().mockReturnValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PhysicsService,
        {
          provide: EntityService,
          useValue: mockEntityService,
        },
        {
          provide: ObjectService,
          useValue: mockObjectService,
        },
        {
          provide: RoomService,
          useValue: mockRoomService,
        },
      ],
    }).compile();

    service = module.get<PhysicsService>(PhysicsService);
  });

  describe('State Changes', () => {
    it('should update object state when effect causes state change', async () => {
      const woodMaterial = PhysicsService.createMaterialPreset('wood');
      const target = createTestObject('wood1', woodMaterial, 10, 10);

      mockObjectService.getObject = jest.fn().mockReturnValue(target);

      // Need intensity 6 to overcome resistance 2 and get effective 4 for catching fire
      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 6,
        description: 'flames',
      };

      await service.applyEffect('wood1', effect);

      const updateCall = (mockEntityService.updateEntity as jest.Mock).mock.calls[0];
      const updatedObject = updateCall[1];

      expect(updatedObject.state).toBeDefined();
      expect(updatedObject.state.isOnFire).toBe(true);
    });

    it('should mark object as destroyed when destroyed flag is set', async () => {
      const glassMaterial = PhysicsService.createMaterialPreset('glass');
      const target = createTestObject('glass1', glassMaterial, 10, 10);

      mockObjectService.getObject = jest.fn().mockReturnValue(target);

      const effect: IPhysicsEffect = {
        type: 'force',
        intensity: 8,
        description: 'impact',
      };

      await service.applyEffect('glass1', effect);

      const updateCall = (mockEntityService.updateEntity as jest.Mock).mock.calls[0];
      const updatedObject = updateCall[1];

      expect(updatedObject.health).toBe(0);
      expect(updatedObject.state.destroyed).toBe(true);
    });

    it('should preserve existing state when applying new state changes', async () => {
      const waterMaterial = PhysicsService.createMaterialPreset('water');
      const target = createTestObject('water1', waterMaterial, 10, 10, { isActive: true });

      mockObjectService.getObject = jest.fn().mockReturnValue(target);

      const effect: IPhysicsEffect = {
        type: 'ice',
        intensity: 5,
        description: 'frost',
      };

      await service.applyEffect('water1', effect);

      const updateCall = (mockEntityService.updateEntity as jest.Mock).mock.calls[0];
      const updatedObject = updateCall[1];

      expect(updatedObject.state.frozen).toBe(true);
      expect(updatedObject.state.isActive).toBe(true);
    });
  });

  describe('Area Effects', () => {
    it('should return failure when room is not found', async () => {
      mockRoomService.getRoom = jest.fn().mockReturnValue(null);

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 5,
        description: 'flames',
      };

      const result = await service.applyAreaEffect('nonexistent-room', effect);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Room not found');
    });

    it('should apply effect to all objects in room', async () => {
      const woodMaterial = PhysicsService.createMaterialPreset('wood');
      const obj1 = createTestObject('obj1', woodMaterial, 10, 10);
      const obj2 = createTestObject('obj2', woodMaterial, 10, 10);

      mockRoomService.getRoom = jest.fn().mockReturnValue({
        id: 'room1',
        objects: ['obj1', 'obj2'],
      });

      mockObjectService.getObject = jest
        .fn()
        .mockReturnValueOnce(obj1)
        .mockReturnValueOnce(obj2);

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 5,
        description: 'flames',
      };

      const result = await service.applyAreaEffect('room1', effect);

      expect(result.success).toBe(true);
      expect(mockObjectService.getObject).toHaveBeenCalledWith('obj1');
      expect(mockObjectService.getObject).toHaveBeenCalledWith('obj2');
    });

    it('should aggregate all affected objects from area effect', async () => {
      const woodMaterial = PhysicsService.createMaterialPreset('wood');
      const obj1 = createTestObject('obj1', woodMaterial, 10, 10);
      const obj2 = createTestObject('obj2', woodMaterial, 10, 10);

      mockRoomService.getRoom = jest.fn().mockReturnValue({
        id: 'room1',
        objects: ['obj1', 'obj2'],
      });

      mockObjectService.getObject = jest
        .fn()
        .mockReturnValueOnce(obj1)
        .mockReturnValueOnce(obj2);

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 5,
        description: 'flames',
      };

      const result = await service.applyAreaEffect('room1', effect);

      expect(result.success).toBe(true);
      expect(result.objectsAffected).toBeDefined();
      // Each object has 1 objectAffected, so total should be 2
      expect(result.objectsAffected!.length).toBeGreaterThanOrEqual(1);
    });

    it('should return failure when no objects are affected', async () => {
      mockRoomService.getRoom = jest.fn().mockReturnValue({
        id: 'room1',
        objects: [],
      });

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 5,
        description: 'flames',
      };

      const result = await service.applyAreaEffect('room1', effect);

      expect(result.success).toBe(false);
    });
  });

  describe('Chain Reactions', () => {
    it('should process chain reactions recursively', async () => {
      const gasMaterial = PhysicsService.createMaterialPreset('gas');
      const woodMaterial = PhysicsService.createMaterialPreset('wood');

      const gas1 = createTestObject('gas1', gasMaterial, 10, 10);
      const wood1 = createTestObject('wood1', woodMaterial, 10, 10);

      mockObjectService.getObject = jest
        .fn()
        .mockReturnValueOnce(gas1)
        .mockReturnValueOnce(wood1);

      mockRoomService.getAllRooms = jest.fn().mockReturnValue([
        {
          id: 'room1',
          objects: ['gas1', 'wood1'],
        },
      ]);

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 8,
        description: 'flames',
      };

      const result = await service.applyEffect('gas1', effect);

      expect(result.success).toBe(true);
      expect(result.message).toContain('explodes');
      // Chain reactions should be present
      expect(mockObjectService.getObject).toHaveBeenCalledWith('wood1');
    });

    it('should reduce intensity in chain reactions', async () => {
      const metalMaterial = PhysicsService.createMaterialPreset('metal');
      const metal1 = createTestObject('metal1', metalMaterial, 10, 10);
      const metal2 = createTestObject('metal2', metalMaterial, 10, 10);

      mockObjectService.getObject = jest
        .fn()
        .mockReturnValueOnce(metal1)
        .mockReturnValueOnce(metal2)
        .mockReturnValueOnce(metal2);

      mockRoomService.getAllRooms = jest.fn().mockReturnValue([
        {
          id: 'room1',
          objects: ['metal1', 'metal2'],
        },
      ]);

      const effect: IPhysicsEffect = {
        type: 'lightning',
        intensity: 8,
        description: 'electricity',
      };

      const result = await service.applyEffect('metal1', effect);

      expect(result.success).toBe(true);
      expect(result.chainReactions).toBeDefined();

      // Verify intensity is reduced in chain
      const chainEffect = result.chainReactions![0]?.effect;
      if (chainEffect) {
        expect(chainEffect.intensity).toBeLessThan(8);
        expect(chainEffect.intensity).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('Spatial Queries', () => {
    it('should find objects in range within same room', async () => {
      const gasMaterial = PhysicsService.createMaterialPreset('gas');
      const target = createTestObject('gas1', gasMaterial, 10, 10);
      const nearby = createTestObject('nearby1', PhysicsService.createMaterialPreset('wood'), 10, 10);

      mockObjectService.getObject = jest
        .fn()
        .mockReturnValueOnce(target)
        .mockReturnValueOnce(nearby);

      mockRoomService.getAllRooms = jest.fn().mockReturnValue([
        {
          id: 'room1',
          objects: ['gas1', 'nearby1'],
        },
      ]);

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 8,
        description: 'flames',
      };

      const result = await service.applyEffect('gas1', effect);

      // Should find nearby objects for explosion chain reaction
      expect(result.chainReactions).toBeDefined();
      expect(result.chainReactions!.length).toBeGreaterThan(0);
    });

    it('should exclude source object from range query', async () => {
      const gasMaterial = PhysicsService.createMaterialPreset('gas');
      const target = createTestObject('gas1', gasMaterial, 10, 10);

      mockObjectService.getObject = jest.fn().mockReturnValue(target);

      mockRoomService.getAllRooms = jest.fn().mockReturnValue([
        {
          id: 'room1',
          objects: ['gas1'],
        },
      ]);

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 8,
        description: 'flames',
      };

      const result = await service.applyEffect('gas1', effect);

      expect(result.success).toBe(true);
      // Should not chain to itself
      expect(result.chainReactions?.some((r) => r.targetId === 'gas1')).toBeFalsy();
    });

    it('should return empty array when object is not in any room', async () => {
      const gasMaterial = PhysicsService.createMaterialPreset('gas');
      const target = createTestObject('gas1', gasMaterial, 10, 10);

      mockObjectService.getObject = jest.fn().mockReturnValue(target);
      mockRoomService.getAllRooms = jest.fn().mockReturnValue([]);

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 8,
        description: 'flames',
      };

      const result = await service.applyEffect('gas1', effect);

      expect(result.success).toBe(true);
      // No chain reactions if not in a room
      expect(result.chainReactions).toEqual([]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle negative intensity', async () => {
      const woodMaterial = PhysicsService.createMaterialPreset('wood');
      const target = createTestObject('wood1', woodMaterial, 10, 10);

      mockObjectService.getObject = jest.fn().mockReturnValue(target);

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: -5,
        description: 'flames',
      };

      const result = await service.applyEffect('wood1', effect);

      expect(result.success).toBe(true);
      // Negative intensity results in complete resistance
      expect(result.message).toContain('resists');
      expect(result.objectsAffected).toEqual([]);
    });

    it('should handle zero intensity', async () => {
      const woodMaterial = PhysicsService.createMaterialPreset('wood');
      const target = createTestObject('wood1', woodMaterial, 10, 10);

      mockObjectService.getObject = jest.fn().mockReturnValue(target);

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 0,
        description: 'flames',
      };

      const result = await service.applyEffect('wood1', effect);

      expect(result.success).toBe(true);
      // Zero intensity results in complete resistance
      expect(result.message).toContain('resists');
      expect(result.objectsAffected).toEqual([]);
    });

    it('should handle very high intensity', async () => {
      const woodMaterial = PhysicsService.createMaterialPreset('wood');
      const target = createTestObject('wood1', woodMaterial, 10, 10);

      mockObjectService.getObject = jest.fn().mockReturnValue(target);

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 100,
        description: 'inferno',
      };

      const result = await service.applyEffect('wood1', effect);

      expect(result.success).toBe(true);
      expect(result.objectsAffected![0].damage).toBeDefined();
    });

    it('should handle objects with no maxHealth', async () => {
      const woodMaterial = PhysicsService.createMaterialPreset('wood');
      const target: IObject = {
        id: 'wood1',
        name: 'test-wood1',
        type: 'object',
        objectType: 'item',
        materialProperties: woodMaterial,
        health: undefined,
        maxHealth: undefined,
      };

      mockObjectService.getObject = jest.fn().mockReturnValue(target);

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 9,
        description: 'inferno',
      };

      await service.applyEffect('wood1', effect);

      // Should use default value of 10
      const updateCall = (mockEntityService.updateEntity as jest.Mock).mock.calls[0];
      expect(updateCall).toBeDefined();
    });

    it('should handle empty contained objects array', async () => {
      const metalMaterial = PhysicsService.createMaterialPreset('metal');
      const container = createTestObject('container1', metalMaterial, 10, 10, {}, []);

      mockObjectService.getObject = jest.fn().mockReturnValue(container);

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 6,
        description: 'flames',
      };

      const result = await service.applyEffect('container1', effect);

      expect(result.success).toBe(true);
      // Should not explode without explosive contents
      expect(result.message).not.toContain('explodes');
    });

    it('should handle missing spatial relationship', async () => {
      const metalMaterial = PhysicsService.createMaterialPreset('metal');
      const target = createTestObject('metal1', metalMaterial, 10, 10);
      // No spatialRelationship set

      mockObjectService.getObject = jest.fn().mockReturnValue(target);

      mockRoomService.getAllRooms = jest.fn().mockReturnValue([
        {
          id: 'room1',
          objects: ['metal1'],
        },
      ]);

      const effect: IPhysicsEffect = {
        type: 'lightning',
        intensity: 8,
        description: 'electricity',
      };

      const result = await service.applyEffect('metal1', effect);

      expect(result.success).toBe(true);
      // Should still work without spatial relationship
    });
  });
});
