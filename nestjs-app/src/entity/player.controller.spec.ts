import { Test, TestingModule } from '@nestjs/testing';
import { PlayerController } from './player.controller';
import { PlayerService } from './player.service';
import { EntityService } from './entity.service';
import { ObjectService } from './object.service';
import { PhysicsService } from './physics.service';
import { RoomService } from './room.service';

describe('PlayerController', () => {
  let controller: PlayerController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlayerController],
      providers: [
        PlayerService,
        EntityService,
        ObjectService,
        PhysicsService,
        RoomService,
      ],
    }).compile();

    controller = module.get<PlayerController>(PlayerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
