import { Injectable, Logger } from '@nestjs/common';
import { IPlayer } from '../player.interface';
import { IObject } from '../object.interface';
import { ObjectService } from '../object.service';
import { IInteractionResult } from '../entity.interface';
import { Mutex, withTimeout } from 'async-mutex';

/**
 * Player Inventory Helper
 * Handles all inventory management operations including:
 * - Adding/removing items
 * - Sorting and filtering
 * - Inventory statistics
 * - Thread-safe operations with mutex locks
 */
@Injectable()
export class PlayerInventoryHelper {
  private readonly logger = new Logger(PlayerInventoryHelper.name);

  // Concurrency protection
  private readonly playerLocks = new Map<string, Mutex>();
  private readonly LOCK_TIMEOUT = 5000;

  constructor(private readonly objectService: ObjectService) {}

  /**
   * Get or create a lock for a specific player
   */
  private getPlayerLock(playerId: string): Mutex {
    if (!this.playerLocks.has(playerId)) {
      this.playerLocks.set(playerId, new Mutex());
    }
    return this.playerLocks.get(playerId)!;
  }

  /**
   * Add item to player inventory
   * THREAD-SAFE: Acquires player lock to prevent duplicate additions
   */
  async addToInventory(
    player: IPlayer,
    itemId: string,
    updateCallback: (player: IPlayer) => Promise<boolean>,
  ): Promise<boolean> {
    const lock = this.getPlayerLock(player.id);

    try {
      return await withTimeout(lock, this.LOCK_TIMEOUT).runExclusive(
        async () => {
          if (!player.inventory.includes(itemId)) {
            player.inventory.push(itemId);
            return await updateCallback(player);
          }
          return true;
        },
      );
    } catch (error) {
      if (error.message?.includes('timeout')) {
        this.logger.error(
          `Lock timeout adding to inventory for player ${player.id}`,
        );
        return false;
      }
      throw error;
    }
  }

  /**
   * Remove item from player inventory
   * THREAD-SAFE: Acquires player lock to prevent concurrent modifications
   */
  async removeFromInventory(
    player: IPlayer,
    itemId: string,
    updateCallback: (player: IPlayer) => Promise<boolean>,
  ): Promise<boolean> {
    const lock = this.getPlayerLock(player.id);

    try {
      return await withTimeout(lock, this.LOCK_TIMEOUT).runExclusive(
        async () => {
          const index = player.inventory.indexOf(itemId);
          if (index > -1) {
            player.inventory.splice(index, 1);
            return await updateCallback(player);
          }
          return false;
        },
      );
    } catch (error) {
      if (error.message?.includes('timeout')) {
        this.logger.error(
          `Lock timeout removing from inventory for player ${player.id}`,
        );
        return false;
      }
      throw error;
    }
  }

  /**
   * Get inventory items as objects
   */
  getInventory(player: IPlayer): IObject[] {
    // Return actual objects instead of just IDs
    return player.inventory
      .map((itemId) => this.objectService.getObject(itemId))
      .filter(Boolean) as IObject[];
  }

  /**
   * Sort player's inventory by specified criteria
   */
  sortInventory(
    player: IPlayer,
    sortBy: 'name' | 'type' | 'weight' | 'value',
  ): IObject[] {
    // Get actual objects from inventory IDs
    const inventoryObjects = this.getInventory(player);

    // Sort based on criteria
    switch (sortBy) {
      case 'name':
        return inventoryObjects.sort((a, b) => a.name.localeCompare(b.name));
      case 'type':
        return inventoryObjects.sort((a, b) =>
          a.objectType.localeCompare(b.objectType),
        );
      case 'weight':
        return inventoryObjects.sort((a, b) => {
          const weightA = a.weight || a.properties?.weight || 0;
          const weightB = b.weight || b.properties?.weight || 0;
          return weightB - weightA; // Descending order
        });
      case 'value':
        return inventoryObjects.sort((a, b) => {
          const valueA = a.properties?.value || 0;
          const valueB = b.properties?.value || 0;
          return valueB - valueA; // Descending order
        });
      default:
        return inventoryObjects;
    }
  }

