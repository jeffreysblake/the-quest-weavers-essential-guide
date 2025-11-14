import { Module, Global } from '@nestjs/common';
import { StateMachineService } from './state-machine.service';
import { EventsModule } from '../events/events.module';

@Global()
@Module({
  imports: [EventsModule],
  providers: [StateMachineService],
  exports: [StateMachineService],
})
export class StateMachineModule {}
