import { Module } from '@nestjs/common';
import { CLIService } from './cli.service';
import { GameManagerService } from './game-manager.service';
import { DatabaseModule } from '../database/database.module';
import { FileSystemModule } from '../file-system/file-system.module';
import { AssetModule } from '../asset/asset.module';
import { EventsModule } from '../events/events.module';
import { CommandsModule } from '../commands/commands.module';
import { ComponentsModule } from '../components/components.module';
import { PoolingModule } from '../pooling/pooling.module';
import { StateMachineModule } from '../state-machine/state-machine.module';
import { GameplayModule } from '../gameplay/gameplay.module';
import { DialogueModule } from '../dialogue/dialogue.module';
import { QuestModule } from '../quest/quest.module';
import { InventoryModule } from '../inventory/inventory.module';
import { TriggerModule } from '../trigger/trigger.module';
import { EffectsModule } from '../effects/effects.module';
import { WorldStateModule } from '../world-state/world-state.module';
import { EntityModule } from '../entity/entity.module';
import { RoomModule } from '../entity/room.module';
import { ObjectModule } from '../entity/object.module';
import { PlayerModule } from '../entity/player.module';

@Module({
  imports: [
    DatabaseModule,
    FileSystemModule,
    AssetModule,
    EventsModule,
    CommandsModule,
    ComponentsModule,
    PoolingModule,
    StateMachineModule,
    GameplayModule,
    DialogueModule,
    QuestModule,
    InventoryModule,
    TriggerModule,
    EffectsModule,
    WorldStateModule,
    EntityModule,
    RoomModule,
    ObjectModule,
    PlayerModule,
  ],
  providers: [CLIService, GameManagerService],
  exports: [CLIService, GameManagerService],
})
export class CLIModule {}
