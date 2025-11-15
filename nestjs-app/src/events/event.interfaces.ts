/**
 * Game event types enumeration
 */
export enum GameEventType {
  // Game lifecycle events
  GAME_CREATED = 'game.created',
  GAME_LOADED = 'game.loaded',
  GAME_SAVED = 'game.saved',
  GAME_DELETED = 'game.deleted',
  GAME_EXPORTED = 'game.exported',

  // Entity lifecycle events
  ENTITY_CREATED = 'entity.created',
  ENTITY_UPDATED = 'entity.updated',
  ENTITY_DELETED = 'entity.deleted',

  // Room events
  ROOM_CREATED = 'room.created',
  ROOM_UPDATED = 'room.updated',
  ROOM_DELETED = 'room.deleted',
  ROOM_ENTERED = 'room.entered',
  ROOM_EXITED = 'room.exited',

  // Object events
  OBJECT_CREATED = 'object.created',
  OBJECT_UPDATED = 'object.updated',
  OBJECT_DELETED = 'object.deleted',
  OBJECT_PICKED_UP = 'object.picked_up',
  OBJECT_DROPPED = 'object.dropped',
  OBJECT_USED = 'object.used',

  // NPC events
  NPC_CREATED = 'npc.created',
  NPC_UPDATED = 'npc.updated',
  NPC_DELETED = 'npc.deleted',
  NPC_DIALOGUE_STARTED = 'npc.dialogue.started',
  NPC_DIALOGUE_ENDED = 'npc.dialogue.ended',

  // Player events
  PLAYER_CREATED = 'player.created',
  PLAYER_MOVED = 'player.moved',
  PLAYER_INVENTORY_CHANGED = 'player.inventory.changed',
  PLAYER_HEALTH_CHANGED = 'player.health.changed',
  PLAYER_LEVEL_UP = 'player.level_up',

  // Asset events
  ASSET_REGISTERED = 'asset.registered',
  ASSET_LINKED = 'asset.linked',
  ASSET_GENERATED = 'asset.generated',
  ASSET_DELETED = 'asset.deleted',

  // Validation events
  VALIDATION_STARTED = 'validation.started',
  VALIDATION_COMPLETED = 'validation.completed',
  VALIDATION_FAILED = 'validation.failed',

  // Version control events
  VERSION_SAVED = 'version.saved',
  VERSION_RESTORED = 'version.restored',
  CHECKPOINT_CREATED = 'checkpoint.created',

  // Connection events
  CONNECTION_CREATED = 'connection.created',
  CONNECTION_DELETED = 'connection.deleted',
  CONNECTION_TRAVERSED = 'connection.traversed',

  // Custom events
  CUSTOM_EVENT = 'custom.event',
}

/**
 * Base game event interface
 */
export interface IGameEvent<T = any> {
  type: GameEventType;
  timestamp: string;
  gameId?: string;
  data: T;
  metadata?: Record<string, any>;
}

/**
 * Event subscriber callback function
 */
export type EventCallback<T = any> = (
  event: IGameEvent<T>,
) => void | Promise<void>;

/**
 * Event subscription handle for unsubscribing
 */
export interface IEventSubscription {
  id: string;
  eventType: GameEventType;
  unsubscribe: () => void;
}

/**
 * Event filter function
 */
export type EventFilter<T = any> = (event: IGameEvent<T>) => boolean;

/**
 * Entity event data
 */
export interface IEntityEventData {
  entityType: 'room' | 'object' | 'npc' | 'player';
  entityId: string;
  entityName?: string;
  previousState?: any;
  newState?: any;
}

/**
 * Game lifecycle event data
 */
export interface IGameLifecycleEventData {
  gameId: string;
  gameName: string;
  action: 'created' | 'loaded' | 'saved' | 'deleted' | 'exported';
  details?: Record<string, any>;
}

/**
 * Validation event data
 */
export interface IValidationEventData {
  gameId: string;
  isValid: boolean;
  errorCount: number;
  warningCount: number;
  errors?: string[];
  warnings?: string[];
}

/**
 * Asset event data
 */
export interface IAssetEventData {
  assetId: string;
  assetType: string;
  entityType?: string;
  entityId?: string;
  filePath?: string;
}

/**
 * Player action event data
 */
export interface IPlayerActionEventData {
  playerId: string;
  action: string;
  targetId?: string;
  targetType?: string;
  roomId?: string;
  result?: 'success' | 'failure';
  message?: string;
}

/**
 * Version control event data
 */
export interface IVersionEventData {
  gameId: string;
  versionId?: string;
  checkpointName?: string;
  entityCount?: number;
  description?: string;
  author?: string;
}
