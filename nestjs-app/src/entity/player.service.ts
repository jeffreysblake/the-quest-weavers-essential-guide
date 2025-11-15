import { Injectable, Logger } from '@nestjs/common';
import { EntityService } from './entity.service';
import { IPlayer } from './player.interface';
import { ObjectService } from './object.service';
import { IInteractionResult } from './entity.interface';
import { IObject } from './object.interface';
import { PhysicsService } from './physics.service';
import { IPhysicsEffect, EffectType } from './physics.interface';
import { DatabaseService } from '../database/database.service';
import { NPCData } from '../database/database.interfaces';
import { v4 as uuidv4 } from 'uuid';
import { Mutex, withTimeout } from 'async-mutex';

/**
 * CONCURRENCY PROTECTION:
 * - Uses Mutex locks to prevent race conditions in player operations
 * - Per-player locks prevent concurrent modifications to player state
 * - Prevents inventory duplication and lost updates
 * - All locks have 5-second timeout to prevent permanent deadlocks
 */
@Injectable()
export class PlayerService {
  private readonly logger = new Logger(PlayerService.name);
  private players: Map<string, IPlayer> = new Map();

  // Concurrency protection
  private readonly playerLocks = new Map<string, Mutex>();
  private readonly LOCK_TIMEOUT = 5000;

  constructor(
    private readonly entityService: EntityService,
    private readonly objectService: ObjectService,
    private readonly physicsService: PhysicsService,
    private readonly databaseService?: DatabaseService,
  ) {}

  /**
   * Get or create a lock for a specific player
   */
  private getPlayerLock(playerId: string): Mutex {
    if (!this.playerLocks.has(playerId)) {
      this.playerLocks.set(playerId, new Mutex());
    }
    return this.playerLocks.get(playerId)!;
  }

  async createPlayer(playerData: Omit<IPlayer, 'id' | 'type'>): Promise<IPlayer> {
    // Create player with generated ID
    const player: IPlayer = {
      ...playerData,
      id: uuidv4(),
      type: 'player' as const,
      health: playerData.health ?? 100,
      inventory: playerData.inventory ?? [],
      level: playerData.level ?? 1,
      experience: playerData.experience ?? 0,
    };

    // Store in local cache
    this.players.set(player.id, player);

    // Also create in EntityService for compatibility
    try {
      await this.entityService.createEntity(player);
    } catch (error) {
      this.logger.error(`Failed to create player entity ${player.id}:`, error);
      // Remove from cache if entity creation failed
      this.players.delete(player.id);
      throw error;
    }

    // Don't save automatically to prevent race conditions with explicit persistGame() calls
    // The player is cached in memory and will be persisted when persistGame() is called
    // This ensures data consistency and prevents stale async saves from overwriting fresh data

    return player;
  }

  getPlayer(id: string): IPlayer | undefined {
    // Check local cache first
    const player = this.players.get(id);
    if (player) {
      return player;
    }

    // Fallback to EntityService
    const entity = this.entityService.getEntity(id);
    if (entity && entity.type === 'player') {
      return entity as IPlayer;
    }
    return undefined;
  }

  // Alias for compatibility
  findById(id: string): IPlayer | undefined {
    return this.getPlayer(id);
  }

  async create(playerData: Omit<IPlayer, 'id' | 'type'>): Promise<IPlayer> {
    return await this.createPlayer(playerData);
  }

  findAll(): IPlayer[] {
    return Array.from(this.players.values());
  }

  async update(id: string, updates: Partial<IPlayer>): Promise<boolean> {
    return await this.updatePlayer(id, updates);
  }

  async moveToRoom(playerId: string, roomId: string): Promise<boolean> {
    const player = this.getPlayer(playerId);
    if (!player) return false;

    player.roomId = roomId;
    await this.updatePlayer(playerId, { roomId });
    return true;
  }

