import { Module, Global } from '@nestjs/common';
import { ComponentManagerService } from './component-manager.service';
import { EventsModule } from '../events/events.module';

@Global() // Make components available throughout the application
@Module({
  imports: [EventsModule],
  providers: [ComponentManagerService],
  exports: [ComponentManagerService],
})
export class ComponentsModule {}
