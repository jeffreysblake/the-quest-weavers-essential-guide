import { Injectable, Logger } from '@nestjs/common';
import { IRoom } from '../room.interface';
import { DatabaseService } from '../../database/database.service';
import { RoomData } from '../../database/database.interfaces';

/**
 * Room Persistence Helper
 * Handles all database operations for room entities including:
 * - Save/load operations
 * - Batch loading for performance
 * - Room-object and room-player relationship management
 */
@Injectable()
export class RoomPersistenceHelper {
  private readonly logger = new Logger(RoomPersistenceHelper.name);

  constructor(private readonly databaseService?: DatabaseService) {}

  /**
   * Save a single room to database
   */
  async saveRoomToDatabase(room: IRoom): Promise<void> {
    if (!this.databaseService) return;

    try {
      console.log(`[RoomService] Starting transaction for room ${room.id}`);
      console.log(
        `[RoomService] Database path:`,
        (this.databaseService as any).dbPath,
      );
      this.databaseService.transaction((db) => {
        console.log(`[RoomService] Inside transaction for room ${room.id}`);
        // Convert IRoom to RoomData format for database
        const roomData: RoomData = {
          id: room.id,
          gameId: room.gameId || 'default',
          name: room.name,
          description: room.description,
          longDescription: room.longDescription,
          position: room.position,
          width: room.size?.width || room.width || 10,
          height: room.size?.height || room.height || 10,
          depth: room.size?.depth || 3,
          environmentData: room.environment,
          version: 1,
          createdAt: new Date().toISOString(),
        };

        // Save to rooms table
        const insertRoom = db.prepare(`
          INSERT OR REPLACE INTO rooms (
            id, game_id, name, description, long_description, position_x, position_y, position_z,
            width, height, depth, environment_data, version, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const roomResult = insertRoom.run(
          roomData.id,
          roomData.gameId,
          roomData.name,
          roomData.description,
          roomData.longDescription,
          roomData.position.x,
          roomData.position.y,
          roomData.position.z,
          roomData.width,
          roomData.height,
          roomData.depth,
          JSON.stringify(roomData.environmentData),
          roomData.version,
          roomData.createdAt,
        );
        console.log(`[RoomService] Room INSERT result:`, roomResult);

        // Save room-object relationships
        if (room.objects && room.objects.length > 0) {
          console.log(
            `[RoomService] Saving ${room.objects.length} room-object relationships for room ${room.id}`,
          );
          console.log(`[RoomService] Objects to save:`, room.objects);
          // Clear existing relationships
          db.prepare('DELETE FROM room_objects WHERE room_id = ?').run(room.id);

          const insertRoomObject = db.prepare(`
            INSERT INTO room_objects (room_id, object_id, placed_at)
            VALUES (?, ?, ?)
          `);

          for (const objectId of room.objects) {
            console.log(
              `[RoomService]   Saving room-object: ${room.id} -> ${objectId}`,
            );
            try {
              const result = insertRoomObject.run(
                room.id,
                objectId,
                new Date().toISOString(),
              );
              console.log(`[RoomService]   INSERT result:`, result);
            } catch (err) {
              console.log(
                `[RoomService]   ERROR inserting room-object:`,
                err.message,
              );
              throw err;
            }
          }
        } else {
          console.log(
            `[RoomService] No room-object relationships to save for room ${room.id}`,
          );
        }

        // Save room-player relationships
        if (room.players && room.players.length > 0) {
          // Clear existing relationships
          db.prepare('DELETE FROM room_npcs WHERE room_id = ?').run(room.id);

          const insertRoomNpc = db.prepare(`
            INSERT INTO room_npcs (room_id, npc_id, placed_at)
            VALUES (?, ?, ?)
          `);

          for (const playerId of room.players) {
            insertRoomNpc.run(room.id, playerId, new Date().toISOString());
          }
        }
        console.log(`[RoomService] Transaction completed for room ${room.id}`);
      });
      console.log(`[RoomService] After transaction for room ${room.id}`);

      // Force WAL checkpoint to make data visible
      try {
        this.databaseService.getDatabase().pragma('wal_checkpoint(PASSIVE)');
        console.log(
          `[RoomService] WAL checkpoint completed for room ${room.id}`,
        );
      } catch (e) {
        console.log(`[RoomService] WAL checkpoint error:`, e.message);
      }

      // Note: Version history is saved explicitly via saveRoomVersion() when needed
    } catch (error) {
      console.log(`[RoomService] ERROR saving room ${room.id}:`, error);
      this.logger.error(`Failed to save room ${room.id} to database:`, error);
      throw error;
    }
  }

  /**
   * Load a single room from database
   */
  async loadRoomFromDatabase(
    roomId: string,
    gameId?: string,
  ): Promise<IRoom | undefined> {
    if (!this.databaseService) return undefined;

    try {
      // Load room from database
      const roomQuery = this.databaseService.prepare(`
        SELECT * FROM rooms
        WHERE id = ? ${gameId ? 'AND game_id = ?' : ''}
      `);

      const roomRow = gameId
        ? (roomQuery.get(roomId, gameId) as any)
        : (roomQuery.get(roomId) as any);

      if (!roomRow) return undefined;

      // Load room-object relationships
      console.log(
        `[RoomService] Loading room-object relationships for roomId:`,
        roomId,
      );
      console.log(
        `[RoomService] Database path for load:`,
        (this.databaseService as any).dbPath,
      );
      const objectQuery = this.databaseService.prepare(`
        SELECT object_id FROM room_objects WHERE room_id = ?
      `);
      const objectRows = objectQuery.all(roomId) as any[];
      console.log(
        `[RoomService] Query returned ${objectRows.length} rows:`,
        objectRows,
      );
      const objects = objectRows.map((row) => row.object_id);
      console.log(
        `[RoomService] Loaded ${objects.length} room-object relationships for room ${roomId}`,
      );
      console.log(`[RoomService] Loaded objects:`, objects);

      // Debug: Check what's actually in the database
      const allRoomObjects = this.databaseService
        .prepare(`SELECT * FROM room_objects`)
        .all();
      console.log(
        `[RoomService] ALL room_objects in database:`,
        allRoomObjects,
      );

      // Load room-player relationships
      const playerQuery = this.databaseService.prepare(`
        SELECT npc_id FROM room_npcs WHERE room_id = ?
      `);
      const playerRows = playerQuery.all(roomId) as any[];
      const players = playerRows.map((row) => row.npc_id);

      // Convert database format to IRoom
      const room: IRoom = {
        id: roomRow.id,
        name: roomRow.name,
        description: roomRow.description,
        longDescription: roomRow.long_description,
        type: 'room',
        position: {
          x: roomRow.position_x || 0,
          y: roomRow.position_y || 0,
          z: roomRow.position_z || 0,
        },
        width: roomRow.width || 10,
        height: roomRow.height || 10,
        size: {
          width: roomRow.width || 10,
          height: roomRow.height || 10,
          depth: roomRow.depth || 3,
        },
        environment: roomRow.environment_data
          ? JSON.parse(roomRow.environment_data)
          : undefined,
        objects: objects,
        players: players,
        gameId: roomRow.game_id,
      };

      return room;
    } catch (error) {
      this.logger.error(`Failed to load room ${roomId} from database:`, error);
      return undefined;
    }
  }

  /**
   * Load multiple rooms by IDs in a single batch query
   * Prevents N+1 query pattern by using WHERE id IN (...)
   */
  async loadMultipleRooms(roomIds: string[]): Promise<IRoom[]> {
    if (!this.databaseService || roomIds.length === 0) return [];

    try {
      // Batch load room data
      const placeholders = roomIds.map(() => '?').join(',');
      const roomQuery = this.databaseService.prepare(`
        SELECT * FROM rooms WHERE id IN (${placeholders})
      `);
      const roomRows = roomQuery.all(...roomIds) as any[];

      // Batch load all room-object relationships for these rooms
      const objectQuery = this.databaseService.prepare(`
        SELECT room_id, object_id FROM room_objects WHERE room_id IN (${placeholders})
      `);
      const objectRows = objectQuery.all(...roomIds) as any[];

      // Batch load all room-player relationships for these rooms
      const playerQuery = this.databaseService.prepare(`
        SELECT room_id, npc_id FROM room_npcs WHERE room_id IN (${placeholders})
      `);
      const playerRows = playerQuery.all(...roomIds) as any[];

      // Group relationships by room ID
      const objectsByRoom = new Map<string, string[]>();
      objectRows.forEach((row: any) => {
        if (!objectsByRoom.has(row.room_id)) {
          objectsByRoom.set(row.room_id, []);
        }
        objectsByRoom.get(row.room_id)!.push(row.object_id);
      });

      const playersByRoom = new Map<string, string[]>();
      playerRows.forEach((row: any) => {
        if (!playersByRoom.has(row.room_id)) {
          playersByRoom.set(row.room_id, []);
        }
        playersByRoom.get(row.room_id)!.push(row.npc_id);
      });

      // Convert to IRoom objects
      const rooms: IRoom[] = roomRows.map((roomRow) => {
        const room: IRoom = {
          id: roomRow.id,
          name: roomRow.name,
          description: roomRow.description,
          longDescription: roomRow.long_description,
          type: 'room',
          position: {
            x: roomRow.position_x || 0,
            y: roomRow.position_y || 0,
            z: roomRow.position_z || 0,
          },
          width: roomRow.width || 10,
          height: roomRow.height || 10,
          size: {
            width: roomRow.width || 10,
            height: roomRow.height || 10,
            depth: roomRow.depth || 3,
          },
          environment: roomRow.environment_data
            ? JSON.parse(roomRow.environment_data)
            : undefined,
          objects: objectsByRoom.get(roomRow.id) || [],
          players: playersByRoom.get(roomRow.id) || [],
          gameId: roomRow.game_id,
        };
        return room;
      });

      return rooms;
    } catch (error) {
      this.logger.error('Failed to batch load rooms from database:', error);
      return [];
    }
  }

  /**
   * Load all rooms for a specific game
   */
  async loadGameRoomsFromDatabase(gameId: string): Promise<IRoom[]> {
    if (!this.databaseService) return [];

    try {
      // First get all room IDs for this game
      const query = this.databaseService.prepare(
        'SELECT id FROM rooms WHERE game_id = ?',
      );
      const rows = query.all(gameId) as any[];
      const roomIds = rows.map((row) => row.id);

      // Use batch loading to prevent N+1 queries
      return await this.loadMultipleRooms(roomIds);
    } catch (error) {
      this.logger.error(
        `Failed to load rooms for game ${gameId} from database:`,
        error,
      );
      return [];
    }
  }

  /**
   * Load all rooms from database
   */
  async loadAllRoomsFromDatabase(): Promise<IRoom[]> {
    if (!this.databaseService) return [];

    try {
      // First get all room IDs
      const query = this.databaseService.prepare('SELECT id FROM rooms');
      const rows = query.all() as any[];
      const roomIds = rows.map((row) => row.id);

      // Use batch loading to prevent N+1 queries
      return await this.loadMultipleRooms(roomIds);
    } catch (error) {
      this.logger.error('Failed to load all rooms from database:', error);
      return [];
    }
  }

  /**
   * Persist all rooms to database
   */
  async persistRooms(rooms: IRoom[]): Promise<void> {
    if (!this.databaseService) {
      this.logger.warn('Database service not available for persistence');
      return;
    }

    try {
      this.logger.log(`Persisting ${rooms.length} rooms to database`);

      for (const room of rooms) {
        await this.saveRoomToDatabase(room);
      }

      this.logger.log('Successfully persisted all rooms');
    } catch (error) {
      this.logger.error('Failed to persist rooms:', error);
      throw error;
    }
  }

  /**
   * Save room version to version history
   */
  async saveRoomVersion(
    roomId: string,
    roomData: IRoom,
    reason?: string,
  ): Promise<number> {
    if (!this.databaseService) {
      throw new Error('Database service not available for version management');
    }

    return this.databaseService.saveVersion(
      'room',
      roomId,
      roomData,
      'room_service',
      reason,
    );
  }

  /**
   * Get a specific version of room data
   */
  async getRoomVersion(
    roomId: string,
    version?: number,
  ): Promise<IRoom | null> {
    if (!this.databaseService) {
      throw new Error('Database service not available for version management');
    }

    return this.databaseService.getVersion('room', roomId, version);
  }

  /**
   * Rollback room to a previous version
   */
  async rollbackRoom(roomId: string, version: number): Promise<IRoom | null> {
    if (!this.databaseService) {
      throw new Error('Database service not available for version management');
    }

    // Get the version data
    const versionData = await this.databaseService.getVersion(
      'room',
      roomId,
      version,
    );

    if (!versionData) {
      return null;
    }

    // Save the old version to the database
    await this.saveRoomToDatabase(versionData as IRoom);

    // Create a version history entry for the rollback
    await this.databaseService.saveVersion(
      'room',
      roomId,
      versionData,
      'system',
      `Rollback to version ${version}`,
    );

    return versionData as IRoom;
  }
}