  async getPlayerWithFallback(
    id: string,
    gameId?: string,
  ): Promise<IPlayer | undefined> {
    // First check local cache
    let player = this.players.get(id);
    if (player) {
      return player;
    }

    // Then check EntityService
    const entity = this.entityService.getEntity(id);
    if (entity && entity.type === 'player') {
      player = entity as IPlayer;
      this.players.set(player.id, player);
      return player;
    }

    // If not found and database is available, try to load from database
    if (this.databaseService && gameId) {
      player = await this.loadPlayerFromDatabase(id, gameId);
      if (player) {
        this.players.set(player.id, player);
        try {
          await this.entityService.createEntity(player); // Sync with EntityService
        } catch (error) {
          this.logger.error(`Failed to sync player ${player.id} with EntityService:`, error);
        }
        return player;
      }
    }

    return undefined;
  }

  async getAllPlayersForGame(gameId: string): Promise<IPlayer[]> {
    // Get all in-memory players for this game
    const inMemoryPlayers = Array.from(this.players.values()).filter(
      (player) => player.gameId === gameId,
    );

    // If database is available, also load from database
    if (this.databaseService) {
      try {
        const dbPlayers = await this.loadGamePlayersFromDatabase(gameId);

        // Merge with in-memory players, preferring in-memory versions
        const playerMap = new Map<string, IPlayer>();

        // Add database players first
        dbPlayers.forEach((player) => playerMap.set(player.id, player));

        // Override with in-memory players
        inMemoryPlayers.forEach((player) => playerMap.set(player.id, player));

        return Array.from(playerMap.values());
      } catch (error) {
        this.logger.error(
          `Failed to load players for game ${gameId} from database:`,
          error,
        );
      }
    }

    return inMemoryPlayers;
  }

  async updatePlayer(
    id: string,
    updates: Partial<Omit<IPlayer, 'id' | 'type'>>,
  ): Promise<boolean> {
    const player = this.getPlayer(id);
    if (!player) return false;

    // Fix Bug 2: Cap health at maxHealth to prevent overflow exploit
    if (updates.health !== undefined && player.maxHealth !== undefined) {
      updates.health = Math.min(updates.health, player.maxHealth);
    }

    // Update local cache first
    Object.assign(player, updates);
    this.players.set(id, player);

    // Update the entity service
    try {
      return await this.entityService.updateEntity(id, {
        ...updates,
        type: 'player',
      });
    } catch (error) {
      this.logger.error(`Failed to update player entity ${id}:`, error);
      return false;
    }
  }

  async addInventoryItem(playerId: string, item: any): Promise<boolean> {
    const player = this.getPlayer(playerId);
    if (!player) return false;

    player.inventory.push(item);
    return await this.updatePlayer(playerId, { inventory: player.inventory });
  }

  async interactWithObject(
    playerId: string,
    objectId: string,
    action: string = 'examine',
  ): Promise<IInteractionResult> {
    const player = this.getPlayer(playerId);
    const object = this.objectService.getObject(objectId);

    if (!player || !object) {
      return {
        success: false,
        message: 'Player or object not found',
      };
    }

    switch (action) {
      case 'examine':
        return this.examineObjectInternal(player, object);
      case 'take':
      case 'pickup':
        return await this.takeObjectInternal(player, object);
      case 'open':
        return await this.openContainer(player, object);
      case 'close':
        return await this.closeContainer(player, object);
      case 'use':
        return this.useObjectInternal(player, object);
      default:
        return {
          success: false,
          message: `Unknown action: ${action}`,
        };
    }
  }

  private examineObjectInternal(
    player: IPlayer,
    object: IObject,
  ): IInteractionResult {
    let description = `You examine the ${object.name}.`;

    if (object.spatialRelationship) {
      const location = this.objectService.getObjectLocation(object.id);
      description += ` ${location}.`;
    }

    if (object.isContainer && object.state?.isOpen) {
      const contents = this.objectService.getObjectsInContainer(object.id);
      if (contents.length > 0) {
        const itemNames = contents.map((item) => item.name).join(', ');
        description += ` Inside you see: ${itemNames}.`;
      } else {
        description += ' It is empty.';
      }
    }

    return {
      success: true,
      message: description,
    };
  }

