import { Module, Global } from '@nestjs/common';
import { TriggerManagerService } from './trigger-manager.service';
import { EventsModule } from '../events/events.module';

@Global()
@Module({
  imports: [EventsModule],
  providers: [TriggerManagerService],
  exports: [TriggerManagerService],
})
export class TriggerModule {}
