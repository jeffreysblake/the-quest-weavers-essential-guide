/**
 * World state tracker interfaces
 * Supports persistent world changes, door states, NPC positions, environmental changes
 */

/**
 * State change type
 */
export enum StateChangeType {
  // Door/Portal states
  DOOR_OPENED = 'door_opened',
  DOOR_CLOSED = 'door_closed',
  DOOR_LOCKED = 'door_locked',
  DOOR_UNLOCKED = 'door_unlocked',

  // Object states
  OBJECT_MOVED = 'object_moved',
  OBJECT_DESTROYED = 'object_destroyed',
  OBJECT_CREATED = 'object_created',
  OBJECT_STATE_CHANGED = 'object_state_changed',

  // NPC states
  NPC_MOVED = 'npc_moved',
  NPC_DEFEATED = 'npc_defeated',
  NPC_SPAWNED = 'npc_spawned',
  NPC_DESPAWNED = 'npc_despawned',
  NPC_STATE_CHANGED = 'npc_state_changed',

  // Environmental states
  ENVIRONMENT_CHANGED = 'environment_changed',
  WEATHER_CHANGED = 'weather_changed',
  TIME_CHANGED = 'time_changed',

  // Custom
  CUSTOM = 'custom',
}

/**
 * Door/Portal state
 */
export interface IDoorState {
  doorId: string;
  isOpen: boolean;
  isLocked: boolean;
  requiredKeyId?: string;
  openedBy?: string; // Player/NPC ID
  openedAt?: string;
}

/**
 * Object state
 */
export interface IObjectState {
  objectId: string;
  exists: boolean;
  position?: { x: number; y: number; z: number };
  roomId?: string;
  customState: Record<string, any>; // Custom state data
  lastModified: string;
  modifiedBy?: string;
}

/**
 * NPC state
 */
export interface INpcState {
  npcId: string;
  alive: boolean;
  position?: { x: number; y: number; z: number };
  roomId?: string;
  health?: number;
  attitude?: 'friendly' | 'neutral' | 'hostile';
  currentActivity?: string;
  customState: Record<string, any>;
  lastModified: string;
  modifiedBy?: string;
}

/**
 * Environmental state
 */
export interface IEnvironmentState {
  roomId: string;
  lighting?: number; // 0-100 brightness
  temperature?: number;
  weather?: 'clear' | 'rain' | 'snow' | 'storm' | 'fog';
  timeOfDay?:
    | 'dawn'
    | 'morning'
    | 'noon'
    | 'afternoon'
    | 'dusk'
    | 'night'
    | 'midnight';
  customState: Record<string, any>;
  lastModified: string;
}

/**
 * World state snapshot
 */
export interface IWorldState {
  gameId: string;
  doors: Map<string, IDoorState>;
  objects: Map<string, IObjectState>;
  npcs: Map<string, INpcState>;
  environments: Map<string, IEnvironmentState>;
  globalFlags: Record<string, boolean>;
  globalVariables: Record<string, any>;
  lastUpdated: string;
}

/**
 * State change record
 */
export interface IStateChange {
  id: string;
  gameId: string;
  changeType: StateChangeType;
  entityId: string; // Door, object, or NPC ID
  entityType: 'door' | 'object' | 'npc' | 'environment' | 'global';
  previousState?: any;
  newState: any;
  changedBy?: string; // Player/NPC ID
  timestamp: string;
  reason?: string;
}

/**
 * State query filter
 */
export interface IStateQuery {
  entityType?: 'door' | 'object' | 'npc' | 'environment';
  entityId?: string;
  roomId?: string;
  changedBy?: string;
  fromTimestamp?: string;
  toTimestamp?: string;
  changeType?: StateChangeType;
}

/**
 * State update request
 */
export interface IStateUpdateRequest {
  gameId: string;
  entityId: string;
  entityType: 'door' | 'object' | 'npc' | 'environment' | 'global';
  changeType: StateChangeType;
  newState: any;
  changedBy?: string;
  reason?: string;
}

/**
 * State update result
 */
export interface IStateUpdateResult {
  success: boolean;
  message: string;
  stateChange?: IStateChange;
  previousState?: any;
  newState?: any;
}

/**
 * World state statistics
 */
export interface IWorldStateStats {
  totalDoors: number;
  openDoors: number;
  lockedDoors: number;
  totalObjects: number;
  activeObjects: number;
  destroyedObjects: number;
  totalNpcs: number;
  aliveNpcs: number;
  defeatedNpcs: number;
  totalEnvironments: number;
  totalChanges: number;
}

/**
 * Revertible state change
 */
export interface IRevertibleChange {
  changeId: string;
  canRevert: boolean;
  reason?: string;
}
