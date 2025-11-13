import { Module } from '@nestjs/common';
import { AssetService } from './asset.service';
import { FileSystemModule } from '../file-system/file-system.module';

@Module({
  imports: [FileSystemModule],
  providers: [AssetService],
  exports: [AssetService],
})
export class AssetModule {}
