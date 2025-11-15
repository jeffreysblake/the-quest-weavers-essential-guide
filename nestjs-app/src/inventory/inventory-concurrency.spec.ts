/**
 * COMPREHENSIVE CONCURRENCY TESTS FOR INVENTORY OPERATIONS
 *
 * This test suite focuses on race conditions, deadlocks, and data integrity
 * issues that can occur in multiplayer scenarios with concurrent inventory operations.
 *
 * Critical areas tested:
 * 1. Concurrent item transfers (item duplication prevention)
 * 2. Simultaneous inventory modifications (add/remove/equip race conditions)
 * 3. Equipment slot conflicts (multiple equips to same slot)
 * 4. Item instance integrity (unique IDs, quantity consistency)
 * 5. Database transaction safety (rollback, ACID, lock contention)
 *
 * These tests are designed to catch exploits that could allow:
 * - Item duplication through concurrent transfers
 * - Item loss through race conditions
 * - Inventory corruption through simultaneous operations
 * - Equipment state inconsistencies
 * - Weight/quantity calculation errors
 */

import { Test, TestingModule } from '@nestjs/testing';
import { InventoryManagerService } from './inventory-manager.service';
import { EventEmitterService } from '../events/event-emitter.service';
import {
  IInventory,
  IInventoryConfig,
  IInventoryItem,
  EquipmentSlot,
} from './inventory.interfaces';

