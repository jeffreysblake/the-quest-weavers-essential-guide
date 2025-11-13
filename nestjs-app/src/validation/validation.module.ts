import { Module } from '@nestjs/common';
import { ValidationService } from './validation.service';
import { GameLogicValidatorService } from './game-logic-validator.service';
import { FileSystemModule } from '../file-system/file-system.module';

@Module({
  imports: [FileSystemModule],
  providers: [ValidationService, GameLogicValidatorService],
  exports: [ValidationService, GameLogicValidatorService],
})
export class ValidationModule {}
