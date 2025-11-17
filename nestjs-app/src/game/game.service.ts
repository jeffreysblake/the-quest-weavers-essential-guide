import { Injectable, Logger } from '@nestjs/common';
import { GameStateService } from './game-state.service';
import { CommandProcessorService } from './command-processor.service';
import { EntityService } from '../entity/entity.service';
import { RoomService } from '../entity/room.service';
import { PlayerService } from '../entity/player.service';
import { ObjectService } from '../entity/object.service';
import { DatabaseService } from '../database/database.service';
import { v4 as uuidv4 } from 'uuid';
import { Mutex, withTimeout } from 'async-mutex';

export interface GameSession {
  gameId: string;
  playerId: string;
  createdAt: Date;
  lastActive: Date;
}

export interface CommandResult {
  success: boolean;
  type?: string;
  message?: string;
  roomDescription?: string;
  items?: any[];
  npcs?: any[];
  exits?: string[];
  playerStatus?: {
    health?: number;
    location?: string;
    level?: number;
  };
  gameState?: any;
  dialogue?: {
    npcName: string;
    text: string;
    choices?: string[];
  };
  combatResult?: {
    damage?: number;
    targetDefeated?: boolean;
    targetHealthRemaining?: number;
    targetMaxHealth?: number;
    experienceGained?: number;
    leveledUp?: boolean;
    newLevel?: number;
  };
}

/**
 * CONCURRENCY PROTECTION:
 * - Uses Mutex locks to prevent race conditions in game session management
 * - Map-level lock protects the gameSessions Map from concurrent modifications
 * - Prevents duplicate game sessions and lost updates
 * - All locks have 5-second timeout to prevent permanent deadlocks
 *
 * RESOURCE LIMITS (DOS/OOM Prevention):
 * - Max sessions: 10000 (LRU eviction when exceeded)
 * - Auto-cleanup sessions inactive > 24 hours
 */
@Injectable()
export class GameService {
  private readonly logger = new Logger(GameService.name);
  private gameSessions = new Map<string, GameSession>();

  // Concurrency protection
  private readonly mapLock = withTimeout(new Mutex(), 5000);
  private readonly LOCK_TIMEOUT = 5000;

  // Resource limits
  private readonly MAX_SESSIONS = 10000;
  private readonly SESSION_INACTIVE_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours in ms

  constructor(
    private gameStateService: GameStateService,
    private commandProcessor: CommandProcessorService,
    private entityService: EntityService,
    private roomService: RoomService,
    private playerService: PlayerService,
    private objectService: ObjectService,
    private databaseService: DatabaseService,
  ) {}

  // Create a new game session
  // THREAD-SAFE: Acquires map lock to prevent duplicate game session creation
  // RESOURCE LIMIT: Max 10000 sessions with LRU eviction
  async createGame(): Promise<{ gameId: string; gameState: any }> {
    return await this.mapLock.runExclusive(async () => {
      // RESOURCE LIMIT: Auto-cleanup inactive sessions before creating new one
      this.cleanupInactiveSessions(this.SESSION_INACTIVE_TIMEOUT);

      // RESOURCE LIMIT: If at max sessions, evict least recently used session
      if (this.gameSessions.size >= this.MAX_SESSIONS) {
        this.evictLRUSession();
      }

      const gameId = uuidv4();

      // First, save the game record to the database to satisfy foreign key constraints
      await this.saveGameToDatabase(gameId);

      // Create initial player with gameId
      const player = await this.playerService.createPlayer({
        name: 'Adventurer',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 1,
        experience: 0,
        gameId: gameId,
      });

      // Load or create initial game world
      await this.initializeGameWorld(gameId);

      // Create game session
      const session: GameSession = {
        gameId,
        playerId: player.id,
        createdAt: new Date(),
        lastActive: new Date(),
      };

      this.gameSessions.set(gameId, session);

      // Get initial game state
      let gameState = await this.gameStateService.getGameState(gameId);

      // Defensive null check - create initial state if null/undefined
      if (!gameState) {
        console.error(
          `[GameService] getGameState returned null for gameId: ${gameId}, creating new state`,
        );
        gameState = {
          gameId,
          rooms: {},
          npcs: {},
          items: {},
          metadata: {
            version: '2.1.0',
            initialized: false,
          },
        };
      }

      gameState.player = player;

      return { gameId, gameState };
    });
  }

