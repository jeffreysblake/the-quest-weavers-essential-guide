/**
 * Runtime inventory management interfaces
 * Supports item stacking, weight limits, equipment slots, and container management
 */

/**
 * Item slot type
 */
export enum SlotType {
  INVENTORY = 'inventory', // General inventory slot
  EQUIPMENT = 'equipment', // Equipped item slot
  CONTAINER = 'container', // Slot in a container (chest, bag, etc.)
  QUICKSLOT = 'quickslot', // Quick access slot
}

/**
 * Equipment slot
 */
export enum EquipmentSlot {
  HEAD = 'head',
  NECK = 'neck',
  CHEST = 'chest',
  HANDS = 'hands',
  LEGS = 'legs',
  FEET = 'feet',
  MAIN_HAND = 'main_hand',
  OFF_HAND = 'off_hand',
  RING_LEFT = 'ring_left',
  RING_RIGHT = 'ring_right',
  TRINKET_1 = 'trinket_1',
  TRINKET_2 = 'trinket_2',
}

/**
 * Inventory item instance
 */
export interface IInventoryItem {
  instanceId: string; // Unique instance ID
  itemId: string; // Reference to item definition (from ObjectService)
  quantity: number; // Stack size
  maxStack?: number; // Maximum stack size (from item definition)
  weight?: number; // Weight per item
  equipped?: boolean;
  equipSlot?: EquipmentSlot;
  containerItems?: IInventoryItem[]; // Items inside this container
  metadata?: Record<string, any>; // Custom data (durability, enchantments, etc.)
}

/**
 * Inventory configuration
 */
export interface IInventoryConfig {
  maxSlots?: number; // Maximum number of inventory slots
  maxWeight?: number; // Maximum total weight
  allowStacking?: boolean; // Allow item stacking
  allowEquipment?: boolean; // Support equipment slots
  equipmentSlots?: EquipmentSlot[]; // Available equipment slots
}

/**
 * Player/NPC inventory
 */
export interface IInventory {
  ownerId: string; // Player or NPC ID
  gameId: string;
  items: IInventoryItem[];
  equippedItems: Map<EquipmentSlot, IInventoryItem>; // Equipped items by slot
  config: IInventoryConfig;
  currentWeight: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Inventory operation result
 */
export interface IInventoryResult {
  success: boolean;
  message: string;
  item?: IInventoryItem;
  removedItems?: IInventoryItem[];
  addedItems?: IInventoryItem[];
  weightChanged?: number;
}

/**
 * Item transfer request
 */
export interface IItemTransfer {
  fromInventoryId: string;
  toInventoryId: string;
  itemInstanceId: string;
  quantity: number;
}

/**
 * Item filter criteria
 */
export interface IItemFilter {
  itemId?: string;
  itemType?: string;
  equipped?: boolean;
  minWeight?: number;
  maxWeight?: number;
  tags?: string[];
  customFilter?: (item: IInventoryItem) => boolean;
}

/**
 * Item sort criteria
 */
export enum SortCriteria {
  NAME = 'name',
  WEIGHT = 'weight',
  QUANTITY = 'quantity',
  TYPE = 'type',
  RARITY = 'rarity',
}

/**
 * Sort order
 */
export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

/**
 * Inventory statistics
 */
export interface IInventoryStats {
  totalItems: number;
  uniqueItems: number;
  totalWeight: number;
  maxWeight: number;
  usedSlots: number;
  maxSlots: number;
  equippedItems: number;
  availableSlots: number;
  weightPercentage: number;
}

/**
 * Container info
 */
export interface IContainerInfo {
  containerId: string;
  itemId: string;
  capacity: number;
  currentItems: number;
  items: IInventoryItem[];
}
