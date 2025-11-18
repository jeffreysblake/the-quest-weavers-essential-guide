import { Module, Global, forwardRef } from '@nestjs/common';
import { DialogueManagerService } from './dialogue-manager.service';
import { EventsModule } from '../events/events.module';
import { PlayerModule } from '../entity/player.module';

@Global()
@Module({
  imports: [EventsModule, forwardRef(() => PlayerModule)],
  providers: [DialogueManagerService],
  exports: [DialogueManagerService],
})
export class DialogueModule {}
