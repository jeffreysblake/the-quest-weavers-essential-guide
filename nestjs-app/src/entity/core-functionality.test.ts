import { Test, TestingModule } from '@nestjs/testing';
import { EntityService } from './entity.service';

describe('Core Functionality Tests', () => {
  let service: EntityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EntityService],
    }).compile();

    service = module.get<EntityService>(EntityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create an entity with proper properties', () => {
    const testData = {
      name: 'Test Entity',
      position: { x: 0, y: 0, z: 0 },
      type: 'object' as const,
    };

    const result = service.createEntity(testData);

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.name).toBe('Test Entity');
    expect(result.type).toBe('object');
  });

  it('should retrieve an entity by ID', () => {
    const testData = {
      name: 'Test Entity',
      position: { x: 0, y: 0, z: 0 },
      type: 'object' as const,
    };

    const createdEntity = service.createEntity(testData);
    const retrievedEntity = service.getEntity(createdEntity.id);

    expect(retrievedEntity).toBeDefined();
    expect(retrievedEntity?.id).toBe(createdEntity.id);
  });

  it('should update an entity', () => {
    const testData = {
      name: 'Test Entity',
      position: { x: 0, y: 0, z: 0 },
      type: 'object' as const,
    };

    const createdEntity = service.createEntity(testData);
    const updated = service.updateEntity(createdEntity.id, {
      name: 'Updated Name',
    });

    expect(updated).toBe(true);
    const retrievedEntity = service.getEntity(createdEntity.id);
    expect(retrievedEntity?.name).toBe('Updated Name');
  });

  it('should delete an entity', () => {
    const testData = {
      name: 'Test Entity',
      position: { x: 0, y: 0, z: 0 },
      type: 'object' as const,
    };

    const createdEntity = service.createEntity(testData);
    const deleted = service.deleteEntity(createdEntity.id);

    expect(deleted).toBe(true);
    const retrievedEntity = service.getEntity(createdEntity.id);
    expect(retrievedEntity).toBeUndefined();
  });
});
