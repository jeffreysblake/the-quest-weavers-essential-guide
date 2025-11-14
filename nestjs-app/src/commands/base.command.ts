import { ICommand } from './command.interfaces';
import { v4 as uuidv4 } from 'uuid';

/**
 * Abstract base command implementation
 * Provides common functionality for all commands
 */
export abstract class BaseCommand<T = any> implements ICommand<T> {
  public readonly id: string;
  public readonly timestamp: string;
  protected executed: boolean = false;
  protected undone: boolean = false;
  protected result: T | undefined;

  constructor(
    public readonly type: string,
    public readonly gameId?: string,
    public readonly metadata?: Record<string, any>,
  ) {
    this.id = uuidv4();
    this.timestamp = new Date().toISOString();
  }

  /**
   * Execute the command
   * Implements template method pattern
   */
  async execute(): Promise<T> {
    if (this.executed && !this.undone) {
      throw new Error(`Command ${this.id} has already been executed`);
    }

    try {
      this.result = await this.doExecute();
      this.executed = true;
      this.undone = false;
      return this.result;
    } catch (error) {
      throw new Error(`Failed to execute command ${this.id}: ${error.message}`);
    }
  }

  /**
   * Undo the command
   */
  async undo(): Promise<void> {
    if (!this.executed) {
      throw new Error(`Cannot undo command ${this.id}: not executed`);
    }

    if (this.undone) {
      throw new Error(`Command ${this.id} has already been undone`);
    }

    if (!this.canUndo()) {
      throw new Error(`Command ${this.id} cannot be undone`);
    }

    try {
      await this.doUndo();
      this.undone = true;
    } catch (error) {
      throw new Error(`Failed to undo command ${this.id}: ${error.message}`);
    }
  }

  /**
   * Redo the command (re-execute after undo)
   */
  async redo(): Promise<T> {
    if (!this.undone) {
      throw new Error(`Cannot redo command ${this.id}: not undone`);
    }

    return await this.execute();
  }

  /**
   * Check if command can be undone
   * Override this in subclasses for specific logic
   */
  canUndo(): boolean {
    return this.executed && !this.undone;
  }

  /**
   * Get command description
   * Override this in subclasses
   */
  abstract getDescription(): string;

  /**
   * Execute implementation (to be implemented by subclasses)
   */
  protected abstract doExecute(): Promise<T>;

  /**
   * Undo implementation (to be implemented by subclasses)
   */
  protected abstract doUndo(): Promise<void>;

  /**
   * Get the result of the last execution
   */
  getResult(): T | undefined {
    return this.result;
  }

  /**
   * Check if command has been executed
   */
  isExecuted(): boolean {
    return this.executed && !this.undone;
  }

  /**
   * Check if command has been undone
   */
  isUndone(): boolean {
    return this.undone;
  }
}
