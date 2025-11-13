import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ValidationModule } from '../validation/validation.module';
import { GameFileService } from './game-file.service';
import { FileScannerService } from './file-scanner.service';

@Module({
  imports: [DatabaseModule, ValidationModule],
  providers: [GameFileService, FileScannerService],
  exports: [GameFileService, FileScannerService],
})
export class FileSystemModule {}
