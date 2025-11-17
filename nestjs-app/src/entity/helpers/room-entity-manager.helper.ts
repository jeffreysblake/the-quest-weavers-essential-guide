import { Injectable, Logger } from '@nestjs/common';
import { IRoom } from '../room.interface';
import { EntityService } from '../entity.service';
import { Mutex, withTimeout } from 'async-mutex';

/**
 * Room Entity Manager Helper
 * Handles all player and object management within rooms including:
 * - Thread-safe addition/removal of players and objects
 * - Resource limits (max players/objects per room)
 * - Entity retrieval and listing
 */
@Injectable()
export class RoomEntityManagerHelper {
  private readonly logger = new Logger(RoomEntityManagerHelper.name);

  // Concurrency protection
  private readonly roomLocks = new Map<string, Mutex>();
  private readonly LOCK_TIMEOUT = 5000;

  // Resource limits
  private readonly MAX_OBJECTS_PER_ROOM = 1000;
  private readonly MAX_PLAYERS_PER_ROOM = 100;

  constructor(private readonly entityService: EntityService) {}

  /**
   * Get or create a lock for a specific room
   */
  private getRoomLock(roomId: string): Mutex {
    if (!this.roomLocks.has(roomId)) {
      this.roomLocks.set(roomId, new Mutex());
    }
    return this.roomLocks.get(roomId)!;
  }

  /**
   * Add player to room
   * THREAD-SAFE: Acquires room lock to prevent duplicate additions
   * RESOURCE LIMIT: Max 100 players per room
   */
  async addPlayerToRoom(
    room: IRoom,
    playerId: string,
  ): Promise<boolean> {
    const lock = this.getRoomLock(room.id);

    try {
      return await withTimeout(lock, this.LOCK_TIMEOUT).runExclusive(
        async () => {
          // NULL CHECK: Ensure room.players array exists
          if (!room.players) {
            room.players = [];
          }

          // RESOURCE LIMIT: Check max players per room
          if (room.players.length >= this.MAX_PLAYERS_PER_ROOM) {
            this.logger.warn(
              `Room ${room.id} has reached maximum player limit of ${this.MAX_PLAYERS_PER_ROOM}`,
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
        this.logger.error(`Lock timeout adding player to room ${room.id}`);
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
  async addObjectToRoom(
    room: IRoom,
    objectId: string,
  ): Promise<boolean> {
    const lock = this.getRoomLock(room.id);

    try {
      return await withTimeout(lock, this.LOCK_TIMEOUT).runExclusive(
        async () => {
          // NULL CHECK: Ensure room.objects array exists
          if (!room.objects) {
            room.objects = [];
          }

          // RESOURCE LIMIT: Check max objects per room
          if (room.objects.length >= this.MAX_OBJECTS_PER_ROOM) {
            this.logger.warn(
              `Room ${room.id} has reached maximum object limit of ${this.MAX_OBJECTS_PER_ROOM}`,
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
        this.logger.error(`Lock timeout adding object to room ${room.id}`);
        return false;
      }
      throw error;
    }
  }

  /**
   * Remove object from room
   * THREAD-SAFE: Acquires room lock to prevent concurrent modifications
   */
  async removeObjectFromRoom(
    room: IRoom,
    objectId: string,
  ): Promise<boolean> {
    const lock = this.getRoomLock(room.id);

    try {
      return await withTimeout(lock, this.LOCK_TIMEOUT).runExclusive(
        async () => {
          if (!room.objects) {
            return false;
          }

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
        this.logger.error(`Lock timeout removing object from room ${room.id}`);
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
    room: IRoom,
    playerId: string,
  ): Promise<boolean> {
    const lock = this.getRoomLock(room.id);

    try {
      return await withTimeout(lock, this.LOCK_TIMEOUT).runExclusive(
        async () => {
          if (!room.players) {
            return false;
          }

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
        this.logger.error(`Lock timeout removing player from room ${room.id}`);
        return false;
      }
      throw error;
    }
  }

  /**
   * Get all objects in a room as entity instances
   */
  getObjectsInRoom(room: IRoom): any[] {
    // NULL CHECK: Ensure room.objects array exists
    if (!room.objects || !Array.isArray(room.objects)) {
      this.logger.warn(`getObjectsInRoom: Room ${room.id} has invalid objects array`);
      return [];
    }

    return room.objects
      .map((objectId) => this.entityService.getEntity(objectId))
      .filter(Boolean);
  }

  /**
   * Get all players in a room as entity instances
   */
  getPlayersInRoom(room: IRoom): any[] {
    // NULL CHECK: Ensure room.players array exists
    if (!room.players || !Array.isArray(room.players)) {
      this.logger.warn(`getPlayersInRoom: Room ${room.id} has invalid players array`);
      return [];
    }

    return room.players
      .map((playerId) => this.entityService.getEntity(playerId))
      .filter(Boolean);
  }

  /**
   * Get room entities (both players and objects)
   */
  getRoomEntities(room: IRoom): { players: string[]; objects: string[] } {
    // NULL CHECK: Ensure arrays exist
    return {
      players: room.players || [],
      objects: room.objects || [],
    };
  }
}
