import { Module, Global } from '@nestjs/common';
import { ObjectPoolService } from './object-pool.service';

@Global()
@Module({
  providers: [ObjectPoolService],
  exports: [ObjectPoolService],
})
export class PoolingModule {}
