import { Test, TestingModule } from '@nestjs/testing';
import { ObjectService } from './object.service';
import { EntityService } from './entity.service';

describe('ObjectService (Integration)', () => {
  let service: ObjectService;
  let entityService: EntityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ObjectService, EntityService],
    }).compile();

    service = module.get<ObjectService>(ObjectService);
    entityService = module.get<EntityService>(EntityService);
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
});
