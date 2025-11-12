import { Test, TestingModule } from '@nestjs/testing';
import { PhysicsController } from './physics.controller';
import { PhysicsService } from './physics.service';
import { CreatePhysicsBodyDto } from './physics.dto';
import { UpdatePhysicsBodyDto } from './physics.dto';

describe('PhysicsController', () => {
  let controller: PhysicsController;
  let service: PhysicsService;

  const mockPhysicsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
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
    it('should create a physics body', async () => {
      const dto: CreatePhysicsBodyDto = {
        position: [0, 0, 0],
        velocity: [0, 0, 0],
        mass: 1,
        shape: 'box',
      };
      mockPhysicsService.create.mockReturnValue(dto);

      expect(await controller.create(dto)).toBe(dto);
      expect(mockPhysicsService.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('findAll', () => {
    it('should return all physics bodies', async () => {
      const result = [{ id: '1', position: [0, 0, 0] }];
      mockPhysicsService.findAll.mockReturnValue(result);

      expect(await controller.findAll()).toBe(result);
      expect(mockPhysicsService.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a physics body by ID', async () => {
      const result = { id: '1', position: [0, 0, 0] };
      mockPhysicsService.findOne.mockReturnValue(result);

      expect(await controller.findOne('1')).toBe(result);
      expect(mockPhysicsService.findOne).toHaveBeenCalledWith('1');
    });
  });

  describe('update', () => {
    it('should update a physics body by ID', async () => {
      const dto: UpdatePhysicsBodyDto = {
        position: [1, 1, 1],
        velocity: [0, 0, 0],
      };
      const result = { id: '1', ...dto };
      mockPhysicsService.update.mockReturnValue(result);

      expect(await controller.update('1', dto)).toBe(result);
      expect(mockPhysicsService.update).toHaveBeenCalledWith('1', dto);
    });
  });

  describe('remove', () => {
    it('should remove a physics body by ID', async () => {
      const result = true;
      mockPhysicsService.remove.mockReturnValue(result);

      expect(await controller.remove('1')).toBe(result);
      expect(mockPhysicsService.remove).toHaveBeenCalledWith('1');
    });
  });
});
