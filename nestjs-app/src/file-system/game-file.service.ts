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
import { IRoom } from '../entity/room.interface';
import { IObject } from '../entity/object.interface';
import Database from 'better-sqlite3';
// Removed unused import - using NPCData interface instead

@Injectable()
export class GameFileService {
  private readonly logger = new Logger(GameFileService.name);

  constructor(
    private readonly fileScannerService: FileScannerService,
    private readonly databaseService: DatabaseService,
    private readonly validationService: ValidationService,
    private readonly gameLogicValidator: GameLogicValidatorService,
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

    // RESOURCE LIMIT: Max file size 10MB for game-config.json
    const MAX_CONFIG_SIZE = 10 * 1024 * 1024; // 10MB
    const fileSize = Buffer.byteLength(content, 'utf8');
    if (fileSize > MAX_CONFIG_SIZE) {
      throw new Error(
        `Game config file too large: ${(fileSize / 1024 / 1024).toFixed(2)}MB exceeds maximum of 10MB`,
      );
    }

    const rawConfig = JSON.parse(content);

    // Validate against JSON schema
    const validationResult =
      this.validationService.validateGameConfig(rawConfig);
    if (!validationResult.isValid) {
      throw new Error(
        `Game config validation failed: ${validationResult.errors.join(', ')}`,
      );
    }

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

          // RESOURCE LIMIT: Max file size 5MB for room JSON files
          const MAX_ROOM_SIZE = 5 * 1024 * 1024; // 5MB
          const fileSize = Buffer.byteLength(content, 'utf8');
          if (fileSize > MAX_ROOM_SIZE) {
            this.logger.error(
              `Room file ${roomFile} too large: ${(fileSize / 1024 / 1024).toFixed(2)}MB exceeds maximum of 5MB`,
            );
            continue; // Skip oversized room
          }

          const rawRoom = JSON.parse(content);

          // Validate against JSON schema
          const validationResult = this.validationService.validateRoom(rawRoom);
          if (!validationResult.isValid) {
            this.logger.error(
              `Room validation failed for ${roomFile}: ${validationResult.errors.join(', ')}`,
            );
            continue; // Skip invalid room
          }

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

          // RESOURCE LIMIT: Max file size 5MB for object JSON files
          const MAX_OBJECT_SIZE = 5 * 1024 * 1024; // 5MB
          const fileSize = Buffer.byteLength(content, 'utf8');
          if (fileSize > MAX_OBJECT_SIZE) {
            this.logger.error(
              `Object file ${objectFile} too large: ${(fileSize / 1024 / 1024).toFixed(2)}MB exceeds maximum of 5MB`,
            );
            continue; // Skip oversized object
          }

          const rawObject = JSON.parse(content);

          // Validate against JSON schema
          const validationResult =
            this.validationService.validateObject(rawObject);
          if (!validationResult.isValid) {
            this.logger.error(
              `Object validation failed for ${objectFile}: ${validationResult.errors.join(', ')}`,
            );
            continue; // Skip invalid object
          }

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

          // RESOURCE LIMIT: Max file size 5MB for NPC JSON files
          const MAX_NPC_SIZE = 5 * 1024 * 1024; // 5MB
          const fileSize = Buffer.byteLength(content, 'utf8');
          if (fileSize > MAX_NPC_SIZE) {
            this.logger.error(
              `NPC file ${npcFile} too large: ${(fileSize / 1024 / 1024).toFixed(2)}MB exceeds maximum of 5MB`,
            );
            continue; // Skip oversized NPC
          }

          const rawNpc = JSON.parse(content);

          // Validate against JSON schema
          const validationResult = this.validationService.validateNPC(rawNpc);
          if (!validationResult.isValid) {
            this.logger.error(
              `NPC validation failed for ${npcFile}: ${validationResult.errors.join(', ')}`,
            );
            continue; // Skip invalid NPC
          }

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

      // Validate against JSON schema
      const validationResult =
        this.validationService.validateConnections(rawConnections);
      if (!validationResult.isValid) {
        this.logger.error(
          `Connections validation failed: ${validationResult.errors.join(', ')}`,
        );
        return [];
      }

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
    // RESOURCE LIMIT: Max 1000 entities per transaction, split large operations into batches
    const BATCH_SIZE = 1000;

    // Helper function to process entities in batches
    const processBatches = <T>(
      entities: T[],
      processor: (batch: T[], db: Database.Database) => void,
    ) => {
      for (let i = 0; i < entities.length; i += BATCH_SIZE) {
        const batch = entities.slice(i, i + BATCH_SIZE);
        this.databaseService.transaction((db) => {
          processor(batch, db);
        });
        this.logger.log(
          `Processed batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(entities.length / BATCH_SIZE)}`,
        );
      }
    };

    // Save game config first (always single item)
    if (gameData) {
      this.databaseService.transaction((db) => {
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
      });
    }

    // Save rooms in batches
    if (rooms.length > 0) {
      this.logger.log(
        `Saving ${rooms.length} rooms in batches of ${BATCH_SIZE}...`,
      );
      processBatches(rooms, (batch, db) => {
        const insertRoom = db.prepare(`
          INSERT OR REPLACE INTO rooms (
            id, game_id, name, description, long_description, position_x, position_y, position_z,
            width, height, depth, environment_data, version, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const room of batch) {
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
      });
    }

    // Save objects in batches
    if (objects.length > 0) {
      this.logger.log(
        `Saving ${objects.length} objects in batches of ${BATCH_SIZE}...`,
      );
      processBatches(objects, (batch, db) => {
        const insertObject = db.prepare(`
          INSERT OR REPLACE INTO objects (
            id, game_id, name, description, object_type, position_x, position_y, position_z,
            material, material_properties, weight, health, max_health, is_portable, is_container,
            can_contain, container_capacity, state_data, properties, version, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const object of batch) {
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
      });
    }

    // Save NPCs in batches
    if (npcs.length > 0) {
      this.logger.log(
        `Saving ${npcs.length} NPCs in batches of ${BATCH_SIZE}...`,
      );
      processBatches(npcs, (batch, db) => {
        const insertNpc = db.prepare(`
          INSERT OR REPLACE INTO npcs (
            id, game_id, name, description, npc_type, position_x, position_y, position_z,
            health, max_health, level, experience, inventory_data, dialogue_tree_data,
            behavior_config, attributes, version, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const npc of batch) {
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
      });
    }

    // Save connections in batches
    if (connections.length > 0) {
      this.logger.log(
        `Saving ${connections.length} connections in batches of ${BATCH_SIZE}...`,
      );

      // Clear existing connections for this game first
      this.databaseService.transaction((db) => {
        db.prepare(
          'DELETE FROM room_connections WHERE room_id IN (SELECT id FROM rooms WHERE game_id = ?)',
        ).run(gameData?.id);
      });

      processBatches(connections, (batch, db) => {
        const insertConnection = db.prepare(`
          INSERT INTO room_connections (room_id, connected_room_id, direction, description, is_locked, required_key_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        for (const connection of batch) {
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
      const gameData = await this.queryGameConfig(gameId);
      if (gameData) {
        await this.exportGameConfig(gameData, exportDir);
      }

      // 2. Export rooms
      const rooms = await this.queryRooms(gameId);
      await this.exportRooms(rooms, exportDir);

      // 3. Export objects
      const objects = await this.queryObjects(gameId);
      await this.exportObjects(objects, exportDir);

      // 4. Export NPCs
      const npcs = await this.queryNPCs(gameId);
      await this.exportNPCs(npcs, exportDir);

      // 5. Export connections
      const connections = await this.queryConnections(gameId);
      await this.exportConnections(connections, exportDir);

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

  private async queryGameConfig(gameId: string): Promise<GameData | null> {
    try {
      const result = this.databaseService
        .prepare('SELECT * FROM games WHERE id = ?')
        .get(gameId) as any;

      if (!result) {
        this.logger.warn(`No game config found in database for ${gameId}`);
        return null;
      }

      return {
        id: result.id,
        name: result.name,
        description: result.description,
        version: result.version,
        createdAt: result.created_at,
        updatedAt: result.updated_at,
        isActive: Boolean(result.is_active),
        metadata: result.metadata ? JSON.parse(result.metadata) : undefined,
      };
    } catch (error) {
      this.logger.error(`Error querying game config for ${gameId}:`, error);
      return null;
    }
  }

  private async queryRooms(gameId: string): Promise<RoomData[]> {
    const results = this.databaseService
      .prepare('SELECT * FROM rooms WHERE game_id = ?')
      .all(gameId) as any[];

    return results.map((row) => ({
      id: row.id,
      gameId: row.game_id,
      name: row.name,
      description: row.description,
      longDescription: row.long_description,
      position: {
        x: row.position_x,
        y: row.position_y,
        z: row.position_z,
      },
      width: row.width,
      height: row.height,
      depth: row.depth,
      environmentData: row.environment_data
        ? JSON.parse(row.environment_data)
        : undefined,
      version: row.version,
      createdAt: row.created_at,
    }));
  }

  private async queryObjects(gameId: string): Promise<ObjectData[]> {
    const results = this.databaseService
      .prepare('SELECT * FROM objects WHERE game_id = ?')
      .all(gameId) as any[];

    return results.map((row) => ({
      id: row.id,
      gameId: row.game_id,
      name: row.name,
      description: row.description,
      objectType: row.object_type,
      position: {
        x: row.position_x,
        y: row.position_y,
        z: row.position_z,
      },
      material: row.material,
      materialProperties: row.material_properties
        ? JSON.parse(row.material_properties)
        : undefined,
      weight: row.weight,
      health: row.health,
      maxHealth: row.max_health,
      isPortable: Boolean(row.is_portable),
      isContainer: Boolean(row.is_container),
      canContain: Boolean(row.can_contain),
      containerCapacity: row.container_capacity,
      stateData: row.state_data ? JSON.parse(row.state_data) : undefined,
      properties: row.properties ? JSON.parse(row.properties) : undefined,
      version: row.version,
      createdAt: row.created_at,
    }));
  }

  private async queryNPCs(gameId: string): Promise<NPCData[]> {
    const results = this.databaseService
      .prepare('SELECT * FROM npcs WHERE game_id = ?')
      .all(gameId) as any[];

    return results.map((row) => ({
      id: row.id,
      gameId: row.game_id,
      name: row.name,
      description: row.description,
      npcType: row.npc_type,
      position: {
        x: row.position_x,
        y: row.position_y,
        z: row.position_z,
      },
      health: row.health,
      maxHealth: row.max_health,
      level: row.level,
      experience: row.experience,
      inventoryData: row.inventory_data
        ? JSON.parse(row.inventory_data)
        : undefined,
      dialogueTreeData: row.dialogue_tree_data
        ? JSON.parse(row.dialogue_tree_data)
        : undefined,
      behaviorConfig: row.behavior_config
        ? JSON.parse(row.behavior_config)
        : undefined,
      attributes: row.attributes ? JSON.parse(row.attributes) : undefined,
      version: row.version,
      createdAt: row.created_at,
    }));
  }

  private async queryConnections(gameId: string): Promise<RoomConnection[]> {
    const results = this.databaseService
      .prepare(
        `SELECT rc.* FROM room_connections rc
         JOIN rooms r ON rc.room_id = r.id
         WHERE r.game_id = ?`,
      )
      .all(gameId) as any[];

    return results.map((row) => ({
      id: row.id,
      roomId: row.room_id,
      connectedRoomId: row.connected_room_id,
      direction: row.direction,
      description: row.description,
      isLocked: Boolean(row.is_locked),
      requiredKeyId: row.required_key_id,
      createdAt: row.created_at,
    }));
  }

  private async exportGameConfig(
    gameData: GameData,
    exportDir: string,
  ): Promise<void> {
    const configPath = `${exportDir}/game-config.json`;

    const configJson = {
      id: gameData.id,
      name: gameData.name,
      description: gameData.description,
      version: gameData.version,
      metadata: gameData.metadata,
    };

    await this.fileScannerService.writeFileContent(
      configPath,
      JSON.stringify(configJson, null, 2),
    );

    this.logger.log(`Exported game config to ${configPath}`);
  }

  private async exportRooms(
    rooms: RoomData[],
    exportDir: string,
  ): Promise<void> {
    const roomsDir = `${exportDir}/rooms`;

    for (const room of rooms) {
      const roomFileName = this.sanitizeFilename(room.id);
      const roomPath = `${roomsDir}/${roomFileName}.json`;

      const roomJson = {
        id: room.id,
        name: room.name,
        description: room.description,
        long_description: room.longDescription,
        position: room.position,
        size: {
          width: room.width,
          height: room.height,
          depth: room.depth,
        },
        environment: room.environmentData,
      };

      await this.fileScannerService.writeFileContent(
        roomPath,
        JSON.stringify(roomJson, null, 2),
      );
    }

    this.logger.log(`Exported ${rooms.length} rooms to ${roomsDir}`);
  }

  private async exportObjects(
    objects: ObjectData[],
    exportDir: string,
  ): Promise<void> {
    const objectsDir = `${exportDir}/objects`;

    for (const object of objects) {
      const objectFileName = this.sanitizeFilename(object.id);
      const objectPath = `${objectsDir}/${objectFileName}.json`;

      const objectJson = {
        id: object.id,
        name: object.name,
        description: object.description,
        object_type: object.objectType,
        position: object.position,
        material: object.material,
        material_properties: object.materialProperties,
        weight: object.weight,
        health: object.health,
        max_health: object.maxHealth,
        is_portable: object.isPortable,
        is_container: object.isContainer,
        can_contain: object.canContain,
        container_capacity: object.containerCapacity,
        state_data: object.stateData,
        properties: object.properties,
      };

      await this.fileScannerService.writeFileContent(
        objectPath,
        JSON.stringify(objectJson, null, 2),
      );
    }

    this.logger.log(`Exported ${objects.length} objects to ${objectsDir}`);
  }

  private async exportNPCs(npcs: NPCData[], exportDir: string): Promise<void> {
    const npcsDir = `${exportDir}/npcs`;

    for (const npc of npcs) {
      const npcFileName = this.sanitizeFilename(npc.id);
      const npcPath = `${npcsDir}/${npcFileName}.json`;

      const npcJson = {
        id: npc.id,
        name: npc.name,
        description: npc.description,
        npc_type: npc.npcType,
        position: npc.position,
        health: npc.health,
        max_health: npc.maxHealth,
        level: npc.level,
        experience: npc.experience,
        inventory_data: npc.inventoryData,
        dialogue_tree_data: npc.dialogueTreeData,
        behavior_config: npc.behaviorConfig,
        attributes: npc.attributes,
      };

      await this.fileScannerService.writeFileContent(
        npcPath,
        JSON.stringify(npcJson, null, 2),
      );
    }

    this.logger.log(`Exported ${npcs.length} NPCs to ${npcsDir}`);
  }

  private async exportConnections(
    connections: RoomConnection[],
    exportDir: string,
  ): Promise<void> {
    const connectionsPath = `${exportDir}/connections.json`;

    const connectionsJson = {
      connections: connections.map((conn) => ({
        from_room: conn.roomId,
        to_room: conn.connectedRoomId,
        direction: conn.direction,
        description: conn.description,
        is_locked: conn.isLocked,
        required_key: conn.requiredKeyId || null,
      })),
    };

    await this.fileScannerService.writeFileContent(
      connectionsPath,
      JSON.stringify(connectionsJson, null, 2),
    );

    this.logger.log(
      `Exported ${connections.length} connections to ${connectionsPath}`,
    );
  }

  private sanitizeFilename(filename: string): string {
    // Replace spaces and special characters with hyphens
    return filename.toLowerCase().replace(/[^a-z0-9-]/g, '-');
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
