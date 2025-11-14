import { Module, Global } from '@nestjs/common';
import { WorldStateManagerService } from './world-state-manager.service';
import { EventsModule } from '../events/events.module';

@Global()
@Module({
  imports: [EventsModule],
  providers: [WorldStateManagerService],
  exports: [WorldStateManagerService],
})
export class WorldStateModule {}
