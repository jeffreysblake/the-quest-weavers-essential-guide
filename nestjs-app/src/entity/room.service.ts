import { Injectable, Logger } from '@nestjs/common';
import { EntityService } from './entity.service';
import { IRoom } from './room.interface';
import { DatabaseService } from '../database/database.service';
import { RoomData } from '../database/database.interfaces';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);
  private rooms: Map<string, IRoom> = new Map();

  constructor(
    private readonly entityService: EntityService,
    private readonly databaseService?: DatabaseService,
  ) {}

  createRoom(roomData: Omit<IRoom, 'id' | 'type'>): IRoom {
    const room: IRoom = {
      ...roomData,
      id: this.generateId(),
      type: 'room',
      objects: roomData.objects || [],
      players: roomData.players || [],
    };

    this.rooms.set(room.id, room);

    // Save to database if available
    if (this.databaseService) {
      this.saveRoomToDatabase(room).catch((error) => {
        this.logger.error(`Failed to save room ${room.id} to database:`, error);
      });
    }

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

  addPlayerToRoom(roomId: string, playerId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    // Check if player exists
    const player = this.entityService.getEntity(playerId);
    if (!player) return false;

    if (!room.players.includes(playerId)) {
      room.players.push(playerId);
      return true;
    }
    return false;
  }

  addObjectToRoom(roomId: string, objectId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    // Check if object exists
    const obj = this.entityService.getEntity(objectId);
    if (!obj) return false;

    if (!room.objects.includes(objectId)) {
      room.objects.push(objectId);
      return true;
    }
    return false;
  }

  getRoomEntities(roomId: string): { players: string[]; objects: string[] } {
    const room = this.rooms.get(roomId);
    if (!room) return { players: [], objects: [] };

    return {
      players: room.players,
      objects: room.objects,
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

    return room.objects
      .map((objectId) => this.entityService.getEntity(objectId))
      .filter(Boolean);
  }

  getPlayersInRoom(roomId: string): any[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];

    return room.players
      .map((playerId) => this.entityService.getEntity(playerId))
      .filter(Boolean);
  }

  removeObjectFromRoom(roomId: string, objectId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const index = room.objects.indexOf(objectId);
    if (index > -1) {
      room.objects.splice(index, 1);
      return true;
    }
    return false;
  }

  removePlayerFromRoom(roomId: string, playerId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    const index = room.players.indexOf(playerId);
    if (index > -1) {
      room.players.splice(index, 1);
      return true;
    }
    return false;
  }

  // Database integration methods
  private async saveRoomToDatabase(room: IRoom): Promise<void> {
    if (!this.databaseService) return;

    try {
      this.databaseService.transaction((db) => {
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

        insertRoom.run(
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

        // Save room-object relationships
        if (room.objects && room.objects.length > 0) {
          console.log(`[RoomService] Saving ${room.objects.length} room-object relationships for room ${room.id}`);
          console.log(`[RoomService] Objects to save:`, room.objects);
          // Clear existing relationships
          db.prepare('DELETE FROM room_objects WHERE room_id = ?').run(room.id);

          const insertRoomObject = db.prepare(`
            INSERT INTO room_objects (room_id, object_id, placed_at)
            VALUES (?, ?, ?)
          `);

          for (const objectId of room.objects) {
            console.log(`[RoomService]   Saving room-object: ${room.id} -> ${objectId}`);
            insertRoomObject.run(room.id, objectId, new Date().toISOString());
          }
        } else {
          console.log(`[RoomService] No room-object relationships to save for room ${room.id}`);
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
      });

      // Note: Version history is saved explicitly via saveRoomVersion() when needed
    } catch (error) {
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
      const objectQuery = this.databaseService.prepare(`
        SELECT object_id FROM room_objects WHERE room_id = ?
      `);
      const objectRows = objectQuery.all(roomId) as any[];
      const objects = objectRows.map((row) => row.object_id);
      console.log(`[RoomService] Loaded ${objects.length} room-object relationships for room ${roomId}`);
      console.log(`[RoomService] Loaded objects:`, objects);

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

  private async loadGameRoomsFromDatabase(gameId: string): Promise<IRoom[]> {
    if (!this.databaseService) return [];

    try {
      const query = this.databaseService.prepare(
        'SELECT * FROM rooms WHERE game_id = ?',
      );
      const rows = query.all(gameId) as any[];

      const rooms: IRoom[] = [];

      for (const row of rows) {
        const room = await this.loadRoomFromDatabase(row.id, gameId);
        if (room) {
          rooms.push(room);
        }
      }

      return rooms;
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
      const query = this.databaseService.prepare('SELECT * FROM rooms');
      const rows = query.all() as any[];

      const rooms: IRoom[] = [];

      for (const row of rows) {
        const room = await this.loadRoomFromDatabase(row.id);
        if (room) {
          rooms.push(room);
        }
      }

      return rooms;
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
