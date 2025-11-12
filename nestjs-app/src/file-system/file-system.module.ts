import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { GameFileService } from './game-file.service';
import { FileScannerService } from './file-scanner.service';

@Module({
  imports: [DatabaseModule],
  providers: [GameFileService, FileScannerService],
  exports: [GameFileService, FileScannerService],
})
export class FileSystemModule {}