  /**
   * Filter inventory items matching criteria
   */
  findInventoryItems(
    player: IPlayer,
    criteria: {
      name?: string;
      objectType?: string;
      type?: string;
      material?: string;
      weight?: number | { min?: number; max?: number };
      rarity?: number | { min?: number; max?: number };
      value?: number | { min?: number; max?: number };
    },
  ): IObject[] {
    // Get actual objects from inventory IDs
    const inventoryObjects = this.getInventory(player);

    // Filter based on criteria
    return inventoryObjects.filter((obj) => {
      // Check name (partial match, case-insensitive)
      if (
        criteria.name &&
        !obj.name.toLowerCase().includes(criteria.name.toLowerCase())
      ) {
        return false;
      }

      // Check object type (exact match) - support both 'type' and 'objectType' fields
      const typeToCheck = criteria.objectType || criteria.type;
      if (typeToCheck && obj.objectType !== typeToCheck) {
        return false;
      }

      // Check material (exact match)
      if (criteria.material && obj.material !== criteria.material) {
        return false;
      }

      // Check weight (exact or range)
      if (criteria.weight !== undefined) {
        const objWeight = obj.weight || obj.properties?.weight || 0;
        if (typeof criteria.weight === 'number') {
          if (objWeight !== criteria.weight) return false;
        } else if (typeof criteria.weight === 'object') {
          if (
            criteria.weight.min !== undefined &&
            objWeight < criteria.weight.min
          ) {
            return false;
          }
          if (
            criteria.weight.max !== undefined &&
            objWeight > criteria.weight.max
          ) {
            return false;
          }
        }
      }

      // Check rarity (exact or range) - assumes rarity is in properties
      if (criteria.rarity !== undefined) {
        const objRarity = (obj.properties as any)?.rarity || 0;
        if (typeof criteria.rarity === 'number') {
          if (objRarity !== criteria.rarity) return false;
        } else if (typeof criteria.rarity === 'object') {
          if (
            criteria.rarity.min !== undefined &&
            objRarity < criteria.rarity.min
          ) {
            return false;
          }
          if (
            criteria.rarity.max !== undefined &&
            objRarity > criteria.rarity.max
          ) {
            return false;
          }
        }
      }

      // Check value (exact or range)
      if (criteria.value !== undefined) {
        const objValue = obj.properties?.value || 0;
        if (typeof criteria.value === 'number') {
          if (objValue !== criteria.value) return false;
        } else if (typeof criteria.value === 'object') {
          if (
            criteria.value.min !== undefined &&
            objValue < criteria.value.min
          ) {
            return false;
          }
          if (
            criteria.value.max !== undefined &&
            objValue > criteria.value.max
          ) {
            return false;
          }
        }
      }

      return true;
    });
  }

  /**
   * Calculate aggregate stats from inventory
   */
  getInventoryStats(player: IPlayer): {
    totalItems: number;
    totalWeight: number;
    totalValue: number;
  } {
    // Get actual objects from inventory IDs
    const inventoryObjects = this.getInventory(player);

    // Calculate totals
    const totalItems = inventoryObjects.length;
    const totalWeight = inventoryObjects.reduce((sum, obj) => {
      return sum + (obj.weight || obj.properties?.weight || 0);
    }, 0);
    const totalValue = inventoryObjects.reduce((sum, obj) => {
      return sum + (obj.properties?.value || 0);
    }, 0);

    return {
      totalItems,
      totalWeight,
      totalValue,
    };
  }

  /**
   * Drop object from inventory into room
   */
  async dropObject(
    player: IPlayer,
    objectId: string,
    updatePlayerCallback: (player: IPlayer) => Promise<boolean>,
    updateObjectCallback: (objectId: string, updates: Partial<IObject>) => Promise<void>,
  ): Promise<IInteractionResult> {
    const object = this.objectService.getObject(objectId);
    if (!object) {
      return {
        success: false,
        message: 'Object not found',
      };
    }

    // Check if object is in player's inventory
    const inventoryIndex = player.inventory.indexOf(objectId);
    if (inventoryIndex === -1) {
      return {
        success: false,
        message: `You do not have the ${object.name} in your inventory.`,
      };
    }

    // Remove from player's inventory
    player.inventory.splice(inventoryIndex, 1);
    await updatePlayerCallback(player);

    // If player has a current room, add object to that room
    if (player.roomId) {
      // Update object's room ID
      await updateObjectCallback(objectId, { roomId: player.roomId });

      return {
        success: true,
        message: `You drop the ${object.name}.`,
        effects: {
          itemDropped: objectId,
          droppedInRoom: player.roomId,
        },
      };
    }

    // If no room, just remove from inventory
    return {
      success: true,
      message: `You drop the ${object.name}.`,
      effects: {
        itemDropped: objectId,
      },
    };
  }
}