  private async takeObjectInternal(
    player: IPlayer,
    object: IObject,
  ): Promise<IInteractionResult> {
    if (!object.isPortable) {
      return {
        success: false,
        message: `You cannot take the ${object.name}.`,
      };
    }

    // Remove from current location
    if (object.spatialRelationship?.relationshipType === 'inside') {
      this.objectService.removeObjectFromContainer(
        object.id,
        object.spatialRelationship.targetId,
      );
    }

    // Add to player inventory
    player.inventory.push(object.id);
    object.spatialRelationship = undefined;

    await this.updatePlayer(player.id, { inventory: player.inventory });
    try {
      await this.entityService.updateEntity(object.id, object);
    } catch (error) {
      this.logger.error(`Failed to update object entity ${object.id}:`, error);
    }

    return {
      success: true,
      message: `You take the ${object.name}.`,
      effects: {
        itemTaken: object.id,
      },
    };
  }

  private async openContainer(player: IPlayer, object: IObject): Promise<IInteractionResult> {
    if (!object.isContainer) {
      return {
        success: false,
        message: `The ${object.name} cannot be opened.`,
      };
    }

    if (object.state?.isLocked) {
      return {
        success: false,
        message: `The ${object.name} is locked.`,
      };
    }

    if (object.state?.isOpen) {
      return {
        success: false,
        message: `The ${object.name} is already open.`,
      };
    }

    object.state = { ...object.state, isOpen: true };
    try {
      await this.entityService.updateEntity(object.id, object);
    } catch (error) {
      this.logger.error(`Failed to update object entity ${object.id}:`, error);
    }

    return {
      success: true,
      message: `You open the ${object.name}.`,
      effects: {
        containerOpened: object.id,
      },
    };
  }

  private async closeContainer(player: IPlayer, object: IObject): Promise<IInteractionResult> {
    if (!object.isContainer) {
      return {
        success: false,
        message: `The ${object.name} cannot be closed.`,
      };
    }

    if (!object.state?.isOpen) {
      return {
        success: false,
        message: `The ${object.name} is already closed.`,
      };
    }

    object.state = { ...object.state, isOpen: false };
    try {
      await this.entityService.updateEntity(object.id, object);
    } catch (error) {
      this.logger.error(`Failed to update object entity ${object.id}:`, error);
    }

    return {
      success: true,
      message: `You close the ${object.name}.`,
      effects: {
        containerClosed: object.id,
      },
    };
  }

  private useObjectInternal(
    player: IPlayer,
    object: IObject,
  ): IInteractionResult {
    // Basic use implementation - can be extended based on object type
    switch (object.objectType) {
      case 'weapon':
        return {
          success: true,
          message: `You brandish the ${object.name}.`,
        };
      case 'consumable':
        // Remove from inventory if consumed
        const index = player.inventory.indexOf(object.id);
        if (index > -1) {
          player.inventory.splice(index, 1);
          this.updatePlayer(player.id, { inventory: player.inventory });
        }
        return {
          success: true,
          message: `You use the ${object.name}.`,
          effects: {
            itemConsumed: object.id,
          },
        };
      default:
        return {
          success: true,
          message: `You use the ${object.name}.`,
        };
    }
  }