  // Get existing game session
  async getGame(gameId: string): Promise<{ gameState: any } | null> {
    const session = this.gameSessions.get(gameId);
    if (!session) {
      return null;
    }

    // Update last active
    session.lastActive = new Date();

    // Get current game state
    let gameState = await this.gameStateService.getGameState(gameId);

    // Defensive null check - create initial state if null/undefined
    if (!gameState) {
      console.error(
        `[GameService] getGameState returned null for gameId: ${gameId}, creating new state`,
      );
      gameState = {
        gameId,
        rooms: {},
        npcs: {},
        items: {},
        metadata: {
          version: '2.1.0',
          initialized: false,
        },
      };
    }

    const player = this.playerService.getPlayer(session.playerId);
    gameState.player = player;

    return { gameState };
  }

  // Process a game command
  async processCommand(
    gameId: string,
    command: string,
  ): Promise<CommandResult> {
    const session = this.gameSessions.get(gameId);
    if (!session) {
      return {
        success: false,
        type: 'error',
        message: 'Game session not found',
      };
    }

    // Update last active
    session.lastActive = new Date();

    try {
      // Process the command
      const result = await this.commandProcessor.processCommand(
        command,
        session.playerId,
        gameId,
      );

      // Update game state if needed
      if (result.success) {
        await this.gameStateService.updateGameState(gameId, {
          lastCommand: command,
          lastCommandTime: new Date(),
        });
      }

      return result;
    } catch (error) {
      return {
        success: false,
        type: 'error',
        message: `Command processing error: ${error.message}`,
      };
    }
  }

  // Get player inventory
  async getInventory(
    gameId: string,
  ): Promise<{ success: boolean; items?: any[]; message?: string }> {
    const session = this.gameSessions.get(gameId);
    if (!session) {
      return { success: false, message: 'Game session not found' };
    }

    try {
      const player = this.playerService.getPlayer(session.playerId);
      if (!player) {
        return { success: false, message: 'Player not found' };
      }

      const inventory = this.playerService.getInventory(session.playerId);
      const items = inventory.map((item) => ({
        id: item.id,
        name: item.name,
        type: item.type,
        quantity: 1, // Could be enhanced with quantity tracking
      }));

      return { success: true, items };
    } catch (error) {
      return {
        success: false,
        message: `Failed to get inventory: ${error.message}`,
      };
    }
  }

  // Get current room map
  async getMap(
    gameId: string,
  ): Promise<{ success: boolean; map?: any; message?: string }> {
    const session = this.gameSessions.get(gameId);
    if (!session) {
      return { success: false, message: 'Game session not found' };
    }

    try {
      const player = this.playerService.getPlayer(session.playerId);
      if (!player) {
        return { success: false, message: 'Player not found' };
      }

      // Find player's current room
      const rooms = this.roomService.getAllRooms();
      const currentRoom = rooms.find((room) =>
        this.isPlayerInRoom(player, room),
      );

      if (!currentRoom) {
        return {
          success: true,
          map: {
            ascii: `
    ┌───────────────────┐
    │   UNKNOWN AREA    │
    │                   │
    │        [?]        │
    │                   │
    └───────────────────┘`,
          },
        };
      }

      // Generate simple ASCII map for current room
      const map = this.generateRoomMap(currentRoom, rooms);

      return { success: true, map };
    } catch (error) {
      return { success: false, message: `Failed to get map: ${error.message}` };
    }
  }

