import { Module, Global } from '@nestjs/common';
import { QuestManagerService } from './quest-manager.service';
import { EventsModule } from '../events/events.module';

@Global()
@Module({
  imports: [EventsModule],
  providers: [QuestManagerService],
  exports: [QuestManagerService],
})
export class QuestModule {}
