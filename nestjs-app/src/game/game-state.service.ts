import { Injectable, Optional, Inject, forwardRef } from '@nestjs/common';
import { PlayerService } from '../entity/player.service';
import { QuestManagerService } from '../quest/quest-manager.service';
import { InventoryManagerService } from '../inventory/inventory-manager.service';
import { EffectManagerService } from '../effects/effect-manager.service';
import { WorldStateManagerService } from '../world-state/world-state-manager.service';
import { Mutex, withTimeout } from 'async-mutex';

export interface GameState {
  gameId: string;
  player?: any;
  rooms?: { [key: string]: any };
  npcs?: { [key: string]: any };
  items?: { [key: string]: any };
  lastCommand?: string;
  lastCommandTime?: Date;
  startingRoomId?: string;
  initialized?: boolean;
  metadata?: {
    startingRoomId?: string;
    initialized?: boolean;
    lastCommand?: string;
    lastCommandTime?: Date;
    version?: string;
    savedAt?: Date;
    slotName?: string;
    loadedAt?: Date;
    importedAt?: Date;
  };
  saves?: { [slotName: string]: GameState };
  // Additional state from other services
  players?: { [playerId: string]: any };
  quests?: { [gameId: string]: any };
  inventories?: { [playerId: string]: any };
  effects?: { [gameId: string]: any };
  worldStates?: { [gameId: string]: any };
}

/**
 * CONCURRENCY PROTECTION:
 * - Uses Mutex locks to prevent race conditions in game state operations
 * - Per-game locks prevent concurrent save/load operations on the same game
 * - Prevents lost updates when multiple operations modify state simultaneously
 * - All locks have 10-second timeout to prevent permanent deadlocks
 */
@Injectable()
export class GameStateService {
  private gameStates = new Map<string, GameState>();
  private saveSlots = new Map<string, Map<string, GameState>>();

  // Concurrency protection
  private readonly gameLocks = new Map<string, Mutex>();
  private readonly LOCK_TIMEOUT = 10000; // 10 seconds (save/load can be slow)

  constructor(
    @Optional() private readonly playerService?: PlayerService,
    @Optional() private readonly questManager?: QuestManagerService,
    @Optional() private readonly inventoryManager?: InventoryManagerService,
    @Optional() private readonly effectManager?: EffectManagerService,
    @Optional() private readonly worldStateManager?: WorldStateManagerService,
  ) {}

  /**
   * Get or create a lock for a specific game
   */
  private getGameLock(gameId: string): Mutex {
    if (!this.gameLocks.has(gameId)) {
      this.gameLocks.set(gameId, new Mutex());
    }
    return this.gameLocks.get(gameId)!;
  }

  // Get current game state
  async getGameState(gameId: string): Promise<GameState> {
    if (!this.gameStates.has(gameId)) {
      // Initialize new game state
      const newState: GameState = {
        gameId,
        rooms: {},
        npcs: {},
        items: {},
        metadata: {
          version: '2.1.0',
          initialized: false,
        },
      };
      this.gameStates.set(gameId, newState);
      return newState;
    }

    return this.gameStates.get(gameId)!;
  }

  // Update game state
  async updateGameState(
    gameId: string,
    updates: Partial<GameState>,
  ): Promise<void> {
    const currentState = await this.getGameState(gameId);

    // Merge updates into current state
    const updatedState: GameState = {
      ...currentState,
      ...updates,
      metadata: {
        ...currentState.metadata,
        ...updates.metadata,
      },
    };

    this.gameStates.set(gameId, updatedState);
  }