  // Save game state
  async saveGame(
    gameId: string,
    slotName: string = 'quicksave',
  ): Promise<{ success: boolean; message: string }> {
    const session = this.gameSessions.get(gameId);
    if (!session) {
      return { success: false, message: 'Game session not found' };
    }

    try {
      await this.gameStateService.saveGameState(gameId, slotName);
      return { success: true, message: `Game saved to slot: ${slotName}` };
    } catch (error) {
      return { success: false, message: `Save failed: ${error.message}` };
    }
  }

  // Load saved game state
  async loadGame(
    gameId: string,
    slotName: string = 'quicksave',
  ): Promise<{ success: boolean; gameState?: any; message: string }> {
    const session = this.gameSessions.get(gameId);
    if (!session) {
      return { success: false, message: 'Game session not found' };
    }

    try {
      const gameState = await this.gameStateService.loadGameState(
        gameId,
        slotName,
      );
      return {
        success: true,
        gameState,
        message: `Game loaded from slot: ${slotName}`,
      };
    } catch (error) {
      return { success: false, message: `Load failed: ${error.message}` };
    }
  }

  // Initialize the game world with default content
  private async initializeGameWorld(gameId: string): Promise<void> {
    // Create starting room
    const startingRoom = this.roomService.createRoom({
      name: 'Entry Hall',
      description:
        'A dimly lit entry hall with stone walls and flickering torches. The air is heavy with the scent of age and mystery.',
      position: { x: 0, y: 0, z: 0 },
      width: 10,
      height: 10,
      size: { width: 10, height: 10, depth: 3 },
      objects: [],
      players: [],
      gameId: gameId,
    });

    // Create some initial objects
    const torch = this.objectService.createObject({
      name: 'Flickering Torch',
      description: 'A torch mounted on the wall, casting dancing shadows.',
      objectType: 'furniture',
      position: { x: 1, y: 1, z: 1 },
      material: 'wood',
      canTake: false,
      gameId: gameId,
    });

    const key = this.objectService.createObject({
      name: 'Brass Key',
      description: 'An old brass key with intricate engravings.',
      objectType: 'item',
      position: { x: 5, y: 5, z: 0 },
      material: 'metal',
      canTake: true,
      gameId: gameId,
    });

    // Place objects in room
    this.roomService.addObjectToRoom(startingRoom.id, torch.id);
    this.roomService.addObjectToRoom(startingRoom.id, key.id);

    // Create adjacent rooms for movement with clear boundaries
    const northRoom = this.roomService.createRoom({
      name: 'Garden',
      description:
        'A peaceful garden with lush greenery and a small fountain in the center.',
      position: { x: 0, y: 15, z: 0 },
      width: 10,
      height: 10,
      size: { width: 10, height: 10, depth: 3 },
      objects: [],
      players: [],
      gameId: gameId,
    });

    const eastRoom = this.roomService.createRoom({
      name: 'Library',
      description:
        'A vast library filled with ancient books and scrolls reaching up to the vaulted ceiling.',
      position: { x: 15, y: 0, z: 0 },
      width: 10,
      height: 10,
      size: { width: 10, height: 10, depth: 3 },
      objects: [],
      players: [],
      gameId: gameId,
    });

    // Create some objects for the new rooms
    const book = this.objectService.createObject({
      name: 'Ancient Tome',
      description:
        'A leather-bound book with mysterious symbols etched on its cover.',
      objectType: 'item',
      position: { x: 2, y: 3, z: 0 },
      material: 'paper',
      canTake: true,
      gameId: gameId,
    });

    const flower = this.objectService.createObject({
      name: 'Glowing Flower',
      description: 'A beautiful flower that emits a soft, ethereal light.',
      objectType: 'item',
      position: { x: 5, y: 5, z: 0 },
      material: 'organic',
      canTake: true,
      gameId: gameId,
    });

    // Place objects in their respective rooms
    this.roomService.addObjectToRoom(eastRoom.id, book.id);
    this.roomService.addObjectToRoom(northRoom.id, flower.id);

    // Save initial state
    await this.gameStateService.updateGameState(gameId, {
      startingRoomId: startingRoom.id,
      initialized: true,
    });
  }

