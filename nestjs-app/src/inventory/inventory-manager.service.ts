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
import { Mutex, withTimeout } from 'async-mutex';

/**
 * Manages runtime inventory operations for players and NPCs
 *
 * CONCURRENCY PROTECTION:
 * - Uses Mutex locks to prevent race conditions in inventory operations
 * - Map-level lock protects the inventories Map from concurrent modifications
 * - Per-inventory locks prevent concurrent modifications to individual inventories
 * - Transfer operations acquire locks in sorted order (by ownerId) to prevent deadlocks
 * - All locks have 5-second timeout to prevent permanent deadlocks
 */
@Injectable()
export class InventoryManagerService {
  private readonly logger = new Logger(InventoryManagerService.name);
  private inventories: Map<string, IInventory> = new Map(); // ownerId -> inventory

  // Concurrency protection
  private readonly mapLock = withTimeout(new Mutex(), 5000); // Protects inventories Map
  private readonly inventoryLocks = new Map<string, Mutex>(); // Per-inventory locks
  private readonly LOCK_TIMEOUT = 5000; // 5 seconds

  constructor(private readonly eventEmitter: EventEmitterService) {}

  /**
   * Get or create a lock for a specific inventory
   * This ensures each inventory has its own lock for fine-grained concurrency control
   */
  private getInventoryLock(ownerId: string): Mutex {
    if (!this.inventoryLocks.has(ownerId)) {
      this.inventoryLocks.set(ownerId, new Mutex());
    }
    return this.inventoryLocks.get(ownerId)!;
  }

  /**
   * Create an inventory for a player or NPC
   * THREAD-SAFE: Acquires map lock to prevent concurrent Map modifications
   */
  async createInventory(
    ownerId: string,
    gameId: string,
    config: IInventoryConfig,
  ): Promise<IInventory> {
    return await this.mapLock.runExclusive(async () => {
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
      this.logger.log(
        `Created inventory for ${ownerId} with ${config.maxSlots || 50} slots`,
      );

      return inventory;
    });
  }

  /**
   * Internal unlocked method to add item
   * IMPORTANT: This method does NOT acquire locks - caller must already hold lock
   * Used by transferItem which already holds locks on both inventories
   */
  private async addItemInternal(
    inventory: IInventory,
    itemId: string,
    quantity: number = 1,
    itemData?: Partial<IInventoryItem>,
  ): Promise<IInventoryResult> {
    // Check weight limit
    const itemWeight = itemData?.weight || 0;
    const totalWeight = itemWeight * quantity;

    if (
      inventory.maxWeight !== undefined &&
      inventory.currentWeight + totalWeight > inventory.maxWeight
    ) {
      return {
        success: false,
        message: `Adding item would exceed weight limit (${inventory.maxWeight})`,
      };
    }

    // Check slot limit
    if (
      inventory.maxSlots !== undefined &&
      inventory.items.length >= inventory.maxSlots &&
      !inventory.allowStacking
    ) {
      return {
        success: false,
        message: `Inventory is full (max ${inventory.maxSlots} slots)`,
      };
    }

    // Try to stack with existing item
    if (inventory.allowStacking) {
      const existingItem = inventory.items.find(
        (item) => item.itemId === itemId && item.quantity < (item.maxStack || 99),
      );

      if (existingItem) {
        const canAdd = Math.min(
          quantity,
          (existingItem.maxStack || 99) - existingItem.quantity,
        );
        existingItem.quantity += canAdd;
        inventory.currentWeight += itemWeight * canAdd;
        inventory.updatedAt = new Date().toISOString();

        if (canAdd < quantity) {
          // Stack is full, create new stack
          const newItem: IInventoryItem = {
            instanceId: this.generateInstanceId(),
            itemId,
            quantity: quantity - canAdd,
            weight: itemWeight,
            maxStack: itemData?.maxStack,
            metadata: itemData?.metadata,
            equipped: false,
          };
          inventory.items.push(newItem);
        }

        await this.eventEmitter.emit(
          GameEventType.CUSTOM_EVENT,
          {
            action: 'item_added',
            ownerId: inventory.ownerId,
            itemId,
            quantity,
          },
          inventory.gameId,
        );

        return {
          success: true,
          message: `Added ${quantity} ${itemId}`,
          item: existingItem,
          weightChanged: totalWeight,
        };
      }
    }

    // Create new item
    const newItem: IInventoryItem = {
      instanceId: this.generateInstanceId(),
      itemId,
      quantity,
      weight: itemWeight,
      maxStack: itemData?.maxStack,
      metadata: itemData?.metadata,
      equipped: false,
    };

    inventory.items.push(newItem);
    inventory.currentWeight += totalWeight;
    inventory.updatedAt = new Date().toISOString();

    await this.eventEmitter.emit(
      GameEventType.CUSTOM_EVENT,
      {
        action: 'item_added',
        ownerId: inventory.ownerId,
        itemId,
        quantity,
      },
      inventory.gameId,
    );

    this.logger.log(`Added ${quantity} ${itemId} to ${inventory.ownerId}'s inventory`);

    return {
      success: true,
      message: `Added ${quantity} ${itemId}`,
      item: newItem,
      weightChanged: totalWeight,
    };
  }

