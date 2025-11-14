import { IRoom } from '../../entity/room.interface';
import { IObject } from '../../entity/object.interface';
import { IPlayer } from '../../entity/player.interface';

// Conflict resolution types
export type ConflictType =
  | 'physics'
  | 'narrative'
  | 'balance'
  | 'logic'
  | 'gameplay'
  | 'player_action'
  | 'npc_behavior'
  | 'object_state'
  | 'world_consistency';

// Core LLM interfaces
export interface LLMProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  generateResponse(
    prompt: string,
    options?: LLMRequestOptions,
  ): Promise<LLMResponse>;
  generateStructuredResponse<T>(
    prompt: string,
    schema: any,
    options?: LLMRequestOptions,
  ): Promise<StructuredLLMResponse<T>>;
}

export interface LLMRequestOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  timeout?: number;
  model?: string;
  systemPrompt?: string;
  conversationHistory?: ConversationTurn[];
}

export interface LLMResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  finishReason: 'stop' | 'length' | 'content_filter' | 'error';
  confidence?: number;
  metadata?: Record<string, any>;
}

export interface StructuredLLMResponse<T> extends LLMResponse {
  parsedContent: T;
  validationErrors?: string[];
}

export interface ConversationTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

// Game context interfaces
export interface GameContext {
  gameInfo: GameInfo;
  currentScene: SceneContext;
  playerContext: PlayerContext;
  worldState: WorldState;
  constraints: GameConstraints;
}

export interface GameInfo {
  id: string;
  name: string;
  theme: string;
  genre: string;
  description: string;
  createdAt: string;
  lastModified: string;
}

export interface SceneContext {
  activeRoom: RoomContext;
  nearbyRooms: RoomContext[];
  recentEvents: GameEvent[];
  timeOfDay?: string;
  weather?: string;
  atmosphere?: string;
}

export interface RoomContext {
  room: IRoom;
  objects: ObjectContext[];
  npcs: NPCContext[];
  connections: RoomConnection[];
  ambiance: {
    lighting: string;
    sounds: string[];
    smells: string[];
    temperature: string;
  };
}

export interface ObjectContext {
  object: IObject;
  spatialRelationships: SpatialRelationship[];
  interactionHistory: Interaction[];
  significance: 'background' | 'notable' | 'important' | 'quest_critical';
}

export interface NPCContext {
  npc: IPlayer;
  personality: NPCPersonality;
  relationships: NPCRelationship[];
  currentMood: string;
  recentActions: string[];
  conversationHistory: ConversationTurn[];
}

export interface PlayerContext {
  player: IPlayer;
  recentActions: PlayerAction[];
  preferences: PlayerPreferences;
  currentObjectives: Objective[];
  conversationHistory: ConversationTurn[];
  playStyle: PlayStyle;
}

export interface WorldState {
  keyLocations: LocationSummary[];
  importantNPCs: NPCProfile[];
  majorItems: ItemSummary[];
  ongoingQuests: Quest[];
  worldEvents: WorldEvent[];
  factions: Faction[];
}

export interface GameConstraints {
  physicsRules: PhysicsConstraint[];
  culturalSettings: CulturalContext;
  narrativeGuidelines: NarrativeStyle;
  contentRatings: ContentRating[];
  technicalLimitations: TechnicalConstraint[];
}

// Supporting interfaces
export interface NPCPersonality {
  traits: string[];
  values: string[];
  fears: string[];
  motivations: string[];
  speechPatterns: SpeechPattern;
  background: string;
}

export interface SpeechPattern {
  formality: 'casual' | 'formal' | 'archaic' | 'technical';
  verbosity: 'terse' | 'normal' | 'verbose';
  emotiveness: 'stoic' | 'balanced' | 'expressive';
  vocabulary: string[];
  commonPhrases: string[];
}

export interface NPCRelationship {
  targetId: string;
  type: 'ally' | 'enemy' | 'neutral' | 'romantic' | 'family' | 'rival';
  strength: number; // -100 to 100
  history: string;
  secretKnowledge?: string[];
}

export interface PlayerAction {
  action: string;
  target?: string;
  timestamp: string;
  success: boolean;
  consequences: string[];
}

export interface PlayerPreferences {
  preferredGenres: string[];
  contentPreferences: {
    violence: 'none' | 'mild' | 'moderate' | 'high';
    romance: 'none' | 'mild' | 'moderate' | 'explicit';
    horror: 'none' | 'mild' | 'moderate' | 'intense';
    humor: 'none' | 'occasional' | 'frequent' | 'constant';
  };
  interactionStyle: 'explorer' | 'achiever' | 'socializer' | 'killer';
  pacing: 'slow' | 'moderate' | 'fast';
}

export interface PlayStyle {
  exploration: number; // 0-100
  combat: number;
  social: number;
  puzzle: number;
  story: number;
  creation: number;
}

export interface Objective {
  id: string;
  type: 'main' | 'side' | 'personal' | 'hidden';
  description: string;
  progress: number; // 0-100
  deadline?: string;
  rewards: string[];
  dependencies: string[];
}

export interface GameEvent {
  type: 'action' | 'dialogue' | 'discovery' | 'conflict' | 'resolution';
  description: string;
  timestamp: string;
  participants: string[];
  consequences: string[];
  significance: 'minor' | 'moderate' | 'major' | 'pivotal';
}

export interface Interaction {
  playerId: string;
  action: string;
  timestamp: string;
  result: string;
  emotionalResponse?: string;
}

export interface SpatialRelationship {
  type: 'on_top_of' | 'inside' | 'next_to' | 'underneath' | 'attached_to';
  targetId: string;
  description: string;
  stability: number; // 0-100
}

