/**
 * Base command interface
 * Implements the Command Pattern for undo/redo functionality
 */
export interface ICommand<T = any> {
  /**
   * Unique command ID
   */
  id: string;

  /**
   * Command type/name
   */
  type: string;

  /**
   * Game ID this command applies to
   */
  gameId?: string;

  /**
   * Command metadata
   */
  metadata?: Record<string, any>;

  /**
   * Timestamp when command was created
   */
  timestamp: string;

  /**
   * Execute the command
   */
  execute(): Promise<T>;

  /**
   * Undo the command (reverse the action)
   */
  undo(): Promise<void>;

  /**
   * Redo the command (re-execute after undo)
   */
  redo(): Promise<T>;

  /**
   * Check if command can be undone
   */
  canUndo(): boolean;

  /**
   * Get description of the command
   */
  getDescription(): string;
}

/**
 * Command execution result
 */
export interface ICommandResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  commandId: string;
}

/**
 * Command history entry
 */
export interface ICommandHistoryEntry {
  command: ICommand;
  executedAt: string;
  undoneAt?: string;
  status: 'executed' | 'undone' | 'failed';
  error?: string;
}

/**
 * Command types enumeration
 */
export enum CommandType {
  // Entity commands
  CREATE_ENTITY = 'create_entity',
  UPDATE_ENTITY = 'update_entity',
  DELETE_ENTITY = 'delete_entity',

  // Room commands
  CREATE_ROOM = 'create_room',
  UPDATE_ROOM = 'update_room',
  DELETE_ROOM = 'delete_room',
  CONNECT_ROOMS = 'connect_rooms',
  DISCONNECT_ROOMS = 'disconnect_rooms',

  // Object commands
  CREATE_OBJECT = 'create_object',
  UPDATE_OBJECT = 'update_object',
  DELETE_OBJECT = 'delete_object',
  MOVE_OBJECT = 'move_object',

  // NPC commands
  CREATE_NPC = 'create_npc',
  UPDATE_NPC = 'update_npc',
  DELETE_NPC = 'delete_npc',
  MOVE_NPC = 'move_npc',

  // Player commands
  CREATE_PLAYER = 'create_player',
  MOVE_PLAYER = 'move_player',
  PICKUP_ITEM = 'pickup_item',
  DROP_ITEM = 'drop_item',
  USE_ITEM = 'use_item',

  // Game commands
  SAVE_GAME = 'save_game',
  LOAD_GAME = 'load_game',
  EXPORT_GAME = 'export_game',

  // Batch commands
  BATCH = 'batch',
  COMPOSITE = 'composite',

  // Custom
  CUSTOM = 'custom',
}

/**
 * Command context for dependency injection
 */
export interface ICommandContext {
  gameId?: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}
