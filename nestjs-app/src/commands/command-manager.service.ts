import { Injectable, Logger } from '@nestjs/common';
import {
  ICommand,
  ICommandResult,
  ICommandHistoryEntry,
} from './command.interfaces';
import { EventEmitterService } from '../events/event-emitter.service';
import { GameEventType } from '../events/event.interfaces';

@Injectable()
export class CommandManagerService {
  private readonly logger = new Logger(CommandManagerService.name);
  private commandHistory: Map<string, ICommandHistoryEntry[]> = new Map();
  private undoStacks: Map<string, ICommand[]> = new Map();
  private redoStacks: Map<string, ICommand[]> = new Map();
  private maxHistorySize = 1000;
  private maxUndoStackSize = 100;

  constructor(private readonly eventEmitter: EventEmitterService) {}

  /**
   * Execute a command
   */
  async execute<T = any>(command: ICommand<T>): Promise<ICommandResult<T>> {
    this.logger.debug(`Executing command: ${command.type} (${command.id})`);

    const gameId = command.gameId || 'global';

    try {
      const result = await command.execute();

      // Add to history
      this.addToHistory(gameId, {
        command,
        executedAt: new Date().toISOString(),
        status: 'executed',
      });

      // Add to undo stack if command can be undone
      if (command.canUndo()) {
        this.pushToUndoStack(gameId, command);
        // Clear redo stack since we executed a new command
        this.clearRedoStack(gameId);
      }

      // Emit event
      await this.eventEmitter.emit(
        GameEventType.CUSTOM_EVENT,
        {
          action: 'command_executed',
          commandType: command.type,
          commandId: command.id,
        },
        command.gameId,
      );

      this.logger.debug(`Command executed successfully: ${command.id}`);

      return {
        success: true,
        data: result,
        commandId: command.id,
      };
    } catch (error) {
      this.logger.error(`Command execution failed: ${error.message}`);

      // Add failure to history
      this.addToHistory(gameId, {
        command,
        executedAt: new Date().toISOString(),
        status: 'failed',
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
        commandId: command.id,
      };
    }
  }

  /**
   * Undo the last command for a game
   */
  async undo(gameId: string = 'global'): Promise<ICommandResult> {
    const command = this.popFromUndoStack(gameId);

    if (!command) {
      return {
        success: false,
        error: 'No commands to undo',
        commandId: '',
      };
    }

    this.logger.debug(`Undoing command: ${command.type} (${command.id})`);

    try {
      await command.undo();

      // Update history
      const history = this.getHistory(gameId);
      const entry = history.find((h) => h.command.id === command.id);
      if (entry) {
        entry.status = 'undone';
        entry.undoneAt = new Date().toISOString();
      }

      // Add to redo stack
      this.pushToRedoStack(gameId, command);

      // Emit event
      await this.eventEmitter.emit(
        GameEventType.CUSTOM_EVENT,
        {
          action: 'command_undone',
          commandType: command.type,
          commandId: command.id,
        },
        command.gameId,
      );

      this.logger.debug(`Command undone successfully: ${command.id}`);

      return {
        success: true,
        commandId: command.id,
      };
    } catch (error) {
      this.logger.error(`Undo failed: ${error.message}`);

      // Push back to undo stack on failure
      this.pushToUndoStack(gameId, command);

      return {
        success: false,
        error: error.message,
        commandId: command.id,
      };
    }
  }

  /**
   * Redo the last undone command for a game
   */
  async redo(gameId: string = 'global'): Promise<ICommandResult> {
    const command = this.popFromRedoStack(gameId);

    if (!command) {
      return {
        success: false,
        error: 'No commands to redo',
        commandId: '',
      };
    }

    this.logger.debug(`Redoing command: ${command.type} (${command.id})`);

    try {
      const result = await command.redo();

      // Update history
      const history = this.getHistory(gameId);
      const entry = history.find((h) => h.command.id === command.id);
      if (entry) {
        entry.status = 'executed';
        entry.undoneAt = undefined;
      }

      // Add back to undo stack
      this.pushToUndoStack(gameId, command);

      // Emit event
      await this.eventEmitter.emit(
        GameEventType.CUSTOM_EVENT,
        {
          action: 'command_redone',
          commandType: command.type,
          commandId: command.id,
        },
        command.gameId,
      );

      this.logger.debug(`Command redone successfully: ${command.id}`);

      return {
        success: true,
        data: result,
        commandId: command.id,
      };
    } catch (error) {
      this.logger.error(`Redo failed: ${error.message}`);

      // Push back to redo stack on failure
      this.pushToRedoStack(gameId, command);

      return {
        success: false,
        error: error.message,
        commandId: command.id,
      };
    }
  }

  /**
   * Check if undo is available for a game
   */
  canUndo(gameId: string = 'global'): boolean {
    const stack = this.undoStacks.get(gameId) || [];
    return stack.length > 0;
  }

  /**
   * Check if redo is available for a game
   */
  canRedo(gameId: string = 'global'): boolean {
    const stack = this.redoStacks.get(gameId) || [];
    return stack.length > 0;
  }

  /**
   * Get command history for a game
   */
  getHistory(gameId: string = 'global'): ICommandHistoryEntry[] {
    return this.commandHistory.get(gameId) || [];
  }

  /**
   * Clear command history for a game
   */
  clearHistory(gameId: string = 'global'): void {
    this.commandHistory.delete(gameId);
    this.undoStacks.delete(gameId);
    this.redoStacks.delete(gameId);
    this.logger.log(`Cleared command history for game: ${gameId}`);
  }

  /**
   * Get undo stack size for a game
   */
  getUndoStackSize(gameId: string = 'global'): number {
    return (this.undoStacks.get(gameId) || []).length;
  }

  /**
   * Get redo stack size for a game
   */
  getRedoStackSize(gameId: string = 'global'): number {
    return (this.redoStacks.get(gameId) || []).length;
  }

  /**
   * Add command to history
   */
  private addToHistory(gameId: string, entry: ICommandHistoryEntry): void {
    if (!this.commandHistory.has(gameId)) {
      this.commandHistory.set(gameId, []);
    }

    const history = this.commandHistory.get(gameId)!;
    history.push(entry);

    // Trim history if it exceeds max size
    if (history.length > this.maxHistorySize) {
      history.splice(0, history.length - this.maxHistorySize);
    }
  }

  /**
   * Push command to undo stack
   */
  private pushToUndoStack(gameId: string, command: ICommand): void {
    if (!this.undoStacks.has(gameId)) {
      this.undoStacks.set(gameId, []);
    }

    const stack = this.undoStacks.get(gameId)!;
    stack.push(command);

    // Trim stack if it exceeds max size
    if (stack.length > this.maxUndoStackSize) {
      stack.shift();
    }
  }

  /**
   * Pop command from undo stack
   */
  private popFromUndoStack(gameId: string): ICommand | undefined {
    const stack = this.undoStacks.get(gameId);
    return stack?.pop();
  }

  /**
   * Push command to redo stack
   */
  private pushToRedoStack(gameId: string, command: ICommand): void {
    if (!this.redoStacks.has(gameId)) {
      this.redoStacks.set(gameId, []);
    }

    const stack = this.redoStacks.get(gameId)!;
    stack.push(command);

    // Trim stack if it exceeds max size
    if (stack.length > this.maxUndoStackSize) {
      stack.shift();
    }
  }

  /**
   * Pop command from redo stack
   */
  private popFromRedoStack(gameId: string): ICommand | undefined {
    const stack = this.redoStacks.get(gameId);
    return stack?.pop();
  }

  /**
   * Clear redo stack (called when new command is executed)
   */
  private clearRedoStack(gameId: string): void {
    this.redoStacks.delete(gameId);
  }

  /**
   * Execute multiple commands in sequence
   */
  async executeAll<T = any>(
    commands: ICommand<T>[],
  ): Promise<ICommandResult<T>[]> {
    const results: ICommandResult<T>[] = [];

    for (const command of commands) {
      const result = await this.execute(command);
      results.push(result);

      // Stop on first failure
      if (!result.success) {
        break;
      }
    }

    return results;
  }
}
