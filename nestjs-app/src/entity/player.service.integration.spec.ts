import { Test, TestingModule } from '@nestjs/testing';
import { PlayerService } from './player.service';
import { EntityService } from './entity.service';
import { ObjectService } from './object.service';
import { PhysicsService } from './physics.service';
import { RoomService } from './room.service';

describe('PlayerService (Integration)', () => {
  let service: PlayerService;
  let entityService: EntityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayerService,
        EntityService,
        ObjectService,
        PhysicsService,
        RoomService,
      ],
    }).compile();

    service = module.get<PlayerService>(PlayerService);
    entityService = module.get<EntityService>(EntityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create a player with proper properties', () => {
    const playerData = {
      name: 'Test Player',
      position: { x: 0, y: 0, z: 0 },
      health: 100,
      inventory: [],
      level: 1,
      experience: 0,
    };

    const result = service.createPlayer(playerData);

    expect(result).toBeDefined();
    expect(result.id).toBeDefined();
    expect(result.name).toBe('Test Player');
    expect(result.type).toBe('player');
    expect(result.health).toBe(100);
    expect(result.level).toBe(1);
  });
});