  /**
   * Add item to inventory
   * THREAD-SAFE: Acquires inventory lock to prevent concurrent modifications
   */
  async addItem(
    ownerId: string,
    itemId: string,
    quantity: number = 1,
    itemData?: Partial<IInventoryItem>,
  ): Promise<IInventoryResult> {
    const lock = this.getInventoryLock(ownerId);

    try {
      return await withTimeout(lock, this.LOCK_TIMEOUT).runExclusive(
        async () => {
          const inventory = this.inventories.get(ownerId);

          if (!inventory) {
            return {
              success: false,
              message: `Inventory not found for ${ownerId}`,
            };
          }

          return await this.addItemInternal(inventory, itemId, quantity, itemData);
        },
      );
    } catch (error) {
      if (error.message?.includes('timeout')) {
        this.logger.error(`Lock timeout adding item to inventory ${ownerId}`);
        return {
          success: false,
          message: 'Operation timed out, please try again',
        };
      }
      throw error;
    }
  }

  /**
   * Internal unlocked method to remove item
   * IMPORTANT: This method does NOT acquire locks - caller must already hold lock
   * Used by transferItem which already holds locks on both inventories
   */
  private async removeItemInternal(
    inventory: IInventory,
    itemInstanceId: string,
    quantity: number = 1,
  ): Promise<IInventoryResult> {
    const itemIndex = inventory.items.findIndex(
      (item) => item.instanceId === itemInstanceId,
    );

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

    if (item.equipped) {
      return {
        success: false,
        message: 'Cannot remove equipped item without unequipping first',
      };
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
        ownerId: inventory.ownerId,
        itemId: item.itemId,
        quantity,
      },
      inventory.gameId,
    );

    this.logger.log(
      `Removed ${quantity} ${item.itemId} from ${inventory.ownerId}'s inventory`,
    );

