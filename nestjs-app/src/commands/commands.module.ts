import { Module, Global } from '@nestjs/common';
import { CommandManagerService } from './command-manager.service';
import { EventsModule } from '../events/events.module';

@Global() // Make commands available throughout the application
@Module({
  imports: [EventsModule],
  providers: [CommandManagerService],
  exports: [CommandManagerService],
})
export class CommandsModule {}
