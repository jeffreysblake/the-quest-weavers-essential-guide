import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ValidationModule } from '../validation/validation.module';
import { GameFileService } from './game-file.service';
import { FileScannerService } from './file-scanner.service';

@Module({
  imports: [DatabaseModule, forwardRef(() => ValidationModule)],
  providers: [GameFileService, FileScannerService],
  exports: [GameFileService, FileScannerService],
})
export class FileSystemModule {}
