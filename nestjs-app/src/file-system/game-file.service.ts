import { Injectable, Logger } from '@nestjs/common';
import { FileScannerService } from './file-scanner.service';
import { DatabaseService } from '../database/database.service';
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
import { IRoom } from '../entity/room.interface';
import { IObject } from '../entity/object.interface';
// Removed unused import - using NPCData interface instead

@Injectable()
export class GameFileService {
  private readonly logger = new Logger(GameFileService.name);

  constructor(
    private readonly fileScannerService: FileScannerService,
    private readonly databaseService: DatabaseService,
  ) {}

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
      this.saveGameToDatabase(gameData, rooms, objects, npcs, connections);

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
    const configPath = `${this.fileScannerService.getGamesDirectory()}/${gameId}/game-config.json`;
    const content = await this.fileScannerService.getFileContent(configPath);

    const rawConfig = JSON.parse(content);

    return {
      id: rawConfig.id,
      name: rawConfig.name,
      description: rawConfig.description,
      version: rawConfig.version || 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true,
      metadata: rawConfig.metadata,
    };
  }

  async loadRooms(gameId: string): Promise<RoomData[]> {
    const roomsDir = `${this.fileScannerService.getGamesDirectory()}/${gameId}/rooms`;
    const rooms: RoomData[] = [];

    try {
      const fs = require('fs');
      if (!fs.existsSync(roomsDir)) {
        return rooms;
      }

      const roomFiles = fs
        .readdirSync(roomsDir)
        .filter((f: string) => f.endsWith('.json'));

      for (const roomFile of roomFiles) {
        try {
          const roomPath = `${roomsDir}/${roomFile}`;
          const content =
            await this.fileScannerService.getFileContent(roomPath);
          const rawRoom = JSON.parse(content);

          const roomData: RoomData = {
            id: rawRoom.id,
            gameId: gameId,
            name: rawRoom.name,
            description: rawRoom.description,
            longDescription: rawRoom.long_description,
            position: rawRoom.position || { x: 0, y: 0, z: 0 },
            width: rawRoom.size?.width || rawRoom.width || 10,
            height: rawRoom.size?.height || rawRoom.height || 10,
            depth: rawRoom.size?.depth || rawRoom.depth || 3,
            environmentData: rawRoom.environment,
            version: 1,
            createdAt: new Date().toISOString(),
          };

          rooms.push(roomData);
        } catch (error) {
          this.logger.error(`Failed to load room from ${roomFile}:`, error);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to load rooms directory for ${gameId}:`, error);
    }

    return rooms;
  }

  async loadObjects(gameId: string): Promise<ObjectData[]> {
    const objectsDir = `${this.fileScannerService.getGamesDirectory()}/${gameId}/objects`;
    const objects: ObjectData[] = [];

    try {
      const fs = require('fs');
      if (!fs.existsSync(objectsDir)) {
        return objects;
      }

      const objectFiles = fs
        .readdirSync(objectsDir)
        .filter((f: string) => f.endsWith('.json'));

      for (const objectFile of objectFiles) {
        try {
          const objectPath = `${objectsDir}/${objectFile}`;
          const content =
            await this.fileScannerService.getFileContent(objectPath);
          const rawObject = JSON.parse(content);

          const objectData: ObjectData = {
            id: rawObject.id,
            gameId: gameId,
            name: rawObject.name,
            description: rawObject.description,
            objectType: rawObject.object_type,
            position: rawObject.position || { x: 0, y: 0, z: 0 },
            material: rawObject.material,
            materialProperties: rawObject.material_properties,
            weight: rawObject.weight || 0,
            health: rawObject.health,
            maxHealth: rawObject.max_health,
            isPortable: rawObject.is_portable ?? true,
            isContainer: rawObject.is_container ?? false,
            canContain: rawObject.can_contain ?? false,
            containerCapacity: rawObject.container_capacity || 0,
            stateData: rawObject.state_data,
            properties: rawObject.properties,
            version: 1,
            createdAt: new Date().toISOString(),
          };

          objects.push(objectData);
        } catch (error) {
          this.logger.error(`Failed to load object from ${objectFile}:`, error);
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to load objects directory for ${gameId}:`,
        error,
      );
    }

    return objects;
  }

  async loadNpcs(gameId: string): Promise<NPCData[]> {
    const npcsDir = `${this.fileScannerService.getGamesDirectory()}/${gameId}/npcs`;
    const npcs: NPCData[] = [];

    try {
      const fs = require('fs');
      if (!fs.existsSync(npcsDir)) {
        return npcs;
      }

      const npcFiles = fs
        .readdirSync(npcsDir)
        .filter((f: string) => f.endsWith('.json'));

      for (const npcFile of npcFiles) {
        try {
          const npcPath = `${npcsDir}/${npcFile}`;
          const content = await this.fileScannerService.getFileContent(npcPath);
          const rawNpc = JSON.parse(content);

          const npcData: NPCData = {
            id: rawNpc.id,
            gameId: gameId,
            name: rawNpc.name,
            description: rawNpc.description,
            npcType: rawNpc.npc_type || 'npc',
            position: rawNpc.position || { x: 0, y: 0, z: 0 },
            health: rawNpc.health || 100,
            maxHealth: rawNpc.max_health || rawNpc.health || 100,
            level: rawNpc.level || 1,
            experience: rawNpc.experience || 0,
            inventoryData: rawNpc.inventory_data,
            dialogueTreeData: rawNpc.dialogue_tree_data,
            behaviorConfig: rawNpc.behavior_config,
            attributes: rawNpc.attributes,
            version: 1,
            createdAt: new Date().toISOString(),
          };

          npcs.push(npcData);
        } catch (error) {
          this.logger.error(`Failed to load NPC from ${npcFile}:`, error);
        }
      }
    } catch (error) {
      this.logger.error(`Failed to load NPCs directory for ${gameId}:`, error);
    }

    return npcs;
  }

  async loadConnections(gameId: string): Promise<RoomConnection[]> {
    const connectionsPath = `${this.fileScannerService.getGamesDirectory()}/${gameId}/connections.json`;

    try {
      const content =
        await this.fileScannerService.getFileContent(connectionsPath);
      const rawConnections = JSON.parse(content);

      if (
        !rawConnections.connections ||
        !Array.isArray(rawConnections.connections)
      ) {
        this.logger.warn(
          `Invalid connections format in ${gameId}/connections.json`,
        );
        return [];
      }

      return rawConnections.connections.map((conn: any, index: number) => ({
        id: index + 1, // Will be assigned by database
        roomId: conn.from_room,
        connectedRoomId: conn.to_room,
        direction: conn.direction,
        description: conn.description,
        isLocked: conn.is_locked || false,
        requiredKeyId: conn.required_key || null,
        createdAt: new Date().toISOString(),
      }));
    } catch (error) {
      this.logger.error(`Failed to load connections for ${gameId}:`, error);
      return [];
    }
  }

  private saveGameToDatabase(
    gameData: GameData | undefined,
    rooms: RoomData[],
    objects: ObjectData[],
    npcs: NPCData[],
    connections: RoomConnection[],
  ): void {
    this.databaseService.transaction((db) => {
      // Save game config
      if (gameData) {
        const insertGame = db.prepare(`
          INSERT OR REPLACE INTO games (id, name, description, version, created_at, updated_at, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        insertGame.run(
          gameData.id,
          gameData.name,
          gameData.description,
          gameData.version,
          gameData.createdAt,
          gameData.updatedAt,
          gameData.isActive,
        );

        // Save version history - call synchronously
        this.databaseService.saveVersion(
          'game',
          gameData.id,
          gameData,
          'file_loader',
          'Loaded from files',
        );
      }

      // Save rooms
      const insertRoom = db.prepare(`
        INSERT OR REPLACE INTO rooms (
          id, game_id, name, description, long_description, position_x, position_y, position_z,
          width, height, depth, environment_data, version, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const room of rooms) {
        insertRoom.run(
          room.id,
          room.gameId,
          room.name,
          room.description,
          room.longDescription,
          room.position.x,
          room.position.y,
          room.position.z,
          room.width,
          room.height,
          room.depth,
          JSON.stringify(room.environmentData),
          room.version,
          room.createdAt,
        );

        this.databaseService.saveVersion(
          'room',
          room.id,
          room,
          'file_loader',
          'Loaded from files',
        );
      }

      // Save objects
      const insertObject = db.prepare(`
        INSERT OR REPLACE INTO objects (
          id, game_id, name, description, object_type, position_x, position_y, position_z,
          material, material_properties, weight, health, max_health, is_portable, is_container,
          can_contain, container_capacity, state_data, properties, version, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const object of objects) {
        insertObject.run(
          object.id,
          object.gameId,
          object.name,
          object.description,
          object.objectType,
          object.position.x,
          object.position.y,
          object.position.z,
          object.material,
          JSON.stringify(object.materialProperties),
          object.weight,
          object.health,
          object.maxHealth,
          object.isPortable,
          object.isContainer,
          object.canContain,
          object.containerCapacity,
          JSON.stringify(object.stateData),
          JSON.stringify(object.properties),
          object.version,
          object.createdAt,
        );

        this.databaseService.saveVersion(
          'object',
          object.id,
          object,
          'file_loader',
          'Loaded from files',
        );
      }

      // Save NPCs
      const insertNpc = db.prepare(`
        INSERT OR REPLACE INTO npcs (
          id, game_id, name, description, npc_type, position_x, position_y, position_z,
          health, max_health, level, experience, inventory_data, dialogue_tree_data,
          behavior_config, attributes, version, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const npc of npcs) {
        insertNpc.run(
          npc.id,
          npc.gameId,
          npc.name,
          npc.description,
          npc.npcType,
          npc.position.x,
          npc.position.y,
          npc.position.z,
          npc.health,
          npc.maxHealth,
          npc.level,
          npc.experience,
          JSON.stringify(npc.inventoryData),
          JSON.stringify(npc.dialogueTreeData),
          JSON.stringify(npc.behaviorConfig),
          JSON.stringify(npc.attributes),
          npc.version,
          npc.createdAt,
        );

        this.databaseService.saveVersion(
          'npc',
          npc.id,
          npc,
          'file_loader',
          'Loaded from files',
        );
      }

      // Clear existing connections for this game
      db.prepare(
        'DELETE FROM room_connections WHERE room_id IN (SELECT id FROM rooms WHERE game_id = ?)',
      ).run(gameData?.id);

      // Save connections
      const insertConnection = db.prepare(`
        INSERT INTO room_connections (room_id, connected_room_id, direction, description, is_locked, required_key_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const connection of connections) {
        insertConnection.run(
          connection.roomId,
          connection.connectedRoomId,
          connection.direction,
          connection.description,
          connection.isLocked,
          connection.requiredKeyId,
          connection.createdAt,
        );
      }
    });
  }

  async exportGameToFiles(
    gameId: string,
    outputDirectory?: string,
  ): Promise<{
    success: boolean;
    message: string;
    exportPath?: string;
  }> {
    // Implementation for exporting database game back to files
    // This will be useful for backing up or sharing games
    this.logger.log(`Exporting game ${gameId} to files...`);

    // This is a placeholder - full implementation would read from database
    // and write to file system in the proper format

    return {
      success: false,
      message: 'Export functionality not yet implemented',
    };
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

      // Additional validation logic could go here
      // - Check for orphaned references
      // - Validate JSON schemas
      // - Check for circular dependencies in connections
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
