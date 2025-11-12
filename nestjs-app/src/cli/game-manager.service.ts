import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { EntityService } from '../entity/entity.service';
import { RoomService } from '../entity/room.service';
import { ObjectService } from '../entity/object.service';
import { PlayerService } from '../entity/player.service';
import { GameFileService } from '../file-system/game-file.service';
import { FileScannerService } from '../file-system/file-scanner.service';
import { GameData } from '../database/database.interfaces';
import { IBaseEntity } from '../entity/entity.interface';
import { IRoom } from '../entity/room.interface';
import { IObject } from '../entity/object.interface';
import { IPlayer } from '../entity/player.interface';
import * as fs from 'fs/promises';
import * as path from 'path';

interface CreateGameData {
  name: string;
  description?: string;
  gameId: string;
}

interface CreateEntityData {
  name: string;
  description?: string;
  position?: { x: number; y: number; z: number };
}

interface CacheStats {
  entities: number;
  rooms: number;
  objects: number;
  players: number;
}

@Injectable()
export class GameManagerService {
  private readonly logger = new Logger(GameManagerService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly entityService: EntityService,
    private readonly roomService: RoomService,
    private readonly objectService: ObjectService,
    private readonly playerService: PlayerService,
    private readonly gameFileService: GameFileService,
    private readonly fileScanner: FileScannerService,
  ) {}