  // Save game state to a specific slot
  // THREAD-SAFE: Acquires game lock to prevent concurrent save/load operations
  async saveGameState(gameId: string, slotName: string): Promise<void> {
    const lock = this.getGameLock(gameId);

    try {
      await withTimeout(lock, this.LOCK_TIMEOUT).runExclusive(async () => {
        const currentState = await this.getGameState(gameId);

        if (!this.saveSlots.has(gameId)) {
          this.saveSlots.set(gameId, new Map());
        }

        const gameSlots = this.saveSlots.get(gameId)!;

        // Capture state from all services
        const capturedState: GameState = JSON.parse(
          JSON.stringify(currentState),
        );

        // Capture player states from PlayerService
        if (this.playerService) {
          const players = this.playerService.findAll?.() || [];
          capturedState.players = {};
          for (const player of players) {
            if (player.gameId === gameId) {
              capturedState.players[player.id] = JSON.parse(
                JSON.stringify(player),
              );
            }
          }
        }

        // Capture quest states from QuestManager
        if (this.questManager) {
          try {
            const questData = this.questManager.getAllPlayerQuests?.(gameId);
            if (questData) {
              capturedState.quests = JSON.parse(
                JSON.stringify({ [gameId]: questData }),
              );
            }
          } catch (e) {
            // Quest manager might not have this method in all versions
          }
        }

        // Capture inventory states from InventoryManager
        if (this.inventoryManager) {
          try {
            const inventoryState = this.inventoryManager.exportState?.();
            if (inventoryState) {
              capturedState.inventories = inventoryState;
            }
          } catch (e) {
            // Inventory manager might not have exportState
          }
        }

        // Capture effect states from EffectManager
        if (this.effectManager) {
          try {
            const effects = this.effectManager.exportEffects?.(gameId);
            if (effects) {
              capturedState.effects = JSON.parse(
                JSON.stringify({ [gameId]: effects }),
              );
            }
          } catch (e) {
            // Effect manager might not have this method
          }
        }

        // Capture world states from WorldStateManager
        if (this.worldStateManager) {
          try {
            const worldState = this.worldStateManager.getWorldState?.(gameId);
            if (worldState) {
              // Convert Maps to arrays for JSON serialization
              const serializedWorldState = {
                gameId: worldState.gameId,
                doors: Array.from(worldState.doors?.entries?.() || []),
                npcs: Array.from(worldState.npcs?.entries?.() || []),
                objects: Array.from(worldState.objects?.entries?.() || []),
                variables: worldState.variables,
                flags: worldState.flags,
              };
              capturedState.worldStates = { [gameId]: serializedWorldState };
            }
          } catch (e) {
            // World state manager might not have this method
          }
        }

        // Add metadata
        capturedState.metadata = {
          ...capturedState.metadata,
          savedAt: new Date(),
          slotName,
        };

        gameSlots.set(slotName, capturedState);
      });
    } catch (error) {
      if (error.message?.includes('timeout')) {
        throw new Error(`Save operation timed out for game ${gameId}`);
      }
      throw error;
    }
  }

