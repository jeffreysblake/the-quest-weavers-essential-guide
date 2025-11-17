import { Test, TestingModule } from '@nestjs/testing';
import { EntityService } from './entity.service';
import { RoomService } from './room.service';
import { PlayerService } from './player.service';
import { ObjectService } from './object.service';

describe('Core Services Tests', () => {
  let entityService: EntityService;
  let roomService: RoomService;
  let playerService: PlayerService;
  let objectService: ObjectService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EntityService, RoomService, PlayerService, ObjectService],
    }).compile();

    entityService = module.get<EntityService>(EntityService);
    roomService = module.get<RoomService>(RoomService);
    playerService = module.get<PlayerService>(PlayerService);
    objectService = module.get<ObjectService>(ObjectService);
  });

  it('should create an entity', async () => {
    const testData = {
      name: 'Test Entity',
      position: { x: 0, y: 0, z: 0 },
      type: 'object' as const,
    };

    const result = await entityService.createEntity(testData);
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
  });

  it('should create a room', () => {
    const roomData = {
      name: 'Test Room',
      width: 10,
      height: 10,
      position: { x: 0, y: 0, z: 0 },
      size: { width: 10, height: 10, depth: 3 },
      objects: [],
      players: [],
    };

    const result = roomService.createRoom(roomData);
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
  });

  it('should create a player', async () => {
    const playerData = {
      name: 'Test Player',
      position: { x: 0, y: 0, z: 0 },
      health: 100,
      inventory: [],
      level: 1,
      experience: 0,
    };

    const result = await playerService.createPlayer(playerData);
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
  });

  it('should create an object', () => {
    const objectData = {
      name: 'Test Object',
      position: { x: 0, y: 0, z: 0 },
      objectType: 'item' as const,
    };

    const result = objectService.createObject(objectData);
    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
  });
});
