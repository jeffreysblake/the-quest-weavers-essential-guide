import { Module, Global } from '@nestjs/common';
import { ActionResolverService } from './action-resolver.service';
import { CommandParserService } from './command-parser.service';
import { PlayerStateService } from './player-state.service';
import { MovementActionHandler } from './handlers/movement.handler';
import { EventsModule } from '../events/events.module';
import { DatabaseModule } from '../database/database.module';
import { EntityModule } from '../entity/entity.module';
import { RoomModule } from '../entity/room.module';
import { ObjectModule } from '../entity/object.module';
import { PlayerModule } from '../entity/player.module';

@Global() // Make gameplay services available throughout the application
@Module({
  imports: [
    EventsModule,
    DatabaseModule,
    EntityModule,
    RoomModule,
    ObjectModule,
    PlayerModule,
  ],
  providers: [
    ActionResolverService,
    CommandParserService,
    PlayerStateService,
    MovementActionHandler,
  ],
  exports: [
    ActionResolverService,
    CommandParserService,
    PlayerStateService,
  ],
})
export class GameplayModule {}
