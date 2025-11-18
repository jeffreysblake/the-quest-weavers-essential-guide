import { Module, forwardRef } from '@nestjs/common';
import { ValidationService } from './validation.service';
import { GameLogicValidatorService } from './game-logic-validator.service';
import { GameIntegrityValidatorService } from './game-integrity-validator.service';
import { FileSystemModule } from '../file-system/file-system.module';

@Module({
  imports: [forwardRef(() => FileSystemModule)],
  providers: [ValidationService, GameLogicValidatorService, GameIntegrityValidatorService],
  exports: [ValidationService, GameLogicValidatorService, GameIntegrityValidatorService],
})
export class ValidationModule {}
