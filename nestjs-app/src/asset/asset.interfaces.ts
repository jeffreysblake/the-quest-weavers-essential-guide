/**
 * Asset type enumeration
 */
export enum AssetType {
  IMAGE = 'image',
  AUDIO = 'audio',
  VIDEO = 'video',
  MODEL_3D = '3d-model',
}

/**
 * Entity type that can have assets
 */
export enum AssetEntityType {
  ROOM = 'room',
  OBJECT = 'object',
  NPC = 'npc',
  GAME = 'game',
}

/**
 * Asset category for organization
 */
export enum AssetCategory {
  // Image categories
  ROOM_BACKGROUND = 'room-background',
  NPC_PORTRAIT = 'npc-portrait',
  NPC_SPRITE = 'npc-sprite',
  OBJECT_ICON = 'object-icon',
  OBJECT_SPRITE = 'object-sprite',
  UI_ELEMENT = 'ui-element',

  // Audio categories
  DIALOGUE = 'dialogue',
  AMBIENT = 'ambient',
  SOUND_EFFECT = 'sound-effect',
  MUSIC = 'music',

  // Other
  OTHER = 'other',
}

/**
 * Asset metadata interface
 */
export interface IAsset {
  id: string;
  gameId: string;
  assetType: AssetType;
  category: AssetCategory;
  entityType?: AssetEntityType;
  entityId?: string;
  filePath: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  generatedBy?: string;
  generationPrompt?: string;
  generationParams?: Record<string, any>;
  version: number;
  tags?: string[];
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Asset link between entity and asset
 */
export interface IAssetLink {
  id: number;
  gameId: string;
  entityType: AssetEntityType;
  entityId: string;
  assetId: string;
  isPrimary: boolean; // Whether this is the primary/default asset for this entity
  displayOrder?: number;
  createdAt: string;
}

/**
 * Asset generation request
 */
export interface IAssetGenerationRequest {
  gameId: string;
  entityType: AssetEntityType;
  entityId: string;
  assetType: AssetType;
  category: AssetCategory;
  prompt: string;
  params?: Record<string, any>;
  generator?: string;
}

/**
 * Asset generation result
 */
export interface IAssetGenerationResult {
  success: boolean;
  asset?: IAsset;
  filePath?: string;
  message: string;
  error?: string;
}

/**
 * Asset query filters
 */
export interface IAssetQuery {
  gameId?: string;
  entityType?: AssetEntityType;
  entityId?: string;
  assetType?: AssetType;
  category?: AssetCategory;
  tags?: string[];
}
