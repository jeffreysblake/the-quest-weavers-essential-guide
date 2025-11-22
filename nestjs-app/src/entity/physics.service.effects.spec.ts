import { Test, TestingModule } from '@nestjs/testing';
import { PhysicsService } from './physics.service';
import { EntityService } from './entity.service';
import { ObjectService } from './object.service';
import { RoomService } from './room.service';
import { IObject } from './object.interface';
import { IPhysicsEffect, IMaterialProperties } from './physics.interface';

describe('PhysicsService - Effects', () => {
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

  describe('Service Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have all required dependencies injected', () => {
      expect(mockEntityService).toBeDefined();
      expect(mockObjectService).toBeDefined();
      expect(mockRoomService).toBeDefined();
    });
  });

  describe('Material Presets', () => {
    it('should create wood material preset with correct properties', () => {
      const wood = PhysicsService.createMaterialPreset('wood');
      expect(wood.material).toBe('wood');
      expect(wood.flammability).toBe(8);
      expect(wood.conductivity).toBe(1);
      expect(wood.resistances?.fire).toBe(2);
      expect(wood.resistances?.lightning).toBe(8);
    });

    it('should create metal material preset with correct properties', () => {
      const metal = PhysicsService.createMaterialPreset('metal');
      expect(metal.material).toBe('metal');
      expect(metal.conductivity).toBe(9);
      expect(metal.flammability).toBe(0);
      expect(metal.resistances?.lightning).toBe(1);
    });

    it('should create glass material preset with correct properties', () => {
      const glass = PhysicsService.createMaterialPreset('glass');
      expect(glass.material).toBe('glass');
      expect(glass.brittleness).toBe(9);
      expect(glass.properties?.transparent).toBe(true);
    });

    it('should create gas material preset with explosive property', () => {
      const gas = PhysicsService.createMaterialPreset('gas');
      expect(gas.material).toBe('gas');
      expect(gas.flammability).toBe(8);
      expect(gas.properties?.explosive).toBe(true);
    });

    it('should create water material preset with high conductivity', () => {
      const water = PhysicsService.createMaterialPreset('water');
      expect(water.material).toBe('water');
      expect(water.conductivity).toBe(8);
      expect(water.flammability).toBe(0);
    });

    it('should default to stone for unknown material types', () => {
      const unknown = PhysicsService.createMaterialPreset('unknown' as any);
      expect(unknown.material).toBe('stone');
    });
  });

  describe('applyEffect - Target Not Found', () => {
    it('should return failure when target object does not exist', async () => {
      mockObjectService.getObject = jest.fn().mockReturnValue(null);

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 5,
        description: 'test fire',
      };

      const result = await service.applyEffect('nonexistent', effect);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Target object not found');
    });
  });

  describe('applyEffect - No Material Properties', () => {
    it('should return failure when object has no material properties', async () => {
      const objectWithoutMaterial: IObject = {
        id: 'obj1',
        name: 'test',
        type: 'object',
        objectType: 'item',
        // No materialProperties
      };

      mockObjectService.getObject = jest.fn().mockReturnValue(objectWithoutMaterial);

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 5,
        description: 'test fire',
      };

      const result = await service.applyEffect('obj1', effect);

      expect(result.success).toBe(false);
      expect(result.message).toContain('has no material properties');
    });
  });

  describe('Fire Effects', () => {
    it('should apply fire damage based on flammability', async () => {
      const woodMaterial = PhysicsService.createMaterialPreset('wood');
      const target = createTestObject('wood1', woodMaterial, 10, 10);

      mockObjectService.getObject = jest.fn().mockReturnValue(target);

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 5,
        description: 'flames',
      };

      const result = await service.applyEffect('wood1', effect);

      expect(result.success).toBe(true);
      expect(result.objectsAffected).toBeDefined();
      expect(result.objectsAffected![0].damage).toBeGreaterThan(0);
      expect(mockEntityService.updateEntity).toHaveBeenCalled();
    });

    it('should set object on fire when flammability > 5 and intensity > 3', async () => {
      const woodMaterial = PhysicsService.createMaterialPreset('wood');
      const target = createTestObject('wood1', woodMaterial, 10, 10);

      mockObjectService.getObject = jest.fn().mockReturnValue(target);

      // Wood has fire resistance 2, so need intensity 6 for effective 4
      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 6,
        description: 'flames',
      };

      const result = await service.applyEffect('wood1', effect);

      expect(result.success).toBe(true);
      expect(result.message).toContain('catches fire');
      expect(result.objectsAffected![0].newState?.isOnFire).toBe(true);
    });

    it('should deal massive damage to very flammable objects (BUG FIX: flammable materials)', async () => {
      const paperMaterial = PhysicsService.createMaterialPreset('paper');
      const target = createTestObject('paper1', paperMaterial, 10, 10);

      mockObjectService.getObject = jest.fn().mockReturnValue(target);

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 9,
        description: 'inferno',
      };

      const result = await service.applyEffect('paper1', effect);

      expect(result.success).toBe(true);
      expect(result.objectsAffected![0].damage).toBeGreaterThanOrEqual(10);
      expect(result.message).toContain('consumed by flames');
    });

    it('should resist fire when material has low flammability', async () => {
      const stoneMaterial = PhysicsService.createMaterialPreset('stone');
      const target = createTestObject('stone1', stoneMaterial, 10, 10);

      mockObjectService.getObject = jest.fn().mockReturnValue(target);

      // Stone has fire resistance 9, so intensity 5 is completely resisted
      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 5,
        description: 'flames',
      };

      const result = await service.applyEffect('stone1', effect);

      expect(result.success).toBe(true);
      // Stone completely resists due to high resistance
      expect(result.message).toContain('resists');
    });

    it('should create explosion chain reaction when explosive material catches fire', async () => {
      const gasMaterial = PhysicsService.createMaterialPreset('gas');
      const target = createTestObject('gas1', gasMaterial, 10, 10);

      // Mock nearby objects in range
      const nearby1 = createTestObject('nearby1', PhysicsService.createMaterialPreset('wood'), 10, 10);
      const nearby2 = createTestObject('nearby2', PhysicsService.createMaterialPreset('metal'), 10, 10);

      mockObjectService.getObject = jest
        .fn()
        .mockReturnValueOnce(target)
        .mockReturnValueOnce(nearby1)
        .mockReturnValueOnce(nearby2);

      mockRoomService.getAllRooms = jest.fn().mockReturnValue([
        {
          id: 'room1',
          objects: ['gas1', 'nearby1', 'nearby2'],
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
      expect(result.chainReactions).toBeDefined();
      expect(result.chainReactions!.length).toBeGreaterThan(0);
    });

    it('should explode containers with explosive contents even if container is not flammable', async () => {
      const metalMaterial = PhysicsService.createMaterialPreset('metal');

      // Create explosive material with properties explicitly set
      const explosiveMaterial: IMaterialProperties = {
        material: 'organic',
        density: 5,
        conductivity: 1,
        flammability: 0, // Not flammable itself
        brittleness: 5,
        resistances: { fire: 10 }, // Highly resistant to fire
        properties: {
          explosive: true, // But explosive!
        },
      };

      const explosiveObject = createTestObject('explosive1', explosiveMaterial, 5, 5);
      const container = createTestObject('container1', metalMaterial, 10, 10, {}, ['explosive1']);

      // Use mockImplementation to handle multiple calls correctly
      mockObjectService.getObject = jest
        .fn()
        .mockImplementation((id: string) => {
          if (id === 'container1') return container;
          if (id === 'explosive1') return explosiveObject;
          return null;
        });

      mockRoomService.getAllRooms = jest.fn().mockReturnValue([
        {
          id: 'room1',
          objects: ['container1', 'explosive1'],
        },
      ]);

      // Metal has fire resistance 8, so need intensity 13 for effective 5 (which is > 4) to trigger explosion
      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 13,
        description: 'flames',
      };

      const result = await service.applyEffect('container1', effect);

      expect(result.success).toBe(true);
      expect(result.message).toContain('explodes');
      expect(result.chainReactions).toBeDefined();
      expect(result.chainReactions!.length).toBeGreaterThan(0);
    });
  });

  describe('Lightning Effects', () => {
    it('should apply lightning damage based on conductivity', async () => {
      const metalMaterial = PhysicsService.createMaterialPreset('metal');
      const target = createTestObject('metal1', metalMaterial, 10, 10);

      mockObjectService.getObject = jest.fn().mockReturnValue(target);

      const effect: IPhysicsEffect = {
        type: 'lightning',
        intensity: 5,
        description: 'electricity',
      };

      const result = await service.applyEffect('metal1', effect);

      expect(result.success).toBe(true);
      expect(result.objectsAffected![0].damage).toBeGreaterThan(0);
    });

    it('should deal more damage to highly conductive materials', async () => {
      const metalMaterial = PhysicsService.createMaterialPreset('metal');
      const target = createTestObject('metal1', metalMaterial, 20, 20);

      mockObjectService.getObject = jest.fn().mockReturnValue(target);

      // Metal has lightning resistance 1, so effective intensity = 6 - 1 = 5
      const effect: IPhysicsEffect = {
        type: 'lightning',
        intensity: 6,
        description: 'electricity',
      };

      const result = await service.applyEffect('metal1', effect);

      // High conductivity (9) should get 1.5x multiplier on effective intensity
      // Effective intensity = 6 - 1 = 5, damage = floor(5 * 1.5) = 7
      expect(result.objectsAffected![0].damage).toBe(Math.floor(5 * 1.5));
    });

    it('should reduce damage for non-conductive materials', async () => {
      const woodMaterial = PhysicsService.createMaterialPreset('wood');
      const target = createTestObject('wood1', woodMaterial, 10, 10);

      mockObjectService.getObject = jest.fn().mockReturnValue(target);

      // Wood has lightning resistance 8, so need higher intensity to overcome
      const effect: IPhysicsEffect = {
        type: 'lightning',
        intensity: 10,
        description: 'electricity',
      };

      const result = await service.applyEffect('wood1', effect);

      expect(result.success).toBe(true);
      expect(result.message).toContain('does not conduct electricity');
      // Effective intensity = 10 - 8 = 2, conductivity 1 < 2, so 0.5x, damage = floor(2 * 0.5) = 1
      // Then reduced by 0.1, so floor(1 * 0.1) = 0
      expect(result.objectsAffected![0].damage).toBe(0);
    });

    it('should chain to connected conductive objects (BUG FIX: lightning chaining)', async () => {
      const metalMaterial = PhysicsService.createMaterialPreset('metal');
      const target = createTestObject('metal1', metalMaterial, 10, 10);
      const connected = createTestObject('metal2', metalMaterial, 10, 10);

      // Set up bidirectional relationship - metal2 is on top of metal1
      connected.spatialRelationship = {
        relationshipType: 'on_top_of',
        targetId: 'metal1',
      };

      // Mock getObject to return the connected object when queried
      mockObjectService.getObject = jest
        .fn()
        .mockImplementation((id: string) => {
          if (id === 'metal1') return target;
          if (id === 'metal2') return connected;
          return null;
        });

      mockRoomService.getAllRooms = jest.fn().mockReturnValue([
        {
          id: 'room1',
          objects: ['metal1', 'metal2'],
        },
      ]);

      // Metal has lightning resistance 1, effective = 8 - 1 = 7, conductivity 9 > 7
      const effect: IPhysicsEffect = {
        type: 'lightning',
        intensity: 8,
        description: 'electricity',
      };

      const result = await service.applyEffect('metal1', effect);

      expect(result.success).toBe(true);
      expect(result.message).toContain('conducts the electricity');
      expect(result.chainReactions).toBeDefined();
      // Should chain to metal2 (via connected objects and nearby objects in range)
      expect(result.chainReactions!.length).toBeGreaterThan(0);
    });

    it('should chain to nearby conductive objects in range (BUG FIX: lightning chaining)', async () => {
      const metalMaterial = PhysicsService.createMaterialPreset('metal');
      const target = createTestObject('metal1', metalMaterial, 10, 10);
      const nearby = createTestObject('metal2', metalMaterial, 10, 10);

      mockObjectService.getObject = jest
        .fn()
        .mockReturnValueOnce(target)
        .mockReturnValueOnce(nearby)
        .mockReturnValueOnce(nearby)
        .mockReturnValueOnce(nearby);

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
      expect(result.chainReactions!.some((r) => r.targetId === 'metal2')).toBe(true);
    });

    it('should conduct through water to all objects in same location', async () => {
      const waterMaterial = PhysicsService.createMaterialPreset('water');
      const target = createTestObject('water1', waterMaterial, 10, 10);
      const inWater = createTestObject('obj1', PhysicsService.createMaterialPreset('metal'), 10, 10);

      // obj1 is inside the water
      inWater.spatialRelationship = {
        relationshipType: 'inside',
        targetId: 'water1',
      };

      // water1 doesn't have a spatialRelationship (it's the container)
      target.spatialRelationship = undefined;

      mockObjectService.getObject = jest
        .fn()
        .mockImplementation((id: string) => {
          if (id === 'water1') return target;
          if (id === 'obj1') return inWater;
          return null;
        });

      mockRoomService.getAllRooms = jest.fn().mockReturnValue([
        {
          id: 'room1',
          objects: ['water1', 'obj1'],
        },
      ]);

      // Water has lightning resistance 1, effective = 8 - 1 = 7, conductivity 8 > 7
      const effect: IPhysicsEffect = {
        type: 'lightning',
        intensity: 8,
        description: 'electricity',
      };

      const result = await service.applyEffect('water1', effect);

      expect(result.success).toBe(true);
      expect(result.chainReactions).toBeDefined();
      expect(result.chainReactions!.length).toBeGreaterThan(0);
      // Check that chains include conduction through water to obj1
      expect(result.chainReactions!.some((r) => r.targetId === 'obj1')).toBe(true);
    });

    it('should not chain to non-conductive objects', async () => {
      const metalMaterial = PhysicsService.createMaterialPreset('metal');
      const woodMaterial = PhysicsService.createMaterialPreset('wood');
      const target = createTestObject('metal1', metalMaterial, 10, 10);
      const nearby = createTestObject('wood1', woodMaterial, 10, 10);

      mockObjectService.getObject = jest
        .fn()
        .mockReturnValueOnce(target)
        .mockReturnValueOnce(nearby);

      mockRoomService.getAllRooms = jest.fn().mockReturnValue([
        {
          id: 'room1',
          objects: ['metal1', 'wood1'],
        },
      ]);

      const effect: IPhysicsEffect = {
        type: 'lightning',
        intensity: 8,
        description: 'electricity',
      };

      const result = await service.applyEffect('metal1', effect);

      expect(result.success).toBe(true);
      // Wood has conductivity of 1, which is not > 5, so it shouldn't chain
      const chainsToWood = result.chainReactions?.some((r) => r.targetId === 'wood1');
      expect(chainsToWood).toBeFalsy();
    });
  });

  describe('Generic Effects', () => {
    it('should handle unknown effect types with generic handler', async () => {
      const woodMaterial = PhysicsService.createMaterialPreset('wood');
      const target = createTestObject('wood1', woodMaterial, 10, 10);

      mockObjectService.getObject = jest.fn().mockReturnValue(target);

      const effect: IPhysicsEffect = {
        type: 'poison' as any,
        intensity: 5,
        description: 'poison cloud',
      };

      const result = await service.applyEffect('wood1', effect);

      expect(result.success).toBe(true);
      expect(result.message).toContain('is affected by');
      expect(result.objectsAffected![0].damage).toBe(5);
    });
  });
});
