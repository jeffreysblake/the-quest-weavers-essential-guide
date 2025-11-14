import { Test, TestingModule } from '@nestjs/testing';
import { PhysicsController } from './physics.controller';
import { PhysicsService } from './physics.service';
import { CreatePhysicsBodyDto } from './physics.dto';
import { UpdatePhysicsBodyDto } from './physics.dto';

describe('PhysicsController', () => {
  let controller: PhysicsController;
  let service: PhysicsService;

  const mockPhysicsService = {
    createEntity: jest.fn().mockReturnValue({
      id: 'test-id',
      name: 'test-entity',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      mass: 1,
      size: { width: 1, height: 1, depth: 1 },
      active: true,
    }),
    findAll: jest.fn().mockReturnValue([]),
    findOne: jest.fn().mockReturnValue({
      id: 'test-id',
      name: 'test-entity',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      mass: 1,
      size: { width: 1, height: 1, depth: 1 },
      active: true,
    }),
    updateEntity: jest.fn().mockReturnValue({
      id: 'test-id',
      name: 'updated-entity',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      mass: 1,
      size: { width: 1, height: 1, depth: 1 },
      active: true,
    }),
    removeEntity: jest.fn().mockReturnValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PhysicsController],
      providers: [
        {
          provide: PhysicsService,
          useValue: mockPhysicsService,
        },
      ],
    }).compile();

    controller = module.get<PhysicsController>(PhysicsController);
    service = module.get<PhysicsService>(PhysicsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a physics entity', () => {
      const dto: CreatePhysicsBodyDto = {
        position: { x: 0, y: 0, z: 0 },
        mass: 1,
      };

      const result = controller.create(dto);

      expect(result).toBeDefined();
      expect(result.id).toBe('test-id');
      expect(mockPhysicsService.createEntity).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return all physics entities', () => {
      const result = controller.findAll();

      expect(result).toEqual([]);
      expect(mockPhysicsService.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a physics entity by ID', () => {
      const result = controller.findOne('test-id');

      expect(result).toBeDefined();
      expect(result.id).toBe('test-id');
      expect(mockPhysicsService.findOne).toHaveBeenCalledWith('test-id');
    });

    it('should return error when entity not found', () => {
      mockPhysicsService.findOne.mockReturnValueOnce(null);

      const result = controller.findOne('non-existent');

      expect(result).toEqual({ error: 'Physics entity not found' });
    });
  });

  describe('update', () => {
    it('should update a physics entity by ID', () => {
      const dto: UpdatePhysicsBodyDto = {
        position: { x: 1, y: 1, z: 1 },
      };

      const result = controller.update('test-id', dto);

      expect(result).toBeDefined();
      expect(result.name).toBe('updated-entity');
      expect(mockPhysicsService.findOne).toHaveBeenCalledWith('test-id');
      expect(mockPhysicsService.updateEntity).toHaveBeenCalledWith('test-id', dto);
    });

    it('should return error when entity not found', () => {
      mockPhysicsService.findOne.mockReturnValueOnce(null);
      const dto: UpdatePhysicsBodyDto = {
        position: { x: 1, y: 1, z: 1 },
      };

      const result = controller.update('non-existent', dto);

      expect(result).toEqual({ error: 'Physics entity not found' });
    });
  });

  describe('remove', () => {
    it('should remove a physics entity by ID', () => {
      const result = controller.remove('test-id');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Physics entity removed');
      expect(mockPhysicsService.removeEntity).toHaveBeenCalledWith('test-id');
    });

    it('should return failure message when entity not found', () => {
      mockPhysicsService.removeEntity.mockReturnValueOnce(false);

      const result = controller.remove('non-existent');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Physics entity not found');
    });
  });
});
