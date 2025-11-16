import { Test, TestingModule } from '@nestjs/testing';
import { RoomService } from './room.service';
import { EntityService } from './entity.service';
import { DatabaseService } from '../database/database.service';

describe('RoomService', () => {
  let service: RoomService;
  let entityService: EntityService;
  let mockDatabaseService: jest.Mocked<Partial<DatabaseService>>;

  beforeEach(async () => {
    // Create mock database service
    mockDatabaseService = {
      saveEntity: jest.fn().mockResolvedValue(undefined),
      getEntity: jest.fn().mockResolvedValue(null),
      deleteEntity: jest.fn().mockResolvedValue(undefined),
      getAllEntities: jest.fn().mockResolvedValue([]),
      saveVersion: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomService,
        EntityService,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    service = module.get<RoomService>(RoomService);
    entityService = module.get<EntityService>(EntityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a room', () => {
    const roomData = {
      name: 'Test Room',
      width: 10,
      height: 10,
    };

    const result = service.createRoom(roomData);
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.name).toBe('Test Room');
    expect(result.type).toBe('room');
  });

  it('should get a room by ID', () => {
    const roomData = {
      name: 'Test Room',
      width: 10,
      height: 10,
    };

    const createdRoom = service.createRoom(roomData);
    const retrievedRoom = service.getRoom(createdRoom.id);

    expect(retrievedRoom).toBeDefined();
    expect(retrievedRoom?.id).toBe(createdRoom.id);
  });

  it('should add player to room', () => {
    // Create a test room
    const roomData = {
      name: 'Test Room',
      width: 10,
      height: 10,
    };

    const createdRoom = service.createRoom(roomData);

    // Create a test entity (player)
    const playerData = {
      name: 'Test Player',
      position: { x: 0, y: 0, z: 0 },
      type: 'object' as const,
    };

    const createdPlayer = entityService.createEntity(playerData);

    // Add player to room
    const result = service.addPlayerToRoom(createdRoom.id, createdPlayer.id);

    expect(result).toBe(true);
  });

  it('should add object to room', () => {
    // Create a test room
    const roomData = {
      name: 'Test Room',
      width: 10,
      height: 10,
    };

    const createdRoom = service.createRoom(roomData);

    // Create a test entity (object)
    const objectData = {
      name: 'Test Object',
      position: { x: 0, y: 0, z: 0 },
      type: 'object' as const,
    };

    const createdObject = entityService.createEntity(objectData);

    // Add object to room
    const result = service.addObjectToRoom(createdRoom.id, createdObject.id);

    expect(result).toBe(true);
  });
});
