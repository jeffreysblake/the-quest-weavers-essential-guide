import { Module, Global } from '@nestjs/common';
import { WorldStateManagerService } from './world-state-manager.service';
import { EventsModule } from '../events/events.module';
import { DatabaseModule } from '../database/database.module';

@Global()
@Module({
  imports: [EventsModule, DatabaseModule],
  providers: [WorldStateManagerService],
  exports: [WorldStateManagerService],
})
export class WorldStateModule {}
