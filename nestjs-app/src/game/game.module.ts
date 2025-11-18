import { Module } from '@nestjs/common';
import { GameController } from './game.controller';
import { GameService } from './game.service';
import { GameStateService } from './game-state.service';
import { CommandProcessorService } from './command-processor.service';
import { CommandValidatorService } from './command-validator.service';
import { RoomNavigationHelperService } from './room-navigation-helper.service';
import { EntityModule } from '../entity/entity.module';
import { RoomModule } from '../entity/room.module';
import { PlayerModule } from '../entity/player.module';
import { ObjectModule } from '../entity/object.module';
import { DatabaseModule } from '../database/database.module';
import { EventsModule } from '../events/events.module';
import { DialogueModule } from '../dialogue/dialogue.module';

// Command handlers
import { LookCommandHandler } from './commands/look-command.handler';
import { MovementCommandHandler } from './commands/movement-command.handler';
import { TakeCommandHandler } from './commands/take-command.handler';
import { DropCommandHandler } from './commands/drop-command.handler';
import { ExamineCommandHandler } from './commands/examine-command.handler';
import { UseCommandHandler } from './commands/use-command.handler';
import { OpenCommandHandler, CloseCommandHandler } from './commands/container-command.handler';
import { DialogueCommandHandler } from './commands/dialogue-command.handler';
import { DialogueChoiceCommandHandler } from './commands/dialogue-choice-command.handler';
import { AttackCommandHandler } from './commands/attack-command.handler';
import { CastCommandHandler } from './commands/cast-command.handler';
import { InventoryCommandHandler } from './commands/inventory-command.handler';
import { HelpCommandHandler } from './commands/help-command.handler';
import { SaveCommandHandler } from './commands/save-command.handler';
import { LoadCommandHandler } from './commands/load-command.handler';

@Module({
  imports: [
    DatabaseModule,
    EntityModule,
    RoomModule,
    PlayerModule,
    ObjectModule,
    EventsModule,
    DialogueModule,
  ],
  controllers: [GameController],
  providers: [
    GameService,
    GameStateService,
    CommandProcessorService,
    CommandValidatorService,
    RoomNavigationHelperService,
    // Command handlers
    LookCommandHandler,
    MovementCommandHandler,
    TakeCommandHandler,
    DropCommandHandler,
    ExamineCommandHandler,
    UseCommandHandler,
    OpenCommandHandler,
    CloseCommandHandler,
    DialogueCommandHandler,
    DialogueChoiceCommandHandler,
    AttackCommandHandler,
    CastCommandHandler,
    InventoryCommandHandler,
    HelpCommandHandler,
    SaveCommandHandler,
    LoadCommandHandler,
  ],
  exports: [GameService, GameStateService],
})
export class GameModule {}
