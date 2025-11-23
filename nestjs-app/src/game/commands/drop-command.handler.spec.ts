import { Test, TestingModule } from '@nestjs/testing';
import { DropCommandHandler } from './drop-command.handler';
import { PlayerService } from '../../entity/player.service';
import { RoomService } from '../../entity/room.service';
import { ObjectService } from '../../entity/object.service';
import { CommandValidatorService } from '../command-validator.service';

describe('DropCommandHandler', () => {
  let handler: DropCommandHandler;
  let mockPlayerService: jest.Mocked<Partial<PlayerService>>;
  let mockRoomService: jest.Mocked<Partial<RoomService>>;
  let mockObjectService: jest.Mocked<Partial<ObjectService>>;
  let mockValidator: jest.Mocked<Partial<CommandValidatorService>>;

  const mockPlayer = {
    id: 'player-1',
    gameId: 'game-123',
    name: 'Hero',
    position: { x: 5, y: 5, z: 0 },
    health: 100,
    maxHealth: 100,
    inventory: ['sword-1', 'potion-1', 'key-1'],
    roomId: 'room-1',
  };

  const mockRoom = {
    id: 'room-1',
    name: 'Test Room',
    description: 'A test room',
    position: { x: 0, y: 0, z: 0 },
    size: { width: 10, height: 10, depth: 3 },
    width: 10,
    height: 10,
    objects: ['chest-1'],
    players: ['player-1'],
  };

  const mockSword = {
    id: 'sword-1',
    name: 'Iron Sword',
    description: 'A sharp iron blade.',
    portable: true,
  };

  const mockPotion = {
    id: 'potion-1',
    name: 'Health Potion',
    description: 'Restores 50 HP.',
    portable: true,
  };

  const mockKey = {
    id: 'key-1',
    name: 'Brass Key',
    description: 'An old brass key.',
    portable: true,
  };

  beforeEach(async () => {
    mockPlayerService = {
      removeFromInventory: jest.fn().mockReturnValue(true),
      addToInventory: jest.fn().mockReturnValue(true),
    };

    mockRoomService = {
      addObjectToRoom: jest.fn().mockReturnValue(true),
    };

    mockObjectService = {
      updateObjectPosition: jest.fn().mockReturnValue(true),
    };

    mockValidator = {
      validateItemName: jest.fn().mockReturnValue({ valid: true }),
      validatePosition: jest.fn().mockReturnValue({ valid: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DropCommandHandler,
        { provide: PlayerService, useValue: mockPlayerService },
        { provide: RoomService, useValue: mockRoomService },
        { provide: ObjectService, useValue: mockObjectService },
        { provide: CommandValidatorService, useValue: mockValidator },
      ],
    }).compile();

    handler = module.get<DropCommandHandler>(DropCommandHandler);

    // Setup base class protected properties (objects map for findObjectInInventory)
    (handler as any).objects = new Map([
      ['sword-1', mockSword],
      ['potion-1', mockPotion],
      ['key-1', mockKey],
    ]);
  });

  // ==============================================================================
  // VALIDATION TESTS (3 tests)
  // ==============================================================================

  describe('Validation', () => {
    it('should reject empty target', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, '');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Drop what');
    });

    it('should reject whitespace-only target', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, '   ');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Drop what');
    });

    it('should accept valid target names', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, 'sword');

      expect(result.success).toBe(true);
      expect(result.message).toContain('drop');
    });
  });

  // ==============================================================================
  // SUCCESSFUL DROP OPERATIONS (6 tests)
  // ==============================================================================

  describe('Successful Drop Operations', () => {
    it('should drop item from inventory to room', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, 'sword');

      expect(result.success).toBe(true);
      expect(result.type).toBe('action_success');
      expect(result.message).toBe('You drop the Iron Sword.');
    });

    it('should drop potion from inventory', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, 'potion');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Health Potion');
    });

    it('should remove item from player inventory', async () => {
      await handler.handle(mockPlayer, mockRoom, 'sword');

      expect(mockPlayerService.removeFromInventory).toHaveBeenCalledWith(
        'player-1',
        'sword-1',
      );
    });

    it('should update object position to player location', async () => {
      await handler.handle(mockPlayer, mockRoom, 'sword');

      expect(mockObjectService.updateObjectPosition).toHaveBeenCalledWith(
        'sword-1',
        { x: 5, y: 5, z: 0 },
      );
    });

    it('should add object to room', async () => {
      await handler.handle(mockPlayer, mockRoom, 'sword');

      expect(mockRoomService.addObjectToRoom).toHaveBeenCalledWith(
        'room-1',
        'sword-1',
      );
    });

    it('should handle case insensitive item names', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, 'SWORD');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Iron Sword');
    });
  });

  // ==============================================================================
  // ITEM EXISTENCE CHECKS (5 tests)
  // ==============================================================================

  describe('Item Existence Checks', () => {
    it('should fail when item not in inventory', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, 'dragon');

      expect(result.success).toBe(false);
      expect(result.type).toBe('action_failure');
      expect(result.message).toContain("You don't have a dragon");
    });

    it('should fail when player has empty inventory', async () => {
      const emptyPlayer = { ...mockPlayer, inventory: [] };

      const result = await handler.handle(emptyPlayer, mockRoom, 'sword');

      expect(result.success).toBe(false);
      expect(result.message).toContain("You don't have");
    });

    it('should find item with partial name match', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, 'iron');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Iron Sword');
    });

    it('should prioritize exact match over partial match', async () => {
      (handler as any).objects.set('iron-1', {
        id: 'iron-1',
        name: 'Iron',
        description: 'A piece of iron ore.',
      });
      const playerWithBoth = {
        ...mockPlayer,
        inventory: ['sword-1', 'iron-1'],
      };

      const result = await handler.handle(playerWithBoth, mockRoom, 'iron');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Iron.');
    });

    it('should match item by any word in name', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, 'brass');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Brass Key');
    });
  });

  // ==============================================================================
  // TRANSACTION ROLLBACK TESTS (8 tests)
  // ==============================================================================

  describe('Transaction Rollback', () => {
    it('should fail when removeFromInventory fails', async () => {
      mockPlayerService.removeFromInventory.mockReturnValue(false);

      const result = await handler.handle(mockPlayer, mockRoom, 'sword');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Failed to remove');
      expect(result.message).toContain('Iron Sword');
    });

    it('should not proceed with position update if removal fails', async () => {
      mockPlayerService.removeFromInventory.mockReturnValue(false);

      await handler.handle(mockPlayer, mockRoom, 'sword');

      expect(mockObjectService.updateObjectPosition).not.toHaveBeenCalled();
      expect(mockRoomService.addObjectToRoom).not.toHaveBeenCalled();
    });

    it('should rollback when position validation fails', async () => {
      mockValidator.validatePosition.mockReturnValue({
        valid: false,
        error: 'Invalid coordinates',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'sword');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Cannot drop item');
      expect(result.message).toContain('Invalid coordinates');

      // Verify rollback: item added back to inventory
      expect(mockPlayerService.addToInventory).toHaveBeenCalledWith(
        'player-1',
        'sword-1',
      );
    });

    it('should rollback when updateObjectPosition fails', async () => {
      mockObjectService.updateObjectPosition.mockReturnValue(false);

      const result = await handler.handle(mockPlayer, mockRoom, 'sword');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Failed to drop');
      expect(result.message).toContain('position could not be updated');

      // Verify rollback: item added back to inventory
      expect(mockPlayerService.addToInventory).toHaveBeenCalledWith(
        'player-1',
        'sword-1',
      );
    });

    it('should rollback when addObjectToRoom fails', async () => {
      mockRoomService.addObjectToRoom.mockReturnValue(false);

      const result = await handler.handle(mockPlayer, mockRoom, 'sword');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Failed to drop');
      expect(result.message).toContain('could not be placed in the room');

      // Verify rollback: item added back to inventory
      expect(mockPlayerService.addToInventory).toHaveBeenCalledWith(
        'player-1',
        'sword-1',
      );
    });

    it('should not update position if validation fails after removal', async () => {
      mockValidator.validatePosition.mockReturnValue({
        valid: false,
        error: 'Out of bounds',
      });

      await handler.handle(mockPlayer, mockRoom, 'sword');

      expect(mockObjectService.updateObjectPosition).not.toHaveBeenCalled();
      expect(mockRoomService.addObjectToRoom).not.toHaveBeenCalled();
    });

    it('should not add to room if position update fails', async () => {
      mockObjectService.updateObjectPosition.mockReturnValue(false);

      await handler.handle(mockPlayer, mockRoom, 'sword');

      expect(mockRoomService.addObjectToRoom).not.toHaveBeenCalled();
    });

    it('should handle consecutive drop attempts after rollback', async () => {
      // First attempt fails
      mockRoomService.addObjectToRoom.mockReturnValueOnce(false);
      const firstResult = await handler.handle(mockPlayer, mockRoom, 'sword');
      expect(firstResult.success).toBe(false);

      // Reset mocks for second attempt
      mockPlayerService.removeFromInventory.mockClear();
      mockPlayerService.addToInventory.mockClear();
      mockRoomService.addObjectToRoom.mockReturnValueOnce(true);

      // Second attempt succeeds
      const secondResult = await handler.handle(mockPlayer, mockRoom, 'sword');
      expect(secondResult.success).toBe(true);
    });
  });

  // ==============================================================================
  // ERROR HANDLING (4 tests)
  // ==============================================================================

  describe('Error Handling', () => {
    it('should handle invalid position coordinates', async () => {
      mockValidator.validatePosition.mockReturnValue({
        valid: false,
        error: 'Position out of bounds',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'sword');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Cannot drop item');
      expect(result.message).toContain('Position out of bounds');
    });

    it('should validate position before updating', async () => {
      await handler.handle(mockPlayer, mockRoom, 'sword');

      expect(mockValidator.validatePosition).toHaveBeenCalledWith(5, 5, 0);
    });

    it('should handle null player position gracefully', async () => {
      const playerWithNullPos = {
        ...mockPlayer,
        position: null as any,
      };

      // This will be caught by validatePosition
      mockValidator.validatePosition.mockReturnValue({
        valid: false,
        error: 'Position is null',
      });

      const result = await handler.handle(
        playerWithNullPos,
        mockRoom,
        'sword',
      );

      expect(result.success).toBe(false);
    });

    it('should handle undefined position coordinates', async () => {
      const playerWithUndefinedPos = {
        ...mockPlayer,
        position: { x: undefined, y: undefined, z: undefined } as any,
      };

      mockValidator.validatePosition.mockReturnValue({
        valid: false,
        error: 'Invalid position coordinates',
      });

      const result = await handler.handle(
        playerWithUndefinedPos,
        mockRoom,
        'sword',
      );

      expect(result.success).toBe(false);
    });
  });

  // ==============================================================================
  // EDGE CASES (6 tests)
  // ==============================================================================

  describe('Edge Cases', () => {
    it('should handle player with undefined inventory', async () => {
      const noInventoryPlayer = { ...mockPlayer, inventory: undefined };

      const result = await handler.handle(noInventoryPlayer, mockRoom, 'sword');

      expect(result.success).toBe(false);
      expect(result.message).toContain("You don't have");
    });

    it('should handle player with null inventory', async () => {
      const nullInventoryPlayer = { ...mockPlayer, inventory: null as any };

      const result = await handler.handle(
        nullInventoryPlayer,
        mockRoom,
        'sword',
      );

      expect(result.success).toBe(false);
    });

    it('should handle object with no name property', async () => {
      (handler as any).objects.set('noname-1', {
        id: 'noname-1',
        description: 'An unnamed object.',
      });
      const playerWithUnnamed = {
        ...mockPlayer,
        inventory: ['noname-1'],
      };

      // The item won't match since it has no name
      const result = await handler.handle(
        playerWithUnnamed,
        mockRoom,
        'unnamed',
      );

      expect(result.success).toBe(false);
    });

    it('should handle special characters in item names', async () => {
      (handler as any).objects.set('special-1', {
        id: 'special-1',
        name: "Hero's Sword",
        description: 'A special sword.',
      });
      const playerWithSpecial = {
        ...mockPlayer,
        inventory: ['special-1'],
      };

      const result = await handler.handle(
        playerWithSpecial,
        mockRoom,
        'hero',
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain("Hero's Sword");
    });

    it('should handle very long item names', async () => {
      const longName =
        'An Extremely Long and Elaborate Item Name That Goes On Forever';
      (handler as any).objects.set('long-1', {
        id: 'long-1',
        name: longName,
        description: 'A verbose item.',
      });
      const playerWithLong = {
        ...mockPlayer,
        inventory: ['long-1'],
      };

      const result = await handler.handle(playerWithLong, mockRoom, 'extreme');

      expect(result.success).toBe(true);
      expect(result.message).toContain(longName);
    });

    it('should handle numeric-like item names', async () => {
      (handler as any).objects.set('num-1', {
        id: 'num-1',
        name: '42',
        description: 'The answer.',
      });
      const playerWithNum = {
        ...mockPlayer,
        inventory: ['num-1'],
      };

      const result = await handler.handle(playerWithNum, mockRoom, '42');

      expect(result.success).toBe(true);
      expect(result.message).toContain('42');
    });
  });

  // ==============================================================================
  // POSITION HANDLING (3 tests)
  // ==============================================================================

  describe('Position Handling', () => {
    it('should use player position for dropped object', async () => {
      const playerAtPos = {
        ...mockPlayer,
        position: { x: 10, y: 15, z: 2 },
      };

      await handler.handle(playerAtPos, mockRoom, 'sword');

      expect(mockObjectService.updateObjectPosition).toHaveBeenCalledWith(
        'sword-1',
        { x: 10, y: 15, z: 2 },
      );
    });

    it('should handle negative coordinates', async () => {
      const playerAtNegative = {
        ...mockPlayer,
        position: { x: -5, y: -10, z: 0 },
      };

      await handler.handle(playerAtNegative, mockRoom, 'sword');

      expect(mockValidator.validatePosition).toHaveBeenCalledWith(-5, -10, 0);
    });

    it('should handle zero coordinates', async () => {
      const playerAtZero = {
        ...mockPlayer,
        position: { x: 0, y: 0, z: 0 },
      };

      await handler.handle(playerAtZero, mockRoom, 'sword');

      expect(mockObjectService.updateObjectPosition).toHaveBeenCalledWith(
        'sword-1',
        { x: 0, y: 0, z: 0 },
      );
    });
  });
});
