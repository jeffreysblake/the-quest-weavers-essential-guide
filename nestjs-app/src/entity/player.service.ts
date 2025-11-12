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

@Injectable()
export class PlayerService {
  private readonly logger = new Logger(PlayerService.name);
  private players: Map<string, IPlayer> = new Map();

  constructor(
    private readonly entityService: EntityService,
    private readonly objectService: ObjectService,
    private readonly physicsService: PhysicsService,
    private readonly databaseService?: DatabaseService,
  ) {}

  createPlayer(playerData: Omit<IPlayer, 'id' | 'type'>): IPlayer {
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
    this.entityService.createEntity(player);

    // Save to database if available
    if (this.databaseService) {
      this.savePlayerToDatabase(player).catch((error) => {
        this.logger.error(
          `Failed to save player ${player.id} to database:`,
          error,
        );
      });
    }

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

  create(playerData: Omit<IPlayer, 'id' | 'type'>): IPlayer {
    return this.createPlayer(playerData);
  }

  findAll(): IPlayer[] {
    return Array.from(this.players.values());
  }

  update(id: string, updates: Partial<IPlayer>): boolean {
    return this.updatePlayer(id, updates);
  }

  moveToRoom(playerId: string, roomId: string): boolean {
    const player = this.getPlayer(playerId);
    if (!player) return false;

    player.roomId = roomId;
    this.updatePlayer(playerId, { roomId });
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
        this.entityService.createEntity(player); // Sync with EntityService
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

  updatePlayer(
    id: string,
    updates: Partial<Omit<IPlayer, 'id' | 'type'>>,
  ): boolean {
    const player = this.getPlayer(id);
    if (!player) return false;

    // Update local cache first
    Object.assign(player, updates);
    this.players.set(id, player);

    // Update the entity service
    return this.entityService.updateEntity(id, {
      ...updates,
      type: 'player',
    });
  }

  addInventoryItem(playerId: string, item: any): boolean {
    const player = this.getPlayer(playerId);
    if (!player) return false;

    player.inventory.push(item);
    return this.updatePlayer(playerId, { inventory: player.inventory });
  }

  interactWithObject(
    playerId: string,
    objectId: string,
    action: string = 'examine',
  ): IInteractionResult {
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
        return this.examineObject(player, object);
      case 'take':
      case 'pickup':
        return this.takeObject(player, object);
      case 'open':
        return this.openContainer(player, object);
      case 'close':
        return this.closeContainer(player, object);
      case 'use':
        return this.useObject(player, object);
      default:
        return {
          success: false,
          message: `Unknown action: ${action}`,
        };
    }
  }

  private examineObject(player: IPlayer, object: IObject): IInteractionResult {
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

  private takeObject(player: IPlayer, object: IObject): IInteractionResult {
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

    this.updatePlayer(player.id, { inventory: player.inventory });
    this.entityService.updateEntity(object.id, object);

    return {
      success: true,
      message: `You take the ${object.name}.`,
      effects: {
        itemTaken: object.id,
      },
    };
  }

  private openContainer(player: IPlayer, object: IObject): IInteractionResult {
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
    this.entityService.updateEntity(object.id, object);

    return {
      success: true,
      message: `You open the ${object.name}.`,
      effects: {
        containerOpened: object.id,
      },
    };
  }

  private closeContainer(player: IPlayer, object: IObject): IInteractionResult {
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
    this.entityService.updateEntity(object.id, object);

    return {
      success: true,
      message: `You close the ${object.name}.`,
      effects: {
        containerClosed: object.id,
      },
    };
  }

  private useObject(player: IPlayer, object: IObject): IInteractionResult {
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

    return {
      success: result.success,
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
  movePlayer(
    playerId: string,
    newPosition: { x: number; y: number; z: number },
  ): boolean {
    return this.updatePlayer(playerId, { position: newPosition });
  }

  addToInventory(playerId: string, itemId: string): boolean {
    const player = this.getPlayer(playerId);
    if (!player) return false;

    if (!player.inventory.includes(itemId)) {
      player.inventory.push(itemId);
      return this.updatePlayer(playerId, { inventory: player.inventory });
    }
    return true;
  }

  removeFromInventory(playerId: string, itemId: string): boolean {
    const player = this.getPlayer(playerId);
    if (!player) return false;

    const index = player.inventory.indexOf(itemId);
    if (index > -1) {
      player.inventory.splice(index, 1);
      return this.updatePlayer(playerId, { inventory: player.inventory });
    }
    return false;
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

    const success = await this.databaseService.rollbackToVersion(
      'player',
      playerId,
      version,
    );

    if (success) {
      // Reload player from database
      const player = await this.loadPlayerFromDatabase(playerId);
      if (player) {
        this.players.set(playerId, player);
      }
    }

    return success;
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
        this.entityService.createEntity(player); // Sync with EntityService
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

      // Save version history
      this.databaseService.saveVersion(
        'player',
        player.id,
        player,
        'player_service',
        'Player updated',
      );
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
        inventory: playerRow.inventory_data
          ? JSON.parse(playerRow.inventory_data)
          : [],
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

  private async loadGamePlayersFromDatabase(
    gameId: string,
  ): Promise<IPlayer[]> {
    if (!this.databaseService) return [];

    try {
      const query = this.databaseService.prepare(
        'SELECT * FROM npcs WHERE game_id = ?',
      );
      const rows = query.all(gameId) as any[];

      const players: IPlayer[] = [];

      for (const row of rows) {
        const player = await this.loadPlayerFromDatabase(row.id, gameId);
        if (player) {
          players.push(player);
        }
      }

      return players;
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
      const query = this.databaseService.prepare('SELECT * FROM npcs');
      const rows = query.all() as any[];

      const players: IPlayer[] = [];

      for (const row of rows) {
        const player = await this.loadPlayerFromDatabase(row.id);
        if (player) {
          players.push(player);
        }
      }

      return players;
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
}
