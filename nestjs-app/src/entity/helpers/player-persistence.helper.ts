import { Injectable, Logger } from '@nestjs/common';
import { IPlayer } from '../player.interface';
import { DatabaseService } from '../../database/database.service';
import { NPCData } from '../../database/database.interfaces';

/**
 * Player Persistence Helper
 * Handles all database operations for player entities including:
 * - Save/load operations
 * - Version management
 * - Batch loading for performance
 */
@Injectable()
export class PlayerPersistenceHelper {
  private readonly logger = new Logger(PlayerPersistenceHelper.name);

  constructor(private readonly databaseService?: DatabaseService) {}

  /**
   * Save a single player to database
   */
  async savePlayerToDatabase(player: IPlayer): Promise<void> {
    if (!this.databaseService) return;

    try {
      this.databaseService.transaction((db) => {
        // Convert IPlayer to NPCData format for database
        const playerData: NPCData = {
          id: player.id,
          gameId: player.gameId || 'default',
          name: player.name,
          description: player.description,
          npcType: 'player',
          position: player.position,
          health: player.health || 100,
          maxHealth: player.health || 100,
          level: player.level || 1,
          experience: player.experience || 0,
          inventoryData: player.inventory || [],
          dialogueTreeData: {},
          version: 1,
          createdAt: new Date().toISOString(),
        };

        // Save to npcs table (using same table for players and NPCs)
        const insertPlayer = db.prepare(`
          INSERT OR REPLACE INTO npcs (
            id, game_id, name, description, npc_type, position_x, position_y, position_z,
            health, max_health, level, experience, inventory_data, dialogue_tree_data, version, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        insertPlayer.run(
          playerData.id,
          playerData.gameId,
          playerData.name,
          playerData.description,
          playerData.npcType,
          playerData.position.x,
          playerData.position.y,
          playerData.position.z,
          playerData.health,
          playerData.maxHealth,
          playerData.level,
          playerData.experience,
          JSON.stringify(playerData.inventoryData),
          JSON.stringify(playerData.dialogueTreeData),
          playerData.version,
          playerData.createdAt,
        );
      });
    } catch (error) {
      this.logger.error(
        `Failed to save player ${player.id} to database:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Load a single player from database
   */
  async loadPlayerFromDatabase(
    playerId: string,
    gameId?: string,
  ): Promise<IPlayer | undefined> {
    if (!this.databaseService) return undefined;

    try {
      // Load player from database
      const playerQuery = this.databaseService.prepare(`
        SELECT * FROM npcs
        WHERE id = ? ${gameId ? 'AND game_id = ?' : ''}
      `);

      const playerRow = gameId
        ? (playerQuery.get(playerId, gameId) as any)
        : (playerQuery.get(playerId) as any);

      if (!playerRow) return undefined;

      // ERROR HANDLING: Safe JSON parsing with try-catch
      let inventory: string[] = [];
      if (playerRow.inventory_data) {
        try {
          inventory = JSON.parse(playerRow.inventory_data);
          // Validate that parsed data is an array
          if (!Array.isArray(inventory)) {
            this.logger.error(
              `loadPlayerFromDatabase: inventory_data is not an array for player ${playerRow.id}`,
            );
            inventory = [];
          }
        } catch (error) {
          this.logger.error(
            `loadPlayerFromDatabase: Failed to parse inventory_data for player ${playerRow.id}: ${error.message}`,
          );
          inventory = [];
        }
      }

      // Convert database format to IPlayer
      const player: IPlayer = {
        id: playerRow.id,
        name: playerRow.name,
        type: 'player',
        position: {
          x: playerRow.position_x || 0,
          y: playerRow.position_y || 0,
          z: playerRow.position_z || 0,
        },
        health: playerRow.health || 100,
        level: playerRow.level || 1,
        experience: playerRow.experience || 0,
        inventory: inventory,
        gameId: playerRow.game_id,
      };

      return player;
    } catch (error) {
      this.logger.error(
        `Failed to load player ${playerId} from database:`,
        error,
      );
      return undefined;
    }
  }

  /**
   * Load multiple players by IDs in a single batch query
   * Prevents N+1 query pattern by using WHERE id IN (...)
   */
  async loadMultiplePlayers(playerIds: string[]): Promise<IPlayer[]> {
    if (!this.databaseService || playerIds.length === 0) return [];

    try {
      // Batch load player data
      const placeholders = playerIds.map(() => '?').join(',');
      const playerQuery = this.databaseService.prepare(`
        SELECT * FROM npcs WHERE id IN (${placeholders})
      `);
      const playerRows = playerQuery.all(...playerIds) as any[];

      // Convert to IPlayer objects
      const players: IPlayer[] = playerRows.map((playerRow) => {
        const player: IPlayer = {
          id: playerRow.id,
          name: playerRow.name,
          type: 'player',
          position: {
            x: playerRow.position_x || 0,
            y: playerRow.position_y || 0,
            z: playerRow.position_z || 0,
          },
          health: playerRow.health || 100,
          level: playerRow.level || 1,
          experience: playerRow.experience || 0,
          inventory: playerRow.inventory_data
            ? JSON.parse(playerRow.inventory_data)
            : [],
          gameId: playerRow.game_id,
        };
        return player;
      });

      return players;
    } catch (error) {
      this.logger.error('Failed to batch load players from database:', error);
      return [];
    }
  }

  /**
   * Load all players for a specific game
   */
  async loadGamePlayersFromDatabase(gameId: string): Promise<IPlayer[]> {
    if (!this.databaseService) return [];

    try {
      // First get all player IDs for this game
      const query = this.databaseService.prepare(
        'SELECT id FROM npcs WHERE game_id = ?',
      );
      const rows = query.all(gameId) as any[];
      const playerIds = rows.map((row) => row.id);

      // Use batch loading to prevent N+1 queries
      return await this.loadMultiplePlayers(playerIds);
    } catch (error) {
      this.logger.error(
        `Failed to load players for game ${gameId} from database:`,
        error,
      );
      return [];
    }
  }

  /**
   * Load all players from database
   */
  async loadAllPlayersFromDatabase(): Promise<IPlayer[]> {
    if (!this.databaseService) return [];

    try {
      // First get all player IDs
      const query = this.databaseService.prepare('SELECT id FROM npcs');
      const rows = query.all() as any[];
      const playerIds = rows.map((row) => row.id);

      // Use batch loading to prevent N+1 queries
      return await this.loadMultiplePlayers(playerIds);
    } catch (error) {
      this.logger.error('Failed to load all players from database:', error);
      return [];
    }
  }

  /**
   * Persist all players to database
   */
  async persistPlayers(players: IPlayer[]): Promise<void> {
    if (!this.databaseService) {
      this.logger.warn('Database service not available for persistence');
      return;
    }

    try {
      this.logger.log(`Persisting ${players.length} players to database`);

      for (const player of players) {
        await this.savePlayerToDatabase(player);
      }

      this.logger.log('Successfully persisted all players');
    } catch (error) {
      this.logger.error('Failed to persist players:', error);
      throw error;
    }
  }

  /**
   * Save player version to version history
   */
  async savePlayerVersion(
    playerId: string,
    playerData: IPlayer,
    reason?: string,
  ): Promise<number> {
    if (!this.databaseService) {
      throw new Error('Database service not available for version management');
    }

    return this.databaseService.saveVersion(
      'player',
      playerId,
      playerData,
      'player_service',
      reason,
    );
  }

  /**
   * Get a specific version of player data
   */
  async getPlayerVersion(
    playerId: string,
    version?: number,
  ): Promise<IPlayer | null> {
    if (!this.databaseService) {
      throw new Error('Database service not available for version management');
    }

    return this.databaseService.getVersion('player', playerId, version);
  }

  /**
   * Rollback player to a previous version
   */
  async rollbackPlayer(
    playerId: string,
    version: number,
  ): Promise<IPlayer | null> {
    if (!this.databaseService) {
      throw new Error('Database service not available for version management');
    }

    // Get the version data
    const versionData = await this.databaseService.getVersion(
      'player',
      playerId,
      version,
    );

    if (!versionData) {
      return null;
    }

    // Save the old version to the database
    await this.savePlayerToDatabase(versionData as IPlayer);

    // Create a version history entry for the rollback
    await this.databaseService.saveVersion(
      'player',
      playerId,
      versionData,
      'system',
      `Rollback to version ${version}`,
    );

    return versionData as IPlayer;
  }
}