  async createGame(gameData: CreateGameData): Promise<GameData> {
    try {
      const game: GameData = {
        id: gameData.gameId,
        name: gameData.name,
        description: gameData.description || '',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true,
      };

      // Save to database
      this.databaseService.transaction((db) => {
        const insertGame = db.prepare(`
          INSERT INTO games (id, name, description, version, created_at, updated_at, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        insertGame.run(
          game.id,
          game.name,
          game.description,
          game.version,
          game.createdAt,
          game.updatedAt,
          game.isActive,
        );
      });

      this.logger.log(`Created game: ${game.name} (${game.id})`);
      return game;
    } catch (error) {
      this.logger.error(`Failed to create game: ${error.message}`);
      throw error;
    }
  }

  async listGames(): Promise<GameData[]> {
    try {
      const query = this.databaseService.prepare(
        'SELECT * FROM games ORDER BY created_at DESC',
      );
      const rows = query.all() as any[];

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        version: row.version,
        createdAt: row.created_at,
        updatedAt: row.updated_at || row.created_at,
        isActive: row.is_active !== undefined ? Boolean(row.is_active) : true,
      }));
    } catch (error) {
      this.logger.error(`Failed to list games: ${error.message}`);
      throw error;
    }
  }

  async createGameFiles(gameId: string): Promise<void> {
    try {
      const gamesDir = path.join(process.cwd(), '../games');
      const gameDir = path.join(gamesDir, gameId);

      // Create directory structure
      await fs.mkdir(gameDir, { recursive: true });
      await fs.mkdir(path.join(gameDir, 'rooms'), { recursive: true });
      await fs.mkdir(path.join(gameDir, 'objects'), { recursive: true });
      await fs.mkdir(path.join(gameDir, 'npcs'), { recursive: true });

      // Create game.json
      const gameConfig = {
        id: gameId,
        name: gameId
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (l) => l.toUpperCase()),
        description: `A Quest Weaver's Essential Guide adventure game`,
        version: 1,
        connections: {},
      };

      await fs.writeFile(
        path.join(gameDir, 'game.json'),
        JSON.stringify(gameConfig, null, 2),
      );

      // Create example room
      const startingRoom = {
        id: `${gameId}-start`,
        name: 'Starting Room',
        description: 'You are in the starting room of your adventure.',
        position: { x: 0, y: 0, z: 0 },
        width: 10,
        height: 10,
        depth: 3,
        objects: [],
        npcs: [],
      };

      await fs.writeFile(
        path.join(gameDir, 'rooms', 'starting-room.json'),
        JSON.stringify(startingRoom, null, 2),
      );

      // Create connections.json
      const connections = {
        rooms: {},
        objects: {},
        npcs: {},
      };

      await fs.writeFile(
        path.join(gameDir, 'connections.json'),
        JSON.stringify(connections, null, 2),
      );

      this.logger.log(`Created file structure for game: ${gameId}`);
    } catch (error) {
      this.logger.error(`Failed to create game files: ${error.message}`);
      throw error;
    }
  }

  async createEntity(
    gameId: string,
    entityType: string,
    entityData: CreateEntityData,
  ): Promise<IBaseEntity> {
    try {
      const baseEntity = {
        name: entityData.name,
        description: entityData.description || '',
        position: entityData.position || { x: 0, y: 0, z: 0 },
        gameId,
      };

      let entity: IBaseEntity;

      switch (entityType) {
        case 'room':
          entity = this.roomService.createRoom({
            ...baseEntity,
            width: 10,
            height: 10,
            size: { width: 10, height: 10, depth: 3 },
            objects: [],
            players: [],
          } as Omit<IRoom, 'id' | 'type'>);
          break;

        case 'object':
          entity = this.objectService.createObject({
            ...baseEntity,
            objectType: 'item',
            material: 'wood',
            isPortable: true,
            isContainer: false,
            state: {},
          } as Omit<IObject, 'id' | 'type'>);
          break;

        case 'player':
          entity = this.playerService.createPlayer({
            ...baseEntity,
            health: 100,
            level: 1,
            experience: 0,
            inventory: [],
          } as Omit<IPlayer, 'id' | 'type'>);
          break;

        default:
          throw new Error(`Unknown entity type: ${entityType}`);
      }

      this.logger.log(`Created ${entityType}: ${entity.name} (${entity.id})`);
      return entity;
    } catch (error) {
      this.logger.error(`Failed to create ${entityType}: ${error.message}`);
      throw error;
    }
  }

  async listEntities(gameId: string, type?: string): Promise<IBaseEntity[]> {
    try {
      const entities: IBaseEntity[] = [];

      if (!type || type === 'room') {
        const rooms = await this.roomService.getAllRoomsForGame(gameId);
        entities.push(...rooms);
      }

      if (!type || type === 'object') {
        const objects = await this.objectService.getAllObjectsForGame(gameId);
        entities.push(...objects);
      }

      if (!type || type === 'player') {
        const players = await this.playerService.getAllPlayersForGame(gameId);
        entities.push(...players);
      }

      return entities.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      this.logger.error(`Failed to list entities: ${error.message}`);
      throw error;
    }
  }

  async persistGame(gameId: string): Promise<void> {
    try {
      this.logger.log(`Persisting game: ${gameId}`);

      // Persist all entity types
      await Promise.all([
        this.roomService.persistRooms(),
        this.objectService.persistObjects(),
        this.playerService.persistPlayers(),
      ]);

      this.logger.log(`Successfully persisted game: ${gameId}`);
    } catch (error) {
      this.logger.error(`Failed to persist game ${gameId}: ${error.message}`);
      throw error;
    }
  }

  async loadGame(gameId: string): Promise<void> {
    try {
      this.logger.log(`Loading game: ${gameId}`);

      // Load all entity types
      await Promise.all([
        this.roomService.loadRooms(gameId),
        this.objectService.loadObjects(gameId),
        this.playerService.loadPlayers(gameId),
      ]);

      this.logger.log(`Successfully loaded game: ${gameId}`);
    } catch (error) {
      this.logger.error(`Failed to load game ${gameId}: ${error.message}`);
      throw error;
    }
  }

  async clearAllCaches(): Promise<void> {
    try {
      this.entityService.clearCache();
      this.roomService.clearCache();
      this.objectService.clearCache();
      this.playerService.clearCache();

      this.logger.log('Cleared all caches');
    } catch (error) {
      this.logger.error(`Failed to clear caches: ${error.message}`);
      throw error;
    }
  }

  async getCacheStats(): Promise<CacheStats> {
    try {
      const entityStats = this.entityService.getCacheStats();
      const roomStats = this.roomService.getCacheStats();
      const objectStats = this.objectService.getCacheStats();
      const playerStats = this.playerService.getCacheStats();

      return {
        entities: entityStats.size,
        rooms: roomStats.size,
        objects: objectStats.size,
        players: playerStats.size,
      };
    } catch (error) {
      this.logger.error(`Failed to get cache stats: ${error.message}`);
      throw error;
    }
  }

  async syncGameWithFiles(gameId: string): Promise<void> {
    try {
      this.logger.log(`Syncing game ${gameId} with files`);

      // Load from files first
      const result = await this.gameFileService.loadGameFromFiles(gameId);

      if (!result.success) {
        throw new Error(result.message);
      }

      // Then persist to database
      await this.persistGame(gameId);

      this.logger.log(`Successfully synced game ${gameId}`);
    } catch (error) {
      this.logger.error(`Failed to sync game ${gameId}: ${error.message}`);
      throw error;
    }
  }

  async backupGame(gameId: string): Promise<string> {
    try {
      this.logger.log(`Creating backup for game: ${gameId}`);

      // Create version snapshot
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupReason = `Full game backup - ${timestamp}`;

      // Get all entities for the game
      const entities = await this.listEntities(gameId);

      // Save versions for all entities
      const versionPromises = entities.map(async (entity) => {
        try {
          switch (entity.type) {
            case 'room':
              return await this.roomService.saveRoomVersion(
                entity.id,
                backupReason,
              );
            case 'object':
              return await this.objectService.saveObjectVersion(
                entity.id,
                backupReason,
              );
            case 'player':
              return await this.playerService.savePlayerVersion(
                entity.id,
                backupReason,
              );
            default:
              return null;
          }
        } catch (error) {
          this.logger.warn(
            `Failed to backup entity ${entity.id}: ${error.message}`,
          );
          return null;
        }
      });

      await Promise.all(versionPromises);

      this.logger.log(`Created backup for game ${gameId} at ${timestamp}`);
      return timestamp;
    } catch (error) {
      this.logger.error(`Failed to backup game ${gameId}: ${error.message}`);
      throw error;
    }
  }

  async restoreGame(gameId: string, backupTimestamp: string): Promise<void> {
    try {
      this.logger.log(
        `Restoring game ${gameId} from backup: ${backupTimestamp}`,
      );

      // Get all entities for the game
      const entities = await this.listEntities(gameId);

      // Find the backup versions and restore them
      const restorePromises = entities.map(async (entity) => {
        try {
          // Get versions for this entity
          const versions = await this.databaseService.listVersions(
            entity.type,
            entity.id,
          );

          // Find the version closest to the backup timestamp
          const backupVersion = versions.find(
            (v) => v.reason?.includes(backupTimestamp.substring(0, 16)), // Match date part
          );

          if (backupVersion) {
            switch (entity.type) {
              case 'room':
                return await this.roomService.rollbackRoom(
                  entity.id,
                  backupVersion.version,
                );
              case 'object':
                return await this.objectService.rollbackObject(
                  entity.id,
                  backupVersion.version,
                );
              case 'player':
                return await this.playerService.rollbackPlayer(
                  entity.id,
                  backupVersion.version,
                );
            }
          }
        } catch (error) {
          this.logger.warn(
            `Failed to restore entity ${entity.id}: ${error.message}`,
          );
        }
      });

      await Promise.all(restorePromises);

      this.logger.log(
        `Restored game ${gameId} from backup: ${backupTimestamp}`,
      );
    } catch (error) {
      this.logger.error(`Failed to restore game ${gameId}: ${error.message}`);
      throw error;
    }
  }
}