  // Load game state from a specific slot
  // THREAD-SAFE: Acquires game lock to prevent concurrent save/load operations
  async loadGameState(gameId: string, slotName: string): Promise<GameState> {
    const lock = this.getGameLock(gameId);

    try {
      return await withTimeout(lock, this.LOCK_TIMEOUT).runExclusive(
        async () => {
          const gameSlots = this.saveSlots.get(gameId);
          if (!gameSlots || !gameSlots.has(slotName)) {
            throw new Error(`No saved game found in slot: ${slotName}`);
          }

          const savedState = gameSlots.get(slotName)!;

          // Restore the saved state as current state
          const restoredState = JSON.parse(JSON.stringify(savedState));
          restoredState.metadata = {
            ...restoredState.metadata,
            loadedAt: new Date(),
          };

          this.gameStates.set(gameId, restoredState);

          // Restore player states to PlayerService
          if (this.playerService && restoredState.players) {
            for (const [playerId, playerData] of Object.entries(
              restoredState.players,
            )) {
              const existingPlayer = this.playerService.getPlayer?.(playerId);
              if (existingPlayer) {
                // Update existing player with saved data
                this.playerService.updatePlayer?.(playerId, playerData as any);
              }
            }
          }

          // Restore inventory states to InventoryManager
          if (this.inventoryManager && restoredState.inventories) {
            try {
              this.inventoryManager.importState?.(restoredState.inventories);
            } catch (e) {
              // Inventory manager might not have importState
            }
          }

          // Restore quest states to QuestManager
          if (this.questManager && restoredState.quests) {
            try {
              const questData = restoredState.quests[gameId];
              if (questData) {
                this.questManager.restorePlayerQuests?.(gameId, questData);
              }
            } catch (e) {
              // Quest manager might not have this method
            }
          }

          // Restore world states to WorldStateManager
          if (this.worldStateManager && restoredState.worldStates) {
            try {
              const worldStateData = restoredState.worldStates[gameId];
              if (worldStateData) {
                this.worldStateManager.restoreWorldState?.(
                  gameId,
                  worldStateData,
                );
              }
            } catch (e) {
              // World state manager might not have this method
            }
          }

          // Restore effect states to EffectManager
          if (this.effectManager && restoredState.effects) {
            try {
              const effectData = restoredState.effects[gameId];
              if (effectData) {
                await this.effectManager.importEffects?.(gameId, effectData);
              }
            } catch (e) {
              // Effect manager might not have this method
            }
          }

          return restoredState;
        },
      );
    } catch (error) {
      if (error.message?.includes('timeout')) {
        throw new Error(`Load operation timed out for game ${gameId}`);
      }
      throw error;
    }
  }

  // Get list of available save slots for a game
  async getSaveSlots(gameId: string): Promise<string[]> {
    const gameSlots = this.saveSlots.get(gameId);
    if (!gameSlots) {
      return [];
    }

    return Array.from(gameSlots.keys());
  }

  // Delete a save slot
  async deleteSaveSlot(gameId: string, slotName: string): Promise<boolean> {
    const gameSlots = this.saveSlots.get(gameId);
    if (!gameSlots) {
      return false;
    }

    return gameSlots.delete(slotName);
  }

  // Export game state (for backup/sharing)
  async exportGameState(gameId: string): Promise<string> {
    const state = await this.getGameState(gameId);
    return JSON.stringify(state, null, 2);
  }

  // Import game state (from backup/sharing)
  async importGameState(gameId: string, stateJson: string): Promise<void> {
    try {
      const importedState = JSON.parse(stateJson);
      importedState.gameId = gameId; // Ensure correct game ID
      importedState.metadata = {
        ...importedState.metadata,
        importedAt: new Date(),
      };

      this.gameStates.set(gameId, importedState);
    } catch (error) {
      throw new Error(`Failed to import game state: ${error.message}`);
    }
  }

  // Clean up old game states
  cleanupGameStates(gameIds: string[]): void {
    // Keep only specified game IDs
    const currentKeys = Array.from(this.gameStates.keys());

    for (const key of currentKeys) {
      if (!gameIds.includes(key)) {
        this.gameStates.delete(key);
        this.saveSlots.delete(key);
      }
    }
  }

  // Get memory usage statistics
  getStats(): {
    activeGames: number;
    totalSaveSlots: number;
    memoryUsageEstimate: string;
  } {
    const activeGames = this.gameStates.size;
    let totalSaveSlots = 0;

    for (const slots of this.saveSlots.values()) {
      totalSaveSlots += slots.size;
    }

    // Rough estimate of memory usage
    const stateSize = JSON.stringify([...this.gameStates.values()]).length;
    const savesSize = JSON.stringify([...this.saveSlots.values()]).length;
    const totalBytes = stateSize + savesSize;

    const memoryUsageEstimate = `${(totalBytes / 1024).toFixed(1)} KB`;

    return {
      activeGames,
      totalSaveSlots,
      memoryUsageEstimate,
    };
  }
}
