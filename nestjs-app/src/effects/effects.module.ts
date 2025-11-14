import { Module, Global } from '@nestjs/common';
import { EffectManagerService } from './effect-manager.service';
import { EventsModule } from '../events/events.module';

@Global()
@Module({
  imports: [EventsModule],
  providers: [EffectManagerService],
  exports: [EffectManagerService],
})
export class EffectsModule {}