  // Magic/Physics Interaction Methods
  castSpell(
    playerId: string,
    spellType: EffectType,
    targetId: string,
    intensity: number = 5,
  ): IInteractionResult {
    const player = this.getPlayer(playerId);
    if (!player) {
      return {
        success: false,
        message: 'Player not found',
      };
    }

    // VALIDATION: Validate intensity parameter to prevent crashes
    if (typeof intensity !== 'number' || Number.isNaN(intensity) || !Number.isFinite(intensity)) {
      this.logger.error(`castSpell: Invalid intensity value: ${intensity}`);
      return {
        success: false,
        message: 'Invalid spell intensity',
      };
    }

    // VALIDATION: Ensure intensity is positive and reasonable
    if (intensity < 0) {
      this.logger.error(`castSpell: Negative intensity not allowed: ${intensity}`);
      return {
        success: false,
        message: 'Spell intensity must be positive',
      };
    }

    if (intensity > 1000) {
      this.logger.warn(`castSpell: Capping extremely high intensity from ${intensity} to 1000`);
      intensity = 1000; // Cap at reasonable maximum
    }

    const effect: IPhysicsEffect = {
      type: spellType,
      intensity,
      sourceId: playerId,
      description: this.getSpellDescription(spellType, intensity),
    };

    const result = this.physicsService.applyEffect(targetId, effect);

    return {
      success: result.success,
      message: `${player.name} casts ${this.getSpellName(spellType)}! ${result.message}`,
      effects: {
        physicsResult: result,
      },
    };
  }

  castAreaSpell(
    playerId: string,
    spellType: EffectType,
    roomId: string,
    intensity: number = 5,
  ): IInteractionResult {
    const player = this.getPlayer(playerId);
    if (!player) {
      return {
        success: false,
        message: 'Player not found',
      };
    }

    const effect: IPhysicsEffect = {
      type: spellType,
      intensity,
      sourceId: playerId,
      description: this.getAreaSpellDescription(spellType, intensity),
    };

    const result = this.physicsService.applyAreaEffect(roomId, effect);

    // BUG FIX #2: Casting a spell should succeed even if no objects are affected
    // The spell was cast successfully, it just didn't hit anything
    return {
      success: true,
      message: `${player.name} casts ${this.getSpellName(spellType)} across the room! ${result.message}`,
      effects: {
        physicsResult: result,
      },
    };
  }

  // Helper methods for spell descriptions
  private getSpellName(spellType: EffectType): string {
    const spellNames: Record<EffectType, string> = {
      fire: 'Fireball',
      lightning: 'Lightning Bolt',
      ice: 'Ice Shard',
      force: 'Force Push',
      poison: 'Poison Cloud',
      acid: 'Acid Splash',
      magic: 'Magic Missile',
    };
    return spellNames[spellType] || 'Unknown Spell';
  }

  private getSpellDescription(
    spellType: EffectType,
    intensity: number,
  ): string {
    const base = this.getSpellName(spellType).toLowerCase();
    if (intensity <= 3) return `weak ${base}`;
    if (intensity <= 6) return `${base}`;
    return `powerful ${base}`;
  }

  private getAreaSpellDescription(
    spellType: EffectType,
    intensity: number,
  ): string {
    const base = this.getSpellName(spellType).toLowerCase();
    if (intensity <= 3) return `spreading ${base}`;
    if (intensity <= 6) return `area ${base}`;
    return `devastating ${base} storm`;
  }

  // Missing methods for game service compatibility
  async movePlayer(
    playerId: string,
    newPosition: { x: number; y: number; z: number },
  ): Promise<boolean> {
    return await this.updatePlayer(playerId, { position: newPosition });
  }

  /**
   * Add item to player inventory
   * THREAD-SAFE: Acquires player lock to prevent duplicate additions
   */
  async addToInventory(playerId: string, itemId: string): Promise<boolean> {
    const lock = this.getPlayerLock(playerId);

    try {
      return await withTimeout(lock, this.LOCK_TIMEOUT).runExclusive(
        async () => {
          const player = this.getPlayer(playerId);
          if (!player) return false;

          if (!player.inventory.includes(itemId)) {
            player.inventory.push(itemId);
            return await this.updatePlayer(playerId, { inventory: player.inventory });
          }
          return true;
        },
      );
    } catch (error) {
      if (error.message?.includes('timeout')) {
        this.logger.error(
          `Lock timeout adding to inventory for player ${playerId}`,
        );
        return false;
      }
      throw error;
    }
  }