export interface RoomConnection {
  direction: string;
  targetRoomId: string;
  description: string;
  isLocked: boolean;
  keyRequired?: string;
  difficulty?: string;
}

export interface LocationSummary {
  id: string;
  name: string;
  type: string;
  significance: string;
  description: string;
  connections: string[];
}

export interface NPCProfile {
  id: string;
  name: string;
  role: string;
  importance: 'background' | 'recurring' | 'major' | 'central';
  currentLocation: string;
  keyTraits: string[];
  relationships: string[];
}

export interface ItemSummary {
  id: string;
  name: string;
  type: string;
  significance: 'mundane' | 'useful' | 'valuable' | 'magical' | 'artifact';
  currentLocation: string;
  owner?: string;
}

export interface Quest {
  id: string;
  title: string;
  type: 'main' | 'side' | 'faction' | 'personal';
  status: 'available' | 'active' | 'completed' | 'failed' | 'hidden';
  description: string;
  objectives: Objective[];
  rewards: string[];
  participants: string[];
}

export interface WorldEvent {
  type: 'political' | 'natural' | 'magical' | 'social' | 'economic';
  description: string;
  impact: 'local' | 'regional' | 'global';
  duration: string;
  consequences: string[];
}

export interface Faction {
  id: string;
  name: string;
  type: string;
  goals: string[];
  territory: string[];
  allies: string[];
  enemies: string[];
  influence: number; // 0-100
}

export interface PhysicsConstraint {
  type: 'gravity' | 'material' | 'size' | 'energy' | 'magic';
  description: string;
  flexibility: 'rigid' | 'moderate' | 'flexible';
  exceptions: string[];
}

export interface CulturalContext {
  era: string;
  technology: string;
  socialStructure: string;
  religion: string[];
  values: string[];
  taboos: string[];
  languages: string[];
}

export interface NarrativeStyle {
  tense: 'first' | 'second' | 'third';
  perspective: 'omniscient' | 'limited' | 'objective';
  tone: 'serious' | 'lighthearted' | 'dark' | 'humorous' | 'epic';
  complexity: 'simple' | 'moderate' | 'complex';
  descriptiveness: 'minimal' | 'moderate' | 'rich' | 'purple';
}

export interface ContentRating {
  category: string;
  level: 'none' | 'mild' | 'moderate' | 'strong';
  guidelines: string[];
}

export interface TechnicalConstraint {
  type: 'performance' | 'memory' | 'network' | 'storage';
  limit: string;
  description: string;
}

// LLM Hook interfaces
export interface LLMHookEvent {
  type: 'conflict' | 'generation' | 'enhancement' | 'validation';
  priority: 'low' | 'medium' | 'high' | 'critical';
  context: GameContext;
  requiredResponse: ResponseType;
  timeout: number;
  metadata?: Record<string, any>;
}

export interface ResponseType {
  format: 'text' | 'json' | 'structured';
  schema?: any;
  constraints?: string[];
  examples?: any[];
}

export interface LLMHookResponse {
  success: boolean;
  response: any;
  confidence: number;
  processingTime: number;
  fallbackUsed: boolean;
  errors?: string[];
  warnings?: string[];
}

// Conflict resolution interfaces
export interface ConflictResolution {
  conflictType: ConflictType;
  success: boolean;
  resolution: string;
  explanation: string;
  appliedChanges: string[];
  sideEffects: string[];
  alternativeSolutions: AlternativeSolution[];
  narrativeDescription: string;
  confidence: number;
  processingTime: number;
  requiresPlayerConfirmation: boolean;
  metadata?: Record<string, any>;
}

export interface AlternativeSolution {
  description: string;
  explanation: string;
  pros?: string[];
  cons?: string[];
}

export interface Solution {
  id: string;
  solution: string;
  description: string;
  confidence: number;
  sideEffects: string[];
  cost: number; // Implementation difficulty/cost
  reversible: boolean;
}

// Content generation interfaces
export interface GenerationRequest {
  type: 'room' | 'npc' | 'object' | 'narrative' | 'dialogue';
  context: GameContext;
  constraints: GenerationConstraints;
  references?: GenerationReference[];
}

export interface GenerationConstraints {
  style: string;
  length: 'short' | 'medium' | 'long' | 'detailed';
  tone: string;
  themes: string[];
  requirements: string[];
  restrictions: string[];
}

export interface GenerationReference {
  type: 'example' | 'template' | 'inspiration';
  content: any;
  weight: number; // How much to influence generation
}

export interface GeneratedContent {
  content: any;
  metadata: GenerationMetadata;
  alternatives?: any[];
  refinementSuggestions?: string[];
}

export interface GenerationMetadata {
  generationType: string;
  processingTime: number;
  tokensUsed: number;
  confidence: number;
  seedUsed?: string;
  revisionsCount: number;
}

// Cache interfaces
export interface CacheEntry<T> {
  key: string;
  data: T;
  timestamp: string;
  expiresAt: string;
  accessCount: number;
  metadata?: Record<string, any>;
}

export interface ContextCache {
  gameStateSnapshot: CacheEntry<GameContext>;
  frequentQueries: Map<string, CacheEntry<any>>;
  templateCache: Map<string, CacheEntry<string>>;
  responseCache: Map<string, CacheEntry<LLMResponse>>;
}

// Error handling
export interface LLMError {
  type: 'provider' | 'network' | 'validation' | 'timeout' | 'quota' | 'unknown';
  message: string;
  code?: string;
  retryable: boolean;
  suggestedAction: string;
  metadata?: Record<string, any>;
}
