import { Injectable, Logger } from '@nestjs/common';
import { FileScannerService } from './file-scanner.service';
import { DatabaseService } from '../database/database.service';
import { ValidationService } from '../validation/validation.service';
import { GameLogicValidatorService } from '../validation/game-logic-validator.service';
import {
  GameData,
  RoomData,
  ObjectData,
  NPCData,
  RoomConnection,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from '../database/database.interfaces';
import { JsonFileLoaderHelper } from './helpers/json-file-loader.helper';
import { EntityConverterHelper } from './helpers/entity-converter.helper';
import { DatabaseImportHelper } from './helpers/database-import.helper';
import { DatabaseExportHelper } from './helpers/database-export.helper';

@Injectable()
export class GameFileService {
  private readonly logger = new Logger(GameFileService.name);

  constructor(
    private readonly fileScannerService: FileScannerService,
    private readonly databaseService: DatabaseService,
    private readonly validationService: ValidationService,
    private readonly gameLogicValidator: GameLogicValidatorService,
  ) {
    // Initialize helpers
    this.jsonLoader = new JsonFileLoaderHelper(fileScannerService, validationService);
    this.entityConverter = new EntityConverterHelper();
    this.databaseImporter = new DatabaseImportHelper(databaseService);
    this.databaseExporter = new DatabaseExportHelper(databaseService, fileScannerService);
  }

  // Helper instances
  private readonly jsonLoader: JsonFileLoaderHelper;
  private readonly entityConverter: EntityConverterHelper;
  private readonly databaseImporter: DatabaseImportHelper;
  private readonly databaseExporter: DatabaseExportHelper;

  async loadGameFromFiles(gameId: string): Promise<{
    success: boolean;
    message: string;
    loaded: {
      game?: GameData;
      rooms: RoomData[];
      objects: ObjectData[];
      npcs: NPCData[];
      connections: RoomConnection[];
    };
  }> {
    this.logger.log(`Loading game ${gameId} from files...`);

    try {
      // Validate game directory first
      const validation =
        await this.fileScannerService.validateGameDirectory(gameId);
      if (!validation.isValid) {
        return {
          success: false,
          message: `Validation failed: ${validation.errors.join(', ')}`,
          loaded: { rooms: [], objects: [], npcs: [], connections: [] },
        };
      }

      // Detect changes
      const changes = await this.fileScannerService.detectChanges(gameId);
      if (changes.changes.length === 0) {
        return {
          success: true,
          message: 'No changes detected - game is up to date',
          loaded: { rooms: [], objects: [], npcs: [], connections: [] },
        };
      }

      // Load game configuration
      let gameData: GameData | undefined;
      try {
        gameData = await this.loadGameConfig(gameId);
      } catch (error) {
        this.logger.error(`Failed to load game config for ${gameId}:`, error);
      }

      // Load all entities
      const rooms = await this.loadRooms(gameId);
      const objects = await this.loadObjects(gameId);
      const npcs = await this.loadNpcs(gameId);
      const connections = await this.loadConnections(gameId);

      // Save to database with versioning
      this.databaseImporter.saveGameToDatabase(gameData, rooms, objects, npcs, connections);

      return {
        success: true,
        message: `Successfully loaded game ${gameId} with ${rooms.length} rooms, ${objects.length} objects, ${npcs.length} NPCs, and ${connections.length} connections`,
        loaded: { game: gameData, rooms, objects, npcs, connections },
      };
    } catch (error) {
      this.logger.error(`Failed to load game ${gameId} from files:`, error);
      return {
        success: false,
        message: `Load failed: ${error.message}`,
        loaded: { rooms: [], objects: [], npcs: [], connections: [] },
      };
    }
  }

  async loadGameConfig(gameId: string): Promise<GameData> {
    const result = await this.jsonLoader.loadGameConfig(gameId);

    if (!result.data) {
      throw new Error(
        `Game config validation failed: ${result.errors.join(', ')}`,
      );
    }

    return this.entityConverter.convertToGameData(result.data);
  }

  async loadRooms(gameId: string): Promise<RoomData[]> {
    const roomsDir = `${this.fileScannerService.getGamesDirectory()}/${gameId}/rooms`;
    const rooms: RoomData[] = [];

    const result = await this.jsonLoader.loadJsonFilesFromDirectory(roomsDir);

    for (const { fileName, content } of result.files) {
      try {
        const rawRoom = JSON.parse(content);

        // Validate
        const validationResult = this.validationService.validateRoom(rawRoom);
        if (!validationResult.isValid) {
          this.logger.error(
            `Room validation failed for ${fileName}: ${validationResult.errors.join(', ')}`,
          );
          continue;
        }

        rooms.push(this.entityConverter.convertToRoomData(rawRoom, gameId));
      } catch (error) {
        this.logger.error(`Failed to load room from ${fileName}:`, error);
      }
    }

    return rooms;
  }

  async loadObjects(gameId: string): Promise<ObjectData[]> {
    const objectsDir = `${this.fileScannerService.getGamesDirectory()}/${gameId}/objects`;
    const objects: ObjectData[] = [];

    const result = await this.jsonLoader.loadJsonFilesFromDirectory(objectsDir);

    for (const { fileName, content } of result.files) {
      try {
        const rawObject = JSON.parse(content);

        // Validate
        const validationResult = this.validationService.validateObject(rawObject);
        if (!validationResult.isValid) {
          this.logger.error(
            `Object validation failed for ${fileName}: ${validationResult.errors.join(', ')}`,
          );
          continue;
        }

        objects.push(this.entityConverter.convertToObjectData(rawObject, gameId));
      } catch (error) {
        this.logger.error(`Failed to load object from ${fileName}:`, error);
      }
    }

    return objects;
  }

  async loadNpcs(gameId: string): Promise<NPCData[]> {
    const npcsDir = `${this.fileScannerService.getGamesDirectory()}/${gameId}/npcs`;
    const npcs: NPCData[] = [];

    const result = await this.jsonLoader.loadJsonFilesFromDirectory(npcsDir);

    for (const { fileName, content } of result.files) {
      try {
        const rawNpc = JSON.parse(content);

        // Validate
        const validationResult = this.validationService.validateNPC(rawNpc);
        if (!validationResult.isValid) {
          this.logger.error(
            `NPC validation failed for ${fileName}: ${validationResult.errors.join(', ')}`,
          );
          continue;
        }

        npcs.push(this.entityConverter.convertToNPCData(rawNpc, gameId));
      } catch (error) {
        this.logger.error(`Failed to load NPC from ${fileName}:`, error);
      }
    }

    return npcs;
  }

  async loadConnections(gameId: string): Promise<RoomConnection[]> {
    const connectionsPath = `${this.fileScannerService.getGamesDirectory()}/${gameId}/connections.json`;

    try {
      const content = await this.fileScannerService.getFileContent(connectionsPath);
      const rawConnections = JSON.parse(content);

      // Validate
      const validationResult = this.validationService.validateConnections(rawConnections);
      if (!validationResult.isValid) {
        this.logger.error(
          `Connections validation failed: ${validationResult.errors.join(', ')}`,
        );
        return [];
      }

      if (!rawConnections.connections || !Array.isArray(rawConnections.connections)) {
        this.logger.warn(`Invalid connections format in ${gameId}/connections.json`);
        return [];
      }

      return rawConnections.connections.map((conn: any, index: number) =>
        this.entityConverter.convertToRoomConnection(conn, index),
      );
    } catch (error) {
      this.logger.error(`Failed to load connections for ${gameId}:`, error);
      return [];
    }
  }


  async exportGameToFiles(
    gameId: string,
    outputDirectory?: string,
  ): Promise<{
    success: boolean;
    message: string;
    exportPath?: string;
  }> {
    this.logger.log(`Exporting game ${gameId} to files...`);

    try {
      // Determine output directory
      const exportDir =
        outputDirectory ||
        `${this.fileScannerService.getGamesDirectory()}/${gameId}`;

      // Ensure directory structure exists
      await this.fileScannerService.ensureGameDirectory(gameId);

      // 1. Export game config
      const gameData = await this.databaseExporter.queryGameConfig(gameId);
      if (gameData) {
        await this.databaseExporter.exportGameConfig(gameData, exportDir);
      }

      // 2. Export rooms
      const rooms = await this.databaseExporter.queryRooms(gameId);
      await this.databaseExporter.exportRooms(rooms, exportDir);

      // 3. Export objects
      const objects = await this.databaseExporter.queryObjects(gameId);
      await this.databaseExporter.exportObjects(objects, exportDir);

      // 4. Export NPCs
      const npcs = await this.databaseExporter.queryNPCs(gameId);
      await this.databaseExporter.exportNPCs(npcs, exportDir);

      // 5. Export connections
      const connections = await this.databaseExporter.queryConnections(gameId);
      await this.databaseExporter.exportConnections(connections, exportDir);

      this.logger.log(
        `Successfully exported game ${gameId} with ${rooms.length} rooms, ${objects.length} objects, ${npcs.length} NPCs`,
      );

      return {
        success: true,
        message: `Successfully exported game ${gameId} to ${exportDir}`,
        exportPath: exportDir,
      };
    } catch (error) {
      this.logger.error(`Failed to export game ${gameId}:`, error);
      return {
        success: false,
        message: `Export failed: ${error.message}`,
      };
    }
  }

  async validateGameFiles(gameId: string): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      // Use the file scanner validation
      const scannerResult =
        await this.fileScannerService.validateGameDirectory(gameId);

      // Convert to our format
      scannerResult.errors.forEach((error) => {
        errors.push({
          type: 'missing_file',
          message: error,
        });
      });

      scannerResult.warnings.forEach((warning) => {
        warnings.push({
          type: 'best_practice',
          message: warning,
        });
      });

      // Perform JSON Schema validation
      const gameDir = `${this.fileScannerService.getGamesDirectory()}/${gameId}`;
      const schemaValidation = await this.validationService.validateGameFiles(
        gameId,
        gameDir,
      );

      if (!schemaValidation.isValid) {
        schemaValidation.errors.forEach((error) => {
          errors.push({
            type: 'schema_validation',
            message: error,
          });
        });
      }

      // Perform game logic validation
      const logicValidation =
        await this.gameLogicValidator.validateGameLogic(gameId);

      if (!logicValidation.isValid) {
        logicValidation.errors.forEach((error) => {
          errors.push({
            type: 'invalid_data',
            message: error,
          });
        });
      }

      // Add logic validation warnings
      logicValidation.warnings.forEach((warning) => {
        warnings.push({
          type: 'best_practice',
          message: warning,
        });
      });
    } catch (error) {
      errors.push({
        type: 'invalid_data',
        message: `Validation failed: ${error.message}`,
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
