/**
 * Item System for Quest Weaver
 * Handles items in rooms and player inventory with detailed state management
 */

export interface ItemState {
  // Basic item properties
  id: string;
  name: string;
  description: string;
  type?: 'weapon' | 'armor' | 'consumable' | 'key' | 'quest-item' | 'container' | 'door' | 'tree' | 'glass';
  value?: number; // For currency or other values
  weight?: number;
  /**
   * Indicates whether the item can be picked up and placed in the player's inventory.
   * This is the canonical property name. Default: true
   */
  isPortable?: boolean;
  
  // Container properties
  isContainer?: boolean;
  containedItems?: string[]; // IDs of items inside container
  
  // Special item states (for doors, trees, etc.)
  state?: 'normal' | 'burned' | 'broken' | 'locked' | 'unlocked' | 'shattered';
  health?: number;
  
  // For items that can be interacted with
  requiresKey?: string; // ID of key needed to unlock/interact
  interactionEffect?: 'burn' | 'explode' | 'unlock' | 'lock'; // What happens when used
}

export interface Inventory {
  items: ItemState[];
}

export class ItemSystem {
  private inventory: Map<string, Inventory> = new Map();
  private allItems: Map<string, ItemState> = new Map();
  
  /**
   * Create a new item with detailed state management
   */
  createItem(
    id: string,
    name: string,
    description: string,
    type?: 'weapon' | 'armor' | 'consumable' | 'key' | 'quest-item' | 'container' | 'door' | 'tree' | 'glass',
    value?: number,
    weight?: number,
    isPortable?: boolean,
    isContainer?: boolean,
    containedItems?: string[],
    state?: 'normal' | 'burned' | 'broken' | 'locked' | 'unlocked' | 'shattered',
    health?: number,
    requiresKey?: string,
    interactionEffect?: 'burn' | 'explode' | 'unlock' | 'lock'
  ): ItemState {
    const item: ItemState = {
      id,
      name,
      description,
      type,
      value,
      weight,
      isPortable: isPortable !== undefined ? isPortable : true, // Default to true if not specified
      isContainer,
      containedItems,
      state,
      health,
      requiresKey,
      interactionEffect
    };

    this.allItems.set(id, item);
    return item;
  }
  
  /**
   * Get an item by ID
   */
  getItem(itemId: string): ItemState | undefined {
    return this.allItems.get(itemId);
  }
  
  /**
   * Update an item's state (like burning a tree or unlocking a door)
   */
  updateItemState(itemId: string, newState: 'normal' | 'burned' | 'broken' | 'locked' | 'unlocked' | 'shattered', health?: number): boolean {
    const item = this.getItem(itemId);
    if (!item) return false;
    
    // Update the state
    item.state = newState;
    if (health !== undefined) {
      item.health = health;
    }
    
    return true;
  }
  
  /**
   * Add an item to a player's inventory
   */
  addItemToInventory(playerId: string, item: ItemState): void {
    let inventory = this.inventory.get(playerId);
    
    if (!inventory) {
      inventory = { items: [] };
      this.inventory.set(playerId, inventory);
    }
    
    // Check if the item is already in inventory
    const existingItemIndex = inventory.items.findIndex(i => i.id === item.id);
    
    if (existingItemIndex === -1) {
      inventory.items.push(item);
    } else {
      // If it exists, update its properties or just leave as-is
      // For simplicity, we'll assume items are unique by ID
    }
  }
  
  /**
   * Remove an item from a player's inventory
   */
  removeItemFromInventory(playerId: string, itemId: string): boolean {
    const inventory = this.inventory.get(playerId);
    
    if (!inventory) {
      return false;
    }
    
    const initialLength = inventory.items.length;
    inventory.items = inventory.items.filter(item => item.id !== itemId);
    
    // Return true if an item was removed
    return inventory.items.length < initialLength;
  }
  
  /**
   * Get a player's inventory
   */
  getInventory(playerId: string): Inventory | undefined {
    return this.inventory.get(playerId);
  }
  
  /**
   * Check if a player has an item in their inventory
   */
  hasItem(playerId: string, itemId: string): boolean {
    const inventory = this.inventory.get(playerId);
    
    if (!inventory) {
      return false;
    }
    
    return inventory.items.some(item => item.id === itemId);
  }
  
  /**
   * Open a container item (like chest)
   */
  openContainer(playerId: string, containerItemId: string): ItemState[] {
    const playerInventory = this.getInventory(playerId);
    if (!playerInventory) return [];
    
    // Find the container in inventory
    const containerItem = playerInventory.items.find(item => item.id === containerItemId);
    if (!containerItem || !containerItem.isContainer || !containerItem.containedItems) {
      return [];
    }
    
    // Return all items contained within this container
    const containedItems: ItemState[] = [];
    for (const itemId of containerItem.containedItems) {
      const item = this.getItem(itemId);
      if (item) {
        containedItems.push(item);
      }
    }
    
    return containedItems;
  }
  
  /**
   * Add an item to a container
   */
  addItemToContainer(containerItemId: string, itemId: string): boolean {
    const containerItem = this.getItem(containerItemId);
    if (!containerItem || !containerItem.isContainer) return false;
    
    // Initialize containedItems array if needed
    if (!containerItem.containedItems) {
      containerItem.containedItems = [];
    }
    
    // Add item to container if not already present
    if (!containerItem.containedItems.includes(itemId)) {
      containerItem.containedItems.push(itemId);
    }
    
    return true; // Return true if operation succeeded (idempotent)
  }
  
  /**
   * Remove an item from a container
   */
  removeItemFromContainer(containerItemId: string, itemId: string): boolean {
    const containerItem = this.getItem(containerItemId);
    if (!containerItem || !containerItem.isContainer || !containerItem.containedItems) return false;
    
    // Remove item from container
    const index = containerItem.containedItems.indexOf(itemId);
    if (index > -1) {
      containerItem.containedItems.splice(index, 1);
      return true;
    }
    
    return false; // Item not found in container
  }
  
  /**
   * Use an item with specific effects
   */
  useItem(playerId: string, itemId: string): boolean {
    const inventory = this.getInventory(playerId);
    if (!inventory) return false;
    
    // Find the item in player's inventory
    const itemIndex = inventory.items.findIndex(item => item.id === itemId);
    if (itemIndex === -1) return false;
    
    const item = inventory.items[itemIndex];
    
    // Handle specific interaction effects
    switch(item.interactionEffect) {
      case 'burn':
        // For example, burning a tree
        this.updateItemState(item.id, 'burned');
        return true;
      case 'explode':
        // For example, glass shattering
        this.updateItemState(item.id, 'shattered');
        return true;
      case 'unlock':
        // For example, unlocking a door
        if (item.requiresKey) {
          // In a real implementation, we'd check if player has the key
          this.updateItemState(item.id, 'unlocked');
          return true;
        }
        return false;
      case 'lock':
        // For example, locking something
        this.updateItemState(item.id, 'locked');
        return true;
      default:
        return true; // Default to successful use
    }
  }
}