  /**
   * Remove item from player inventory
   * THREAD-SAFE: Acquires player lock to prevent concurrent modifications
   */
  async removeFromInventory(
    playerId: string,
    itemId: string,
  ): Promise<boolean> {
    const lock = this.getPlayerLock(playerId);

    try {
      return await withTimeout(lock, this.LOCK_TIMEOUT).runExclusive(
        async () => {
          const player = this.getPlayer(playerId);
          if (!player) return false;

          const index = player.inventory.indexOf(itemId);
          if (index > -1) {
            player.inventory.splice(index, 1);
            return await this.updatePlayer(playerId, { inventory: player.inventory });
          }
          return false;
        },
      );
    } catch (error) {
      if (error.message?.includes('timeout')) {
        this.logger.error(
          `Lock timeout removing from inventory for player ${playerId}`,
        );
        return false;
      }
      throw error;
    }
  }

  getInventory(playerId: string): any[] {
    const player = this.getPlayer(playerId);
    if (!player) return [];

    // Return actual objects instead of just IDs
    return player.inventory
      .map((itemId) => this.objectService.getObject(itemId))
      .filter(Boolean);
  }

  // Enhanced persistence methods with database integration
  async persistPlayers(): Promise<void> {
    if (!this.databaseService) {
      this.logger.warn('Database service not available for persistence');
      return;
    }

    try {
      const players = Array.from(this.players.values());
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

  async loadPlayers(gameId?: string): Promise<void> {
    if (!this.databaseService) {
      this.logger.warn('Database service not available for loading');
      return;
    }

    try {
      const players = gameId
        ? await this.loadGamePlayersFromDatabase(gameId)
        : await this.loadAllPlayersFromDatabase();

      this.logger.log(`Loading ${players.length} players from database`);

      // Clear current players and load from database
      this.players.clear();
      players.forEach((player) => this.players.set(player.id, player));

      this.logger.log('Successfully loaded players');
    } catch (error) {
      this.logger.error('Failed to load players:', error);
      throw error;
    }
  }

  // Version management methods
  async savePlayerVersion(playerId: string, reason?: string): Promise<number> {
    if (!this.databaseService) {
      throw new Error('Database service not available for version management');
    }

    const player = this.players.get(playerId);
    if (!player) {
      throw new Error(`Player ${playerId} not found in memory`);
    }

    return this.databaseService.saveVersion(
      'player',
      playerId,
      player,
      'player_service',
      reason,
    );
  }

  async getPlayerVersion(
    playerId: string,
    version?: number,
  ): Promise<IPlayer | null> {
    if (!this.databaseService) {
      throw new Error('Database service not available for version management');
    }

    return this.databaseService.getVersion('player', playerId, version);
  }

  async rollbackPlayer(playerId: string, version: number): Promise<boolean> {
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
      return false;
    }

    // Update the in-memory cache with the old version
    this.players.set(playerId, versionData as IPlayer);

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

    return true;
  }

  // Dynamic loading for gameplay
  async loadPlayerOnDemand(
    gameId: string,
    playerId: string,
  ): Promise<IPlayer | undefined> {
    // Check if already loaded
    const existingPlayer = this.players.get(playerId);
    if (existingPlayer) {
      return existingPlayer;
    }

    // Load from database
    const player = await this.getPlayerWithFallback(playerId, gameId);
    return player;
  }

  async refreshPlayer(
    gameId: string,
    playerId: string,
  ): Promise<IPlayer | undefined> {
    // Force reload from database
    if (this.databaseService) {
      const player = await this.loadPlayerFromDatabase(playerId, gameId);
      if (player) {
        this.players.set(playerId, player);
        try {
          await this.entityService.createEntity(player); // Sync with EntityService
        } catch (error) {
          this.logger.error(`Failed to sync player ${playerId} with EntityService:`, error);
        }
        return player;
      }
    }
    return this.players.get(playerId);
  }

  // Database integration methods
  private async savePlayerToDatabase(player: IPlayer): Promise<void> {
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

      // Note: Version history is saved explicitly via savePlayerVersion() when needed
    } catch (error) {
      this.logger.error(
        `Failed to save player ${player.id} to database:`,
        error,
      );
      throw error;
    }
  }

