import { Module } from '@nestjs/common';
import { CLIService } from './cli.service';
import { GameManagerService } from './game-manager.service';
import { DatabaseModule } from '../database/database.module';
import { FileSystemModule } from '../file-system/file-system.module';
import { AssetModule } from '../asset/asset.module';
import { EntityModule } from '../entity/entity.module';
import { RoomModule } from '../entity/room.module';
import { ObjectModule } from '../entity/object.module';
import { PlayerModule } from '../entity/player.module';

@Module({
  imports: [
    DatabaseModule,
    FileSystemModule,
    AssetModule,
    EntityModule,
    RoomModule,
    ObjectModule,
    PlayerModule,
  ],
  providers: [CLIService, GameManagerService],
  exports: [CLIService, GameManagerService],
})
export class CLIModule {}
