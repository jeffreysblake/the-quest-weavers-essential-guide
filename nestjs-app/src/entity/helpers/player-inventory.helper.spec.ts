import { Test, TestingModule } from '@nestjs/testing';
import { PlayerInventoryHelper } from './player-inventory.helper';
import { ObjectService } from '../object.service';
import { IPlayer } from '../player.interface';
import { IObject } from '../object.interface';

describe('PlayerInventoryHelper', () => {
  let helper: PlayerInventoryHelper;
  let mockObjectService: jest.Mocked<Partial<ObjectService>>;

  const createPlayer = (inventory: string[] = []): IPlayer => ({
    id: 'player-1',
    gameId: 'game-123',
    name: 'Test Hero',
    position: { x: 5, y: 5, z: 0 },
    health: 100,
    maxHealth: 100,
    inventory,
    roomId: 'room-1',
  });

  const mockObjects: Record<string, IObject> = {
    'sword-1': {
      id: 'sword-1',
      name: 'Iron Sword',
      description: 'A sharp blade',
      objectType: 'weapon',
      material: 'iron',
      weight: 5,
      type: 'object',
      properties: { value: 100 },
    },
    'potion-1': {
      id: 'potion-1',
      name: 'Health Potion',
      description: 'Restores health',
      objectType: 'consumable',
      weight: 1,
      type: 'object',
      properties: { value: 50 },
    },
    'key-1': {
      id: 'key-1',
      name: 'Brass Key',
      description: 'Opens doors',
      objectType: 'key',
      material: 'brass',
      weight: 0.5,
      type: 'object',
      properties: { value: 10 },
    },
    'armor-1': {
      id: 'armor-1',
      name: 'Steel Armor',
      description: 'Heavy armor',
      objectType: 'armor',
      material: 'steel',
      properties: { weight: 25, value: 500 },
      type: 'object',
    },
  };

  beforeEach(async () => {
    mockObjectService = {
      getObject: jest.fn((id: string) => mockObjects[id]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayerInventoryHelper,
        { provide: ObjectService, useValue: mockObjectService },
      ],
    }).compile();

    helper = module.get<PlayerInventoryHelper>(PlayerInventoryHelper);
  });

  afterEach(() => jest.clearAllMocks());

  // ==============================================================================
  // ADD TO INVENTORY (10 tests)
  // ==============================================================================

  describe('addToInventory', () => {
    it('should add new item to empty inventory', async () => {
      const player = createPlayer([]);
      const callback = jest.fn().mockResolvedValue(true);

      const result = await helper.addToInventory(player, 'sword-1', callback);

      expect(result).toBe(true);
      expect(player.inventory).toContain('sword-1');
      expect(callback).toHaveBeenCalledWith(player);
    });

    it('should add item to non-empty inventory', async () => {
      const player = createPlayer(['key-1']);
      const callback = jest.fn().mockResolvedValue(true);

      await helper.addToInventory(player, 'sword-1', callback);

      expect(player.inventory).toEqual(['key-1', 'sword-1']);
    });

    it('should not duplicate existing items', async () => {
      const player = createPlayer(['sword-1']);
      const callback = jest.fn().mockResolvedValue(true);

      const result = await helper.addToInventory(player, 'sword-1', callback);

      expect(result).toBe(true);
      expect(player.inventory).toEqual(['sword-1']);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle callback returning false', async () => {
      const player = createPlayer([]);
      const callback = jest.fn().mockResolvedValue(false);

      const result = await helper.addToInventory(player, 'sword-1', callback);

      expect(result).toBe(false);
      expect(player.inventory).toContain('sword-1');
    });

    it('should handle timeout errors gracefully', async () => {
      const player = createPlayer([]);
      expect(helper['LOCK_TIMEOUT']).toBe(5000);

      const timeoutError = new Error('Lock acquisition timed out');
      const callback = jest.fn().mockRejectedValue(timeoutError);

      const result = await helper.addToInventory(player, 'sword-1', callback);

      expect(result).toBe(false);
    });

    it('should propagate non-timeout errors', async () => {
      const player = createPlayer([]);
      const callback = jest.fn().mockRejectedValue(new Error('DB error'));

      await expect(
        helper.addToInventory(player, 'sword-1', callback),
      ).rejects.toThrow('DB error');
    });

    it('should handle concurrent additions', async () => {
      const player = createPlayer([]);
      const callback = jest.fn().mockResolvedValue(true);

      const results = await Promise.all([
        helper.addToInventory(player, 'sword-1', callback),
        helper.addToInventory(player, 'potion-1', callback),
        helper.addToInventory(player, 'key-1', callback),
      ]);

      expect(results).toEqual([true, true, true]);
      expect(player.inventory).toHaveLength(3);
      expect(callback).toHaveBeenCalledTimes(3);
    });

    it('should prevent concurrent duplicates', async () => {
      const player = createPlayer([]);
      const callback = jest.fn().mockResolvedValue(true);

      const results = await Promise.all([
        helper.addToInventory(player, 'sword-1', callback),
        helper.addToInventory(player, 'sword-1', callback),
        helper.addToInventory(player, 'sword-1', callback),
      ]);

      expect(player.inventory.filter((id) => id === 'sword-1')).toHaveLength(1);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should use different locks for different players', async () => {
      const player1 = createPlayer([]);
      player1.id = 'player-1';
      const player2 = createPlayer([]);
      player2.id = 'player-2';

      const results = await Promise.all([
        helper.addToInventory(player1, 'sword-1', jest.fn().mockResolvedValue(true)),
        helper.addToInventory(player2, 'sword-1', jest.fn().mockResolvedValue(true)),
      ]);

      expect(results).toEqual([true, true]);
      expect(player1.inventory).toContain('sword-1');
      expect(player2.inventory).toContain('sword-1');
    });

    it('should maintain insertion order', async () => {
      const player = createPlayer(['key-1']);
      const callback = jest.fn().mockResolvedValue(true);

      await helper.addToInventory(player, 'sword-1', callback);
      await helper.addToInventory(player, 'potion-1', callback);

      expect(player.inventory).toEqual(['key-1', 'sword-1', 'potion-1']);
    });
  });

  // ==============================================================================
  // REMOVE FROM INVENTORY (9 tests)
  // ==============================================================================

  describe('removeFromInventory', () => {
    it('should remove existing item', async () => {
      const player = createPlayer(['sword-1', 'potion-1']);
      const callback = jest.fn().mockResolvedValue(true);

      const result = await helper.removeFromInventory(player, 'sword-1', callback);

      expect(result).toBe(true);
      expect(player.inventory).toEqual(['potion-1']);
      expect(callback).toHaveBeenCalledWith(player);
    });

    it('should return false for non-existent item', async () => {
      const player = createPlayer(['potion-1']);
      const callback = jest.fn().mockResolvedValue(true);

      const result = await helper.removeFromInventory(player, 'sword-1', callback);

      expect(result).toBe(false);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle empty inventory', async () => {
      const player = createPlayer([]);
      const callback = jest.fn().mockResolvedValue(true);

      const result = await helper.removeFromInventory(player, 'sword-1', callback);

      expect(result).toBe(false);
      expect(callback).not.toHaveBeenCalled();
    });

    it('should remove first occurrence of duplicates', async () => {
      const player = createPlayer(['sword-1', 'potion-1', 'sword-1']);
      const callback = jest.fn().mockResolvedValue(true);

      await helper.removeFromInventory(player, 'sword-1', callback);

      expect(player.inventory).toEqual(['potion-1', 'sword-1']);
    });

    it('should handle timeout errors gracefully', async () => {
      const player = createPlayer(['sword-1']);
      expect(helper['LOCK_TIMEOUT']).toBe(5000);

      const callback = jest.fn().mockRejectedValue(new Error('Lock acquisition timed out'));

      const result = await helper.removeFromInventory(player, 'sword-1', callback);

      expect(result).toBe(false);
    });

    it('should propagate non-timeout errors', async () => {
      const player = createPlayer(['sword-1']);
      const callback = jest.fn().mockRejectedValue(new Error('DB error'));

      await expect(
        helper.removeFromInventory(player, 'sword-1', callback),
      ).rejects.toThrow('DB error');
    });

    it('should handle concurrent removals', async () => {
      const player = createPlayer(['sword-1', 'potion-1', 'key-1']);
      const callback = jest.fn().mockResolvedValue(true);

      const results = await Promise.all([
        helper.removeFromInventory(player, 'sword-1', callback),
        helper.removeFromInventory(player, 'potion-1', callback),
        helper.removeFromInventory(player, 'key-1', callback),
      ]);

      expect(results).toEqual([true, true, true]);
      expect(player.inventory).toHaveLength(0);
    });

    it('should handle mixed add/remove operations', async () => {
      const player = createPlayer(['sword-1']);

      await Promise.all([
        helper.addToInventory(player, 'potion-1', jest.fn().mockResolvedValue(true)),
        helper.removeFromInventory(player, 'sword-1', jest.fn().mockResolvedValue(true)),
        helper.addToInventory(player, 'key-1', jest.fn().mockResolvedValue(true)),
      ]);

      expect(player.inventory).toContain('potion-1');
      expect(player.inventory).toContain('key-1');
      expect(player.inventory).not.toContain('sword-1');
    });

    it('should serialize add/remove on same player', async () => {
      const player = createPlayer([]);

      await Promise.all([
        helper.addToInventory(player, 'sword-1', jest.fn().mockResolvedValue(true)),
        helper.removeFromInventory(player, 'sword-1', jest.fn().mockResolvedValue(true)),
      ]);

      expect(player.inventory.filter((id) => id === 'sword-1').length).toBeLessThanOrEqual(1);
    });
  });

  // ==============================================================================
  // GET INVENTORY (4 tests)
  // ==============================================================================

  describe('getInventory', () => {
    it('should return objects for valid IDs', () => {
      const player = createPlayer(['sword-1', 'potion-1', 'key-1']);

      const result = helper.getInventory(player);

      expect(result).toHaveLength(3);
      expect(result).toContainEqual(mockObjects['sword-1']);
      expect(result).toContainEqual(mockObjects['potion-1']);
    });

    it('should return empty array for empty inventory', () => {
      const player = createPlayer([]);
      expect(helper.getInventory(player)).toEqual([]);
    });

    it('should filter out invalid IDs', () => {
      const player = createPlayer(['sword-1', 'invalid', 'potion-1']);

      const result = helper.getInventory(player);

      expect(result).toHaveLength(2);
    });

    it('should call objectService for each ID', () => {
      const player = createPlayer(['sword-1', 'potion-1']);

      helper.getInventory(player);

      expect(mockObjectService.getObject).toHaveBeenCalledTimes(2);
    });
  });

  // ==============================================================================
  // SORT INVENTORY (6 tests)
  // ==============================================================================

  describe('sortInventory', () => {
    it('should sort by name alphabetically', () => {
      const player = createPlayer(['sword-1', 'key-1', 'potion-1']);

      const result = helper.sortInventory(player, 'name');

      expect(result.map((o) => o.name)).toEqual(['Brass Key', 'Health Potion', 'Iron Sword']);
    });

    it('should sort by type alphabetically', () => {
      const player = createPlayer(['sword-1', 'key-1', 'potion-1']);

      const result = helper.sortInventory(player, 'type');

      expect(result.map((o) => o.objectType)).toEqual(['consumable', 'key', 'weapon']);
    });

    it('should sort by weight descending', () => {
      const player = createPlayer(['key-1', 'sword-1', 'armor-1']);

      const result = helper.sortInventory(player, 'weight');

      expect(result[0].name).toBe('Steel Armor');
      expect(result[result.length - 1].name).toBe('Brass Key');
    });

    it('should sort by value descending', () => {
      const player = createPlayer(['key-1', 'sword-1', 'armor-1']);

      const result = helper.sortInventory(player, 'value');

      expect(result.map((o) => o.properties?.value)).toEqual([500, 100, 10]);
    });

    it('should handle missing properties', () => {
      const player = createPlayer(['armor-1']);

      const result = helper.sortInventory(player, 'weight');

      expect(result).toHaveLength(1);
    });

    it('should return empty for empty inventory', () => {
      expect(helper.sortInventory(createPlayer([]), 'name')).toEqual([]);
    });
  });

  // ==============================================================================
  // FIND INVENTORY ITEMS (10 tests)
  // ==============================================================================

  describe('findInventoryItems', () => {
    it('should filter by name (partial, case-insensitive)', () => {
      const player = createPlayer(['sword-1', 'potion-1']);

      const result = helper.findInventoryItems(player, { name: 'health' });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Health Potion');
    });

    it('should filter by objectType', () => {
      const player = createPlayer(['sword-1', 'potion-1']);

      const result = helper.findInventoryItems(player, { objectType: 'weapon' });

      expect(result[0].name).toBe('Iron Sword');
    });

    it('should filter by type field', () => {
      const player = createPlayer(['sword-1', 'potion-1']);

      const result = helper.findInventoryItems(player, { type: 'weapon' });

      expect(result[0].name).toBe('Iron Sword');
    });

    it('should filter by material', () => {
      const player = createPlayer(['sword-1', 'key-1']);

      const result = helper.findInventoryItems(player, { material: 'iron' });

      expect(result[0].name).toBe('Iron Sword');
    });

    it('should filter by exact weight', () => {
      const player = createPlayer(['sword-1', 'potion-1', 'key-1']);

      const result = helper.findInventoryItems(player, { weight: 5 });

      expect(result[0].name).toBe('Iron Sword');
    });

    it('should filter by weight range', () => {
      const player = createPlayer(['sword-1', 'potion-1', 'armor-1']);

      const result = helper.findInventoryItems(player, { weight: { min: 1, max: 10 } });

      expect(result).toHaveLength(2);
    });

    it('should filter by exact value', () => {
      const player = createPlayer(['sword-1', 'potion-1']);

      const result = helper.findInventoryItems(player, { value: 50 });

      expect(result[0].name).toBe('Health Potion');
    });

    it('should filter by value range', () => {
      const player = createPlayer(['sword-1', 'potion-1', 'key-1']);

      const result = helper.findInventoryItems(player, { value: { min: 40, max: 150 } });

      expect(result).toHaveLength(2);
    });

    it('should filter by multiple criteria', () => {
      const player = createPlayer(['sword-1', 'potion-1', 'armor-1']);

      const result = helper.findInventoryItems(player, {
        material: 'iron',
        weight: { max: 10 },
        value: { min: 50 },
      });

      expect(result[0].name).toBe('Iron Sword');
    });

    it('should return empty when no matches', () => {
      const player = createPlayer(['sword-1']);

      const result = helper.findInventoryItems(player, { name: 'nonexistent' });

      expect(result).toEqual([]);
    });
  });

  // ==============================================================================
  // GET INVENTORY STATS (4 tests)
  // ==============================================================================

  describe('getInventoryStats', () => {
    it('should calculate stats correctly', () => {
      const player = createPlayer(['sword-1', 'potion-1', 'key-1']);

      const result = helper.getInventoryStats(player);

      expect(result).toEqual({
        totalItems: 3,
        totalWeight: 6.5,
        totalValue: 160,
      });
    });

    it('should return zeros for empty inventory', () => {
      const result = helper.getInventoryStats(createPlayer([]));

      expect(result).toEqual({ totalItems: 0, totalWeight: 0, totalValue: 0 });
    });

    it('should handle weight in properties', () => {
      const player = createPlayer(['armor-1']);

      const result = helper.getInventoryStats(player);

      expect(result.totalWeight).toBe(25);
      expect(result.totalValue).toBe(500);
    });

    it('should handle missing properties', () => {
      mockObjectService.getObject = jest.fn().mockReturnValue({
        id: 'test-1',
        name: 'Test',
        objectType: 'misc',
        type: 'object',
      });

      const player = createPlayer(['test-1']);
      const result = helper.getInventoryStats(player);

      expect(result).toEqual({ totalItems: 1, totalWeight: 0, totalValue: 0 });
    });
  });

  // ==============================================================================
  // DROP OBJECT (8 tests)
  // ==============================================================================

  describe('dropObject', () => {
    it('should drop object with room ID', async () => {
      const player = createPlayer(['sword-1']);
      const updatePlayer = jest.fn().mockResolvedValue(true);
      const updateObject = jest.fn().mockResolvedValue(undefined);

      const result = await helper.dropObject(player, 'sword-1', updatePlayer, updateObject);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Iron Sword');
      expect(result.effects?.itemDropped).toBe('sword-1');
      expect(result.effects?.droppedInRoom).toBe('room-1');
      expect(player.inventory).not.toContain('sword-1');
      expect(updateObject).toHaveBeenCalledWith('sword-1', { roomId: 'room-1' });
    });

    it('should drop object without room ID', async () => {
      const player = createPlayer(['sword-1']);
      player.roomId = undefined;
      const updatePlayer = jest.fn().mockResolvedValue(true);
      const updateObject = jest.fn();

      const result = await helper.dropObject(player, 'sword-1', updatePlayer, updateObject);

      expect(result.success).toBe(true);
      expect(result.effects?.droppedInRoom).toBeUndefined();
      expect(updateObject).not.toHaveBeenCalled();
    });

    it('should fail when object not found', async () => {
      const result = await helper.dropObject(
        createPlayer([]),
        'invalid',
        jest.fn(),
        jest.fn(),
      );

      expect(result.success).toBe(false);
      expect(result.message).toBe('Object not found');
    });

    it('should fail when not in inventory', async () => {
      const result = await helper.dropObject(
        createPlayer(['potion-1']),
        'sword-1',
        jest.fn(),
        jest.fn(),
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('do not have');
    });

    it('should remove from multi-item inventory', async () => {
      const player = createPlayer(['sword-1', 'potion-1', 'key-1']);

      await helper.dropObject(
        player,
        'potion-1',
        jest.fn().mockResolvedValue(true),
        jest.fn(),
      );

      expect(player.inventory).toEqual(['sword-1', 'key-1']);
    });

    it('should handle duplicate items', async () => {
      const player = createPlayer(['sword-1', 'potion-1', 'sword-1']);

      await helper.dropObject(
        player,
        'sword-1',
        jest.fn().mockResolvedValue(true),
        jest.fn(),
      );

      expect(player.inventory).toEqual(['potion-1', 'sword-1']);
    });

    it('should handle null room ID', async () => {
      const player = createPlayer(['sword-1']);
      player.roomId = null as any;

      const result = await helper.dropObject(
        player,
        'sword-1',
        jest.fn().mockResolvedValue(true),
        jest.fn(),
      );

      expect(result.success).toBe(true);
      expect(result.effects?.droppedInRoom).toBeUndefined();
    });

    it('should update player even if object update fails', async () => {
      const player = createPlayer(['sword-1']);
      const updatePlayer = jest.fn().mockResolvedValue(true);
      const updateObject = jest.fn().mockRejectedValue(new Error('DB error'));

      await expect(
        helper.dropObject(player, 'sword-1', updatePlayer, updateObject),
      ).rejects.toThrow('DB error');

      expect(player.inventory).not.toContain('sword-1');
      expect(updatePlayer).toHaveBeenCalled();
    });
  });
});
