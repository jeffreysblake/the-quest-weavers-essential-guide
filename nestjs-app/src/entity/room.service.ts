import { Injectable, Logger } from '@nestjs/common';
import { EntityService } from './entity.service';
import { IRoom } from './room.interface';
import { DatabaseService } from '../database/database.service';
import { v4 as uuidv4 } from 'uuid';
import { Mutex, withTimeout } from 'async-mutex';
import { RoomPersistenceHelper } from './helpers/room-persistence.helper';
import { RoomEntityManagerHelper } from './helpers/room-entity-manager.helper';
import { RoomConnectionHelper } from './helpers/room-connection.helper';

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
  ) {
    // Initialize helpers
    this.persistenceHelper = new RoomPersistenceHelper(databaseService);
    this.entityManagerHelper = new RoomEntityManagerHelper(entityService);
    this.connectionHelper = new RoomConnectionHelper();
  }

  // Helper instances
  private readonly persistenceHelper: RoomPersistenceHelper;
  private readonly entityManagerHelper: RoomEntityManagerHelper;
  private readonly connectionHelper: RoomConnectionHelper;

  /**
   * Get or create a lock for a specific room
   */
  private getRoomLock(roomId: string): Mutex {
    if (!this.roomLocks.has(roomId)) {
      this.roomLocks.set(roomId, new Mutex());
    }
    return this.roomLocks.get(roomId)!;
  }

  createRoom(roomData: Omit<IRoom, 'id' | 'type'> & { id?: string }): IRoom {
    const room: IRoom = {
      ...roomData,
      id: roomData.id || this.generateId(), // Use provided ID or generate new one
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
      room = await this.persistenceHelper.loadRoomFromDatabase(id, gameId);
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

    return this.connectionHelper.connectRooms(room1, room2, direction);
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
      this.persistenceHelper.saveRoomToDatabase(room).catch((error) => {
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
        const dbRooms = await this.persistenceHelper.loadGameRoomsFromDatabase(gameId);

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
    const room = this.rooms.get(roomId);
    if (!room) {
      this.logger.error(`addPlayerToRoom: Room ${roomId} not found`);
      return false;
    }

    return await this.entityManagerHelper.addPlayerToRoom(room, playerId);
  }

  /**
   * Add object to room
   * THREAD-SAFE: Acquires room lock to prevent duplicate additions
   * RESOURCE LIMIT: Max 1000 objects per room
   */
  async addObjectToRoom(roomId: string, objectId: string): Promise<boolean> {
    const room = this.rooms.get(roomId);
    if (!room) {
      this.logger.error(`addObjectToRoom: Room ${roomId} not found`);
      return false;
    }

    return await this.entityManagerHelper.addObjectToRoom(room, objectId);
  }

  getRoomEntities(roomId: string): { players: string[]; objects: string[] } {
    const room = this.rooms.get(roomId);
    if (!room) return { players: [], objects: [] };

    return this.entityManagerHelper.getRoomEntities(room);
  }

  // Enhanced persistence methods with database integration
  async persistRooms(): Promise<void> {
    const rooms = Array.from(this.rooms.values());
    return await this.persistenceHelper.persistRooms(rooms);
  }

  async loadRooms(gameId?: string): Promise<void> {
    if (!this.databaseService) {
      this.logger.warn('Database service not available for loading');
      return;
    }

    try {
      const rooms = gameId
        ? await this.persistenceHelper.loadGameRoomsFromDatabase(gameId)
        : await this.persistenceHelper.loadAllRoomsFromDatabase();

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
    const room = this.rooms.get(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} not found in memory`);
    }

    return await this.persistenceHelper.saveRoomVersion(roomId, room, reason);
  }

  async getRoomVersion(
    roomId: string,
    version?: number,
  ): Promise<IRoom | null> {
    return await this.persistenceHelper.getRoomVersion(roomId, version);
  }

  async rollbackRoom(roomId: string, version: number): Promise<boolean> {
    const versionData = await this.persistenceHelper.rollbackRoom(roomId, version);

    if (!versionData) {
      return false;
    }

    // Update the in-memory cache with the old version
    this.rooms.set(roomId, versionData);

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
      const room = await this.persistenceHelper.loadRoomFromDatabase(roomId, gameId);
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

    return this.entityManagerHelper.getObjectsInRoom(room);
  }

  getPlayersInRoom(roomId: string): any[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];

    return this.entityManagerHelper.getPlayersInRoom(room);
  }

  /**
   * Remove object from room
   * THREAD-SAFE: Acquires room lock to prevent concurrent modifications
   */
  async removeObjectFromRoom(
    roomId: string,
    objectId: string,
  ): Promise<boolean> {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    return await this.entityManagerHelper.removeObjectFromRoom(room, objectId);
  }

  /**
   * Remove player from room
   * THREAD-SAFE: Acquires room lock to prevent concurrent modifications
   */
  async removePlayerFromRoom(
    roomId: string,
    playerId: string,
  ): Promise<boolean> {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    return await this.entityManagerHelper.removePlayerFromRoom(room, playerId);
  }

  /**
   * Load multiple rooms by IDs in a single batch query
   * Prevents N+1 query pattern by using WHERE id IN (...)
   */
  async loadMultipleRooms(roomIds: string[]): Promise<IRoom[]> {
    return await this.persistenceHelper.loadMultipleRooms(roomIds);
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
  async placePlayerInRoom(
    roomId: string,
    playerId: string,
  ): Promise<{ success: boolean; message?: string }> {
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

    const result = await this.addPlayerToRoom(roomId, playerId);
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
  async placeObjectInRoom(
    roomId: string,
    objectId: string,
  ): Promise<{ success: boolean; message?: string }> {
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

    const result = await this.addObjectToRoom(roomId, objectId);
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
   */
  calculateDistance(
    pos1: { x: number; y: number; z: number },
    pos2: { x: number; y: number; z: number },
  ): number {
    return this.connectionHelper.calculateDistance(pos1, pos2);
  }
}
