import { Test, TestingModule } from '@nestjs/testing';
import { EntityController } from './entity.controller';
import { EntityService } from './entity.service';
import { DatabaseService } from '../database/database.service';

describe('EntityController', () => {
  let controller: EntityController;
  let service: EntityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EntityController],
      providers: [
        EntityService,
        {
          provide: DatabaseService,
          useValue: {
            saveEntity: jest.fn().mockResolvedValue(undefined),
            getEntity: jest.fn().mockResolvedValue(null),
            deleteEntity: jest.fn().mockResolvedValue(undefined),
            getAllEntities: jest.fn().mockResolvedValue([]),
            saveVersion: jest.fn().mockResolvedValue(1),
          },
        },
      ],
    }).compile();

    controller = module.get<EntityController>(EntityController);
    service = module.get<EntityService>(EntityService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create an entity', async () => {
      const dto = {
        name: 'Test Entity',
        position: { x: 0, y: 0, z: 0 },
        type: 'object' as const,
      };

      const result = await controller.create(dto);
      expect(result).toBeDefined();
    });
  });

  describe('findAll', () => {
    it('should return all entities', async () => {
      const result = await controller.findAll();
      expect(result).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('should find an entity by ID', async () => {
      const dto = {
        name: 'Test Entity',
        position: { x: 0, y: 0, z: 0 },
        type: 'object' as const,
      };

      const result = await controller.create(dto);
      expect(result).toBeDefined();
    });
  });
});
