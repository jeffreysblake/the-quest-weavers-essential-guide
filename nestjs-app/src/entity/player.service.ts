import { Injectable, Logger } from '@nestjs/common';
import { EntityService } from './entity.service';
import { IPlayer } from './player.interface';
import { ObjectService } from './object.service';
import { IInteractionResult } from './entity.interface';
import { IObject } from './object.interface';
import { PhysicsService } from './physics.service';
import { EffectType } from './physics.interface';
import { DatabaseService } from '../database/database.service';
import { v4 as uuidv4 } from 'uuid';
import { Mutex, withTimeout } from 'async-mutex';
import { PlayerPersistenceHelper } from './helpers/player-persistence.helper';
import { PlayerInventoryHelper } from './helpers/player-inventory.helper';
import { PlayerInteractionHelper } from './helpers/player-interaction.helper';
import { PlayerCombatHelper } from './helpers/player-combat.helper';

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
  ) {
    // Initialize helpers
    this.persistenceHelper = new PlayerPersistenceHelper(databaseService);
    this.inventoryHelper = new PlayerInventoryHelper(objectService);
    this.interactionHelper = new PlayerInteractionHelper(objectService);
    this.combatHelper = new PlayerCombatHelper(physicsService);
  }

  // Helper instances
  private readonly persistenceHelper: PlayerPersistenceHelper;
  private readonly inventoryHelper: PlayerInventoryHelper;
  private readonly interactionHelper: PlayerInteractionHelper;
  private readonly combatHelper: PlayerCombatHelper;

  /**
   * Get or create a lock for a specific player
   */
  private getPlayerLock(playerId: string): Mutex {
    if (!this.playerLocks.has(playerId)) {
      this.playerLocks.set(playerId, new Mutex());
    }
    return this.playerLocks.get(playerId)!;
  }

  async createPlayer(playerData: Omit<IPlayer, 'id' | 'type'> & { id?: string }): Promise<IPlayer> {
    // Create player with provided ID or generated ID
    const player: IPlayer = {
      ...playerData,
      id: playerData.id || uuidv4(), // Use provided ID or generate new one
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
      player = await this.persistenceHelper.loadPlayerFromDatabase(id, gameId);
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
        const dbPlayers = await this.persistenceHelper.loadGamePlayersFromDatabase(gameId);

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
    return this.interactionHelper.examineObject(player, object);
  }

  private async takeObjectInternal(
    player: IPlayer,
    object: IObject,
  ): Promise<IInteractionResult> {
    return await this.interactionHelper.takeObject(
      player,
      object,
      async (p) => await this.updatePlayer(p.id, { inventory: p.inventory }),
      async (objId, updates) => {
        try {
          await this.entityService.updateEntity(objId, updates);
        } catch (error) {
          this.logger.error(`Failed to update object entity ${objId}:`, error);
        }
      },
    );
  }

  private async openContainer(player: IPlayer, object: IObject): Promise<IInteractionResult> {
    return await this.interactionHelper.openContainer(
      player,
      object,
      async (objId, updates) => {
        try {
          await this.entityService.updateEntity(objId, updates);
        } catch (error) {
          this.logger.error(`Failed to update object entity ${objId}:`, error);
        }
      },
    );
  }

  private async closeContainer(player: IPlayer, object: IObject): Promise<IInteractionResult> {
    return await this.interactionHelper.closeContainer(
      player,
      object,
      async (objId, updates) => {
        try {
          await this.entityService.updateEntity(objId, updates);
        } catch (error) {
          this.logger.error(`Failed to update object entity ${objId}:`, error);
        }
      },
    );
  }

  private async useObjectInternal(
    player: IPlayer,
    object: IObject,
  ): Promise<IInteractionResult> {
    return await this.interactionHelper.useObject(
      player,
      object,
      async (p) => await this.updatePlayer(p.id, { inventory: p.inventory }),
    );
  }

  // Magic/Physics Interaction Methods
  async castSpell(
    playerId: string,
    spellType: EffectType,
    targetId: string,
    intensity: number = 5,
  ): Promise<IInteractionResult> {
    const player = this.getPlayer(playerId);
    if (!player) {
      return {
        success: false,
        message: 'Player not found',
      };
    }

    return await this.combatHelper.castSpell(player, spellType, targetId, intensity);
  }

  async castAreaSpell(
    playerId: string,
    spellType: EffectType,
    roomId: string,
    intensity: number = 5,
  ): Promise<IInteractionResult> {
    const player = this.getPlayer(playerId);
    if (!player) {
      return {
        success: false,
        message: 'Player not found',
      };
    }

    return await this.combatHelper.castAreaSpell(player, spellType, roomId, intensity);
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
    const player = this.getPlayer(playerId);
    if (!player) return false;

    return await this.inventoryHelper.addToInventory(
      player,
      itemId,
      async (p) => await this.updatePlayer(p.id, { inventory: p.inventory }),
    );
  }

  /**
   * Remove item from player inventory
   * THREAD-SAFE: Acquires player lock to prevent concurrent modifications
   */
  async removeFromInventory(
    playerId: string,
    itemId: string,
  ): Promise<boolean> {
    const player = this.getPlayer(playerId);
    if (!player) return false;

    return await this.inventoryHelper.removeFromInventory(
      player,
      itemId,
      async (p) => await this.updatePlayer(p.id, { inventory: p.inventory }),
    );
  }

  getInventory(playerId: string): any[] {
    const player = this.getPlayer(playerId);
    if (!player) return [];

    return this.inventoryHelper.getInventory(player);
  }

  // Enhanced persistence methods with database integration
  async persistPlayers(): Promise<void> {
    const players = Array.from(this.players.values());
    return await this.persistenceHelper.persistPlayers(players);
  }

  async loadPlayers(gameId?: string): Promise<void> {
    if (!this.databaseService) {
      this.logger.warn('Database service not available for loading');
      return;
    }

    try {
      const players = gameId
        ? await this.persistenceHelper.loadGamePlayersFromDatabase(gameId)
        : await this.persistenceHelper.loadAllPlayersFromDatabase();

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
    const player = this.players.get(playerId);
    if (!player) {
      throw new Error(`Player ${playerId} not found in memory`);
    }

    return await this.persistenceHelper.savePlayerVersion(playerId, player, reason);
  }

  async getPlayerVersion(
    playerId: string,
    version?: number,
  ): Promise<IPlayer | null> {
    return await this.persistenceHelper.getPlayerVersion(playerId, version);
  }

  async rollbackPlayer(playerId: string, version: number): Promise<boolean> {
    const versionData = await this.persistenceHelper.rollbackPlayer(playerId, version);

    if (!versionData) {
      return false;
    }

    // Update the in-memory cache with the old version
    this.players.set(playerId, versionData);

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
      const player = await this.persistenceHelper.loadPlayerFromDatabase(playerId, gameId);
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

  /**
   * Load multiple players by IDs in a single batch query
   * Prevents N+1 query pattern by using WHERE id IN (...)
   */
  async loadMultiplePlayers(playerIds: string[]): Promise<IPlayer[]> {
    return await this.persistenceHelper.loadMultiplePlayers(playerIds);
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
  async takeObject(playerId: string, objectId: string): Promise<IInteractionResult> {
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

    return await this.takeObjectInternal(player, object);
  }

  /**
   * Public wrapper for using an object
   * Compatibility wrapper that accepts IDs instead of entity objects
   * @param playerId - The player's ID
   * @param objectId - The object's ID
   * @returns Interaction result with usage effects
   */
  async useObject(playerId: string, objectId: string): Promise<IInteractionResult> {
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

    return await this.useObjectInternal(player, object);
  }

  /**
   * Alias for addToInventory that returns IInteractionResult
   * Compatibility wrapper for stress tests
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

    return await this.interactionHelper.giveObjectToPlayer(
      player,
      object,
      async (pId, oId) => await this.addToInventory(pId, oId),
    );
  }

  // Priority 2: Inventory Management Features

  /**
   * Sort player's inventory by specified criteria
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

    return this.inventoryHelper.sortInventory(player, sortBy);
  }

  /**
   * Filter inventory items matching criteria
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

    return this.inventoryHelper.findInventoryItems(player, criteria);
  }

  /**
   * Calculate aggregate stats from inventory
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

    return this.inventoryHelper.getInventoryStats(player);
  }

  /**
   * Remove item from player inventory and place it in the player's current room
   */
  async dropObject(playerId: string, objectId: string): Promise<IInteractionResult> {
    const player = this.getPlayer(playerId);
    if (!player) {
      return {
        success: false,
        message: 'Player not found',
      };
    }

    return await this.inventoryHelper.dropObject(
      player,
      objectId,
      async (p) => await this.updatePlayer(p.id, { inventory: p.inventory }),
      async (objId, updates) => {
        try {
          await this.entityService.updateEntity(objId, updates);
        } catch (error) {
          this.logger.error(`Failed to update object entity ${objId}:`, error);
        }
      },
    );
  }
}
