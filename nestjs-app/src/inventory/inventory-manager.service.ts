import { Injectable, Logger } from '@nestjs/common';
import {
  IInventory,
  IInventoryItem,
  IInventoryConfig,
  IInventoryResult,
  IInventoryStats,
  IItemFilter,
  SortCriteria,
  SortOrder,
  EquipmentSlot,
  IContainerInfo,
} from './inventory.interfaces';
import { EventEmitterService } from '../events/event-emitter.service';
import { GameEventType } from '../events/event.interfaces';
import { v4 as uuidv4 } from 'uuid';

/**
 * Manages runtime inventory operations for players and NPCs
 */
@Injectable()
export class InventoryManagerService {
  private readonly logger = new Logger(InventoryManagerService.name);
  private inventories: Map<string, IInventory> = new Map(); // ownerId -> inventory

  constructor(private readonly eventEmitter: EventEmitterService) {}

  /**
   * Create an inventory for a player or NPC
   */
  createInventory(ownerId: string, gameId: string, config: IInventoryConfig): IInventory {
    const now = new Date().toISOString();

    const inventory: IInventory = {
      ownerId,
      gameId,
      items: [],
      equippedItems: new Map(),
      config: {
        maxSlots: config.maxSlots || 50,
        maxWeight: config.maxWeight || 1000,
        allowStacking: config.allowStacking ?? true,
        allowEquipment: config.allowEquipment ?? true,
        equipmentSlots: config.equipmentSlots || [
          EquipmentSlot.HEAD,
          EquipmentSlot.CHEST,
          EquipmentSlot.HANDS,
          EquipmentSlot.LEGS,
          EquipmentSlot.FEET,
          EquipmentSlot.MAIN_HAND,
          EquipmentSlot.OFF_HAND,
        ],
      },
      currentWeight: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.inventories.set(ownerId, inventory);
    this.logger.log(`Created inventory for ${ownerId} with ${config.maxSlots || 50} slots`);

    return inventory;
  }

  /**
   * Add item to inventory
   */
  async addItem(
    ownerId: string,
    itemId: string,
    quantity: number = 1,
    itemData?: Partial<IInventoryItem>,
  ): Promise<IInventoryResult> {
    const inventory = this.inventories.get(ownerId);

    if (!inventory) {
      return {
        success: false,
        message: `Inventory not found for ${ownerId}`,
      };
    }

    // Bug Fix 2: Validate quantity and weight
    if (quantity <= 0) {
      return {
        success: false,
        message: 'Quantity must be greater than 0',
      };
    }

    const itemWeight = itemData?.weight || 1;

    if (itemWeight < 0) {
      return {
        success: false,
        message: 'Weight cannot be negative',
      };
    }

    const totalWeight = itemWeight * quantity;

    // Check weight limit
    if (inventory.config.maxWeight) {
      if (inventory.currentWeight + totalWeight > inventory.config.maxWeight) {
        return {
          success: false,
          message: 'Inventory weight limit exceeded',
        };
      }
    }

    const maxStack = itemData?.maxStack || 99;

    // Check if we can stack with existing items
    if (inventory.config.allowStacking) {
      const existingItem = inventory.items.find(
        (item) => item.itemId === itemId && item.quantity < maxStack && !item.equipped,
      );

      if (existingItem) {
        const availableSpace = maxStack - existingItem.quantity;
        const quantityToAdd = Math.min(quantity, availableSpace);
        const remaining = quantity - quantityToAdd;

        existingItem.quantity += quantityToAdd;
        inventory.currentWeight += itemWeight * quantityToAdd;
        inventory.updatedAt = new Date().toISOString();

        await this.eventEmitter.emit(
          GameEventType.CUSTOM_EVENT,
          {
            action: 'item_added',
            ownerId,
            itemId,
            quantity: quantityToAdd,
          },
          inventory.gameId,
        );

        // If there's remaining quantity, create new stack
        if (remaining > 0) {
          return await this.addItem(ownerId, itemId, remaining, itemData);
        }

        return {
          success: true,
          message: `Added ${quantityToAdd} ${itemId} to existing stack`,
          item: existingItem,
          weightChanged: itemWeight * quantityToAdd,
        };
      }
    }

    // Check slot limit
    if (inventory.config.maxSlots) {
      if (inventory.items.length >= inventory.config.maxSlots) {
        return {
          success: false,
          message: 'Inventory is full',
        };
      }
    }

    // Create new inventory item
    const newItem: IInventoryItem = {
      instanceId: uuidv4(),
      itemId,
      quantity,
      maxStack,
      weight: itemWeight,
      equipped: false,
      metadata: itemData?.metadata || {},
    };

    inventory.items.push(newItem);
    inventory.currentWeight += totalWeight;
    inventory.updatedAt = new Date().toISOString();

    await this.eventEmitter.emit(
      GameEventType.CUSTOM_EVENT,
      {
        action: 'item_added',
        ownerId,
        itemId,
        quantity,
      },
      inventory.gameId,
    );

    this.logger.log(`Added ${quantity} ${itemId} to ${ownerId}'s inventory`);

    return {
      success: true,
      message: `Added ${quantity} ${itemId}`,
      item: newItem,
      weightChanged: totalWeight,
    };
  }

  /**
   * Remove item from inventory
   */
  async removeItem(
    ownerId: string,
    itemInstanceId: string,
    quantity: number = 1,
  ): Promise<IInventoryResult> {
    const inventory = this.inventories.get(ownerId);

    if (!inventory) {
      return {
        success: false,
        message: `Inventory not found for ${ownerId}`,
      };
    }

    const itemIndex = inventory.items.findIndex((item) => item.instanceId === itemInstanceId);

    if (itemIndex === -1) {
      return {
        success: false,
        message: 'Item not found in inventory',
      };
    }

    const item = inventory.items[itemIndex];

    if (item.quantity < quantity) {
      return {
        success: false,
        message: `Insufficient quantity (have ${item.quantity}, need ${quantity})`,
      };
    }

    // Bug Fix 1: Unequip item before removing if it's equipped
    if (item.equipped && item.equipSlot) {
      await this.unequipItem(ownerId, item.equipSlot);
    }

    const weightReduced = (item.weight || 0) * quantity;

    if (item.quantity === quantity) {
      // Remove entire stack
      inventory.items.splice(itemIndex, 1);
    } else {
      // Reduce quantity
      item.quantity -= quantity;
    }

    inventory.currentWeight -= weightReduced;
    inventory.updatedAt = new Date().toISOString();

    await this.eventEmitter.emit(
      GameEventType.CUSTOM_EVENT,
      {
        action: 'item_removed',
        ownerId,
        itemId: item.itemId,
        quantity,
      },
      inventory.gameId,
    );

    this.logger.log(`Removed ${quantity} ${item.itemId} from ${ownerId}'s inventory`);

    return {
      success: true,
      message: `Removed ${quantity} ${item.itemId}`,
      item,
      weightChanged: -weightReduced,
    };
  }

  /**
   * Equip an item
   */
  async equipItem(ownerId: string, itemInstanceId: string, slot: EquipmentSlot): Promise<IInventoryResult> {
    const inventory = this.inventories.get(ownerId);

    if (!inventory) {
      return {
        success: false,
        message: `Inventory not found for ${ownerId}`,
      };
    }

    if (!inventory.config.allowEquipment) {
      return {
        success: false,
        message: 'Equipment not allowed in this inventory',
      };
    }

    if (!inventory.config.equipmentSlots?.includes(slot)) {
      return {
        success: false,
        message: `Equipment slot ${slot} not available`,
      };
    }

    const item = inventory.items.find((item) => item.instanceId === itemInstanceId);

    if (!item) {
      return {
        success: false,
        message: 'Item not found in inventory',
      };
    }

    if (item.equipped) {
      return {
        success: false,
        message: 'Item is already equipped',
      };
    }

    // BUG FIX #3: Unequip current item in slot and properly clear its state
    const currentEquipped = inventory.equippedItems.get(slot);
    if (currentEquipped) {
      // Find the old item in the items array and clear its flags
      const oldItem = inventory.items.find(i => i.instanceId === currentEquipped.instanceId);
      if (oldItem) {
        oldItem.equipped = false;
        oldItem.equipSlot = undefined;
      }
      inventory.equippedItems.delete(slot);
    }

    // Equip new item
    item.equipped = true;
    item.equipSlot = slot;
    inventory.equippedItems.set(slot, item);
    inventory.updatedAt = new Date().toISOString();

    await this.eventEmitter.emit(
      GameEventType.CUSTOM_EVENT,
      {
        action: 'item_equipped',
        ownerId,
        itemId: item.itemId,
        slot,
      },
      inventory.gameId,
    );

    this.logger.log(`${ownerId} equipped ${item.itemId} in ${slot}`);

    return {
      success: true,
      message: `Equipped ${item.itemId} in ${slot}`,
      item,
    };
  }

  /**
   * Unequip an item
   */
  async unequipItem(ownerId: string, slot: EquipmentSlot): Promise<IInventoryResult> {
    const inventory = this.inventories.get(ownerId);

    if (!inventory) {
      return {
        success: false,
        message: `Inventory not found for ${ownerId}`,
      };
    }

    const item = inventory.equippedItems.get(slot);

    if (!item) {
      return {
        success: false,
        message: `No item equipped in ${slot}`,
      };
    }

    item.equipped = false;
    item.equipSlot = undefined;
    inventory.equippedItems.delete(slot);
    inventory.updatedAt = new Date().toISOString();

    await this.eventEmitter.emit(
      GameEventType.CUSTOM_EVENT,
      {
        action: 'item_unequipped',
        ownerId,
        itemId: item.itemId,
        slot,
      },
      inventory.gameId,
    );

    this.logger.log(`${ownerId} unequipped ${item.itemId} from ${slot}`);

    return {
      success: true,
      message: `Unequipped ${item.itemId} from ${slot}`,
      item,
    };
  }

  /**
   * Transfer item between inventories
   */
  async transferItem(
    fromOwnerId: string,
    toOwnerId: string,
    itemInstanceId: string,
    quantity: number = 1,
  ): Promise<IInventoryResult> {
    const fromInventory = this.inventories.get(fromOwnerId);
    const toInventory = this.inventories.get(toOwnerId);

    if (!fromInventory) {
      return {
        success: false,
        message: `Source inventory not found`,
      };
    }

    if (!toInventory) {
      return {
        success: false,
        message: `Destination inventory not found`,
      };
    }

    const item = fromInventory.items.find((item) => item.instanceId === itemInstanceId);

    if (!item) {
      return {
        success: false,
        message: 'Item not found in source inventory',
      };
    }

    if (item.equipped) {
      return {
        success: false,
        message: 'Cannot transfer equipped items',
      };
    }

    // Store original item state for potential rollback (deep copy to avoid mutation)
    const originalItem = JSON.parse(JSON.stringify(item));
    const originalQuantity = item.quantity;

    // Remove from source
    const removeResult = await this.removeItem(fromOwnerId, itemInstanceId, quantity);

    if (!removeResult.success) {
      return removeResult;
    }

    // Add to destination
    const addResult = await this.addItem(toOwnerId, item.itemId, quantity, {
      weight: item.weight,
      maxStack: item.maxStack,
      metadata: item.metadata,
    });

    if (!addResult.success) {
      // BUG FIX #4: Rollback - restore original item state
      // Find the item in the inventory (it may have reduced quantity or been completely removed)
      const itemIndex = fromInventory.items.findIndex(i => i.instanceId === itemInstanceId);

      if (itemIndex >= 0) {
        // Item still exists (partial removal) - restore original quantity
        fromInventory.items[itemIndex] = originalItem;
      } else {
        // Item was completely removed - add it back
        fromInventory.items.push(originalItem);
      }

      fromInventory.currentWeight += (originalItem.weight || 0) * quantity;
      fromInventory.updatedAt = new Date().toISOString();

      return {
        success: false,
        message: `Transfer failed: ${addResult.message}`,
      };
    }

    await this.eventEmitter.emit(
      GameEventType.CUSTOM_EVENT,
      {
        action: 'item_transferred',
        fromOwnerId,
        toOwnerId,
        itemId: item.itemId,
        quantity,
      },
      fromInventory.gameId,
    );

    this.logger.log(`Transferred ${quantity} ${item.itemId} from ${fromOwnerId} to ${toOwnerId}`);

    return {
      success: true,
      message: `Transferred ${quantity} ${item.itemId}`,
      item: addResult.item,
    };
  }

  /**
   * Get inventory items with optional filtering
   */
  getItems(ownerId: string, filter?: IItemFilter): IInventoryItem[] {
    const inventory = this.inventories.get(ownerId);

    if (!inventory) {
      return [];
    }

    let items = inventory.items;

    if (filter) {
      items = items.filter((item) => {
        if (filter.itemId && item.itemId !== filter.itemId) return false;
        if (filter.equipped !== undefined && item.equipped !== filter.equipped) return false;
        if (filter.minWeight && (item.weight || 0) < filter.minWeight) return false;
        if (filter.maxWeight && (item.weight || 0) > filter.maxWeight) return false;
        if (filter.customFilter && !filter.customFilter(item)) return false;
        return true;
      });
    }

    return items;
  }

  /**
   * Sort inventory items
   */
  sortItems(ownerId: string, criteria: SortCriteria, order: SortOrder = SortOrder.ASC): void {
    const inventory = this.inventories.get(ownerId);

    if (!inventory) {
      return;
    }

    inventory.items.sort((a, b) => {
      let comparison = 0;

      switch (criteria) {
        case SortCriteria.NAME:
          comparison = a.itemId.localeCompare(b.itemId);
          break;
        case SortCriteria.WEIGHT:
          comparison = (a.weight || 0) - (b.weight || 0);
          break;
        case SortCriteria.QUANTITY:
          comparison = a.quantity - b.quantity;
          break;
        default:
          comparison = 0;
      }

      return order === SortOrder.ASC ? comparison : -comparison;
    });

    inventory.updatedAt = new Date().toISOString();
    this.logger.log(`Sorted ${ownerId}'s inventory by ${criteria} ${order}`);
  }

  /**
   * Get inventory statistics
   */
  getStats(ownerId: string): IInventoryStats | undefined {
    const inventory = this.inventories.get(ownerId);

    if (!inventory) {
      return undefined;
    }

    const totalItems = inventory.items.reduce((sum, item) => sum + item.quantity, 0);
    const uniqueItems = inventory.items.length;
    const equippedItems = inventory.equippedItems.size;
    const maxSlots = inventory.config.maxSlots || 0;
    const maxWeight = inventory.config.maxWeight || 0;

    return {
      totalItems,
      uniqueItems,
      totalWeight: inventory.currentWeight,
      maxWeight,
      usedSlots: uniqueItems,
      maxSlots,
      equippedItems,
      availableSlots: maxSlots - uniqueItems,
      weightPercentage: maxWeight > 0 ? (inventory.currentWeight / maxWeight) * 100 : 0,
    };
  }

  /**
   * Get inventory
   */
  getInventory(ownerId: string): IInventory | undefined {
    return this.inventories.get(ownerId);
  }

  /**
   * Remove inventory
   */
  removeInventory(ownerId: string): void {
    this.inventories.delete(ownerId);
    this.logger.log(`Removed inventory for ${ownerId}`);
  }

  /**
   * Clear all inventories
   */
  clearAllInventories(): void {
    this.inventories.clear();
    this.logger.log('Cleared all inventories');
  }
}
