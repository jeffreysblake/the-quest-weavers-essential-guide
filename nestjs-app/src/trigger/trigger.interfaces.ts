/**
 * Condition and trigger system interfaces
 * Supports event-based triggers, complex conditions, and automated actions
 */

/**
 * Trigger type
 */
export enum TriggerType {
  EVENT = 'event', // Triggered by game events
  TIME = 'time', // Triggered at specific time or interval
  CONDITION = 'condition', // Triggered when conditions are met
  PROXIMITY = 'proximity', // Triggered when player enters area
  ITEM_PICKUP = 'item_pickup', // Triggered when item is picked up
  DIALOGUE_END = 'dialogue_end', // Triggered when dialogue ends
  QUEST_COMPLETE = 'quest_complete', // Triggered when quest completes
  CUSTOM = 'custom', // Custom trigger logic
}

/**
 * Condition operator
 */
export enum ConditionOperator {
  EQUALS = 'equals',
  NOT_EQUALS = 'not_equals',
  GREATER = 'greater',
  GREATER_EQUAL = 'greater_equal',
  LESS = 'less',
  LESS_EQUAL = 'less_equal',
  CONTAINS = 'contains',
  EXISTS = 'exists',
  IN_RANGE = 'in_range',
}

/**
 * Logic operator for combining conditions
 */
export enum LogicOperator {
  AND = 'and',
  OR = 'or',
  NOT = 'not',
}

/**
 * Trigger condition
 */
export interface ITriggerCondition {
  id: string;
  type: 'flag' | 'variable' | 'item' | 'location' | 'quest' | 'time' | 'custom';
  key?: string; // Flag/variable/item/quest ID
  operator?: ConditionOperator;
  value?: any;
  locationId?: string; // Room ID for location checks
  range?: { min: number; max: number }; // For range checks
  customCheck?: (context: ITriggerContext) => boolean | Promise<boolean>;
}

/**
 * Condition group with logic operators
 */
export interface IConditionGroup {
  operator: LogicOperator;
  conditions: (ITriggerCondition | IConditionGroup)[];
}

/**
 * Trigger action
 */
export interface ITriggerAction {
  id: string;
  type:
    | 'set_flag'
    | 'set_variable'
    | 'give_item'
    | 'remove_item'
    | 'spawn_entity'
    | 'despawn_entity'
    | 'start_quest'
    | 'complete_quest'
    | 'start_dialogue'
    | 'teleport_player'
    | 'emit_event'
    | 'custom';

  // Flag/Variable actions
  flagKey?: string;
  flagValue?: boolean;
  variableKey?: string;
  variableValue?: any;

  // Item actions
  itemId?: string;
  quantity?: number;

  // Entity actions
  entityId?: string;
  entityType?: 'object' | 'npc';
  position?: { x: number; y: number; z: number };
  roomId?: string;

  // Quest actions
  questId?: string;

  // Dialogue actions
  dialogueTreeId?: string;
  npcId?: string;

  // Teleport actions
  targetRoomId?: string;
  targetPosition?: { x: number; y: number; z: number };

  // Event actions
  eventType?: string;
  eventData?: any;

  // Custom action
  customAction?: (context: ITriggerContext) => void | Promise<void>;

  delay?: number; // Delay in milliseconds before executing
}

/**
 * Trigger definition
 */
export interface ITrigger {
  id: string;
  name: string;
  description?: string;
  gameId: string;
  type: TriggerType;

  // Event trigger config
  eventType?: string;
  eventFilter?: (eventData: any) => boolean;

  // Time trigger config
  interval?: number; // Milliseconds for repeating triggers
  executeAt?: string; // ISO timestamp for one-time triggers

  // Proximity trigger config
  roomId?: string;
  radius?: number;

  // Item/Dialogue/Quest trigger config
  targetId?: string; // Item ID, Dialogue ID, or Quest ID

  // Conditions
  conditions?: IConditionGroup;

  // Actions
  actions: ITriggerAction[];

  // Trigger settings
  enabled: boolean;
  oneTime?: boolean; // Fire only once
  cooldown?: number; // Milliseconds before can fire again
  priority?: number; // Execution priority (higher = earlier)

  metadata?: Record<string, any>;
}

/**
 * Active trigger state
 */
export interface IActiveTrigger {
  triggerId: string;
  gameId: string;
  firedCount: number;
  lastFiredAt?: string;
  nextFireAt?: string; // For time-based triggers
  cooldownUntil?: string;
}

/**
 * Trigger context for condition checks and actions
 */
export interface ITriggerContext {
  gameId: string;
  playerId?: string;
  currentRoomId?: string;
  playerPosition?: { x: number; y: number; z: number };
  playerFlags: Record<string, boolean>;
  playerVariables: Record<string, any>;
  playerInventory: string[];
  completedQuests: string[];
  worldState: Record<string, any>;
  eventData?: any; // Data from the triggering event
}

/**
 * Trigger execution result
 */
export interface ITriggerResult {
  success: boolean;
  message: string;
  triggerId: string;
  conditionsMet: boolean;
  actionsExecuted: number;
  errors?: string[];
}

/**
 * Trigger event payload
 */
export interface ITriggerEvent {
  triggerId: string;
  triggerName: string;
  firedAt: string;
  context: ITriggerContext;
  actionsExecuted: ITriggerAction[];
}
