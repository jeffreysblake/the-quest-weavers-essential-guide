import { Injectable, Logger } from '@nestjs/common';
import { EntityService } from './entity.service';
import { IRoom } from './room.interface';
import { DatabaseService } from '../database/database.service';
import { RoomData } from '../database/database.interfaces';
import { v4 as uuidv4 } from 'uuid';
import { Mutex, withTimeout } from 'async-mutex';

/**
 * CONCURRENCY PROTECTION:
 * - Uses Mutex locks to prevent race conditions in room operations
 * - Per-room locks prevent concurrent modifications to room state
 * - Map-level lock protects the rooms Map from concurrent modifications
 * - Prevents issues like duplicate player/object additions
 * - All locks have 5-second timeout to prevent permanent deadlocks
 *
 * RESOURCE LIMITS (DOS/OOM Prevention):
 * - Max objects per room: 1000
 * - Max players per room: 100
 */
@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);
  private rooms: Map<string, IRoom> = new Map();

  // Concurrency protection
  private readonly mapLock = withTimeout(new Mutex(), 5000);
  private readonly roomLocks = new Map<string, Mutex>();
  private readonly LOCK_TIMEOUT = 5000;

  // Resource limits
  private readonly MAX_OBJECTS_PER_ROOM = 1000;
  private readonly MAX_PLAYERS_PER_ROOM = 100;

  constructor(
    private readonly entityService: EntityService,
    private readonly databaseService?: DatabaseService,
  ) {}

  /**
   * Get or create a lock for a specific room
   */
  private getRoomLock(roomId: string): Mutex {
    if (!this.roomLocks.has(roomId)) {
      this.roomLocks.set(roomId, new Mutex());
    }
    return this.roomLocks.get(roomId)!;
  }

  createRoom(roomData: Omit<IRoom, 'id' | 'type'>): IRoom {
    const room: IRoom = {
      ...roomData,
      id: this.generateId(),
      type: 'room',
      objects: roomData.objects || [],
      players: roomData.players || [],
    };

    this.rooms.set(room.id, room);

    // Don't save automatically to prevent race conditions with explicit persistGame() calls
    // The room is cached in memory and will be persisted when persistGame() is called
    // This ensures data consistency and prevents stale async saves from overwriting fresh data

    return room;
  }

  getRoom(id: string): IRoom | undefined {
    return this.rooms.get(id);
  }

  async getRoomWithFallback(
    id: string,
    gameId?: string,
  ): Promise<IRoom | undefined> {
    // First check in-memory cache
    let room = this.rooms.get(id);
    if (room) {
      return room;
    }

    // If not found and database is available, try to load from database
    if (this.databaseService && gameId) {
      room = await this.loadRoomFromDatabase(id, gameId);
      if (room) {
        this.rooms.set(room.id, room);
        return room;
      }
    }

    return undefined;
  }

  getAllRooms(): IRoom[] {
    return Array.from(this.rooms.values());
  }

  // Alias for compatibility
  findAll(): IRoom[] {
    return this.getAllRooms();
  }

  // Alias for compatibility
  findById(id: string): IRoom | undefined {
    return this.getRoom(id);
  }

  // Alias for compatibility
  create(roomData: Omit<IRoom, 'id' | 'type'>): IRoom {
    return this.createRoom(roomData);
  }

  // Connect two rooms
  connectRooms(room1Id: string, room2Id: string, direction: string): boolean {
    const room1 = this.rooms.get(room1Id);
    const room2 = this.rooms.get(room2Id);

    if (!room1 || !room2) {
      return false;
    }

    // For now, just add basic connection tracking
    if (!room1.connections) {
      room1.connections = {};
    }
    if (!room2.connections) {
      room2.connections = {};
    }

    room1.connections[direction] = room2Id;

    // Add reverse direction mapping
    const reverseDirections: { [key: string]: string } = {
      north: 'south',
      south: 'north',
      east: 'west',
      west: 'east',
      up: 'down',
      down: 'up',
    };

    const reverseDirection = reverseDirections[direction];
    if (reverseDirection) {
      room2.connections[reverseDirection] = room1Id;
    }

    return true;
  }

  // Update room
  update(roomId: string, updates: Partial<IRoom>): boolean {
    const room = this.rooms.get(roomId);
    if (!room) {
      return false;
    }

    // Update the room with new data
    Object.assign(room, updates);

    // Don't allow changing id or type
    room.id = roomId;
    room.type = 'room';

    // Save to database if available
    if (this.databaseService) {
      this.saveRoomToDatabase(room).catch((error) => {
        this.logger.error(
          `Failed to save updated room ${roomId} to database:`,
          error,
        );
      });
    }

    return true;
  }

  async getAllRoomsForGame(gameId: string): Promise<IRoom[]> {
    // Get all in-memory rooms for this game
    const inMemoryRooms = Array.from(this.rooms.values()).filter(
      (room) => room.gameId === gameId,
    );

    // If database is available, also load from database
    if (this.databaseService) {
      try {
        const dbRooms = await this.loadGameRoomsFromDatabase(gameId);

        // Merge with in-memory rooms, preferring in-memory versions
        const roomMap = new Map<string, IRoom>();

        // Add database rooms first
        dbRooms.forEach((room) => roomMap.set(room.id, room));

        // Override with in-memory rooms
        inMemoryRooms.forEach((room) => roomMap.set(room.id, room));

        return Array.from(roomMap.values());
      } catch (error) {
        this.logger.error(
          `Failed to load rooms for game ${gameId} from database:`,
          error,
        );
      }
    }

    return inMemoryRooms;
  }

  /**
   * Add player to room
   * THREAD-SAFE: Acquires room lock to prevent duplicate additions
   * RESOURCE LIMIT: Max 100 players per room
   */
  async addPlayerToRoom(roomId: string, playerId: string): Promise<boolean> {
    const lock = this.getRoomLock(roomId);

    try {
      return await withTimeout(lock, this.LOCK_TIMEOUT).runExclusive(
        async () => {
          const room = this.rooms.get(roomId);
          if (!room) {
            this.logger.error(`addPlayerToRoom: Room ${roomId} not found`);
            return false;
          }

          // NULL CHECK: Ensure room.players array exists
          if (!room.players) {
            room.players = [];
          }

          // RESOURCE LIMIT: Check max players per room
          if (room.players.length >= this.MAX_PLAYERS_PER_ROOM) {
            this.logger.warn(
              `Room ${roomId} has reached maximum player limit of ${this.MAX_PLAYERS_PER_ROOM}`,
            );
            return false;
          }

          // Check if player exists
          const player = this.entityService.getEntity(playerId);
          if (!player) {
            this.logger.error(`addPlayerToRoom: Player ${playerId} not found`);
            return false;
          }

          if (!room.players.includes(playerId)) {
            room.players.push(playerId);
            return true;
          }
          return false;
        },
      );
    } catch (error) {
      if (error.message?.includes('timeout')) {
        this.logger.error(`Lock timeout adding player to room ${roomId}`);
        return false;
      }
      throw error;
    }
  }

  /**
   * Add object to room
   * THREAD-SAFE: Acquires room lock to prevent duplicate additions
   * RESOURCE LIMIT: Max 1000 objects per room
   */
  async addObjectToRoom(roomId: string, objectId: string): Promise<boolean> {
    const lock = this.getRoomLock(roomId);

    try {
      return await withTimeout(lock, this.LOCK_TIMEOUT).runExclusive(
        async () => {
          const room = this.rooms.get(roomId);
          if (!room) {
            this.logger.error(`addObjectToRoom: Room ${roomId} not found`);
            return false;
          }

          // NULL CHECK: Ensure room.objects array exists
          if (!room.objects) {
            room.objects = [];
          }

          // RESOURCE LIMIT: Check max objects per room
          if (room.objects.length >= this.MAX_OBJECTS_PER_ROOM) {
            this.logger.warn(
              `Room ${roomId} has reached maximum object limit of ${this.MAX_OBJECTS_PER_ROOM}`,
            );
            return false;
          }

          // Check if object exists
          const obj = this.entityService.getEntity(objectId);
          if (!obj) {
            this.logger.error(`addObjectToRoom: Object ${objectId} not found`);
            return false;
          }

          if (!room.objects.includes(objectId)) {
            room.objects.push(objectId);
            return true;
          }
          return false;
        },
      );
    } catch (error) {
      if (error.message?.includes('timeout')) {
        this.logger.error(`Lock timeout adding object to room ${roomId}`);
        return false;
      }
      throw error;
    }
  }

  getRoomEntities(roomId: string): { players: string[]; objects: string[] } {
    const room = this.rooms.get(roomId);
    if (!room) return { players: [], objects: [] };

    // NULL CHECK: Ensure arrays exist
    return {
      players: room.players || [],
      objects: room.objects || [],
    };
  }

  // Enhanced persistence methods with database integration
  async persistRooms(): Promise<void> {
    if (!this.databaseService) {
      this.logger.warn('Database service not available for persistence');
      return;
    }

    try {
      const rooms = Array.from(this.rooms.values());
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

  async loadRooms(gameId?: string): Promise<void> {
    if (!this.databaseService) {
      this.logger.warn('Database service not available for loading');
      return;
    }

    try {
      const rooms = gameId
        ? await this.loadGameRoomsFromDatabase(gameId)
        : await this.loadAllRoomsFromDatabase();

      this.logger.log(`Loading ${rooms.length} rooms from database`);

      // Clear current rooms and load from database
      this.rooms.clear();
      rooms.forEach((room) => this.rooms.set(room.id, room));

      this.logger.log('Successfully loaded rooms');
    } catch (error) {
      this.logger.error('Failed to load rooms:', error);
      throw error;
    }
  }

  // Version management methods
  async saveRoomVersion(roomId: string, reason?: string): Promise<number> {
    if (!this.databaseService) {
      throw new Error('Database service not available for version management');
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} not found in memory`);
    }

    return this.databaseService.saveVersion(
      'room',
      roomId,
      room,
      'room_service',
      reason,
    );
  }

  async getRoomVersion(
    roomId: string,
    version?: number,
  ): Promise<IRoom | null> {
    if (!this.databaseService) {
      throw new Error('Database service not available for version management');
    }

    return this.databaseService.getVersion('room', roomId, version);
  }

  async rollbackRoom(roomId: string, version: number): Promise<boolean> {
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
      return false;
    }

    // Update the in-memory cache with the old version
    this.rooms.set(roomId, versionData as IRoom);

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

    return true;
  }

  // Dynamic loading for gameplay
  async loadRoomOnDemand(
    gameId: string,
    roomId: string,
  ): Promise<IRoom | undefined> {
    // Check if already loaded
    const existingRoom = this.rooms.get(roomId);
    if (existingRoom) {
      return existingRoom;
    }

    // Load from database
    const room = await this.getRoomWithFallback(roomId, gameId);
    return room;
  }

  async refreshRoom(
    gameId: string,
    roomId: string,
  ): Promise<IRoom | undefined> {
    // Force reload from database
    if (this.databaseService) {
      const room = await this.loadRoomFromDatabase(roomId, gameId);
      if (room) {
        this.rooms.set(roomId, room);
        return room;
      }
    }
    return this.rooms.get(roomId);
  }

  // Missing methods for game service compatibility
  getObjectsInRoom(roomId: string): any[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];

    // NULL CHECK: Ensure room.objects array exists
    if (!room.objects || !Array.isArray(room.objects)) {
      this.logger.warn(`getObjectsInRoom: Room ${roomId} has invalid objects array`);
      return [];
    }

    return room.objects
      .map((objectId) => this.entityService.getEntity(objectId))
      .filter(Boolean);
  }

  getPlayersInRoom(roomId: string): any[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];

    // NULL CHECK: Ensure room.players array exists
    if (!room.players || !Array.isArray(room.players)) {
      this.logger.warn(`getPlayersInRoom: Room ${roomId} has invalid players array`);
      return [];
    }

    return room.players
      .map((playerId) => this.entityService.getEntity(playerId))
      .filter(Boolean);
  }

  /**
   * Remove object from room
   * THREAD-SAFE: Acquires room lock to prevent concurrent modifications
   */
  async removeObjectFromRoom(
    roomId: string,
    objectId: string,
  ): Promise<boolean> {
    const lock = this.getRoomLock(roomId);

    try {
      return await withTimeout(lock, this.LOCK_TIMEOUT).runExclusive(
        async () => {
          const room = this.rooms.get(roomId);
          if (!room) return false;

          const index = room.objects.indexOf(objectId);
          if (index > -1) {
            room.objects.splice(index, 1);
            return true;
          }
          return false;
        },
      );
    } catch (error) {
      if (error.message?.includes('timeout')) {
        this.logger.error(`Lock timeout removing object from room ${roomId}`);
        return false;
      }
      throw error;
    }
  }

  /**
   * Remove player from room
   * THREAD-SAFE: Acquires room lock to prevent concurrent modifications
   */
  async removePlayerFromRoom(
    roomId: string,
    playerId: string,
  ): Promise<boolean> {
    const lock = this.getRoomLock(roomId);

    try {
      return await withTimeout(lock, this.LOCK_TIMEOUT).runExclusive(
        async () => {
          const room = this.rooms.get(roomId);
          if (!room) return false;

          const index = room.players.indexOf(playerId);
          if (index > -1) {
            room.players.splice(index, 1);
            return true;
          }
          return false;
        },
      );
    } catch (error) {
      if (error.message?.includes('timeout')) {
        this.logger.error(`Lock timeout removing player from room ${roomId}`);
        return false;
      }
      throw error;
    }
  }

  // Database integration methods
  private async saveRoomToDatabase(room: IRoom): Promise<void> {
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

  private async loadRoomFromDatabase(
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

  private async loadGameRoomsFromDatabase(gameId: string): Promise<IRoom[]> {
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

  private async loadAllRoomsFromDatabase(): Promise<IRoom[]> {
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

  // Clear in-memory cache
  clearCache(): void {
    this.rooms.clear();
    this.logger.log('Room cache cleared');
  }

  // Get cache statistics
  getCacheStats(): { size: number; rooms: string[] } {
    return {
      size: this.rooms.size,
      rooms: Array.from(this.rooms.keys()),
    };
  }

  private generateId(): string {
    return uuidv4();
  }

  // Priority 1: Alias methods for stress test compatibility

  /**
   * Alias for addPlayerToRoom - places a player in a room
   * Compatibility wrapper for naming consistency
   * @param roomId - The room's ID
   * @param playerId - The player's ID
   * @returns Result object with success property
   */
  placePlayerInRoom(
    roomId: string,
    playerId: string,
  ): { success: boolean; message?: string } {
    const room = this.getRoom(roomId);
    if (!room) {
      return {
        success: false,
        message: 'Room not found',
      };
    }

    const player = this.entityService.getEntity(playerId);
    if (!player) {
      return {
        success: false,
        message: 'Player not found',
      };
    }

    const result = this.addPlayerToRoom(roomId, playerId);
    return {
      success: result,
      message: result
        ? 'Player placed in room'
        : 'Failed to place player in room',
    };
  }

  /**
   * Alias for addObjectToRoom - places an object in a room
   * Compatibility wrapper for naming consistency
   * @param roomId - The room's ID
   * @param objectId - The object's ID
   * @returns Result object with success property
   */
  placeObjectInRoom(
    roomId: string,
    objectId: string,
  ): { success: boolean; message?: string } {
    const room = this.getRoom(roomId);
    if (!room) {
      return {
        success: false,
        message: 'Room not found',
      };
    }

    const object = this.entityService.getEntity(objectId);
    if (!object) {
      return {
        success: false,
        message: 'Object not found',
      };
    }

    const result = this.addObjectToRoom(roomId, objectId);
    return {
      success: result,
      message: result
        ? 'Object placed in room'
        : 'Failed to place object in room',
    };
  }

  // Priority 2: Spatial Utilities

  /**
   * Calculate 3D Euclidean distance between two positions
   * @param pos1 - First position with x, y, z coordinates
   * @param pos2 - Second position with x, y, z coordinates
   * @returns Distance as a number
   */
  calculateDistance(
    pos1: { x: number; y: number; z: number },
    pos2: { x: number; y: number; z: number },
  ): number {
    // Validate inputs
    if (!pos1 || !pos2) {
      this.logger.warn('Invalid positions provided to calculateDistance');
      return 0;
    }

    // Ensure positions have valid numeric coordinates
    const x1 = typeof pos1.x === 'number' ? pos1.x : 0;
    const y1 = typeof pos1.y === 'number' ? pos1.y : 0;
    const z1 = typeof pos1.z === 'number' ? pos1.z : 0;

    const x2 = typeof pos2.x === 'number' ? pos2.x : 0;
    const y2 = typeof pos2.y === 'number' ? pos2.y : 0;
    const z2 = typeof pos2.z === 'number' ? pos2.z : 0;

    // Calculate Euclidean distance: sqrt((x2-x1)² + (y2-y1)² + (z2-z1)²)
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;

    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    return distance;
  }
}
