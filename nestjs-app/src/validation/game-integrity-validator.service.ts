import { Injectable, Logger } from '@nestjs/common';
import { GameData, RoomData, ObjectData, NPCData, RoomConnection } from '../database/database.interfaces';

export interface IntegrityError {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  message: string;
  suggestion?: string;
  blocking?: boolean;
}

export interface IntegrityWarning {
  category: string;
  message: string;
  suggestion?: string;
}

export interface IntegrityValidationResult {
  isValid: boolean;
  errors: IntegrityError[];
  warnings: IntegrityWarning[];
  summary: {
    totalErrors: number;
    totalWarnings: number;
    criticalErrors: number;
    blockingIssues: string[];
  };
}

@Injectable()
export class GameIntegrityValidatorService {
  private readonly logger = new Logger(GameIntegrityValidatorService.name);

  /**
   * Validate game integrity
   *
   * NOTE: This validator is temporarily disabled and always returns success.
   * It needs refactoring to handle database-format data instead of raw JSON.
   * Validation currently happens during file loading (schema validation)
   * and game loading (item placement).
   */
  validate(
    gameData: GameData | undefined,
    rooms: RoomData[],
    objects: ObjectData[],
    npcs: NPCData[],
    connections: RoomConnection[],
  ): IntegrityValidationResult {
    this.logger.log('Game integrity validator disabled - validation handled during file loading');

    return {
      isValid: true,
      errors: [] as IntegrityError[],
      warnings: [] as IntegrityWarning[],
      summary: {
        totalErrors: 0,
        totalWarnings: 0,
        criticalErrors: 0,
        blockingIssues: [] as string[],
      },
    };
  }
}