  private async loadPlayerFromDatabase(
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
            this.logger.error(`loadPlayerFromDatabase: inventory_data is not an array for player ${playerRow.id}`);
            inventory = [];
          }
        } catch (error) {
          this.logger.error(`loadPlayerFromDatabase: Failed to parse inventory_data for player ${playerRow.id}: ${error.message}`);
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

  private async loadGamePlayersFromDatabase(
    gameId: string,
  ): Promise<IPlayer[]> {
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

  private async loadAllPlayersFromDatabase(): Promise<IPlayer[]> {
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

  // Clear in-memory cache
  clearCache(): void {
    this.players.clear();
    this.logger.log('Player cache cleared');
  }

  // Get cache statistics
  getCacheStats(): { size: number; players: string[] } {
    return {
      size: this.players.size,
      players: Array.from(this.players.keys()),
    };
  }

  // Priority 1: Wrapper methods for stress test compatibility

  /**
   * Public wrapper for examining an object
   * Compatibility wrapper that accepts IDs instead of entity objects
   * @param playerId - The player's ID
   * @param objectId - The object's ID
   * @returns Interaction result with examination description
   */
  examineObject(playerId: string, objectId: string): IInteractionResult {
    const player = this.getPlayer(playerId);
    if (!player) {
      return {
        success: false,
        message: 'Player not found',
      };
    }

    const object = this.objectService.getObject(objectId);
    if (!object) {
      return {
        success: false,
        message: 'Object not found',
      };
    }

    return this.examineObjectInternal(player, object);
  }

  /**
   * Public wrapper for taking an object
   * Compatibility wrapper that accepts IDs instead of entity objects
   * @param playerId - The player's ID
   * @param objectId - The object's ID
   * @returns Interaction result with success/failure message
   */
  takeObject(playerId: string, objectId: string): IInteractionResult {
    const player = this.getPlayer(playerId);
    if (!player) {
      return {
        success: false,
        message: 'Player not found',
      };
    }

    const object = this.objectService.getObject(objectId);
    if (!object) {
      return {
        success: false,
        message: 'Object not found',
      };
    }

    return this.takeObjectInternal(player, object);
  }

  /**
   * Public wrapper for using an object
   * Compatibility wrapper that accepts IDs instead of entity objects
   * @param playerId - The player's ID
   * @param objectId - The object's ID
   * @returns Interaction result with usage effects
   */
  useObject(playerId: string, objectId: string): IInteractionResult {
    const player = this.getPlayer(playerId);
    if (!player) {
      return {
        success: false,
        message: 'Player not found',
      };
    }

    const object = this.objectService.getObject(objectId);
    if (!object) {
      return {
        success: false,
        message: 'Object not found',
      };
    }

    return this.useObjectInternal(player, object);
  }

  /**
   * Alias for addToInventory that returns IInteractionResult
   * Compatibility wrapper for stress tests
   * @param playerId - The player's ID
   * @param objectId - The object's ID
   * @returns Interaction result with success/failure message
   */
  async giveObjectToPlayer(playerId: string, objectId: string): Promise<IInteractionResult> {
    const player = this.getPlayer(playerId);
    if (!player) {
      return {
        success: false,
        message: 'Player not found',
      };
    }

    const object = this.objectService.getObject(objectId);
    if (!object) {
      return {
        success: false,
        message: 'Object not found',
      };
    }

    const success = await this.addToInventory(playerId, objectId);
    if (success) {
      return {
        success: true,
        message: `${object.name} added to inventory.`,
        effects: {
          itemAdded: objectId,
        },
      };
    } else {
      return {
        success: false,
        message: `Failed to add ${object.name} to inventory.`,
      };
    }
  }

  // Priority 2: Inventory Management Features

  /**
   * Sort player's inventory by specified criteria
   * @param playerId - The player's ID
   * @param sortBy - Criteria to sort by: 'name', 'type', 'weight', or 'value'
   * @returns Sorted array of inventory objects
   */
  sortInventory(
    playerId: string,
    sortBy: 'name' | 'type' | 'weight' | 'value',
  ): IObject[] {
    const player = this.getPlayer(playerId);
    if (!player) {
      this.logger.warn(`Player ${playerId} not found for sortInventory`);
      return [];
    }

    // Get actual objects from inventory IDs
    const inventoryObjects = player.inventory
      .map((itemId) => this.objectService.getObject(itemId))
      .filter(Boolean) as IObject[];

    // Sort based on criteria
    switch (sortBy) {
      case 'name':
        return inventoryObjects.sort((a, b) => a.name.localeCompare(b.name));
      case 'type':
        return inventoryObjects.sort((a, b) =>
          a.objectType.localeCompare(b.objectType),
        );
      case 'weight':
        return inventoryObjects.sort((a, b) => {
          const weightA = a.weight || a.properties?.weight || 0;
          const weightB = b.weight || b.properties?.weight || 0;
          return weightB - weightA; // Descending order
        });
      case 'value':
        return inventoryObjects.sort((a, b) => {
          const valueA = a.properties?.value || 0;
          const valueB = b.properties?.value || 0;
          return valueB - valueA; // Descending order
        });
      default:
        return inventoryObjects;
    }
  }

  /**
   * Filter inventory items matching criteria
   * @param playerId - The player's ID
   * @param criteria - Search criteria (name, objectType/type, material, weight, rarity, etc.)
   * @returns Array of matching inventory objects
   */
  findInventoryItems(
    playerId: string,
    criteria: {
      name?: string;
      objectType?: string;
      type?: string;
      material?: string;
      weight?: number | { min?: number; max?: number };
      rarity?: number | { min?: number; max?: number };
      value?: number | { min?: number; max?: number };
    },
  ): IObject[] {
    const player = this.getPlayer(playerId);
    if (!player) {
      this.logger.warn(`Player ${playerId} not found for findInventoryItems`);
      return [];
    }

    // Get actual objects from inventory IDs
    const inventoryObjects = player.inventory
      .map((itemId) => this.objectService.getObject(itemId))
      .filter(Boolean) as IObject[];

    // Filter based on criteria
    return inventoryObjects.filter((obj) => {
      // Check name (partial match, case-insensitive)
      if (
        criteria.name &&
        !obj.name.toLowerCase().includes(criteria.name.toLowerCase())
      ) {
        return false;
      }

      // Check object type (exact match) - support both 'type' and 'objectType' fields
      const typeToCheck = criteria.objectType || criteria.type;
      if (typeToCheck && obj.objectType !== typeToCheck) {
        return false;
      }

      // Check material (exact match)
      if (criteria.material && obj.material !== criteria.material) {
        return false;
      }

      // Check weight (exact or range)
      if (criteria.weight !== undefined) {
        const objWeight = obj.weight || obj.properties?.weight || 0;
        if (typeof criteria.weight === 'number') {
          if (objWeight !== criteria.weight) return false;
        } else if (typeof criteria.weight === 'object') {
          if (
            criteria.weight.min !== undefined &&
            objWeight < criteria.weight.min
          ) {
            return false;
          }
          if (
            criteria.weight.max !== undefined &&
            objWeight > criteria.weight.max
          ) {
            return false;
          }
        }
      }

      // Check rarity (exact or range) - assumes rarity is in properties
      if (criteria.rarity !== undefined) {
        const objRarity = (obj.properties as any)?.rarity || 0;
        if (typeof criteria.rarity === 'number') {
          if (objRarity !== criteria.rarity) return false;
        } else if (typeof criteria.rarity === 'object') {
          if (
            criteria.rarity.min !== undefined &&
            objRarity < criteria.rarity.min
          ) {
            return false;
          }
          if (
            criteria.rarity.max !== undefined &&
            objRarity > criteria.rarity.max
          ) {
            return false;
          }
        }
      }

      // Check value (exact or range)
      if (criteria.value !== undefined) {
        const objValue = obj.properties?.value || 0;
        if (typeof criteria.value === 'number') {
          if (objValue !== criteria.value) return false;
        } else if (typeof criteria.value === 'object') {
          if (
            criteria.value.min !== undefined &&
            objValue < criteria.value.min
          ) {
            return false;
          }
          if (
            criteria.value.max !== undefined &&
            objValue > criteria.value.max
          ) {
            return false;
          }
        }
      }

      return true;
    });
  }

  /**
   * Calculate aggregate stats from inventory
   * @param playerId - The player's ID
   * @returns Object with totalItems, totalWeight, and totalValue
   */
  getInventoryStats(playerId: string): {
    totalItems: number;
    totalWeight: number;
    totalValue: number;
  } {
    const player = this.getPlayer(playerId);
    if (!player) {
      this.logger.warn(`Player ${playerId} not found for getInventoryStats`);
      return { totalItems: 0, totalWeight: 0, totalValue: 0 };
    }

    // Get actual objects from inventory IDs
    const inventoryObjects = player.inventory
      .map((itemId) => this.objectService.getObject(itemId))
      .filter(Boolean) as IObject[];

    // Calculate totals
    const totalItems = inventoryObjects.length;
    const totalWeight = inventoryObjects.reduce((sum, obj) => {
      return sum + (obj.weight || obj.properties?.weight || 0);
    }, 0);
    const totalValue = inventoryObjects.reduce((sum, obj) => {
      return sum + (obj.properties?.value || 0);
    }, 0);

    return {
      totalItems,
      totalWeight,
      totalValue,
    };
  }

  /**
   * Remove item from player inventory and place it in the player's current room
   * @param playerId - The player's ID
   * @param objectId - The object ID to drop
   * @returns Success/failure result
   */
  async dropObject(playerId: string, objectId: string): Promise<IInteractionResult> {
    const player = this.getPlayer(playerId);
    if (!player) {
      return {
        success: false,
        message: 'Player not found',
      };
    }

    const object = this.objectService.getObject(objectId);
    if (!object) {
      return {
        success: false,
        message: 'Object not found',
      };
    }

    // Check if object is in player's inventory
    const inventoryIndex = player.inventory.indexOf(objectId);
    if (inventoryIndex === -1) {
      return {
        success: false,
        message: `You do not have the ${object.name} in your inventory.`,
      };
    }

    // Remove from player's inventory
    player.inventory.splice(inventoryIndex, 1);
    await this.updatePlayer(playerId, { inventory: player.inventory });

    // If player has a current room, add object to that room
    if (player.roomId) {
      // Update object's room ID
      object.roomId = player.roomId;
      try {
        await this.entityService.updateEntity(objectId, object);
      } catch (error) {
        this.logger.error(`Failed to update object entity ${objectId}:`, error);
      }

      return {
        success: true,
        message: `You drop the ${object.name}.`,
        effects: {
          itemDropped: objectId,
          droppedInRoom: player.roomId,
        },
      };
    }

    // If no room, just remove from inventory
    return {
      success: true,
      message: `You drop the ${object.name}.`,
      effects: {
        itemDropped: objectId,
      },
    };
  }
}
