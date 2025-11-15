/**
 * Core gameplay action interfaces
 * Defines how players interact with the game world
 */

/**
 * Action types that players can perform
 */
export enum ActionType {
  // Movement
  MOVE = 'move',
  GO = 'go',
  TRAVEL = 'travel',

  // Object interaction
  TAKE = 'take',
  DROP = 'drop',
  USE = 'use',
  EXAMINE = 'examine',
  OPEN = 'open',
  CLOSE = 'close',
  UNLOCK = 'unlock',
  LOCK = 'lock',

  // NPC interaction
  TALK = 'talk',
  GIVE = 'give',
  ASK = 'ask',
  TRADE = 'trade',
  ATTACK = 'attack',

  // Inventory
  INVENTORY = 'inventory',
  EQUIP = 'equip',
  UNEQUIP = 'unequip',

  // Information
  LOOK = 'look',
  HELP = 'help',
  STATUS = 'status',

  // System
  SAVE = 'save',
  LOAD = 'load',
  QUIT = 'quit',

  // Custom
  CUSTOM = 'custom',
}

/**
 * Result of an action attempt
 */
export interface IActionResult {
  success: boolean;
  message: string;
  data?: any;
  stateChanges?: IStateChange[];
  followUpActions?: string[]; // Suggested next actions
}

/**
 * State change from an action
 */
export interface IStateChange {
  entityId: string;
  entityType: 'room' | 'object' | 'npc' | 'player';
  property: string;
  oldValue: any;
  newValue: any;
  timestamp: string;
}

/**
 * Action definition
 */
export interface IAction {
  type: ActionType;
  actor: string; // Player ID
  verb: string; // e.g., "take"
  target?: string; // Object/NPC ID
  targetType?: 'object' | 'npc' | 'room';
  tool?: string; // Item used to perform action (e.g., key to unlock door)
  parameters?: Record<string, any>;
  timestamp: string;
}

/**
 * Action validator interface
 */
export interface IActionValidator {
  /**
   * Check if action is valid in current context
   */
  canPerform(
    action: IAction,
    context: IGameContext,
  ): Promise<IValidationResult>;

  /**
   * Get reason why action cannot be performed
   */
  getFailureReason(action: IAction, context: IGameContext): Promise<string>;
}

/**
 * Validation result
 */
export interface IValidationResult {
  valid: boolean;
  reason?: string;
  suggestions?: string[];
}

/**
 * Game context for action execution
 */
export interface IGameContext {
  gameId: string;
  playerId: string;
  currentRoomId: string;
  playerState: any;
  worldState: Record<string, any>;
  inventory: string[]; // Object IDs
}

/**
 * Action handler interface
 */
export interface IActionHandler {
  /**
   * Execute the action
   */
  execute(action: IAction, context: IGameContext): Promise<IActionResult>;

  /**
   * Can this handler handle this action type?
   */
  canHandle(actionType: ActionType): boolean;

  /**
   * Get help text for this action
   */
  getHelp(): string;
}

/**
 * Interaction definition between objects
 */
export interface IInteraction {
  id: string;
  subjectId: string; // The object being used (e.g., key)
  targetId: string; // The object being interacted with (e.g., door)
  actionType: ActionType;
  conditions?: IInteractionCondition[];
  effects: IInteractionEffect[];
  message?: string;
  failureMessage?: string;
}

/**
 * Condition for interaction to succeed
 */
export interface IInteractionCondition {
  type: 'has_item' | 'in_room' | 'property_equals' | 'custom';
  property?: string;
  value?: any;
  customCheck?: (context: IGameContext) => boolean;
}

/**
 * Effect of successful interaction
 */
export interface IInteractionEffect {
  type:
    | 'change_property'
    | 'add_item'
    | 'remove_item'
    | 'move_to_room'
    | 'trigger_event'
    | 'custom';
  entityId?: string;
  entityType?: 'object' | 'npc' | 'room' | 'player';
  property?: string;
  value?: any;
  customEffect?: (context: IGameContext) => Promise<void>;
}

/**
 * Proximity check for interactions
 */
export interface IProximityCheck {
  actorPosition: { x: number; y: number; z: number };
  targetPosition: { x: number; y: number; z: number };
  maxDistance: number;
}
