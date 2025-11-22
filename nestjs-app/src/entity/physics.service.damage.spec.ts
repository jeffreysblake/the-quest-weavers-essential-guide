import { Test, TestingModule } from '@nestjs/testing';
import { PhysicsService } from './physics.service';
import { EntityService } from './entity.service';
import { ObjectService } from './object.service';
import { RoomService } from './room.service';
import { IObject } from './object.interface';
import { IPhysicsEffect, IMaterialProperties } from './physics.interface';

describe('PhysicsService - Damage', () => {
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

  describe('Ice Effects', () => {
    it('should apply ice damage', async () => {
      const woodMaterial = PhysicsService.createMaterialPreset('wood');
      const target = createTestObject('wood1', woodMaterial, 10, 10);

      mockObjectService.getObject = jest.fn().mockReturnValue(target);

      // Wood has ice resistance 5, so effective = 6 - 5 = 1
      const effect: IPhysicsEffect = {
        type: 'ice',
        intensity: 6,
        description: 'frost',
      };

      const result = await service.applyEffect('wood1', effect);

      expect(result.success).toBe(true);
      expect(result.objectsAffected![0].damage).toBe(Math.floor(1 * 0.8));
    });

    it('should freeze water objects', async () => {
      const waterMaterial = PhysicsService.createMaterialPreset('water');
      const target = createTestObject('water1', waterMaterial, 10, 10);

      mockObjectService.getObject = jest.fn().mockReturnValue(target);

      const effect: IPhysicsEffect = {
        type: 'ice',
        intensity: 5,
        description: 'frost',
      };

      const result = await service.applyEffect('water1', effect);

      expect(result.success).toBe(true);
      expect(result.message).toContain('freezes solid');
      expect(result.objectsAffected![0].newState?.frozen).toBe(true);
    });

    it('should make non-water objects brittle', async () => {
      const metalMaterial = PhysicsService.createMaterialPreset('metal');
      const target = createTestObject('metal1', metalMaterial, 10, 10);

      mockObjectService.getObject = jest.fn().mockReturnValue(target);

      // Metal has ice resistance 7, so need intensity > 7 to overcome
      const effect: IPhysicsEffect = {
        type: 'ice',
        intensity: 8,
        description: 'frost',
      };

      const result = await service.applyEffect('metal1', effect);

      expect(result.success).toBe(true);
      expect(result.message).toContain('brittle from the cold');
      expect(result.objectsAffected![0].newState?.brittle).toBe(true);
    });
  });

  describe('Force Effects', () => {
    it('should apply force damage based on brittleness', async () => {
      const glassMaterial = PhysicsService.createMaterialPreset('glass');
      const target = createTestObject('glass1', glassMaterial, 10, 10);

      mockObjectService.getObject = jest.fn().mockReturnValue(target);

      const effect: IPhysicsEffect = {
        type: 'force',
        intensity: 5,
        description: 'impact',
      };

      const result = await service.applyEffect('glass1', effect);

      expect(result.success).toBe(true);
      expect(result.objectsAffected![0].damage).toBeGreaterThan(0);
    });

    it('should shatter brittle objects with high force', async () => {
      const glassMaterial = PhysicsService.createMaterialPreset('glass');
      const target = createTestObject('glass1', glassMaterial, 10, 10);

      mockObjectService.getObject = jest.fn().mockReturnValue(target);

      const effect: IPhysicsEffect = {
        type: 'force',
        intensity: 7,
        description: 'impact',
      };

      const result = await service.applyEffect('glass1', effect);

      expect(result.success).toBe(true);
      expect(result.message).toContain('shatters');
      expect(result.objectsAffected![0].destroyed).toBe(true);
      expect(result.objectsAffected![0].damage).toBe(10);
    });

    it('should not shatter when brittleness is low', async () => {
      const metalMaterial = PhysicsService.createMaterialPreset('metal');
      const target = createTestObject('metal1', metalMaterial, 10, 10);

      mockObjectService.getObject = jest.fn().mockReturnValue(target);

      const effect: IPhysicsEffect = {
        type: 'force',
        intensity: 7,
        description: 'impact',
      };

      const result = await service.applyEffect('metal1', effect);

      expect(result.success).toBe(true);
      expect(result.message).toContain('is damaged');
      expect(result.objectsAffected![0].destroyed).toBeFalsy();
    });

    it('should not shatter when intensity is low even with high brittleness', async () => {
      const glassMaterial = PhysicsService.createMaterialPreset('glass');
      const target = createTestObject('glass1', glassMaterial, 10, 10);

      mockObjectService.getObject = jest.fn().mockReturnValue(target);

      const effect: IPhysicsEffect = {
        type: 'force',
        intensity: 5,
        description: 'impact',
      };

      const result = await service.applyEffect('glass1', effect);

      expect(result.success).toBe(true);
      expect(result.objectsAffected![0].destroyed).toBeFalsy();
    });
  });

  describe('Resistance Calculation', () => {
    it('should reduce effective intensity based on resistance', async () => {
      const stoneMaterial = PhysicsService.createMaterialPreset('stone');
      const target = createTestObject('stone1', stoneMaterial, 10, 10);

      mockObjectService.getObject = jest.fn().mockReturnValue(target);

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 5,
        description: 'flames',
      };

      const result = await service.applyEffect('stone1', effect);

      expect(result.success).toBe(true);
      // Stone has fire resistance 9, so 5 - 9 = -4, clamped to 0
      expect(result.message).toContain('resists');
    });

    it('should resist effect completely when resistance >= intensity', async () => {
      const metalMaterial = PhysicsService.createMaterialPreset('metal');
      const target = createTestObject('metal1', metalMaterial, 10, 10);

      mockObjectService.getObject = jest.fn().mockReturnValue(target);

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 5,
        description: 'flames',
      };

      const result = await service.applyEffect('metal1', effect);

      expect(result.success).toBe(true);
      expect(result.message).toContain('resists the fire effect');
      expect(result.objectsAffected).toEqual([]);
    });
  });

  describe('Damage Application - Zombie Resurrection Bug Fix', () => {
    it('should NOT resurrect objects with 0 health (BUG FIX: zombie resurrection)', async () => {
      const woodMaterial = PhysicsService.createMaterialPreset('wood');
      const target = createTestObject('wood1', woodMaterial, 0, 10);

      mockObjectService.getObject = jest.fn().mockReturnValue(target);

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 5,
        description: 'flames',
      };

      await service.applyEffect('wood1', effect);

      // Verify that updateEntity was called
      expect(mockEntityService.updateEntity).toHaveBeenCalled();

      // Get the updated object from the call
      const updateCall = (mockEntityService.updateEntity as jest.Mock).mock.calls[0];
      const updatedObject = updateCall[1];

      // Should stay at 0, not become negative or positive
      expect(updatedObject.health).toBe(0);
    });

    it('should keep health at 0 for destroyed objects (BUG FIX: zombie resurrection)', async () => {
      const glassMaterial = PhysicsService.createMaterialPreset('glass');
      const target = createTestObject('glass1', glassMaterial, 0, 10);

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
    });

    it('should handle undefined health correctly (BUG FIX: zombie resurrection)', async () => {
      const woodMaterial = PhysicsService.createMaterialPreset('wood');
      const target = createTestObject('wood1', woodMaterial, undefined as any, 10);

      mockObjectService.getObject = jest.fn().mockReturnValue(target);

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 5,
        description: 'flames',
      };

      await service.applyEffect('wood1', effect);

      const updateCall = (mockEntityService.updateEntity as jest.Mock).mock.calls[0];
      const updatedObject = updateCall[1];

      // Should use maxHealth when health is undefined
      expect(updatedObject.health).toBeDefined();
      expect(updatedObject.health).toBeLessThanOrEqual(10);
    });

    it('should apply damage normally to healthy objects', async () => {
      const woodMaterial = PhysicsService.createMaterialPreset('wood');
      const target = createTestObject('wood1', woodMaterial, 10, 10);

      mockObjectService.getObject = jest.fn().mockReturnValue(target);

      // Wood has fire resistance 2, so effective = 5 - 2 = 3, damage = floor(3 * 8/10) = 2
      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 5,
        description: 'flames',
      };

      await service.applyEffect('wood1', effect);

      const updateCall = (mockEntityService.updateEntity as jest.Mock).mock.calls[0];
      const updatedObject = updateCall[1];

      expect(updatedObject.health).toBeGreaterThan(0);
      expect(updatedObject.health).toBeLessThan(10);
    });

    it('should clamp damage to not go below 0', async () => {
      const woodMaterial = PhysicsService.createMaterialPreset('wood');
      const target = createTestObject('wood1', woodMaterial, 5, 10);

      mockObjectService.getObject = jest.fn().mockReturnValue(target);

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 10,
        description: 'inferno',
      };

      await service.applyEffect('wood1', effect);

      const updateCall = (mockEntityService.updateEntity as jest.Mock).mock.calls[0];
      const updatedObject = updateCall[1];

      expect(updatedObject.health).toBe(0);
    });
  });

  describe('Database Update Error Handling', () => {
    it('should continue even if database update fails', async () => {
      const woodMaterial = PhysicsService.createMaterialPreset('wood');
      const target = createTestObject('wood1', woodMaterial, 10, 10);

      mockObjectService.getObject = jest.fn().mockReturnValue(target);
      mockEntityService.updateEntity = jest.fn().mockRejectedValue(new Error('DB Error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 5,
        description: 'flames',
      };

      const result = await service.applyEffect('wood1', effect);

      expect(result.success).toBe(true);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to update object entity'),
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });
  });
});
