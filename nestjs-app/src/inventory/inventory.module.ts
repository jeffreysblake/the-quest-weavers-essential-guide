import { Module, Global } from '@nestjs/common';
import { InventoryManagerService } from './inventory-manager.service';
import { EventsModule } from '../events/events.module';

@Global()
@Module({
  imports: [EventsModule],
  providers: [InventoryManagerService],
  exports: [InventoryManagerService],
})
export class InventoryModule {}
