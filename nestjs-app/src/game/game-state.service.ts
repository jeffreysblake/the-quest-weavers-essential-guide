import { Injectable } from '@nestjs/common';

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
}

@Injectable()
export class GameStateService {
  private gameStates = new Map<string, GameState>();
  private saveSlots = new Map<string, Map<string, GameState>>();

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
  async saveGameState(gameId: string, slotName: string): Promise<void> {
    const currentState = await this.getGameState(gameId);

    if (!this.saveSlots.has(gameId)) {
      this.saveSlots.set(gameId, new Map());
    }

    const gameSlots = this.saveSlots.get(gameId)!;

    // Create a deep copy of the current state for the save
    const savedState: GameState = JSON.parse(JSON.stringify(currentState));
    savedState.metadata = {
      ...savedState.metadata,
      savedAt: new Date(),
      slotName,
    };

    gameSlots.set(slotName, savedState);
  }

  // Load game state from a specific slot
  async loadGameState(gameId: string, slotName: string): Promise<GameState> {
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

    return restoredState;
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
