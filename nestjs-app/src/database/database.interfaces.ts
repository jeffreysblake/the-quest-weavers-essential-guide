export interface GameData {
  id: string;
  name: string;
  description?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  metadata?: {
    difficulty?: string;
    estimatedPlaytime?: string;
    themes?: string[];
    startingRoom?: string;
    victoryConditions?: VictoryCondition[];
  };
}

export interface VictoryCondition {
  type: 'obtain_item' | 'reach_room' | 'defeat_npc' | 'custom';
  itemId?: string;
  roomId?: string;
  npcId?: string;
  description: string;
  customCondition?: string;
}

export interface RoomData {
  id: string;
  gameId: string;
  name: string;
  description?: string;
  longDescription?: string;
  position: Position3D;
  width: number;
  height: number;
  depth: number;
  environmentData?: EnvironmentData;
  version: number;
  createdAt: string;
}

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface EnvironmentData {
  lighting?: string;
  sound?: string;
  temperature?: string;
  weather?: string;
  atmosphere?: string;
}

export interface ObjectData {
  id: string;
  gameId: string;
  name: string;
  description?: string;
  objectType: ObjectType;
  position: Position3D;
  material?: string;
  materialProperties?: MaterialProperties;
  weight: number;
  health?: number;
  maxHealth?: number;
  isPortable: boolean;
  isContainer: boolean;
  canContain: boolean;
  containerCapacity: number;
  stateData?: ObjectState;
  properties?: Record<string, any>;
  version: number;
  createdAt: string;
}

export type ObjectType =
  | 'weapon'
  | 'armor'
  | 'item'
  | 'container'
  | 'furniture'
  | 'quest-item'
  | 'consumable'
  | 'key'
  | 'tool'
  | 'decoration';

export interface MaterialProperties {
  material: string;
  density: number;
  conductivity: number;
  flammability: number;
  brittleness: number;
  resistances?: Record<string, number>;
}

export interface ObjectState {
  isOpen?: boolean;
  isLocked?: boolean;
  isOnFire?: boolean;
  frozen?: boolean;
  broken?: boolean;
  enchanted?: boolean;
  [key: string]: any;
}

export interface NPCData {
  id: string;
  gameId: string;
  name: string;
  description?: string;
  npcType: NPCType;
  position: Position3D;
  health: number;
  maxHealth: number;
  level: number;
  experience: number;
  inventoryData?: string[]; // Array of object IDs
  dialogueTreeData?: DialogueTree;
  behaviorConfig?: NPCBehavior;
  attributes?: NPCAttributes;
  version: number;
  createdAt: string;
}

export type NPCType = 'npc' | 'player' | 'monster' | 'vendor' | 'quest_giver';

export interface DialogueTree {
  [nodeId: string]: DialogueNode;
}

export interface DialogueNode {
  text: string;
  choices?: DialogueChoice[];
  conditions?: DialogueCondition[];
  actions?: DialogueAction[];
}

export interface DialogueChoice {
  text: string;
  leadsTo: string;
  conditions?: DialogueCondition[];
  actions?: DialogueAction[];
}

export interface DialogueCondition {
  type: 'has_item' | 'level_min' | 'health_min' | 'custom';
  value?: any;
  customCondition?: string;
}

export interface DialogueAction {
  type: 'give_item' | 'take_item' | 'give_experience' | 'heal' | 'custom';
  value?: any;
  customAction?: string;
}

export interface NPCBehavior {
  movementPattern?: 'stationary' | 'patrol' | 'wander' | 'follow' | 'flee';
  aggressionLevel?: 'peaceful' | 'defensive' | 'aggressive' | 'hostile';
  tradeEnabled?: boolean;
  questGiver?: boolean;
  patrolRoute?: Position3D[];
  combatBehavior?: CombatBehavior;
}

export interface CombatBehavior {
  attackPattern?: string;
  preferredRange?: 'melee' | 'ranged' | 'magic';
  abilities?: string[];
  retreatThreshold?: number;
}

export interface NPCAttributes {
  strength?: number;
  agility?: number;
  intelligence?: number;
  wisdom?: number;
  charisma?: number;
  constitution?: number;
  [key: string]: any;
}

export interface SpatialRelationship {
  id: number;
  objectId: string;
  targetId: string;
  relationshipType: RelationshipType;
  description?: string;
  createdAt: string;
}

export type RelationshipType =
  | 'on_top_of'
  | 'inside'
  | 'next_to'
  | 'underneath'
  | 'attached_to'
  | 'behind'
  | 'in_front_of';

export interface RoomConnection {
  id: number;
  roomId: string;
  connectedRoomId: string;
  direction: Direction;
  description?: string;
  isLocked: boolean;
  requiredKeyId?: string;
  createdAt: string;
}

export type Direction =
  | 'north'
  | 'south'
  | 'east'
  | 'west'
  | 'up'
  | 'down'
  | 'northeast'
  | 'northwest'
  | 'southeast'
  | 'southwest';

export interface RoomObject {
  id: number;
  roomId: string;
  objectId: string;
  placedAt: string;
}

export interface RoomNPC {
  id: number;
  roomId: string;
  npcId: string;
  placedAt: string;
}

export interface VersionHistoryEntry {
  id: number;
  entityType: EntityType;
  entityId: string;
  versionNumber: number;
  dataSnapshot: string;
  changedBy?: string;
  changeReason?: string;
  createdAt: string;
}

export type EntityType = 'game' | 'room' | 'object' | 'npc';

export interface GameFileInfo {
  gameId: string;
  directory: string;
  hasConfig: boolean;
  roomCount: number;
  objectCount: number;
  npcCount: number;
  lastModified: Date;
}

export interface ChangeSet {
  gameId: string;
  changes: EntityChange[];
}

export interface EntityChange {
  type: 'create' | 'update' | 'delete';
  entityType: EntityType;
  entityId: string;
  filePath: string;
  lastModified: Date;
  reason?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  type:
    | 'missing_file'
    | 'invalid_json'
    | 'missing_reference'
    | 'duplicate_id'
    | 'invalid_data';
  file?: string;
  line?: number;
  message: string;
  details?: string;
}

export interface ValidationWarning {
  type:
    | 'unused_entity'
    | 'missing_description'
    | 'performance'
    | 'best_practice';
  file?: string;
  line?: number;
  message: string;
  details?: string;
}