  // Helper method to check if player is in a room
  private isPlayerInRoom(player: any, room: any): boolean {
    return (
      player.position.x >= room.position.x &&
      player.position.x < room.position.x + room.size.width &&
      player.position.y >= room.position.y &&
      player.position.y < room.position.y + room.size.height &&
      player.position.z >= room.position.z &&
      player.position.z < room.position.z + room.size.depth
    );
  }

  // Generate simple ASCII map for a room
  private generateRoomMap(
    currentRoom: any,
    allRooms: any[],
  ): { ascii: string } {
    const roomName = currentRoom.name;
    const padding = Math.max(0, (17 - roomName.length) / 2);
    const paddedName =
      ' '.repeat(Math.floor(padding)) +
      roomName +
      ' '.repeat(Math.ceil(padding));

    return {
      ascii: `
    ┌───────────────────┐
    │${paddedName}│
    │                   │
    │        [X]        │
    │                   │
    └───────────────────┘`,
    };
  }

  /**
   * Clean up inactive sessions
   * RESOURCE LIMIT: Auto-cleanup sessions inactive > specified time (default 24 hours)
   */
  cleanupInactiveSessions(
    maxInactiveTime: number = this.SESSION_INACTIVE_TIMEOUT,
  ): number {
    const now = new Date();
    let cleaned = 0;

    for (const [gameId, session] of this.gameSessions.entries()) {
      if (now.getTime() - session.lastActive.getTime() > maxInactiveTime) {
        this.gameSessions.delete(gameId);
        cleaned++;
        this.logger.log(
          `Cleaned up inactive session ${gameId} (inactive for ${((now.getTime() - session.lastActive.getTime()) / 1000 / 60 / 60).toFixed(1)} hours)`,
        );
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} inactive sessions`);
    }

    return cleaned;
  }

  /**
   * Evict least recently used session when max sessions limit is reached
   * RESOURCE LIMIT: Part of max 10000 sessions enforcement
   */
  private evictLRUSession(): void {
    let oldestSession: { gameId: string; lastActive: Date } | null = null;

    // Find the least recently used session
    for (const [gameId, session] of this.gameSessions.entries()) {
      if (!oldestSession || session.lastActive < oldestSession.lastActive) {
        oldestSession = { gameId, lastActive: session.lastActive };
      }
    }

    // Evict the oldest session
    if (oldestSession) {
      this.gameSessions.delete(oldestSession.gameId);
      this.logger.warn(
        `Evicted LRU session ${oldestSession.gameId} to maintain max sessions limit of ${this.MAX_SESSIONS}`,
      );
    }
  }

  // Save game record to database to satisfy foreign key constraints
  private async saveGameToDatabase(gameId: string): Promise<void> {
    if (!this.databaseService) {
      throw new Error('Database service not available');
    }

    try {
      const insertGame = this.databaseService.prepare(`
        INSERT INTO games (id, name, description, version, created_at, updated_at, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const now = new Date().toISOString();
      insertGame.run(
        gameId,
        'The Quest Weaver Adventure',
        'A text-based adventure game created by The Quest Weaver',
        1,
        now,
        now,
        1, // SQLite uses 1 for true, 0 for false
      );

      // Save version history
      this.databaseService.saveVersion(
        'game',
        gameId,
        {
          id: gameId,
          name: 'The Quest Weaver Adventure',
          description:
            'A text-based adventure game created by The Quest Weaver',
          version: 1,
          created_at: now,
          updated_at: now,
          is_active: 1,
        },
        'game_service',
        'Game created',
      );
    } catch (error) {
      throw new Error(
        `Failed to save game ${gameId} to database: ${error.message}`,
      );
    }
  }
}
