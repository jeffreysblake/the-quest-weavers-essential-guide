import { Test, TestingModule } from '@nestjs/testing';
import { PhysicsService, PhysicsEntity } from './physics.service';
import * as CANNON from 'cannon-es';

// Mock CANNON module
jest.mock('cannon-es');

describe('PhysicsService', () => {
  let service: PhysicsService;
  let mockWorld: jest.Mocked<CANNON.World>;
  let mockBody: jest.Mocked<CANNON.Body>;
  let mockVec3: jest.Mocked<CANNON.Vec3>;

  beforeEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();

    // Setup mock Vec3
    mockVec3 = {
      x: 0,
      y: 0,
      z: 0,
      set: jest.fn(),
    } as any;

    // Setup mock Body
    mockBody = {
      position: { x: 0, y: 0, z: 0, set: jest.fn() } as any,
      velocity: { x: 0, y: 0, z: 0, set: jest.fn() } as any,
      angularVelocity: { x: 0, y: 0, z: 0, set: jest.fn() } as any,
      quaternion: { x: 0, y: 0, z: 0, w: 1, set: jest.fn() } as any,
      mass: 1,
      applyForce: jest.fn(),
    } as any;

    // Setup mock World
    mockWorld = {
      gravity: mockVec3,
      broadphase: {} as any,
      step: jest.fn(),
      addBody: jest.fn(),
      removeBody: jest.fn(),
    } as any;

    // Mock CANNON constructors
    (CANNON.World as jest.Mock).mockReturnValue(mockWorld);
    (CANNON.Vec3 as jest.Mock).mockReturnValue(mockVec3);
    (CANNON.Body as jest.Mock).mockReturnValue(mockBody);
    (CANNON.Box as jest.Mock).mockReturnValue({} as any);
    (CANNON.Sphere as jest.Mock).mockReturnValue({} as any);
    (CANNON.NaiveBroadphase as jest.Mock).mockReturnValue({} as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [PhysicsService],
    }).compile();

    service = module.get<PhysicsService>(PhysicsService);
  });

  afterEach(() => {
    // Clean up any timers
    if (service) {
      service.cleanup();
    }
    jest.clearAllTimers();
  });

  describe('Constructor and Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should initialize physics world on construction', () => {
      expect(CANNON.World).toHaveBeenCalled();
      expect(mockVec3.set).toHaveBeenCalledWith(0, -9.82, 0);
    });

    it('should set broadphase on world initialization', () => {
      expect(CANNON.NaiveBroadphase).toHaveBeenCalled();
    });

    it('should handle world initialization errors gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (CANNON.World as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Initialization failed');
      });

      // Create a new service instance to trigger initialization
      const newService = new PhysicsService();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error initializing physics system:',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('createEntity', () => {
    const baseEntity = {
      name: 'test-entity',
      position: { x: 0, y: 5, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      size: { width: 1, height: 1, depth: 1 },
      mass: 1,
      active: true,
    };

    it('should create an entity with valid parameters', () => {
      const entity = service.createEntity(baseEntity);

      expect(entity).toBeDefined();
      expect(entity.id).toBeDefined();
      expect(entity.name).toBe('test-entity');
      expect(CANNON.Box).toHaveBeenCalled();
      expect(CANNON.Body).toHaveBeenCalled();
      expect(mockWorld.addBody).toHaveBeenCalledWith(mockBody);
    });

    it('should generate unique IDs for each entity', () => {
      const entity1 = service.createEntity(baseEntity);
      const entity2 = service.createEntity(baseEntity);

      expect(entity1.id).not.toBe(entity2.id);
    });

    it('should create a box shape for entities with valid dimensions', () => {
      service.createEntity(baseEntity);

      expect(CANNON.Box).toHaveBeenCalledWith(mockVec3);
      expect(CANNON.Vec3).toHaveBeenCalledWith(0.5, 0.5, 0.5);
    });

    it('should create a sphere shape for entities with zero width', () => {
      const entityWithZeroWidth = {
        ...baseEntity,
        size: { width: 0, height: 1, depth: 1 },
      };

      service.createEntity(entityWithZeroWidth);

      expect(CANNON.Sphere).toHaveBeenCalledWith(entityWithZeroWidth.mass);
    });

    it('should create a sphere shape for entities with zero height', () => {
      const entityWithZeroHeight = {
        ...baseEntity,
        size: { width: 1, height: 0, depth: 1 },
      };

      service.createEntity(entityWithZeroHeight);

      expect(CANNON.Sphere).toHaveBeenCalledWith(entityWithZeroHeight.mass);
    });

    it('should create a sphere shape for entities with negative width', () => {
      const entityWithNegativeWidth = {
        ...baseEntity,
        size: { width: -1, height: 1, depth: 1 },
      };

      service.createEntity(entityWithNegativeWidth);

      expect(CANNON.Sphere).toHaveBeenCalledWith(entityWithNegativeWidth.mass);
    });

    it('should create a sphere shape for entities with negative height', () => {
      const entityWithNegativeHeight = {
        ...baseEntity,
        size: { width: 1, height: -1, depth: 1 },
      };

      service.createEntity(entityWithNegativeHeight);

      expect(CANNON.Sphere).toHaveBeenCalledWith(entityWithNegativeHeight.mass);
    });

    it('should handle zero mass entities', () => {
      const entityWithZeroMass = {
        ...baseEntity,
        mass: 0,
      };

      const entity = service.createEntity(entityWithZeroMass);

      expect(entity.mass).toBe(0);
      expect(CANNON.Body).toHaveBeenCalledWith(
        expect.objectContaining({ mass: 0 }),
      );
    });

    it('should handle negative mass entities', () => {
      const entityWithNegativeMass = {
        ...baseEntity,
        mass: -5,
      };

      const entity = service.createEntity(entityWithNegativeMass);

      expect(entity.mass).toBe(-5);
    });

    it('should handle extremely large mass values', () => {
      const entityWithLargeMass = {
        ...baseEntity,
        mass: Number.MAX_SAFE_INTEGER,
      };

      const entity = service.createEntity(entityWithLargeMass);

      expect(entity.mass).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should handle entities with optional friction property', () => {
      const entityWithFriction = {
        ...baseEntity,
        friction: 0.5,
      };

      const entity = service.createEntity(entityWithFriction);

      expect(entity.friction).toBe(0.5);
    });

    it('should handle entities with optional restitution property', () => {
      const entityWithRestitution = {
        ...baseEntity,
        restitution: 0.8,
      };

      const entity = service.createEntity(entityWithRestitution);

      expect(entity.restitution).toBe(0.8);
    });

    it('should throw error when body creation fails', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (CANNON.Body as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Body creation failed');
      });

      expect(() => service.createEntity(baseEntity)).toThrow(
        'Body creation failed',
      );
      consoleSpy.mockRestore();
    });

    it('should return entity when world is null', () => {
      // Force world to be null by creating new service with failing initialization
      (CANNON.World as jest.Mock).mockImplementationOnce(() => {
        throw new Error('World creation failed');
      });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const newService = new PhysicsService();

      const entity = newService.createEntity(baseEntity);

      expect(entity).toBeDefined();
      expect(entity.id).toBeUndefined();
      consoleSpy.mockRestore();
    });
  });

  describe('removeEntity', () => {
    it('should remove an existing entity', () => {
      const entity = service.createEntity({
        name: 'test-entity',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      const result = service.removeEntity(entity.id);

      expect(result).toBe(true);
      expect(mockWorld.removeBody).toHaveBeenCalledWith(mockBody);
    });

    it('should return false when removing non-existent entity', () => {
      const result = service.removeEntity('non-existent-id');

      expect(result).toBe(false);
    });

    it('should return false when world is null', () => {
      // Create entity first
      const entity = service.createEntity({
        name: 'test-entity',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      // Force world to null
      (service as any).world = null;

      const result = service.removeEntity(entity.id);

      expect(result).toBe(false);
    });

    it('should handle errors during body removal', () => {
      const entity = service.createEntity({
        name: 'test-entity',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      mockWorld.removeBody.mockImplementationOnce(() => {
        throw new Error('Removal failed');
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => service.removeEntity(entity.id)).toThrow('Removal failed');
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error removing physics entity:',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('findAll', () => {
    it('should return empty array when no entities exist', () => {
      const entities = service.findAll();

      expect(entities).toEqual([]);
      expect(entities).toHaveLength(0);
    });

    it('should return all entities', () => {
      const entity1 = service.createEntity({
        name: 'entity1',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      const entity2 = service.createEntity({
        name: 'entity2',
        position: { x: 1, y: 1, z: 1 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 2, height: 2, depth: 2 },
        mass: 2,
        active: true,
      });

      const entities = service.findAll();

      expect(entities).toHaveLength(2);
      expect(entities).toContainEqual(entity1);
      expect(entities).toContainEqual(entity2);
    });
  });

  describe('findOne', () => {
    it('should return undefined for non-existent entity', () => {
      const entity = service.findOne('non-existent-id');

      expect(entity).toBeUndefined();
    });

    it('should return existing entity by ID', () => {
      const created = service.createEntity({
        name: 'test-entity',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      const entity = service.findOne(created.id);

      expect(entity).toBeDefined();
      expect(entity?.id).toBe(created.id);
      expect(entity?.name).toBe('test-entity');
    });
  });

  describe('updateEntity', () => {
    it('should update existing entity', () => {
      const entity = service.createEntity({
        name: 'test-entity',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      const updated = service.updateEntity(entity.id, {
        name: 'updated-entity',
        mass: 2,
      });

      expect(updated).toBeDefined();
      expect(updated?.name).toBe('updated-entity');
      expect(updated?.mass).toBe(2);
    });

    it('should return undefined when updating non-existent entity', () => {
      const result = service.updateEntity('non-existent-id', {
        name: 'updated',
      });

      expect(result).toBeUndefined();
    });

    it('should update physics body mass when mass is changed', () => {
      const entity = service.createEntity({
        name: 'test-entity',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      service.updateEntity(entity.id, { mass: 5 });

      expect(mockBody.mass).toBe(5);
    });

    it('should handle friction updates gracefully', () => {
      const entity = service.createEntity({
        name: 'test-entity',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      const updated = service.updateEntity(entity.id, { friction: 0.7 });

      expect(updated?.friction).toBe(0.7);
    });

    it('should handle restitution updates gracefully', () => {
      const entity = service.createEntity({
        name: 'test-entity',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      const updated = service.updateEntity(entity.id, { restitution: 0.9 });

      expect(updated?.restitution).toBe(0.9);
    });

    it('should handle errors during body property updates', () => {
      const entity = service.createEntity({
        name: 'test-entity',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Trigger error by making mass setter throw
      Object.defineProperty(mockBody, 'mass', {
        set: () => {
          throw new Error('Mass update failed');
        },
        get: () => 1,
      });

      const updated = service.updateEntity(entity.id, { mass: 5 });

      expect(updated).toBeDefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error updating physics body properties:',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('applyForce', () => {
    it('should apply force to existing entity', () => {
      const entity = service.createEntity({
        name: 'test-entity',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      service.applyForce(entity.id, { x: 10, y: 0, z: 0 });

      expect(mockBody.applyForce).toHaveBeenCalled();
    });

    it('should do nothing when applying force to non-existent entity', () => {
      service.applyForce('non-existent-id', { x: 10, y: 0, z: 0 });

      expect(mockBody.applyForce).not.toHaveBeenCalled();
    });

    it('should handle zero force application', () => {
      const entity = service.createEntity({
        name: 'test-entity',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      service.applyForce(entity.id, { x: 0, y: 0, z: 0 });

      expect(mockBody.applyForce).toHaveBeenCalled();
    });

    it('should handle extreme positive forces', () => {
      const entity = service.createEntity({
        name: 'test-entity',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      service.applyForce(entity.id, {
        x: Number.MAX_SAFE_INTEGER,
        y: Number.MAX_SAFE_INTEGER,
        z: Number.MAX_SAFE_INTEGER,
      });

      expect(mockBody.applyForce).toHaveBeenCalled();
    });

    it('should handle extreme negative forces', () => {
      const entity = service.createEntity({
        name: 'test-entity',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      service.applyForce(entity.id, {
        x: Number.MIN_SAFE_INTEGER,
        y: Number.MIN_SAFE_INTEGER,
        z: Number.MIN_SAFE_INTEGER,
      });

      expect(mockBody.applyForce).toHaveBeenCalled();
    });

    it('should do nothing when world is null', () => {
      const entity = service.createEntity({
        name: 'test-entity',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      // Force world to null
      (service as any).world = null;

      service.applyForce(entity.id, { x: 10, y: 0, z: 0 });

      // applyForce should have been called during creation but not after world is null
      expect(mockBody.applyForce).toHaveBeenCalledTimes(0);
    });

    it('should handle multiple forces on same entity', () => {
      const entity = service.createEntity({
        name: 'test-entity',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      service.applyForce(entity.id, { x: 10, y: 0, z: 0 });
      service.applyForce(entity.id, { x: 0, y: 10, z: 0 });
      service.applyForce(entity.id, { x: 0, y: 0, z: 10 });

      expect(mockBody.applyForce).toHaveBeenCalledTimes(3);
    });

    it('should handle errors during force application', () => {
      const entity = service.createEntity({
        name: 'test-entity',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      mockBody.applyForce.mockImplementationOnce(() => {
        throw new Error('Force application failed');
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      service.applyForce(entity.id, { x: 10, y: 0, z: 0 });

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error applying force:',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('toggleSimulation', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should start simulation when not running', () => {
      service.toggleSimulation();

      expect((service as any).entityUpdateTimer).not.toBeNull();
    });

    it('should stop simulation when running', () => {
      service.toggleSimulation(); // Start
      service.toggleSimulation(); // Stop

      expect((service as any).entityUpdateTimer).toBeNull();
    });

    it('should start and stop simulation multiple times', () => {
      service.toggleSimulation(); // Start
      const firstTimer = (service as any).entityUpdateTimer;

      service.toggleSimulation(); // Stop
      expect((service as any).entityUpdateTimer).toBeNull();

      service.toggleSimulation(); // Start again
      const secondTimer = (service as any).entityUpdateTimer;

      expect(secondTimer).not.toBeNull();
      expect(secondTimer).not.toBe(firstTimer);
    });

    it('should warn when world is not initialized', () => {
      // Force world to null
      (service as any).world = null;

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      service.toggleSimulation();

      expect(consoleSpy).toHaveBeenCalledWith('Physics world not initialized');
      consoleSpy.mockRestore();
    });

    it('should call updatePhysics at regular intervals when running', () => {
      const updateSpy = jest.spyOn(service as any, 'updatePhysics');

      service.toggleSimulation();
      jest.advanceTimersByTime(16);

      expect(updateSpy).toHaveBeenCalled();
    });
  });

  describe('step', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should do nothing when simulation is not running', () => {
      service.step(0.016);

      expect(mockWorld.step).not.toHaveBeenCalled();
    });

    it('should do nothing when world is null', () => {
      service.toggleSimulation(); // Start simulation

      // Force world to null
      (service as any).world = null;

      service.step(0.016);

      expect(mockWorld.step).not.toHaveBeenCalled();
    });

    it('should step physics world when simulation is running', () => {
      service.toggleSimulation(); // Start simulation

      service.step(0.016);

      expect(mockWorld.step).toHaveBeenCalledWith(1 / 60);
    });

    it('should use fixed timestep regardless of deltaTime parameter', () => {
      service.toggleSimulation();

      service.step(0.1); // Large delta time
      service.step(0.001); // Small delta time

      expect(mockWorld.step).toHaveBeenCalledWith(1 / 60);
      expect(mockWorld.step).toHaveBeenCalledTimes(2);
    });

    it('should handle errors during stepping', () => {
      service.toggleSimulation();

      mockWorld.step.mockImplementationOnce(() => {
        throw new Error('Step failed');
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      service.step(0.016);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error stepping physics simulation:',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('updatePhysics', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should do nothing when world is null', async () => {
      service.toggleSimulation();

      // Force world to null
      (service as any).world = null;

      await (service as any).updatePhysics();

      expect(mockWorld.step).not.toHaveBeenCalled();
    });

    it('should do nothing when simulation is not running', async () => {
      await (service as any).updatePhysics();

      expect(mockWorld.step).not.toHaveBeenCalled();
    });

    it('should step the world when running', async () => {
      service.toggleSimulation();

      await (service as any).updatePhysics();

      expect(mockWorld.step).toHaveBeenCalledWith(1 / 60);
    });

    it('should update entity positions from physics bodies', async () => {
      const entity = service.createEntity({
        name: 'test-entity',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      // Simulate physics body movement
      mockBody.position = { x: 5, y: 10, z: 15 } as any;
      mockBody.quaternion = { x: 0.1, y: 0.2, z: 0.3, w: 1 } as any;

      service.toggleSimulation();
      await (service as any).updatePhysics();

      const updatedEntity = service.findOne(entity.id);
      expect(updatedEntity?.position).toEqual({ x: 5, y: 10, z: 15 });
      expect(updatedEntity?.rotation).toEqual({ x: 0.1, y: 0.2, z: 0.3 });
    });

    it('should skip inactive entities during update', async () => {
      const entity = service.createEntity({
        name: 'test-entity',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: false, // Inactive entity
      });

      const originalPosition = { ...entity.position };
      mockBody.position = { x: 5, y: 10, z: 15 } as any;

      service.toggleSimulation();
      await (service as any).updatePhysics();

      const updatedEntity = service.findOne(entity.id);
      expect(updatedEntity?.position).toEqual(originalPosition);
    });

    it('should skip entities without physics bodies', async () => {
      const entity = service.createEntity({
        name: 'test-entity',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      // Remove body from map
      (service as any).bodyMap.delete(entity.id);

      const originalPosition = { ...entity.position };
      mockBody.position = { x: 5, y: 10, z: 15 } as any;

      service.toggleSimulation();
      await (service as any).updatePhysics();

      const updatedEntity = service.findOne(entity.id);
      expect(updatedEntity?.position).toEqual(originalPosition);
    });

    it('should handle errors during physics update', async () => {
      service.toggleSimulation();

      mockWorld.step.mockImplementationOnce(() => {
        throw new Error('Update failed');
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await (service as any).updatePhysics();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error in physics update:',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('resetEntityPhysics', () => {
    it('should reset physics for existing entity', () => {
      const entity = service.createEntity({
        name: 'test-entity',
        position: { x: 5, y: 5, z: 5 },
        rotation: { x: 1, y: 1, z: 1 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      service.resetEntityPhysics(entity.id);

      expect(mockBody.position.set).toHaveBeenCalledWith(0, 10, 0);
      expect(mockBody.velocity.set).toHaveBeenCalledWith(0, 0, 0);
      expect(mockBody.angularVelocity.set).toHaveBeenCalledWith(0, 0, 0);
      expect(mockBody.quaternion.set).toHaveBeenCalledWith(0, 0, 0, 1);
    });

    it('should do nothing when resetting non-existent entity', () => {
      service.resetEntityPhysics('non-existent-id');

      expect(mockBody.position.set).not.toHaveBeenCalled();
    });

    it('should do nothing when world is null', () => {
      const entity = service.createEntity({
        name: 'test-entity',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      // Force world to null
      (service as any).world = null;

      service.resetEntityPhysics(entity.id);

      expect(mockBody.position.set).not.toHaveBeenCalled();
    });

    it('should handle errors during reset', () => {
      const entity = service.createEntity({
        name: 'test-entity',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      mockBody.position.set.mockImplementationOnce(() => {
        throw new Error('Reset failed');
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      service.resetEntityPhysics(entity.id);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error resetting physics:',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('applyGravity', () => {
    it('should apply Earth-like gravity', () => {
      service.applyGravity();

      expect(mockVec3.set).toHaveBeenCalledWith(0, -9.82, 0);
    });

    it('should do nothing when world is null', () => {
      // Force world to null
      (service as any).world = null;

      // Reset mock to track new calls
      mockVec3.set.mockClear();

      service.applyGravity();

      expect(mockVec3.set).not.toHaveBeenCalled();
    });

    it('should handle errors during gravity application', () => {
      mockVec3.set.mockImplementationOnce(() => {
        throw new Error('Gravity application failed');
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      service.applyGravity();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error applying gravity:',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('getSystemStatus', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should return correct status when no entities exist', () => {
      const status = service.getSystemStatus();

      expect(status).toEqual({
        entityCount: 0,
        isRunning: false,
        worldExists: true,
        bodyCount: 0,
      });
    });

    it('should return correct status with entities', () => {
      service.createEntity({
        name: 'entity1',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      service.createEntity({
        name: 'entity2',
        position: { x: 1, y: 1, z: 1 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      const status = service.getSystemStatus();

      expect(status.entityCount).toBe(2);
      expect(status.bodyCount).toBe(2);
    });

    it('should show running status when simulation is active', () => {
      service.toggleSimulation();

      const status = service.getSystemStatus();

      expect(status.isRunning).toBe(true);
    });

    it('should show not running status when simulation is stopped', () => {
      service.toggleSimulation(); // Start
      service.toggleSimulation(); // Stop

      const status = service.getSystemStatus();

      expect(status.isRunning).toBe(false);
    });

    it('should show worldExists as false when world is null', () => {
      // Force world to null
      (service as any).world = null;

      const status = service.getSystemStatus();

      expect(status.worldExists).toBe(false);
    });
  });

  describe('getEntities', () => {
    it('should return empty array when no entities exist', () => {
      const entities = service.getEntities();

      expect(entities).toEqual([]);
    });

    it('should return all entities', () => {
      const entity1 = service.createEntity({
        name: 'entity1',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      const entity2 = service.createEntity({
        name: 'entity2',
        position: { x: 1, y: 1, z: 1 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 2, height: 2, depth: 2 },
        mass: 2,
        active: true,
      });

      const entities = service.getEntities();

      expect(entities).toHaveLength(2);
      expect(entities).toContainEqual(entity1);
      expect(entities).toContainEqual(entity2);
    });
  });

  describe('cleanup', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should stop simulation when cleaning up with running simulation', () => {
      service.toggleSimulation();

      service.cleanup();

      expect((service as any).entityUpdateTimer).toBeNull();
    });

    it('should remove all bodies from world', () => {
      service.createEntity({
        name: 'entity1',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      service.createEntity({
        name: 'entity2',
        position: { x: 1, y: 1, z: 1 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      service.cleanup();

      expect(mockWorld.removeBody).toHaveBeenCalledTimes(2);
      expect((service as any).bodyMap.size).toBe(0);
    });

    it('should handle cleanup with no entities', () => {
      service.cleanup();

      expect(mockWorld.removeBody).not.toHaveBeenCalled();
      expect((service as any).world).toBeNull();
    });

    it('should handle cleanup when world is already null', () => {
      // Force world to null
      (service as any).world = null;

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      service.cleanup();

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle errors during body removal in cleanup', () => {
      service.createEntity({
        name: 'test-entity',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      mockWorld.removeBody.mockImplementationOnce(() => {
        throw new Error('Removal failed');
      });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      service.cleanup();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error removing body:',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });

    it('should set world to null after cleanup', () => {
      service.cleanup();

      expect((service as any).world).toBeNull();
    });

    it('should handle general cleanup errors', () => {
      // Create entity
      service.createEntity({
        name: 'test-entity',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      // Make bodyMap.forEach throw
      (service as any).bodyMap.forEach = () => {
        throw new Error('Cleanup iteration failed');
      };

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      service.cleanup();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error during cleanup:',
        expect.any(Error),
      );
      consoleSpy.mockRestore();
    });
  });

  describe('Integration Tests', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should handle complete lifecycle: create, simulate, update, cleanup', async () => {
      // Create entities
      const entity1 = service.createEntity({
        name: 'entity1',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      const entity2 = service.createEntity({
        name: 'entity2',
        position: { x: 5, y: 5, z: 5 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 2, height: 2, depth: 2 },
        mass: 2,
        active: true,
      });

      // Start simulation
      service.toggleSimulation();
      expect(service.getSystemStatus().isRunning).toBe(true);

      // Apply forces
      service.applyForce(entity1.id, { x: 10, y: 0, z: 0 });
      service.applyForce(entity2.id, { x: -10, y: 0, z: 0 });

      // Update entity
      service.updateEntity(entity1.id, { mass: 5 });

      // Step simulation
      service.step(0.016);

      // Stop simulation
      service.toggleSimulation();
      expect(service.getSystemStatus().isRunning).toBe(false);

      // Remove one entity
      service.removeEntity(entity2.id);
      expect(service.findAll()).toHaveLength(1);

      // Cleanup
      service.cleanup();
      expect(service.getSystemStatus().worldExists).toBe(false);
    });

    it('should maintain entity count consistency across operations', () => {
      // Create multiple entities
      const ids = [];
      for (let i = 0; i < 10; i++) {
        const entity = service.createEntity({
          name: `entity${i}`,
          position: { x: i, y: i, z: i },
          rotation: { x: 0, y: 0, z: 0 },
          size: { width: 1, height: 1, depth: 1 },
          mass: 1,
          active: true,
        });
        ids.push(entity.id);
      }

      expect(service.getSystemStatus().entityCount).toBe(10);
      expect(service.getSystemStatus().bodyCount).toBe(10);

      // Remove half of them
      for (let i = 0; i < 5; i++) {
        service.removeEntity(ids[i]);
      }

      expect(service.getSystemStatus().entityCount).toBe(5);
      expect(service.getSystemStatus().bodyCount).toBe(5);
    });

    it('should handle simulation timing consistency', () => {
      service.createEntity({
        name: 'test-entity',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        size: { width: 1, height: 1, depth: 1 },
        mass: 1,
        active: true,
      });

      service.toggleSimulation();

      // Advance time and check step calls
      jest.advanceTimersByTime(16);
      jest.advanceTimersByTime(16);
      jest.advanceTimersByTime(16);

      // Should be called 3 times (once per 16ms interval)
      expect(mockWorld.step).toHaveBeenCalledTimes(3);
      expect(mockWorld.step).toHaveBeenCalledWith(1 / 60);
    });
  });
});
