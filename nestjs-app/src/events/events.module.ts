import { Module, Global } from '@nestjs/common';
import { EventEmitterService } from './event-emitter.service';

@Global() // Make events available throughout the application
@Module({
  providers: [EventEmitterService],
  exports: [EventEmitterService],
})
export class EventsModule {}
