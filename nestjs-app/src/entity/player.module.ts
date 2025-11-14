import { Module } from '@nestjs/common';
import { PlayerService } from './player.service';
import { PlayerController } from './player.controller';
import { PhysicsService } from './physics.service';
import { EntityModule } from './entity.module';
import { ObjectModule } from './object.module';
import { RoomModule } from './room.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [EntityModule, ObjectModule, RoomModule, DatabaseModule],
  controllers: [PlayerController],
  providers: [PlayerService, PhysicsService],
  exports: [PlayerService, PhysicsService],
})
export class PlayerModule {}
