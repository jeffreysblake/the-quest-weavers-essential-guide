import { Test, TestingModule } from '@nestjs/testing';
import { RoomService } from './room.service';
import { EntityService } from './entity.service';

describe('RoomService (Integration)', () => {
  let service: RoomService;
  let entityService: EntityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RoomService, EntityService],
    }).compile();

    service = module.get<RoomService>(RoomService);
    entityService = module.get<EntityService>(EntityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a room with proper properties', () => {
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
    expect(result.width).toBe(10);
    expect(result.height).toBe(10);
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
});
