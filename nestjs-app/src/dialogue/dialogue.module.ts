import { Module, Global } from '@nestjs/common';
import { DialogueManagerService } from './dialogue-manager.service';
import { EventsModule } from '../events/events.module';

@Global()
@Module({
  imports: [EventsModule],
  providers: [DialogueManagerService],
  exports: [DialogueManagerService],
})
export class DialogueModule {}
