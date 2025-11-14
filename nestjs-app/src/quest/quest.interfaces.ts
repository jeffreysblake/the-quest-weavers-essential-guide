/**
 * Quest and objective system interfaces
 * Supports quest chains, multiple objectives, progress tracking, and rewards
 */

/**
 * Quest state
 */
export enum QuestState {
  NOT_STARTED = 'not_started',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Objective type
 */
export enum ObjectiveType {
  COLLECT_ITEM = 'collect_item', // Collect X of item Y
  TALK_TO_NPC = 'talk_to_npc', // Talk to specific NPC
  GO_TO_LOCATION = 'go_to_location', // Visit specific room/location
  DEFEAT_ENEMY = 'defeat_enemy', // Defeat X enemies
  USE_ITEM = 'use_item', // Use specific item
  CUSTOM = 'custom', // Custom condition check
}

/**
 * Objective condition
 */
export interface IObjectiveCondition {
  type: 'flag' | 'variable' | 'item' | 'custom';
  key?: string;
  operator?: 'equals' | 'not_equals' | 'greater' | 'less' | 'exists';
  value?: any;
  customCheck?: (context: IQuestContext) => boolean | Promise<boolean>;
}

/**
 * Quest objective
 */
export interface IQuestObjective {
  id: string;
  type: ObjectiveType;
  description: string; // Display text for the objective
  targetId?: string; // Item ID, NPC ID, Room ID, etc.
  targetCount?: number; // How many required (for collect/defeat objectives)
  currentCount?: number; // Current progress
  completed: boolean;
  optional?: boolean; // If true, not required for quest completion
  conditions?: IObjectiveCondition[]; // Conditions to unlock this objective
  metadata?: Record<string, any>;
}

/**
 * Quest reward
 */
export interface IQuestReward {
  type: 'item' | 'experience' | 'flag' | 'variable' | 'custom';
  itemId?: string;
  itemCount?: number;
  experience?: number;
  flagKey?: string;
  flagValue?: boolean;
  variableKey?: string;
  variableValue?: any;
  customReward?: (context: IQuestContext) => void | Promise<void>;
  description?: string;
}

/**
 * Quest prerequisite
 */
export interface IQuestPrerequisite {
  type: 'quest' | 'level' | 'flag' | 'item' | 'custom';
  questId?: string; // Required quest must be completed
  requiredLevel?: number;
  flagKey?: string;
  flagValue?: boolean;
  itemId?: string;
  customCheck?: (context: IQuestContext) => boolean | Promise<boolean>;
}

/**
 * Quest definition
 */
export interface IQuest {
  id: string;
  name: string;
  description: string;
  gameId: string;
  objectives: IQuestObjective[];
  rewards?: IQuestReward[];
  prerequisites?: IQuestPrerequisite[];
  nextQuestId?: string; // For quest chains
  failConditions?: IObjectiveCondition[]; // Conditions that cause quest to fail
  autoStart?: boolean; // Auto-start when prerequisites are met
  canAbandon?: boolean; // Can player abandon this quest
  timeLimit?: number; // Time limit in seconds
  metadata?: Record<string, any>;
}

/**
 * Player quest state
 */
export interface IPlayerQuest {
  questId: string;
  playerId: string;
  gameId: string;
  state: QuestState;
  objectives: IQuestObjective[]; // Copy of objectives with progress
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  timeLimitExpiresAt?: string;
  metadata?: Record<string, any>;
}

/**
 * Quest context for conditions and rewards
 */
export interface IQuestContext {
  gameId: string;
  playerId: string;
  playerLevel?: number;
  playerFlags: Record<string, boolean>;
  playerVariables: Record<string, any>;
  playerInventory: string[];
  completedQuests: string[];
}

/**
 * Quest update result
 */
export interface IQuestUpdateResult {
  success: boolean;
  message: string;
  objectiveCompleted?: boolean;
  objectiveId?: string;
  questCompleted?: boolean;
  questFailed?: boolean;
  rewards?: IQuestReward[];
  nextQuestUnlocked?: string;
}

/**
 * Quest start result
 */
export interface IQuestStartResult {
  success: boolean;
  message: string;
  quest?: IPlayerQuest;
  prerequisitesFailed?: string[];
}

/**
 * Serializable quest data
 */
export interface IQuestData {
  id: string;
  name: string;
  description: string;
  gameId: string;
  objectives: IQuestObjective[];
  rewards?: IQuestReward[];
  prerequisites?: IQuestPrerequisite[];
  nextQuestId?: string;
  failConditions?: IObjectiveCondition[];
  autoStart?: boolean;
  canAbandon?: boolean;
  timeLimit?: number;
  metadata?: Record<string, any>;
}