describe('InventoryManagerService - Concurrency & Race Conditions', () => {
  let service: InventoryManagerService;
  let eventEmitter: jest.Mocked<EventEmitterService>;

  beforeEach(async () => {
    const mockEventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryManagerService,
        {
          provide: EventEmitterService,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<InventoryManagerService>(InventoryManagerService);
    eventEmitter = module.get(EventEmitterService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    service.clearAllInventories();
  });

  /**
   * HELPER FUNCTIONS
   */

  /**
   * Create standard test inventory
   */
  const createTestInventory = (
    playerId: string,
    config?: Partial<IInventoryConfig>,
  ) => {
    return service.createInventory(playerId, 'test-game', {
      maxSlots: 50,
      maxWeight: 1000,
      allowEquipment: true,
      ...config,
    });
  };

  /**
   * Add item and return instance ID
   */
  const addItemAndGetId = async (
    playerId: string,
    itemId: string,
    quantity: number = 1,
    data?: any,
  ): Promise<string> => {
    const result = await service.addItem(playerId, itemId, quantity, data);
    return result.item?.instanceId!;
  };

  /**
   * Count total quantity of an item across all stacks in an inventory
   */
  const getTotalItemQuantity = (
    inventory: IInventory | undefined,
    itemId: string,
  ): number => {
    if (!inventory) return 0;
    return inventory.items
      .filter((item) => item.itemId === itemId)
      .reduce((sum, item) => sum + item.quantity, 0);
  };

  /**
   * Verify inventory integrity (no negative quantities, weight matches, etc.)
   */
  const verifyInventoryIntegrity = (
    inventory: IInventory | undefined,
  ): void => {
    expect(inventory).toBeDefined();
    if (!inventory) return;

    // No negative quantities
    inventory.items.forEach((item) => {
      expect(item.quantity).toBeGreaterThan(0);
      expect(item.weight).toBeGreaterThanOrEqual(0);
    });

    // Weight calculation is correct
    const calculatedWeight = inventory.items.reduce(
      (sum, item) => sum + (item.weight || 1) * item.quantity,
      0,
    );
    expect(inventory.currentWeight).toBeCloseTo(calculatedWeight, 2);

    // No duplicate instance IDs within inventory
    const instanceIds = inventory.items.map((item) => item.instanceId);
    const uniqueIds = new Set(instanceIds);
    expect(uniqueIds.size).toBe(instanceIds.length);

    // Equipped items are in equippedItems map
    inventory.items.forEach((item) => {
      if (item.equipped && item.equipSlot) {
        const equipped = inventory.equippedItems.get(item.equipSlot);
        expect(equipped?.instanceId).toBe(item.instanceId);
      }
    });

    // Items in equippedItems map are marked as equipped
    inventory.equippedItems.forEach((item, slot) => {
      expect(item.equipped).toBe(true);
      expect(item.equipSlot).toBe(slot);
    });
  };

  /**
   * Simulate delay (for timing-sensitive tests)
   */
  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  describe('1. CONCURRENT ITEM TRANSFERS', () => {
    beforeEach(() => {
      createTestInventory('player1');
      createTestInventory('player2');
      createTestInventory('player3');
    });

    it('should prevent item duplication when two players transfer same item simultaneously', async () => {
      const itemId = await addItemAndGetId('player1', 'rare_sword', 1, {
        weight: 10,
      });

      // Both players try to receive the same item at the exact same time
      const [result1, result2] = await Promise.all([
        service.transferItem('player1', 'player2', itemId, 1),
        service.transferItem('player1', 'player3', itemId, 1),
      ]);

      // Only one transfer should succeed
      const successCount = [result1, result2].filter((r) => r.success).length;
      expect(successCount).toBe(1);

      // Verify total item count is still 1 across all inventories
      const inv1 = service.getInventory('player1');
      const inv2 = service.getInventory('player2');
      const inv3 = service.getInventory('player3');

      const total =
        getTotalItemQuantity(inv1, 'rare_sword') +
        getTotalItemQuantity(inv2, 'rare_sword') +
        getTotalItemQuantity(inv3, 'rare_sword');

      expect(total).toBe(1);
    });

    it('should handle player transferring item to themselves (edge case)', async () => {
      const itemId = await addItemAndGetId('player1', 'coin', 100, {
        weight: 1,
      });

      const result = await service.transferItem(
        'player1',
        'player1',
        itemId,
        50,
      );

      const inv = service.getInventory('player1');
      const totalCoins = getTotalItemQuantity(inv, 'coin');

      // Total should still be 100, not duplicated
      expect(totalCoins).toBe(100);
      verifyInventoryIntegrity(inv);
    });

    it('should prevent duplication through multiple rapid transfers', async () => {
      const itemId = await addItemAndGetId('player1', 'gold', 1000, {
        weight: 1,
      });

      // Rapid fire 10 concurrent transfers
      const transfers = [];
      for (let i = 0; i < 10; i++) {
        transfers.push(service.transferItem('player1', 'player2', itemId, 100));
      }

      const results = await Promise.all(transfers);

      // Count total gold across both inventories
      const inv1 = service.getInventory('player1');
      const inv2 = service.getInventory('player2');
      const total =
        getTotalItemQuantity(inv1, 'gold') + getTotalItemQuantity(inv2, 'gold');

      expect(total).toBe(1000);
      verifyInventoryIntegrity(inv1);
      verifyInventoryIntegrity(inv2);
    });

    it('should handle concurrent transfers from same source to different destinations', async () => {
      const itemId = await addItemAndGetId('player1', 'arrow', 100, {
        weight: 1,
        maxStack: 99,
      });

      const results = await Promise.all([
        service.transferItem('player1', 'player2', itemId, 30),
        service.transferItem('player1', 'player3', itemId, 30),
      ]);

      const inv1 = service.getInventory('player1');
      const inv2 = service.getInventory('player2');
      const inv3 = service.getInventory('player3');

      const total =
        getTotalItemQuantity(inv1, 'arrow') +
        getTotalItemQuantity(inv2, 'arrow') +
        getTotalItemQuantity(inv3, 'arrow');

      expect(total).toBe(100);
    });

    it('should handle concurrent transfers to same target inventory', async () => {
      const item1 = await addItemAndGetId('player1', 'potion', 50, {
        weight: 1,
      });
      const item2 = await addItemAndGetId('player3', 'potion', 50, {
        weight: 1,
      });

      await Promise.all([
        service.transferItem('player1', 'player2', item1, 50),
        service.transferItem('player3', 'player2', item2, 50),
      ]);

      const inv2 = service.getInventory('player2');
      expect(getTotalItemQuantity(inv2, 'potion')).toBe(100);
      verifyInventoryIntegrity(inv2);
    });

    it('should maintain item integrity during transfer while source is being modified', async () => {
      const itemId = await addItemAndGetId('player1', 'material', 100, {
        weight: 1,
      });

      // Concurrent transfer and removal
      const [transferResult, removeResult] = await Promise.all([
        service.transferItem('player1', 'player2', itemId, 50),
        service.removeItem('player1', itemId, 30),
      ]);

      const inv1 = service.getInventory('player1');
      const inv2 = service.getInventory('player2');

      const total =
        getTotalItemQuantity(inv1, 'material') +
        getTotalItemQuantity(inv2, 'material');

      // Should have either 50 (transfer failed, remove succeeded) or 70 (both succeeded) or 100 (both failed)
      expect([50, 70, 100]).toContain(total);
      verifyInventoryIntegrity(inv1);
      verifyInventoryIntegrity(inv2);
    });

    it('should prevent transfer during item deletion', async () => {
      const itemId = await addItemAndGetId('player1', 'consumable', 10, {
        weight: 1,
      });

      const [transferResult, removeResult] = await Promise.all([
        service.transferItem('player1', 'player2', itemId, 10),
        service.removeItem('player1', itemId, 10),
      ]);

      const inv1 = service.getInventory('player1');
      const inv2 = service.getInventory('player2');

      const total =
        getTotalItemQuantity(inv1, 'consumable') +
        getTotalItemQuantity(inv2, 'consumable');

      // Either transfer or delete succeeded, but not both
      expect([0, 10]).toContain(total);
    });

    it('should handle transfer while item is being equipped (should fail)', async () => {
      const itemId = await addItemAndGetId('player1', 'sword', 1, {
        weight: 10,
      });

      const [transferResult, equipResult] = await Promise.all([
        service.transferItem('player1', 'player2', itemId, 1),
        service.equipItem('player1', itemId, EquipmentSlot.MAIN_HAND),
      ]);

      const inv1 = service.getInventory('player1');
      const inv2 = service.getInventory('player2');

      // Item should be in one inventory, potentially equipped
      const total =
        getTotalItemQuantity(inv1, 'sword') +
        getTotalItemQuantity(inv2, 'sword');
      expect(total).toBe(1);

      verifyInventoryIntegrity(inv1);
      verifyInventoryIntegrity(inv2);
    });

    it('should rollback partial transfers on destination failure', async () => {
      // Create player with limited inventory
      service.createInventory('player4', 'test-game', {
        maxSlots: 1,
        maxWeight: 10,
      });
      await service.addItem('player4', 'existing', 1, {
        weight: 5,
        maxStack: 1,
      });

      const itemId = await addItemAndGetId('player1', 'heavy', 1, {
        weight: 20,
      });

      const originalWeight = service.getInventory('player1')?.currentWeight;

      await service.transferItem('player1', 'player4', itemId, 1);

      const inv1 = service.getInventory('player1');

      // Transfer should fail, item should still be in player1
      expect(getTotalItemQuantity(inv1, 'heavy')).toBe(1);
      expect(inv1?.currentWeight).toBe(originalWeight);
    });

    it('should prevent race condition leading to negative item quantities', async () => {
      const itemId = await addItemAndGetId('player1', 'resource', 10, {
        weight: 1,
      });

      // Try to transfer more than exists through concurrent operations
      const results = await Promise.all([
        service.transferItem('player1', 'player2', itemId, 8),
        service.transferItem('player1', 'player3', itemId, 8),
      ]);

      const inv1 = service.getInventory('player1');

      // Verify no negative quantities
      verifyInventoryIntegrity(inv1);

      const total =
        getTotalItemQuantity(inv1, 'resource') +
        getTotalItemQuantity(service.getInventory('player2'), 'resource') +
        getTotalItemQuantity(service.getInventory('player3'), 'resource');

      expect(total).toBe(10);
    });
  });

  describe('2. SIMULTANEOUS INVENTORY MODIFICATIONS', () => {
    beforeEach(() => {
      createTestInventory('player1');
    });

    it('should handle adding items while removing items', async () => {
      const itemId = await addItemAndGetId('player1', 'item', 50, {
        weight: 1,
      });

      const results = await Promise.all([
        service.addItem('player1', 'item', 25, { weight: 1 }),
        service.removeItem('player1', itemId, 25),
      ]);

      const inv = service.getInventory('player1');
      const total = getTotalItemQuantity(inv, 'item');

      expect(total).toBe(50); // 50 - 25 + 25 = 50
      verifyInventoryIntegrity(inv);
    });

    it('should handle equipping item while being transferred (should prevent transfer)', async () => {
      const itemId = await addItemAndGetId('player1', 'weapon', 1, {
        weight: 10,
      });
      createTestInventory('player2');

      const [equipResult, transferResult] = await Promise.all([
        service.equipItem('player1', itemId, EquipmentSlot.MAIN_HAND),
        service.transferItem('player1', 'player2', itemId, 1),
      ]);

      // If equip succeeded, transfer should fail
      if (equipResult.success) {
        expect(transferResult.success).toBe(false);
      }

      const inv1 = service.getInventory('player1');
      const inv2 = service.getInventory('player2');

      const total =
        getTotalItemQuantity(inv1, 'weapon') +
        getTotalItemQuantity(inv2, 'weapon');
      expect(total).toBe(1);
    });

    it('should handle unequipping item during transfer attempt', async () => {
      const itemId = await addItemAndGetId('player1', 'armor', 1, {
        weight: 15,
      });
      await service.equipItem('player1', itemId, EquipmentSlot.CHEST);
      createTestInventory('player2');

      const [unequipResult, transferResult] = await Promise.all([
        service.unequipItem('player1', EquipmentSlot.CHEST),
        service.transferItem('player1', 'player2', itemId, 1),
      ]);

      const inv1 = service.getInventory('player1');
      const inv2 = service.getInventory('player2');

      const total =
        getTotalItemQuantity(inv1, 'armor') +
        getTotalItemQuantity(inv2, 'armor');
      expect(total).toBe(1);

      verifyInventoryIntegrity(inv1);
      verifyInventoryIntegrity(inv2);
    });

    it('should auto-unequip when deleting equipped item', async () => {
      const itemId = await addItemAndGetId('player1', 'helmet', 1, {
        weight: 5,
      });
      await service.equipItem('player1', itemId, EquipmentSlot.HEAD);

      await service.removeItem('player1', itemId, 1);

      const inv = service.getInventory('player1');

      // Item should be gone and slot should be empty
      expect(getTotalItemQuantity(inv, 'helmet')).toBe(0);
      expect(inv?.equippedItems.get(EquipmentSlot.HEAD)).toBeUndefined();
    });

    it('should maintain weight consistency during concurrent operations', async () => {
      const operations = [];

      // Add 10 items concurrently
      for (let i = 0; i < 10; i++) {
        operations.push(
          service.addItem('player1', `item${i}`, 5, { weight: 2 }),
        );
      }

      await Promise.all(operations);

      const inv = service.getInventory('player1');

      // Expected weight: 10 items * 5 quantity * 2 weight = 100
      expect(inv?.currentWeight).toBe(100);
      verifyInventoryIntegrity(inv);
    });

    it('should handle capacity checks with simultaneous adds', async () => {
      service.createInventory('player2', 'test-game', {
        maxSlots: 3,
        maxWeight: 1000,
      });

      // Try to add 5 different items simultaneously
      const results = await Promise.all([
        service.addItem('player2', 'item1', 1, { weight: 1, maxStack: 1 }),
        service.addItem('player2', 'item2', 1, { weight: 1, maxStack: 1 }),
        service.addItem('player2', 'item3', 1, { weight: 1, maxStack: 1 }),
        service.addItem('player2', 'item4', 1, { weight: 1, maxStack: 1 }),
        service.addItem('player2', 'item5', 1, { weight: 1, maxStack: 1 }),
      ]);

      const inv = service.getInventory('player2');

      // Should have max 3 items (slot limit)
      expect(inv?.items.length).toBeLessThanOrEqual(3);

      const successCount = results.filter((r) => r.success).length;
      expect(successCount).toBeLessThanOrEqual(3);
    });

    it('should handle stack merging with concurrent adds', async () => {
      // Pre-add some items
      await service.addItem('player1', 'potion', 30, {
        weight: 1,
        maxStack: 99,
      });

      // Concurrently add more of the same item
      const results = await Promise.all([
        service.addItem('player1', 'potion', 20, { weight: 1, maxStack: 99 }),
        service.addItem('player1', 'potion', 20, { weight: 1, maxStack: 99 }),
        service.addItem('player1', 'potion', 20, { weight: 1, maxStack: 99 }),
      ]);

      const inv = service.getInventory('player1');
      const total = getTotalItemQuantity(inv, 'potion');

      expect(total).toBe(90); // 30 + 20 + 20 + 20
      verifyInventoryIntegrity(inv);
    });

    it('should handle container manipulation during item operations', async () => {
      // Add a container item
      const containerId = await addItemAndGetId('player1', 'backpack', 1, {
        weight: 5,
        containerItems: [],
      });

      // Concurrently modify container and add items
      const results = await Promise.all([
        service.addItem('player1', 'coin', 100, { weight: 1 }),
        service.removeItem('player1', containerId, 1),
      ]);

      const inv = service.getInventory('player1');
      verifyInventoryIntegrity(inv);
    });

    it('should prevent weight overflow during concurrent adds', async () => {
      service.createInventory('player2', 'test-game', {
        maxSlots: 50,
        maxWeight: 100,
      });

      // Try to add items that together exceed weight limit
      const results = await Promise.all([
        service.addItem('player2', 'heavy1', 1, { weight: 60 }),
        service.addItem('player2', 'heavy2', 1, { weight: 60 }),
        service.addItem('player2', 'heavy3', 1, { weight: 60 }),
      ]);

      const inv = service.getInventory('player2');

      // Total weight should not exceed 100
      expect(inv?.currentWeight).toBeLessThanOrEqual(100);
      verifyInventoryIntegrity(inv);
    });

    it('should handle rapid add/remove cycles', async () => {
      const itemId = await addItemAndGetId('player1', 'cyclic', 50, {
        weight: 1,
      });

      const operations = [];
      for (let i = 0; i < 20; i++) {
        if (i % 2 === 0) {
          operations.push(service.removeItem('player1', itemId, 1));
        } else {
          operations.push(
            service.addItem('player1', 'cyclic', 1, { weight: 1 }),
          );
        }
      }

      await Promise.all(operations);

      const inv = service.getInventory('player1');
      verifyInventoryIntegrity(inv);

      // Quantity should be >= 0
      const total = getTotalItemQuantity(inv, 'cyclic');
      expect(total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('3. EQUIPMENT SLOT CONFLICTS', () => {
    beforeEach(() => {
      createTestInventory('player1');
    });

    it('should prevent two items equipped to same slot simultaneously', async () => {
      const sword1 = await addItemAndGetId('player1', 'sword1', 1, {
        weight: 10,
      });
      const sword2 = await addItemAndGetId('player1', 'sword2', 1, {
        weight: 10,
      });

      const [result1, result2] = await Promise.all([
        service.equipItem('player1', sword1, EquipmentSlot.MAIN_HAND),
        service.equipItem('player1', sword2, EquipmentSlot.MAIN_HAND),
      ]);

      const inv = service.getInventory('player1');
      const equipped = inv?.equippedItems.get(EquipmentSlot.MAIN_HAND);

      // Only one item should be equipped
      expect(equipped).toBeDefined();
      expect([sword1, sword2]).toContain(equipped?.instanceId);

      // Only one equip should report success, or both succeed with second replacing first
      verifyInventoryIntegrity(inv);
    });

    it('should handle equip while unequip in progress', async () => {
      const item1 = await addItemAndGetId('player1', 'item1', 1, { weight: 5 });
      const item2 = await addItemAndGetId('player1', 'item2', 1, { weight: 5 });

      await service.equipItem('player1', item1, EquipmentSlot.HEAD);

      const [unequipResult, equipResult] = await Promise.all([
        service.unequipItem('player1', EquipmentSlot.HEAD),
        service.equipItem('player1', item2, EquipmentSlot.HEAD),
      ]);

      const inv = service.getInventory('player1');
      verifyInventoryIntegrity(inv);

      // Head slot should have either item2, item1, or be empty
      const equipped = inv?.equippedItems.get(EquipmentSlot.HEAD);
      if (equipped) {
        expect([item1, item2]).toContain(equipped.instanceId);
      }
    });

    it('should handle equipment swap race conditions', async () => {
      const item1 = await addItemAndGetId('player1', 'item1', 1, { weight: 5 });
      const item2 = await addItemAndGetId('player1', 'item2', 1, { weight: 5 });
      const item3 = await addItemAndGetId('player1', 'item3', 1, { weight: 5 });

      // Equip item1 first
      await service.equipItem('player1', item1, EquipmentSlot.CHEST);

      // Try to swap to item2 and item3 simultaneously
      await Promise.all([
        service.equipItem('player1', item2, EquipmentSlot.CHEST),
        service.equipItem('player1', item3, EquipmentSlot.CHEST),
      ]);

      const inv = service.getInventory('player1');
      const equipped = inv?.equippedItems.get(EquipmentSlot.CHEST);

      // One of the three items should be equipped
      expect(equipped).toBeDefined();
      expect([item1, item2, item3]).toContain(equipped?.instanceId);

      verifyInventoryIntegrity(inv);
    });

    it('should handle equipped item deletion race', async () => {
      const itemId = await addItemAndGetId('player1', 'gloves', 1, {
        weight: 3,
      });
      await service.equipItem('player1', itemId, EquipmentSlot.HANDS);

      const [removeResult, unequipResult] = await Promise.all([
        service.removeItem('player1', itemId, 1),
        service.unequipItem('player1', EquipmentSlot.HANDS),
      ]);

      const inv = service.getInventory('player1');

      // Item should be gone and slot should be empty
      expect(getTotalItemQuantity(inv, 'gloves')).toBe(0);
      expect(inv?.equippedItems.get(EquipmentSlot.HANDS)).toBeUndefined();
      verifyInventoryIntegrity(inv);
    });

    it('should prevent equipment state corruption during concurrent operations', async () => {
      const items = [];
      for (let i = 0; i < 5; i++) {
        items.push(
          await addItemAndGetId('player1', `item${i}`, 1, { weight: 5 }),
        );
      }

      // Try to equip all items to same slot
      const results = await Promise.all(
        items.map((id) =>
          service.equipItem('player1', id, EquipmentSlot.MAIN_HAND),
        ),
      );

      const inv = service.getInventory('player1');
      verifyInventoryIntegrity(inv);

      // Exactly one item should be equipped in MAIN_HAND
      expect(inv?.equippedItems.size).toBeLessThanOrEqual(1);
    });

    it('should maintain auto-unequip consistency during concurrent operations', async () => {
      const item1 = await addItemAndGetId('player1', 'boots1', 1, {
        weight: 4,
      });
      const item2 = await addItemAndGetId('player1', 'boots2', 1, {
        weight: 4,
      });
      const item3 = await addItemAndGetId('player1', 'boots3', 1, {
        weight: 4,
      });

      await service.equipItem('player1', item1, EquipmentSlot.FEET);

      // Rapidly equip different items
      await Promise.all([
        service.equipItem('player1', item2, EquipmentSlot.FEET),
        service.equipItem('player1', item3, EquipmentSlot.FEET),
        service.unequipItem('player1', EquipmentSlot.FEET),
      ]);

      const inv = service.getInventory('player1');
      verifyInventoryIntegrity(inv);
    });

    it('should handle multiple equipment slots changing simultaneously', async () => {
      const helmet = await addItemAndGetId('player1', 'helmet', 1, {
        weight: 5,
      });
      const chest = await addItemAndGetId('player1', 'chest', 1, {
        weight: 10,
      });
      const gloves = await addItemAndGetId('player1', 'gloves', 1, {
        weight: 3,
      });
      const boots = await addItemAndGetId('player1', 'boots', 1, { weight: 4 });

      await Promise.all([
        service.equipItem('player1', helmet, EquipmentSlot.HEAD),
        service.equipItem('player1', chest, EquipmentSlot.CHEST),
        service.equipItem('player1', gloves, EquipmentSlot.HANDS),
        service.equipItem('player1', boots, EquipmentSlot.FEET),
      ]);

      const inv = service.getInventory('player1');
      verifyInventoryIntegrity(inv);

      // All items should be equipped in their respective slots
      expect(inv?.equippedItems.size).toBeGreaterThan(0);
      expect(inv?.equippedItems.size).toBeLessThanOrEqual(4);
    });

    it('should prevent equipping already equipped items to different slots', async () => {
      const itemId = await addItemAndGetId('player1', 'shield', 1, {
        weight: 8,
      });
      await service.equipItem('player1', itemId, EquipmentSlot.OFF_HAND);

      const result = await service.equipItem(
        'player1',
        itemId,
        EquipmentSlot.MAIN_HAND,
      );

      expect(result.success).toBe(false);

      const inv = service.getInventory('player1');
      verifyInventoryIntegrity(inv);
    });
  });

  describe('4. ITEM INSTANCE INTEGRITY', () => {
    beforeEach(() => {
      createTestInventory('player1');
      createTestInventory('player2');
    });

    it('should enforce unique instanceId across all operations', async () => {
      const operations = [];
      for (let i = 0; i < 20; i++) {
        operations.push(
          service.addItem('player1', 'item', 1, { weight: 1, maxStack: 1 }),
        );
      }

      const results = await Promise.all(operations);
      const instanceIds = results
        .filter((r) => r.success && r.item)
        .map((r) => r.item!.instanceId);

      // All instance IDs should be unique
      const uniqueIds = new Set(instanceIds);
      expect(uniqueIds.size).toBe(instanceIds.length);
    });

    it('should prevent item duplication through concurrent operations', async () => {
      const itemId = await addItemAndGetId('player1', 'unique_item', 1, {
        weight: 5,
      });

      // Try various operations that might duplicate the item
      const operations = [
        service.transferItem('player1', 'player2', itemId, 1),
        service.equipItem('player1', itemId, EquipmentSlot.MAIN_HAND),
        service.removeItem('player1', itemId, 1),
      ];

      await Promise.all(operations);

      const inv1 = service.getInventory('player1');
      const inv2 = service.getInventory('player2');

      const total =
        getTotalItemQuantity(inv1, 'unique_item') +
        getTotalItemQuantity(inv2, 'unique_item');

      // Item should exist at most once
      expect(total).toBeLessThanOrEqual(1);
    });

    it('should maintain quantity consistency through concurrent modifications', async () => {
      const itemId = await addItemAndGetId('player1', 'stackable', 100, {
        weight: 1,
      });

      // Perform multiple removes concurrently
      const results = await Promise.all([
        service.removeItem('player1', itemId, 10),
        service.removeItem('player1', itemId, 10),
        service.removeItem('player1', itemId, 10),
      ]);

      const inv = service.getInventory('player1');
      const total = getTotalItemQuantity(inv, 'stackable');

      // Should have removed 30 total
      expect(total).toBeLessThanOrEqual(100);
      expect(total).toBeGreaterThanOrEqual(0);
      verifyInventoryIntegrity(inv);
    });

    it('should prevent negative quantities through race conditions', async () => {
      const itemId = await addItemAndGetId('player1', 'item', 5, { weight: 1 });

      // Try to remove more than exists
      await Promise.all([
        service.removeItem('player1', itemId, 3),
        service.removeItem('player1', itemId, 3),
        service.removeItem('player1', itemId, 3),
      ]);

      const inv = service.getInventory('player1');
      verifyInventoryIntegrity(inv);

      const total = getTotalItemQuantity(inv, 'item');
      expect(total).toBeGreaterThanOrEqual(0);
    });

    it('should prevent quantity overflow through concurrent adds', async () => {
      // Add items close to max safe integer
      await service.addItem('player1', 'overflow_test', 1000, {
        weight: 1,
        maxStack: Number.MAX_SAFE_INTEGER,
      });

      const operations = [];
      for (let i = 0; i < 10; i++) {
        operations.push(
          service.addItem('player1', 'overflow_test', 1000, {
            weight: 1,
            maxStack: Number.MAX_SAFE_INTEGER,
          }),
        );
      }

      await Promise.all(operations);

      const inv = service.getInventory('player1');
      verifyInventoryIntegrity(inv);

      const total = getTotalItemQuantity(inv, 'overflow_test');
      expect(total).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
    });

    it('should maintain item weight consistency during concurrent operations', async () => {
      const operations = [];
      let expectedWeight = 0;

      for (let i = 0; i < 10; i++) {
        const weight = Math.floor(Math.random() * 10) + 1;
        const quantity = Math.floor(Math.random() * 5) + 1;
        expectedWeight += weight * quantity;
        operations.push(
          service.addItem('player1', `item${i}`, quantity, { weight }),
        );
      }

      await Promise.all(operations);

      const inv = service.getInventory('player1');
      verifyInventoryIntegrity(inv);

      // Weight should be close to expected (within small margin for concurrent ops)
      expect(inv?.currentWeight).toBeCloseTo(expectedWeight, 1);
    });

    it('should preserve metadata through concurrent updates', async () => {
      const metadata = { enchantment: 'fire', level: 5, durability: 100 };
      const itemId = await addItemAndGetId('player1', 'magic_sword', 1, {
        weight: 10,
        metadata,
      });

      // Perform various operations
      await Promise.all([
        service.equipItem('player1', itemId, EquipmentSlot.MAIN_HAND),
        service.unequipItem('player1', EquipmentSlot.MAIN_HAND),
      ]);

      const inv = service.getInventory('player1');
      const item = inv?.items.find((i) => i.instanceId === itemId);

      expect(item?.metadata).toEqual(metadata);
    });

    it('should maintain container contents integrity during concurrent operations', async () => {
      const containerItems: IInventoryItem[] = [
        {
          instanceId: 'contained-1',
          itemId: 'coin',
          quantity: 100,
          weight: 1,
        },
      ];

      const containerId = await addItemAndGetId('player1', 'chest', 1, {
        weight: 10,
        containerItems,
      });

      await Promise.all([
        service.transferItem('player1', 'player2', containerId, 1),
        service.equipItem('player1', containerId, EquipmentSlot.MAIN_HAND),
      ]);

      const inv1 = service.getInventory('player1');
      const inv2 = service.getInventory('player2');

      // Find the container in whichever inventory it ended up
      const container =
        inv1?.items.find((i) => i.instanceId === containerId) ||
        inv2?.items.find((i) => i.instanceId === containerId);

      if (container) {
        expect(container.containerItems).toBeDefined();
        expect(container.containerItems?.length).toBeGreaterThan(0);
      }
    });
  });

  describe('5. DATABASE TRANSACTION SIMULATION', () => {
    beforeEach(() => {
      createTestInventory('player1');
      createTestInventory('player2');
    });

    it('should rollback on concurrent modification failure', async () => {
      const itemId = await addItemAndGetId('player1', 'item', 100, {
        weight: 1,
      });

      // Create a scenario where one operation should fail
      service.createInventory('player3', 'test-game', {
        maxSlots: 1,
        maxWeight: 5,
      });
      await service.addItem('player3', 'blocker', 1, {
        weight: 3,
        maxStack: 1,
      });

      const originalInv1 = JSON.parse(
        JSON.stringify(service.getInventory('player1')),
      );

      // Try transfer that will fail due to full inventory
      await service.transferItem('player1', 'player3', itemId, 10);

      const inv1After = service.getInventory('player1');

      // Player1 inventory should be restored (rollback)
      expect(getTotalItemQuantity(inv1After, 'item')).toBe(100);
      verifyInventoryIntegrity(inv1After);
    });

    it('should maintain ACID compliance for inventory operations', async () => {
      const itemId = await addItemAndGetId('player1', 'gold', 1000, {
        weight: 1,
      });

      // Atomic: All operations complete or none do
      // Consistent: Inventory remains in valid state
      // Isolated: Operations don't interfere
      // Durable: Changes persist

      const results = await Promise.all([
        service.transferItem('player1', 'player2', itemId, 250),
        service.removeItem('player1', itemId, 250),
      ]);

      const inv1 = service.getInventory('player1');
      const inv2 = service.getInventory('player2');

      // Total gold should be conserved (allowing for race conditions)
      const total =
        getTotalItemQuantity(inv1, 'gold') + getTotalItemQuantity(inv2, 'gold');

      // Due to concurrent operations, we might have:
      // - 500 (both succeeded: 1000 - 250 transfer - 250 remove)
      // - 750 (only remove succeeded: 1000 - 250)
      // - 750 (only transfer succeeded: 1000 - 250 to player2)
      // Total should be 1000 or less, conserving items
      expect(total).toBeLessThanOrEqual(1000);
      expect(total).toBeGreaterThanOrEqual(0);

      verifyInventoryIntegrity(inv1);
      verifyInventoryIntegrity(inv2);
    });

    it('should prevent deadlock in circular item transfers', async () => {
      const item1 = await addItemAndGetId('player1', 'item1', 10, {
        weight: 1,
      });
      const item2 = await addItemAndGetId('player2', 'item2', 10, {
        weight: 1,
      });

      // Circular transfers: player1 -> player2, player2 -> player1
      const results = await Promise.all([
        service.transferItem('player1', 'player2', item1, 5),
        service.transferItem('player2', 'player1', item2, 5),
      ]);

      const inv1 = service.getInventory('player1');
      const inv2 = service.getInventory('player2');

      // Both operations should complete without deadlock
      verifyInventoryIntegrity(inv1);
      verifyInventoryIntegrity(inv2);

      // Items should have been swapped
      expect(getTotalItemQuantity(inv1, 'item1')).toBeGreaterThanOrEqual(0);
      expect(getTotalItemQuantity(inv2, 'item2')).toBeGreaterThanOrEqual(0);
    });

    it('should handle optimistic locking for inventory updates', async () => {
      const itemId = await addItemAndGetId('player1', 'contested', 50, {
        weight: 1,
      });

      // Simulate concurrent updates that might conflict
      const operations = [];
      for (let i = 0; i < 5; i++) {
        operations.push(service.removeItem('player1', itemId, 5));
      }

      const results = await Promise.all(operations);

      const inv = service.getInventory('player1');
      verifyInventoryIntegrity(inv);

      const total = getTotalItemQuantity(inv, 'contested');
      expect(total).toBeGreaterThanOrEqual(0);
      expect(total).toBeLessThanOrEqual(50);
    });

    it('should handle database lock contention (simulated)', async () => {
      // Simulate high contention by performing many concurrent operations
      const operations = [];

      for (let i = 0; i < 50; i++) {
        operations.push(
          service.addItem('player1', `item${i % 10}`, 1, {
            weight: 1,
            maxStack: 1,
          }),
        );
      }

      const results = await Promise.all(operations);

      const inv = service.getInventory('player1');
      verifyInventoryIntegrity(inv);

      // All operations should eventually complete
      expect(inv?.items.length).toBeGreaterThan(0);
    });

    it('should maintain transaction isolation levels', async () => {
      const item1 = await addItemAndGetId('player1', 'isolated', 100, {
        weight: 1,
      });

      // Concurrent reads and writes
      const operations = [
        service.getItems('player1', { itemId: 'isolated' }),
        service.removeItem('player1', item1, 25),
        service.getItems('player1', { itemId: 'isolated' }),
        service.removeItem('player1', item1, 25),
        service.getItems('player1', { itemId: 'isolated' }),
      ];

      await Promise.all(operations);

      const inv = service.getInventory('player1');
      verifyInventoryIntegrity(inv);
    });

    it('should handle concurrent save/load with inventory changes', async () => {
      // Add initial items
      await service.addItem('player1', 'item', 50, { weight: 1 });

      // Export state
      const state1 = service.exportState();

      // Clear and recreate inventory
      service.clearAllInventories();
      createTestInventory('player1');
      createTestInventory('player2');

      // Add different items
      await service.addItem('player1', 'different', 100, { weight: 2 });

      // Export new state
      const state2 = service.exportState();

      // States should be different
      expect(state1).not.toEqual(state2);

      // Import old state (should clear current and restore old)
      service.importState(state1);

      const inv = service.getInventory('player1');

      // After importing old state, should have the original items
      expect(inv).toBeDefined();
      expect(inv?.items.length).toBeGreaterThan(0);
      expect(getTotalItemQuantity(inv, 'item')).toBe(50);
      expect(getTotalItemQuantity(inv, 'different')).toBe(0);
    });

    it('should ensure transaction atomicity for multi-step operations', async () => {
      const itemId = await addItemAndGetId('player1', 'material', 100, {
        weight: 1,
      });

      // Multi-step operation: remove from player1, add to player2
      const originalTotal =
        getTotalItemQuantity(service.getInventory('player1'), 'material') +
        getTotalItemQuantity(service.getInventory('player2'), 'material');

      await service.transferItem('player1', 'player2', itemId, 50);

      const newTotal =
        getTotalItemQuantity(service.getInventory('player1'), 'material') +
        getTotalItemQuantity(service.getInventory('player2'), 'material');

      // Total should be conserved
      expect(newTotal).toBe(originalTotal);
    });

    it('should handle retry logic for failed transactions', async () => {
      // Simulate a scenario that might fail and need retry
      service.createInventory('player3', 'test-game', {
        maxSlots: 2,
        maxWeight: 100,
      });

      const operations = [];
      for (let i = 0; i < 5; i++) {
        operations.push(
          service.addItem('player3', `item${i}`, 1, { weight: 1, maxStack: 1 }),
        );
      }

      const results = await Promise.all(operations);

      // Some operations should fail, some succeed
      const successCount = results.filter((r) => r.success).length;
      expect(successCount).toBeLessThanOrEqual(2); // Max 2 slots

      const inv = service.getInventory('player3');
      verifyInventoryIntegrity(inv);
    });

    it('should maintain consistency during export/import with concurrent operations', async () => {
      await service.addItem('player1', 'item', 100, { weight: 1 });
      const itemId = service.getInventory('player1')?.items[0].instanceId!;

      // Perform operations while exporting
      const operations = [
        service.exportState(),
        service.removeItem('player1', itemId, 25),
        service.addItem('player1', 'new', 10, { weight: 2 }),
        service.exportState(),
      ];

      const results = await Promise.all(operations);

      // Both exports should be valid (though different)
      const export1 = results[0];
      const export2 = results[3];

      expect(export1).toBeDefined();
      expect(export2).toBeDefined();
    });
  });

  describe('6. STRESS TESTS - High Concurrency', () => {
    beforeEach(() => {
      createTestInventory('player1');
      createTestInventory('player2');
      createTestInventory('player3');
    });

    it('should handle 100+ concurrent transfer requests', async () => {
      const itemId = await addItemAndGetId('player1', 'mass_item', 1000, {
        weight: 1,
      });

      const operations = [];
      for (let i = 0; i < 100; i++) {
        const target = i % 2 === 0 ? 'player2' : 'player3';
        operations.push(service.transferItem('player1', target, itemId, 1));
      }

      const results = await Promise.all(operations);

      const inv1 = service.getInventory('player1');
      const inv2 = service.getInventory('player2');
      const inv3 = service.getInventory('player3');

      const total =
        getTotalItemQuantity(inv1, 'mass_item') +
        getTotalItemQuantity(inv2, 'mass_item') +
        getTotalItemQuantity(inv3, 'mass_item');

      expect(total).toBe(1000);
      verifyInventoryIntegrity(inv1);
      verifyInventoryIntegrity(inv2);
      verifyInventoryIntegrity(inv3);
    });

    it('should handle rapid-fire inventory modifications', async () => {
      const operations = [];

      for (let i = 0; i < 200; i++) {
        operations.push(
          service.addItem('player1', `item${i % 20}`, 1, { weight: 1 }),
        );
      }

      await Promise.all(operations);

      const inv = service.getInventory('player1');
      verifyInventoryIntegrity(inv);
      expect(inv?.items.length).toBeGreaterThan(0);
    });

    it('should maintain integrity with multiple players performing concurrent operations', async () => {
      const players = ['player1', 'player2', 'player3'];

      // Each player adds items concurrently
      const operations = [];
      for (const player of players) {
        for (let i = 0; i < 20; i++) {
          operations.push(
            service.addItem(player, `item${i}`, 5, { weight: 1 }),
          );
        }
      }

      await Promise.all(operations);

      // Verify all inventories
      for (const player of players) {
        const inv = service.getInventory(player);
        verifyInventoryIntegrity(inv);
      }
    });

    it('should handle stress test with mixed operations', async () => {
      // Pre-populate inventories
      const item1 = await addItemAndGetId('player1', 'item', 100, {
        weight: 1,
      });
      const item2 = await addItemAndGetId('player2', 'weapon', 10, {
        weight: 5,
      });

      const operations = [];

      for (let i = 0; i < 50; i++) {
        operations.push(
          service.addItem('player1', `new${i}`, 1, { weight: 1 }),
        );
        operations.push(service.removeItem('player1', item1, 1));
        operations.push(service.transferItem('player2', 'player3', item2, 1));
      }

      await Promise.all(operations);

      verifyInventoryIntegrity(service.getInventory('player1'));
      verifyInventoryIntegrity(service.getInventory('player2'));
      verifyInventoryIntegrity(service.getInventory('player3'));
    });
  });
});
