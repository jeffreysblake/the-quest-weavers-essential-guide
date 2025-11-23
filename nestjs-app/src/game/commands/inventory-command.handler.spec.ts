import { Test, TestingModule } from '@nestjs/testing';
import { InventoryCommandHandler } from './inventory-command.handler';
import { ObjectService } from '../../entity/object.service';

describe('InventoryCommandHandler', () => {
  let handler: InventoryCommandHandler;
  let mockObjectService: jest.Mocked<Partial<ObjectService>>;

  const mockPlayer = {
    id: 'player-1',
    gameId: 'game-123',
    name: 'Hero',
    position: { x: 5, y: 5, z: 0 },
    health: 100,
    maxHealth: 100,
    inventory: ['sword-1', 'potion-1'],
    roomId: 'room-1',
  };

  const mockRoom = {
    id: 'room-1',
    name: 'Test Room',
    description: 'A test room',
    position: { x: 0, y: 0, z: 0 },
    size: { width: 10, height: 10, depth: 3 },
    objects: [],
    players: ['player-1'],
  };

  const mockSword = {
    id: 'sword-1',
    name: 'Iron Sword',
    description: 'A sharp iron blade.',
    roomId: 'room-1',
  };

  const mockPotion = {
    id: 'potion-1',
    name: 'Health Potion',
    description: 'Restores 50 HP.',
    roomId: 'room-1',
  };

  const mockKey = {
    id: 'key-1',
    name: 'Brass Key',
    description: 'An old brass key.',
    roomId: 'room-1',
  };

  beforeEach(async () => {
    mockObjectService = {
      getObject: jest.fn((id: string) => {
        const objects = {
          'sword-1': mockSword,
          'potion-1': mockPotion,
          'key-1': mockKey,
        };
        return objects[id];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryCommandHandler,
        { provide: ObjectService, useValue: mockObjectService },
      ],
    }).compile();

    handler = module.get<InventoryCommandHandler>(InventoryCommandHandler);
  });

  // ==============================================================================
  // EMPTY INVENTORY TESTS (3 tests)
  // ==============================================================================

  describe('Empty Inventory', () => {
    it('should return empty message when inventory is an empty array', async () => {
      const player = { ...mockPlayer, inventory: [] };

      const result = await handler.handle(player, mockRoom);

      expect(result.success).toBe(true);
      expect(result.type).toBe('inventory');
      expect(result.message).toBe('You are not carrying anything.');
      expect(result.items).toEqual([]);
    });

    it('should return empty message when inventory is null', async () => {
      const player = { ...mockPlayer, inventory: null };

      const result = await handler.handle(player, mockRoom);

      expect(result.success).toBe(true);
      expect(result.type).toBe('inventory');
      expect(result.message).toBe('You are not carrying anything.');
      expect(result.items).toEqual([]);
    });

    it('should return empty message when inventory is undefined', async () => {
      const player = { ...mockPlayer, inventory: undefined };

      const result = await handler.handle(player, mockRoom);

      expect(result.success).toBe(true);
      expect(result.type).toBe('inventory');
      expect(result.message).toBe('You are not carrying anything.');
      expect(result.items).toEqual([]);
    });
  });

  // ==============================================================================
  // INVENTORY WITH ITEMS TESTS (6 tests)
  // ==============================================================================

  describe('Inventory with Items', () => {
    it('should display single item correctly', async () => {
      const player = { ...mockPlayer, inventory: ['sword-1'] };

      const result = await handler.handle(player, mockRoom);

      expect(result.success).toBe(true);
      expect(result.type).toBe('inventory');
      expect(result.message).toBe('You are carrying:\n- Iron Sword');
      expect(result.items).toEqual(['Iron Sword']);
    });

    it('should display multiple items with bullet points', async () => {
      const player = { ...mockPlayer, inventory: ['sword-1', 'potion-1'] };

      const result = await handler.handle(player, mockRoom);

      expect(result.success).toBe(true);
      expect(result.type).toBe('inventory');
      expect(result.message).toBe('You are carrying:\n- Iron Sword\n- Health Potion');
      expect(result.items).toEqual(['Iron Sword', 'Health Potion']);
    });

    it('should display three items correctly', async () => {
      const player = { ...mockPlayer, inventory: ['sword-1', 'potion-1', 'key-1'] };

      const result = await handler.handle(player, mockRoom);

      expect(result.success).toBe(true);
      expect(result.message).toBe('You are carrying:\n- Iron Sword\n- Health Potion\n- Brass Key');
      expect(result.items).toEqual(['Iron Sword', 'Health Potion', 'Brass Key']);
    });

    it('should format item list with correct line breaks', async () => {
      const player = { ...mockPlayer, inventory: ['sword-1', 'potion-1'] };

      const result = await handler.handle(player, mockRoom);

      expect(result.message).toContain('\n- Iron Sword\n');
      expect(result.message).toContain('- Health Potion');
      expect(result.message.split('\n')).toHaveLength(3); // "You are carrying:" + 2 items
    });

    it('should include all item names in items array', async () => {
      const player = { ...mockPlayer, inventory: ['sword-1', 'potion-1', 'key-1'] };

      const result = await handler.handle(player, mockRoom);

      expect(result.items).toHaveLength(3);
      expect(result.items).toContain('Iron Sword');
      expect(result.items).toContain('Health Potion');
      expect(result.items).toContain('Brass Key');
    });

    it('should maintain item order from inventory array', async () => {
      const player = { ...mockPlayer, inventory: ['key-1', 'sword-1', 'potion-1'] };

      const result = await handler.handle(player, mockRoom);

      expect(result.items).toEqual(['Brass Key', 'Iron Sword', 'Health Potion']);
      expect(result.message).toBe('You are carrying:\n- Brass Key\n- Iron Sword\n- Health Potion');
    });
  });

  // ==============================================================================
  // OBJECTSERVICE INTEGRATION TESTS (5 tests)
  // ==============================================================================

  describe('ObjectService Integration', () => {
    it('should call getObject for each inventory item', async () => {
      const player = { ...mockPlayer, inventory: ['sword-1', 'potion-1'] };

      await handler.handle(player, mockRoom);

      expect(mockObjectService.getObject).toHaveBeenCalledTimes(2);
      expect(mockObjectService.getObject).toHaveBeenCalledWith('sword-1');
      expect(mockObjectService.getObject).toHaveBeenCalledWith('potion-1');
    });

    it('should filter out undefined objects when item not found', async () => {
      const player = { ...mockPlayer, inventory: ['sword-1', 'invalid-id', 'potion-1'] };
      mockObjectService.getObject = jest.fn((id: string) => {
        if (id === 'sword-1') return mockSword;
        if (id === 'potion-1') return mockPotion;
        return undefined;
      });

      const result = await handler.handle(player, mockRoom);

      expect(result.success).toBe(true);
      expect(result.items).toEqual(['Iron Sword', 'Health Potion']);
      expect(result.message).toBe('You are carrying:\n- Iron Sword\n- Health Potion');
    });

    it('should handle all invalid item IDs gracefully', async () => {
      const player = { ...mockPlayer, inventory: ['invalid-1', 'invalid-2'] };
      mockObjectService.getObject = jest.fn().mockReturnValue(undefined);

      const result = await handler.handle(player, mockRoom);

      expect(result.success).toBe(true);
      expect(result.type).toBe('inventory');
      expect(result.message).toBe('You are not carrying anything.');
      expect(result.items).toEqual([]);
    });

    it('should filter out null objects', async () => {
      const player = { ...mockPlayer, inventory: ['sword-1', 'null-item'] };
      mockObjectService.getObject = jest.fn((id: string) => {
        if (id === 'sword-1') return mockSword;
        return null;
      });

      const result = await handler.handle(player, mockRoom);

      expect(result.items).toEqual(['Iron Sword']);
      expect(result.message).toBe('You are carrying:\n- Iron Sword');
    });

    it('should handle mixed valid and invalid IDs', async () => {
      const player = { ...mockPlayer, inventory: ['invalid-1', 'sword-1', 'invalid-2', 'potion-1', 'invalid-3'] };
      mockObjectService.getObject = jest.fn((id: string) => {
        const objects = { 'sword-1': mockSword, 'potion-1': mockPotion };
        return objects[id];
      });

      const result = await handler.handle(player, mockRoom);

      expect(result.items).toEqual(['Iron Sword', 'Health Potion']);
      expect(mockObjectService.getObject).toHaveBeenCalledTimes(5);
    });
  });

  // ==============================================================================
  // RETURN VALUE STRUCTURE TESTS (4 tests)
  // ==============================================================================

  describe('Return Value Structure', () => {
    it('should always set success to true', async () => {
      const emptyPlayer = { ...mockPlayer, inventory: [] };
      const fullPlayer = { ...mockPlayer, inventory: ['sword-1', 'potion-1'] };

      const emptyResult = await handler.handle(emptyPlayer, mockRoom);
      const fullResult = await handler.handle(fullPlayer, mockRoom);

      expect(emptyResult.success).toBe(true);
      expect(fullResult.success).toBe(true);
    });

    it('should always set type to inventory', async () => {
      const emptyPlayer = { ...mockPlayer, inventory: [] };
      const fullPlayer = { ...mockPlayer, inventory: ['sword-1'] };

      const emptyResult = await handler.handle(emptyPlayer, mockRoom);
      const fullResult = await handler.handle(fullPlayer, mockRoom);

      expect(emptyResult.type).toBe('inventory');
      expect(fullResult.type).toBe('inventory');
    });

    it('should include message field in response', async () => {
      const player = { ...mockPlayer, inventory: ['sword-1'] };

      const result = await handler.handle(player, mockRoom);

      expect(result.message).toBeDefined();
      expect(typeof result.message).toBe('string');
      expect(result.message.length).toBeGreaterThan(0);
    });

    it('should include items array in response', async () => {
      const emptyPlayer = { ...mockPlayer, inventory: [] };
      const fullPlayer = { ...mockPlayer, inventory: ['sword-1', 'potion-1'] };

      const emptyResult = await handler.handle(emptyPlayer, mockRoom);
      const fullResult = await handler.handle(fullPlayer, mockRoom);

      expect(Array.isArray(emptyResult.items)).toBe(true);
      expect(Array.isArray(fullResult.items)).toBe(true);
      expect(emptyResult.items).toHaveLength(0);
      expect(fullResult.items).toHaveLength(2);
    });
  });

  // ==============================================================================
  // EDGE CASES (5 tests)
  // ==============================================================================

  describe('Edge Cases', () => {
    it('should handle special characters in item names', async () => {
      const specialItem = {
        id: 'special-1',
        name: "Wizard's Staff of Power & Glory!",
        description: 'A magical staff.',
        roomId: 'room-1',
      };
      mockObjectService.getObject = jest.fn().mockReturnValue(specialItem);
      const player = { ...mockPlayer, inventory: ['special-1'] };

      const result = await handler.handle(player, mockRoom);

      expect(result.message).toBe("You are carrying:\n- Wizard's Staff of Power & Glory!");
      expect(result.items).toEqual(["Wizard's Staff of Power & Glory!"]);
    });

    it('should handle very long item names', async () => {
      const longItem = {
        id: 'long-1',
        name: 'An Extremely Long and Elaborate Item Name That Goes On and On',
        description: 'A verbose item.',
        roomId: 'room-1',
      };
      mockObjectService.getObject = jest.fn().mockReturnValue(longItem);
      const player = { ...mockPlayer, inventory: ['long-1'] };

      const result = await handler.handle(player, mockRoom);

      expect(result.message).toContain('An Extremely Long and Elaborate Item Name That Goes On and On');
      expect(result.items[0]).toBe('An Extremely Long and Elaborate Item Name That Goes On and On');
    });

    it('should handle duplicate item IDs in inventory', async () => {
      const player = { ...mockPlayer, inventory: ['sword-1', 'sword-1', 'potion-1'] };

      const result = await handler.handle(player, mockRoom);

      expect(result.items).toEqual(['Iron Sword', 'Iron Sword', 'Health Potion']);
      expect(result.message).toBe('You are carrying:\n- Iron Sword\n- Iron Sword\n- Health Potion');
      expect(mockObjectService.getObject).toHaveBeenCalledTimes(3);
    });

    it('should handle large inventory', async () => {
      const largeInventory = Array.from({ length: 20 }, (_, i) => `item-${i}`);
      mockObjectService.getObject = jest.fn((id: string) => ({
        id,
        name: `Item ${id.split('-')[1]}`,
        description: 'A test item.',
        roomId: 'room-1',
      }));
      const player = { ...mockPlayer, inventory: largeInventory };

      const result = await handler.handle(player, mockRoom);

      expect(result.items).toHaveLength(20);
      expect(result.message.split('\n')).toHaveLength(21); // Header + 20 items
      expect(mockObjectService.getObject).toHaveBeenCalledTimes(20);
    });

    it('should handle Unicode characters in item names', async () => {
      const unicodeItem = {
        id: 'unicode-1',
        name: '魔法の剣 (Magical Sword) 🗡️',
        description: 'A magical sword with Unicode.',
        roomId: 'room-1',
      };
      mockObjectService.getObject = jest.fn().mockReturnValue(unicodeItem);
      const player = { ...mockPlayer, inventory: ['unicode-1'] };

      const result = await handler.handle(player, mockRoom);

      expect(result.message).toBe('You are carrying:\n- 魔法の剣 (Magical Sword) 🗡️');
      expect(result.items).toEqual(['魔法の剣 (Magical Sword) 🗡️']);
    });
  });

  // ==============================================================================
  // PARAMETER HANDLING TESTS (2 tests)
  // ==============================================================================

  describe('Parameter Handling', () => {
    it('should ignore target parameter', async () => {
      const player = { ...mockPlayer, inventory: ['sword-1'] };

      const result = await handler.handle(player, mockRoom, 'some-target');

      expect(result.success).toBe(true);
      expect(result.message).toBe('You are carrying:\n- Iron Sword');
    });

    it('should not use currentRoom parameter', async () => {
      const player = { ...mockPlayer, inventory: ['sword-1'] };
      const differentRoom = { ...mockRoom, id: 'room-999', name: 'Different Room' };

      const result = await handler.handle(player, differentRoom);

      expect(result.success).toBe(true);
      expect(result.message).toBe('You are carrying:\n- Iron Sword');
      // Result should be the same regardless of room
    });
  });
});
