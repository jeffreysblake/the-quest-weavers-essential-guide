import { Module } from '@nestjs/common';
import { RoomService } from './room.service';
import { RoomController } from './room.controller';
import { EntityModule } from './entity.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [EntityModule, DatabaseModule],
  controllers: [RoomController],
  providers: [RoomService],
  exports: [RoomService],
})
export class RoomModule {}
