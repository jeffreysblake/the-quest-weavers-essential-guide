import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { EventEmitterService } from '../events/event-emitter.service';
import { GameEventType } from '../events/event.interfaces';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Player save state
 */
export interface IPlayerSaveState {
  saveId: string;
  gameId: string;
  playerId: string;
  slotNumber: number;
  saveName: string;
  currentRoomId: string;
  inventory: string[]; // Object IDs
  stats: Record<string, number>; // health, mana, level, etc.
  flags: Record<string, boolean>; // Quest flags, achievements, etc.
  variables: Record<string, any>; // Custom game variables
  questStates: Record<string, string>; // Quest ID -> state
  worldState: Record<string, any>; // Door states, NPC states, etc.
  playTime: number; // Seconds
  createdAt: string;
  updatedAt: string;
}

/**
 * Save slot info
 */
export interface ISaveSlot {
  slotNumber: number;
  isEmpty: boolean;
  saveState?: IPlayerSaveState;
}

/**
 * Player state service
 * Manages player progress saves (different from game design checkpoints)
 */
@Injectable()
export class PlayerStateService {
  private readonly logger = new Logger(PlayerStateService.name);
  private readonly maxSaveSlots = 10;
  private readonly savesDirectory: string;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly eventEmitter: EventEmitterService,
  ) {
    this.savesDirectory = path.join(process.cwd(), 'saves');
    this.ensureSavesDirectory();
  }

  /**
   * Ensure saves directory exists
   */
  private ensureSavesDirectory(): void {
    if (!fs.existsSync(this.savesDirectory)) {
      fs.mkdirSync(this.savesDirectory, { recursive: true });
      this.logger.log(`Created saves directory: ${this.savesDirectory}`);
    }
  }

  /**
   * Save player state to a slot
   */
  async saveState(
    gameId: string,
    playerId: string,
    slotNumber: number,
    saveName: string,
    state: Partial<IPlayerSaveState>,
  ): Promise<IPlayerSaveState> {
    if (slotNumber < 1 || slotNumber > this.maxSaveSlots) {
      throw new Error(
        `Invalid save slot: ${slotNumber}. Must be 1-${this.maxSaveSlots}`,
      );
    }

    const now = new Date().toISOString();
    const saveId = `${gameId}-${playerId}-slot${slotNumber}`;

    const saveState: IPlayerSaveState = {
      saveId,
      gameId,
      playerId,
      slotNumber,
      saveName,
      currentRoomId: state.currentRoomId || '',
      inventory: state.inventory || [],
      stats: state.stats || {},
      flags: state.flags || {},
      variables: state.variables || {},
      questStates: state.questStates || {},
      worldState: state.worldState || {},
      playTime: state.playTime || 0,
      createdAt: state.createdAt || now,
      updatedAt: now,
    };

    try {
      // Save to database
      this.databaseService.transaction((db) => {
        const stmt = db.prepare(`
          INSERT OR REPLACE INTO player_saves (
            save_id, game_id, player_id, slot_number, save_name,
            current_room_id, inventory, stats, flags, variables,
            quest_states, world_state, play_time, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          saveState.saveId,
          saveState.gameId,
          saveState.playerId,
          saveState.slotNumber,
          saveState.saveName,
          saveState.currentRoomId,
          JSON.stringify(saveState.inventory),
          JSON.stringify(saveState.stats),
          JSON.stringify(saveState.flags),
          JSON.stringify(saveState.variables),
          JSON.stringify(saveState.questStates),
          JSON.stringify(saveState.worldState),
          saveState.playTime,
          saveState.createdAt,
          saveState.updatedAt,
        );
      });

      // Also save to file for backup
      await this.saveToFile(saveState);

      // Emit event
      await this.eventEmitter.emit(
        GameEventType.CUSTOM_EVENT,
        {
          action: 'player_state_saved',
          saveId: saveState.saveId,
          slotNumber,
          saveName,
        },
        gameId,
      );

      this.logger.log(
        `Saved player state: ${playerId} in slot ${slotNumber}`,
      );

      return saveState;
    } catch (error) {
      this.logger.error(`Failed to save player state: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load player state from a slot
   */
  async loadState(
    gameId: string,
    playerId: string,
    slotNumber: number,
  ): Promise<IPlayerSaveState | null> {
    try {
      const saveId = `${gameId}-${playerId}-slot${slotNumber}`;

      const row = this.databaseService
        .prepare('SELECT * FROM player_saves WHERE save_id = ?')
        .get(saveId) as any;

      if (!row) {
        this.logger.warn(`No save found in slot ${slotNumber}`);
        return null;
      }

      const saveState: IPlayerSaveState = {
        saveId: row.save_id,
        gameId: row.game_id,
        playerId: row.player_id,
        slotNumber: row.slot_number,
        saveName: row.save_name,
        currentRoomId: row.current_room_id,
        inventory: JSON.parse(row.inventory || '[]'),
        stats: JSON.parse(row.stats || '{}'),
        flags: JSON.parse(row.flags || '{}'),
        variables: JSON.parse(row.variables || '{}'),
        questStates: JSON.parse(row.quest_states || '{}'),
        worldState: JSON.parse(row.world_state || '{}'),
        playTime: row.play_time,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };

      // Emit event
      await this.eventEmitter.emit(
        GameEventType.CUSTOM_EVENT,
        {
          action: 'player_state_loaded',
          saveId: saveState.saveId,
          slotNumber,
        },
        gameId,
      );

      this.logger.log(`Loaded player state from slot ${slotNumber}`);

      return saveState;
    } catch (error) {
      this.logger.error(`Failed to load player state: ${error.message}`);
      // Try loading from file backup
      return await this.loadFromFile(gameId, playerId, slotNumber);
    }
  }

  /**
   * Get all save slots for a player
   */
  async getSaveSlots(
    gameId: string,
    playerId: string,
  ): Promise<ISaveSlot[]> {
    const slots: ISaveSlot[] = [];

    for (let i = 1; i <= this.maxSaveSlots; i++) {
      const save = await this.loadState(gameId, playerId, i);
      slots.push({
        slotNumber: i,
        isEmpty: save === null,
        saveState: save || undefined,
      });
    }

    return slots;
  }

  /**
   * Delete a save
   */
  async deleteSave(
    gameId: string,
    playerId: string,
    slotNumber: number,
  ): Promise<void> {
    const saveId = `${gameId}-${playerId}-slot${slotNumber}`;

    try {
      this.databaseService
        .prepare('DELETE FROM player_saves WHERE save_id = ?')
        .run(saveId);

      // Delete file backup
      const filePath = this.getSaveFilePath(gameId, playerId, slotNumber);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      this.logger.log(`Deleted save in slot ${slotNumber}`);
    } catch (error) {
      this.logger.error(`Failed to delete save: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create quick save (slot 0)
   */
  async quickSave(
    gameId: string,
    playerId: string,
    state: Partial<IPlayerSaveState>,
  ): Promise<IPlayerSaveState> {
    return await this.saveState(
      gameId,
      playerId,
      0, // Quick save slot
      'Quick Save',
      state,
    );
  }

  /**
   * Load quick save
   */
  async quickLoad(
    gameId: string,
    playerId: string,
  ): Promise<IPlayerSaveState | null> {
    return await this.loadState(gameId, playerId, 0);
  }

  /**
   * Auto-save (slot -1, special slot)
   */
  async autoSave(
    gameId: string,
    playerId: string,
    state: Partial<IPlayerSaveState>,
  ): Promise<IPlayerSaveState> {
    return await this.saveState(
      gameId,
      playerId,
      -1, // Auto-save slot
      'Auto Save',
      state,
    );
  }

  /**
   * Save to file backup
   */
  private async saveToFile(saveState: IPlayerSaveState): Promise<void> {
    const filePath = this.getSaveFilePath(
      saveState.gameId,
      saveState.playerId,
      saveState.slotNumber,
    );

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, JSON.stringify(saveState, null, 2));
  }

  /**
   * Load from file backup
   */
  private async loadFromFile(
    gameId: string,
    playerId: string,
    slotNumber: number,
  ): Promise<IPlayerSaveState | null> {
    const filePath = this.getSaveFilePath(gameId, playerId, slotNumber);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      this.logger.error(`Failed to load from file: ${error.message}`);
      return null;
    }
  }

  /**
   * Get save file path
   */
  private getSaveFilePath(
    gameId: string,
    playerId: string,
    slotNumber: number,
  ): string {
    return path.join(
      this.savesDirectory,
      gameId,
      playerId,
      `save-${slotNumber}.json`,
    );
  }

  /**
   * Export save to JSON file
   */
  async exportSave(
    gameId: string,
    playerId: string,
    slotNumber: number,
    outputPath: string,
  ): Promise<void> {
    const save = await this.loadState(gameId, playerId, slotNumber);
    if (!save) {
      throw new Error(`No save found in slot ${slotNumber}`);
    }

    fs.writeFileSync(outputPath, JSON.stringify(save, null, 2));
    this.logger.log(`Exported save to: ${outputPath}`);
  }

  /**
   * Import save from JSON file
   */
  async importSave(
    filePath: string,
    targetSlot: number,
  ): Promise<IPlayerSaveState> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const save = JSON.parse(content) as IPlayerSaveState;

    return await this.saveState(
      save.gameId,
      save.playerId,
      targetSlot,
      save.saveName,
      save,
    );
  }
}
