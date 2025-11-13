/**
 * Base component interface
 * Components are pure data containers (no logic)
 */
export interface IComponent {
  /**
   * Component type identifier
   */
  type: string;

  /**
   * Whether component is enabled
   */
  enabled: boolean;
}

/**
 * Component types enumeration
 */
export enum ComponentType {
  // Core components
  TRANSFORM = 'transform',
  IDENTITY = 'identity',

  // Visual components
  RENDERABLE = 'renderable',
  SPRITE = 'sprite',
  MODEL_3D = 'model3d',

  // Interaction components
  INTERACTABLE = 'interactable',
  CONTAINER = 'container',
  PICKUPABLE = 'pickupable',
  USABLE = 'usable',

  // Character components
  HEALTH = 'health',
  INVENTORY = 'inventory',
  STATS = 'stats',
  DIALOGUE = 'dialogue',
  AI_BEHAVIOR = 'ai_behavior',

  // Physics components
  PHYSICS_BODY = 'physics_body',
  COLLIDER = 'collider',
  RIGID_BODY = 'rigid_body',

  // Audio components
  AUDIO_SOURCE = 'audio_source',
  AUDIO_LISTENER = 'audio_listener',

  // Game logic components
  QUEST_GIVER = 'quest_giver',
  MERCHANT = 'merchant',
  DOOR = 'door',
  TRIGGER = 'trigger',

  // Custom
  CUSTOM = 'custom',
}

/**
 * Transform component for position, rotation, scale
 */
export interface ITransformComponent extends IComponent {
  type: ComponentType.TRANSFORM;
  position: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  scale?: { x: number; y: number; z: number };
}

/**
 * Identity component for basic entity info
 */
export interface IIdentityComponent extends IComponent {
  type: ComponentType.IDENTITY;
  id: string;
  name: string;
  description?: string;
  tags?: string[];
}

/**
 * Renderable component for visual representation
 */
export interface IRenderableComponent extends IComponent {
  type: ComponentType.RENDERABLE;
  assetId?: string;
  color?: string;
  visible: boolean;
  layer?: number;
}

/**
 * Interactable component for player interaction
 */
export interface IInteractableComponent extends IComponent {
  type: ComponentType.INTERACTABLE;
  canInteract: boolean;
  interactionText?: string;
  interactionDistance?: number;
  onInteract?: string; // Script or event name
}

/**
 * Container component for holding other objects
 */
export interface IContainerComponent extends IComponent {
  type: ComponentType.CONTAINER;
  capacity: number;
  contains: string[]; // Entity IDs
  canAddItem: boolean;
  canRemoveItem: boolean;
}

/**
 * Health component for entities with hit points
 */
export interface IHealthComponent extends IComponent {
  type: ComponentType.HEALTH;
  current: number;
  maximum: number;
  regenerationRate?: number;
  isAlive: boolean;
}

/**
 * Inventory component for storing items
 */
export interface IInventoryComponent extends IComponent {
  type: ComponentType.INVENTORY;
  items: string[]; // Entity IDs
  maxItems: number;
  maxWeight?: number;
  currentWeight?: number;
}

/**
 * Dialogue component for conversations
 */
export interface IDialogueComponent extends IComponent {
  type: ComponentType.DIALOGUE;
  dialogueTree?: any;
  currentNode?: string;
  canTalk: boolean;
}

/**
 * AI Behavior component for NPCs
 */
export interface IAIBehaviorComponent extends IComponent {
  type: ComponentType.AI_BEHAVIOR;
  behaviorType: 'passive' | 'aggressive' | 'friendly' | 'patrol' | 'custom';
  state: string;
  targetId?: string;
  patrolPoints?: { x: number; y: number; z: number }[];
}

/**
 * Stats component for character attributes
 */
export interface IStatsComponent extends IComponent {
  type: ComponentType.STATS;
  level: number;
  experience: number;
  attributes: Record<string, number>; // strength, dexterity, etc.
}

/**
 * Audio Source component
 */
export interface IAudioSourceComponent extends IComponent {
  type: ComponentType.AUDIO_SOURCE;
  assetId?: string;
  volume: number;
  loop: boolean;
  autoPlay: boolean;
  is3D: boolean;
}

/**
 * Physics Body component
 */
export interface IPhysicsBodyComponent extends IComponent {
  type: ComponentType.PHYSICS_BODY;
  mass: number;
  velocity: { x: number; y: number; z: number };
  isKinematic: boolean;
  useGravity: boolean;
}

/**
 * Entity component data structure
 */
export interface IEntityComponents {
  entityId: string;
  gameId: string;
  components: Map<ComponentType, IComponent>;
}

/**
 * Component query for filtering entities
 */
export interface IComponentQuery {
  all?: ComponentType[]; // Entity must have ALL these components
  any?: ComponentType[]; // Entity must have ANY of these components
  none?: ComponentType[]; // Entity must have NONE of these components
}
