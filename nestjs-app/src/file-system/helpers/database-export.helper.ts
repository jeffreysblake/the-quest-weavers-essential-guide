import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { FileScannerService } from '../file-scanner.service';
import {
  GameData,
  RoomData,
  ObjectData,
  NPCData,
  RoomConnection,
} from '../../database/database.interfaces';

/**
 * Database Export Helper
 * Handles exporting game data from database to JSON files including:
 * - Querying entities from database
 * - Converting database format to file format
 * - Writing JSON files with proper formatting
 * - Filename sanitization
 */
@Injectable()
export class DatabaseExportHelper {
  private readonly logger = new Logger(DatabaseExportHelper.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly fileScannerService: FileScannerService,
  ) {}

  /**
   * Query game configuration from database
   */
  async queryGameConfig(gameId: string): Promise<GameData | null> {
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

  /**
   * Query rooms from database
   */
  async queryRooms(gameId: string): Promise<RoomData[]> {
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

  /**
   * Query objects from database
   */
  async queryObjects(gameId: string): Promise<ObjectData[]> {
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

  /**
   * Query NPCs from database
   */
  async queryNPCs(gameId: string): Promise<NPCData[]> {
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

  /**
   * Query room connections from database
   */
  async queryConnections(gameId: string): Promise<RoomConnection[]> {
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

  /**
   * Export game configuration to JSON file
   */
  async exportGameConfig(
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

  /**
   * Export rooms to JSON files
   */
  async exportRooms(rooms: RoomData[], exportDir: string): Promise<void> {
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

  /**
   * Export objects to JSON files
   */
  async exportObjects(objects: ObjectData[], exportDir: string): Promise<void> {
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

  /**
   * Export NPCs to JSON files
   */
  async exportNPCs(npcs: NPCData[], exportDir: string): Promise<void> {
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

  /**
   * Export connections to JSON file
   */
  async exportConnections(
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

  /**
   * Sanitize filename for safe filesystem usage
   */
  private sanitizeFilename(filename: string): string {
    // Replace spaces and special characters with hyphens
    return filename.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  }
}
