/**
 * Dialogue and conversation system interfaces
 * Supports branching conversations, conditional dialogue, and NPC interactions
 */

/**
 * Dialogue node type
 */
export enum DialogueNodeType {
  TEXT = 'text', // NPC speaks
  CHOICE = 'choice', // Player chooses response
  ACTION = 'action', // Trigger game action
  CONDITION = 'condition', // Branch based on condition
  END = 'end', // End conversation
}

/**
 * Dialogue condition
 */
export interface IDialogueCondition {
  type: 'flag' | 'variable' | 'item' | 'quest' | 'custom';
  key: string; // Flag name, variable name, item ID, quest ID
  operator?: 'equals' | 'not_equals' | 'greater' | 'less' | 'contains' | 'exists';
  value?: any;
  customCheck?: (context: IDialogueContext) => boolean | Promise<boolean>;
}

/**
 * Dialogue action
 */
export interface IDialogueAction {
  type: 'set_flag' | 'set_variable' | 'give_item' | 'update_quest' | 'custom';
  key?: string;
  value?: any;
  itemId?: string;
  questId?: string;
  customAction?: (context: IDialogueContext) => void | Promise<void>;
}

/**
 * Player dialogue choice
 */
export interface IDialogueChoice {
  id: string;
  text: string; // What the player says
  nextNodeId?: string; // Which node to jump to
  conditions?: IDialogueCondition[]; // Conditions to show this choice
  actions?: IDialogueAction[]; // Actions to trigger when chosen
  endsConversation?: boolean;
}

/**
 * Dialogue node
 */
export interface IDialogueNode {
  id: string;
  type: DialogueNodeType;
  speaker?: string; // NPC ID or name
  text?: string; // What the NPC says
  choices?: IDialogueChoice[]; // Available player responses
  nextNodeId?: string; // Auto-advance to next node (for TEXT nodes)
  conditions?: IDialogueCondition[]; // Conditions to reach this node
  actions?: IDialogueAction[]; // Actions to trigger when entering this node
  metadata?: Record<string, any>; // Custom data (emotion, animation, etc.)
}

/**
 * Complete dialogue tree for an NPC
 */
export interface IDialogueTree {
  id: string;
  npcId: string;
  name: string;
  description?: string;
  startNodeId: string; // Entry point
  nodes: Map<string, IDialogueNode>;
  metadata?: Record<string, any>;
}

/**
 * Active conversation state
 */
export interface IConversationState {
  conversationId: string;
  gameId: string;
  playerId: string;
  npcId: string;
  treeId: string;
  currentNodeId: string;
  history: IDialogueHistoryEntry[];
  variables: Record<string, any>; // Conversation-local variables
  startedAt: string;
  lastUpdated: string;
}

/**
 * Dialogue history entry
 */
export interface IDialogueHistoryEntry {
  nodeId: string;
  speaker: string;
  text: string;
  choiceId?: string;
  choiceText?: string;
  timestamp: string;
}

/**
 * Dialogue context for conditions and actions
 */
export interface IDialogueContext {
  gameId: string;
  playerId: string;
  npcId: string;
  conversationState: IConversationState;
  playerFlags: Record<string, boolean>;
  playerVariables: Record<string, any>;
  playerInventory: string[];
  questStates: Record<string, string>;
}

/**
 * Dialogue traversal result
 */
export interface IDialogueResult {
  success: boolean;
  currentNode: IDialogueNode;
  availableChoices: IDialogueChoice[];
  message?: string;
  conversationEnded?: boolean;
  actionsTriggered?: IDialogueAction[];
}

/**
 * Serializable dialogue tree data
 */
export interface IDialogueTreeData {
  id: string;
  npcId: string;
  name: string;
  description?: string;
  startNodeId: string;
  nodes: IDialogueNode[]; // Array instead of Map for JSON serialization
  metadata?: Record<string, any>;
}
