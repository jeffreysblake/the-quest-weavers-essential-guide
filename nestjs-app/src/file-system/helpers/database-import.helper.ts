import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  GameData,
  RoomData,
  ObjectData,
  NPCData,
  RoomConnection,
} from '../../database/database.interfaces';
import Database from 'better-sqlite3';

/**
 * Database Import Helper
 * Handles batch importing of game data to database including:
 * - Batch processing with configurable size limits
 * - Transaction management for data integrity
 * - Version history tracking
 * - Progress logging for large datasets
 */
@Injectable()
export class DatabaseImportHelper {
  private readonly logger = new Logger(DatabaseImportHelper.name);

  // RESOURCE LIMIT: Max 1000 entities per transaction
  private readonly BATCH_SIZE = 1000;

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Helper function to process entities in batches
   */
  private processBatches<T>(
    entities: T[],
    processor: (batch: T[], db: Database.Database) => void,
  ): void {
    for (let i = 0; i < entities.length; i += this.BATCH_SIZE) {
      const batch = entities.slice(i, i + this.BATCH_SIZE);
      this.databaseService.transaction((db) => {
        processor(batch, db);
      });
      this.logger.log(
        `Processed batch ${Math.floor(i / this.BATCH_SIZE) + 1}/${Math.ceil(entities.length / this.BATCH_SIZE)}`,
      );
    }
  }

  /**
   * Save game configuration to database
   */
  saveGameConfig(gameData: GameData): void {
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
        gameData.isActive ? 1 : 0,
      );

      // Save version history
      this.databaseService.saveVersion(
        'game',
        gameData.id,
        gameData,
        'file_loader',
        'Loaded from files',
      );
    });
  }

  /**
   * Save rooms to database in batches
   */
  saveRooms(rooms: RoomData[]): void {
    if (rooms.length === 0) return;

    this.logger.log(
      `Saving ${rooms.length} rooms in batches of ${this.BATCH_SIZE}...`,
    );

    this.processBatches(rooms, (batch, db) => {
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

  /**
   * Save objects to database in batches
   */
  saveObjects(objects: ObjectData[]): void {
    if (objects.length === 0) return;

    this.logger.log(
      `Saving ${objects.length} objects in batches of ${this.BATCH_SIZE}...`,
    );

    this.processBatches(objects, (batch, db) => {
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
          object.isPortable ? 1 : 0,
          object.isContainer ? 1 : 0,
          object.canContain ? 1 : 0,
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

  /**
   * Save NPCs to database in batches
   */
  saveNPCs(npcs: NPCData[]): void {
    if (npcs.length === 0) return;

    this.logger.log(
      `Saving ${npcs.length} NPCs in batches of ${this.BATCH_SIZE}...`,
    );

    this.processBatches(npcs, (batch, db) => {
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

  /**
   * Save room connections to database in batches
   */
  saveConnections(connections: RoomConnection[], gameId?: string): void {
    if (connections.length === 0) return;

    this.logger.log(
      `Saving ${connections.length} connections in batches of ${this.BATCH_SIZE}...`,
    );

    // Clear existing connections for this game first
    if (gameId) {
      this.databaseService.transaction((db) => {
        db.prepare(
          'DELETE FROM room_connections WHERE room_id IN (SELECT id FROM rooms WHERE game_id = ?)',
        ).run(gameId);
      });
    }

    this.processBatches(connections, (batch, db) => {
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
          connection.isLocked ? 1 : 0,
          connection.requiredKeyId,
          connection.createdAt,
        );
      }
    });
  }

  /**
   * Save complete game data to database
   */
  saveGameToDatabase(
    gameData: GameData | undefined,
    rooms: RoomData[],
    objects: ObjectData[],
    npcs: NPCData[],
    connections: RoomConnection[],
  ): void {
    // Save game config first
    if (gameData) {
      this.saveGameConfig(gameData);
    }

    // Save entities in batches
    this.saveRooms(rooms);
    this.saveObjects(objects);
    this.saveNPCs(npcs);
    this.saveConnections(connections, gameData?.id);
  }
}