    return {
      success: true,
      message: `Removed ${quantity} ${item.itemId}`,
      item,
      weightChanged: -weightReduced,
    };
  }

  /**
   * Remove item from inventory
   * THREAD-SAFE: Acquires inventory lock to prevent concurrent modifications
   */
  async removeItem(
    ownerId: string,
    itemInstanceId: string,
    quantity: number = 1,
  ): Promise<IInventoryResult> {
    const lock = this.getInventoryLock(ownerId);

    try {
      return await withTimeout(lock, this.LOCK_TIMEOUT).runExclusive(
        async () => {
          const inventory = this.inventories.get(ownerId);

          if (!inventory) {
            return {
              success: false,
              message: `Inventory not found for ${ownerId}`,
            };
          }

          // Check if item is equipped and unequip first
          const item = inventory.items.find((i) => i.instanceId === itemInstanceId);
          if (item && item.equipped && item.equipSlot) {
            await this.unequipItem(ownerId, item.equipSlot);
          }

          return await this.removeItemInternal(inventory, itemInstanceId, quantity);
        },
      );
    } catch (error) {
      if (error.message?.includes('timeout')) {
        this.logger.error(
          `Lock timeout removing item from inventory ${ownerId}`,
        );
        return {
          success: false,
          message: 'Operation timed out, please try again',
        };
      }
      throw error;
    }
  }

  /**
   * Equip an item
   * THREAD-SAFE: Acquires inventory lock to prevent concurrent equipment changes
   */
  async equipItem(
    ownerId: string,
    itemInstanceId: string,
    slot: EquipmentSlot,
  ): Promise<IInventoryResult> {
    const lock = this.getInventoryLock(ownerId);

    try {
      return await withTimeout(lock, this.LOCK_TIMEOUT).runExclusive(
        async () => {
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

          // Try to find by instanceId first, then by itemId as fallback
          let item = inventory.items.find(
            (item) => item.instanceId === itemInstanceId,
          );

          if (!item) {
            // Fallback: try to find by itemId
            item = inventory.items.find(
              (item) => item.itemId === itemInstanceId,
            );
          }

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

          // Auto-unequip current item in slot if one exists
          const currentEquipped = inventory.equippedItems.get(slot);
          if (currentEquipped) {
            currentEquipped.equipped = false;
            currentEquipped.equipSlot = undefined;
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
        },
      );
    } catch (error) {
      if (error.message?.includes('timeout')) {
        this.logger.error(
          `Lock timeout equipping item in inventory ${ownerId}`,
        );
        return {
          success: false,
          message: 'Operation timed out, please try again',
        };
      }
      throw error;
    }
  }

  /**
   * Unequip an item
   * THREAD-SAFE: Acquires inventory lock to prevent concurrent equipment changes
   */
  async unequipItem(
    ownerId: string,
    slot: EquipmentSlot,
  ): Promise<IInventoryResult> {
    const lock = this.getInventoryLock(ownerId);

    try {
      return await withTimeout(lock, this.LOCK_TIMEOUT).runExclusive(
        async () => {
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
        },
      );
    } catch (error) {
      if (error.message?.includes('timeout')) {
        this.logger.error(
          `Lock timeout unequipping item in inventory ${ownerId}`,
        );
        return {
          success: false,
          message: 'Operation timed out, please try again',
        };
      }
      throw error;
    }
  }

  /**
   * Transfer item between inventories
   * THREAD-SAFE: Acquires locks on BOTH inventories in sorted order to prevent deadlocks
   *
   * DEADLOCK PREVENTION:
   * - Always acquire locks in sorted order (by ownerId)
   * - This ensures consistent lock ordering across all transfer operations
   * - Example: Transfer A->B and B->A both acquire locks in [A, B] order
   */
  async transferItem(
    fromOwnerId: string,
    toOwnerId: string,
    itemInstanceId: string,
    quantity: number = 1,
  ): Promise<IInventoryResult> {
    // Acquire locks in sorted order to prevent deadlocks
    const [firstOwner, secondOwner] = [fromOwnerId, toOwnerId].sort();
    const firstLock = this.getInventoryLock(firstOwner);
    const secondLock = this.getInventoryLock(secondOwner);

    try {
      return await withTimeout(firstLock, this.LOCK_TIMEOUT).runExclusive(
        async () => {
          return await withTimeout(secondLock, this.LOCK_TIMEOUT).runExclusive(
            async () => {
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

              const item = fromInventory.items.find(
                (item) => item.instanceId === itemInstanceId,
              );

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

              // FIX: Use internal methods to avoid deadlock (we already hold locks on both inventories)
              // Remove from source
              const removeResult = await this.removeItemInternal(
                fromInventory,
                itemInstanceId,
                quantity,
              );

              if (!removeResult.success) {
                return removeResult;
              }

              // Add to destination
              const addResult = await this.addItemInternal(
                toInventory,
                item.itemId,
                quantity,
                {
                  weight: item.weight,
                  maxStack: item.maxStack,
                  metadata: item.metadata,
                },
              );

              if (!addResult.success) {
                // BUG FIX #4: Rollback - restore original item state
                // Find the item in the inventory (it may have reduced quantity or been completely removed)
                const itemIndex = fromInventory.items.findIndex(
                  (i) => i.instanceId === itemInstanceId,
                );

                if (itemIndex >= 0) {
                  // Item still exists (partial removal) - restore original quantity
                  fromInventory.items[itemIndex] = originalItem;
                } else {
                  // Item was completely removed - add it back
                  fromInventory.items.push(originalItem);
                }

                fromInventory.currentWeight +=
                  (originalItem.weight || 0) * quantity;
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

              this.logger.log(
                `Transferred ${quantity} ${item.itemId} from ${fromOwnerId} to ${toOwnerId}`,
              );

              return {
                success: true,
                message: `Transferred ${quantity} ${item.itemId}`,
                item: addResult.item,
              };
            },
          );
        },
      );
    } catch (error) {
      if (error.message?.includes('timeout')) {
        this.logger.error(
          `Lock timeout transferring item between inventories ${fromOwnerId} -> ${toOwnerId}`,
        );
        return {
          success: false,
          message: 'Operation timed out, please try again',
        };
      }
      throw error;
    }
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
        if (filter.equipped !== undefined && item.equipped !== filter.equipped)
          return false;
        if (filter.minWeight && (item.weight || 0) < filter.minWeight)
          return false;
        if (filter.maxWeight && (item.weight || 0) > filter.maxWeight)
          return false;
        if (filter.customFilter && !filter.customFilter(item)) return false;
        return true;
      });
    }

    return items;
  }

  /**
   * Sort inventory items
   */
  sortItems(
    ownerId: string,
    criteria: SortCriteria,
    order: SortOrder = SortOrder.ASC,
  ): void {
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

    const totalItems = inventory.items.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );
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
      weightPercentage:
        maxWeight > 0 ? (inventory.currentWeight / maxWeight) * 100 : 0,
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

  /**
   * Export all inventories to a serializable format
   * Converts Maps to arrays for JSON serialization
   */
  exportState(): any {
    const inventoriesArray: any[] = [];

    this.inventories.forEach((inventory, ownerId) => {
      // Convert equippedItems Map to array of [slot, item] pairs
      const equippedItemsArray: [string, IInventoryItem][] = [];
      inventory.equippedItems.forEach((item, slot) => {
        equippedItemsArray.push([slot, item]);
      });

      inventoriesArray.push({
        ownerId,
        inventory: {
          ...inventory,
          equippedItems: equippedItemsArray, // Convert Map to array
        },
      });
    });

    return { inventories: inventoriesArray };
  }

  /**
   * Import inventories from a serialized format
   * Converts arrays back to Maps
   */
  importState(state: any): void {
    if (!state || !state.inventories) {
      return;
    }

    this.inventories.clear();

    for (const { ownerId, inventory } of state.inventories) {
      // Convert equippedItems array back to Map
      const equippedItemsMap = new Map<EquipmentSlot, IInventoryItem>();

      if (Array.isArray(inventory.equippedItems)) {
        for (const [slot, item] of inventory.equippedItems) {
          equippedItemsMap.set(slot as EquipmentSlot, item);
        }
      }

      const restoredInventory: IInventory = {
        ...inventory,
        equippedItems: equippedItemsMap,
      };

      this.inventories.set(ownerId, restoredInventory);
    }

    this.logger.log(`Imported ${this.inventories.size} inventories`);
  }

  /**
   * Generate a unique instance ID for inventory items
   * @returns Unique instance ID combining timestamp and random string
   */
  private generateInstanceId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
