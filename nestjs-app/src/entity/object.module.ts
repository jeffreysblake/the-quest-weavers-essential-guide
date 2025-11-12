import { Module } from '@nestjs/common';
import { ObjectService } from './object.service';
import { ObjectController } from './object.controller';
import { EntityModule } from './entity.module';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [EntityModule, DatabaseModule],
  controllers: [ObjectController],
  providers: [ObjectService],
  exports: [ObjectService],
})
export class ObjectModule {}
