import { Test, TestingModule } from '@nestjs/testing';
import { TakeCommandHandler } from './take-command.handler';
import { PlayerService } from '../../entity/player.service';
import { RoomService } from '../../entity/room.service';
import { CommandValidatorService } from '../command-validator.service';

describe('TakeCommandHandler', () => {
  let handler: TakeCommandHandler;
  let mockPlayerService: jest.Mocked<Partial<PlayerService>>;
  let mockRoomService: jest.Mocked<Partial<RoomService>>;
  let mockValidator: jest.Mocked<Partial<CommandValidatorService>>;

  const mockPlayer = {
    id: 'player-1',
    gameId: 'game-123',
    name: 'Hero',
    position: { x: 5, y: 5, z: 0 },
    health: 100,
    maxHealth: 100,
    inventory: [],
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
    objects: ['key-1', 'chest-1', 'statue-1'],
    players: ['player-1'],
  };

  beforeEach(async () => {
    mockPlayerService = {
      getInventory: jest.fn().mockReturnValue([]),
      addToInventory: jest.fn().mockReturnValue(true),
      removeFromInventory: jest.fn().mockReturnValue(true),
    };

    mockRoomService = {
      getObjectsInRoom: jest.fn().mockReturnValue([
        {
          id: 'key-1',
          name: 'Brass Key',
          description: 'An old brass key.',
          roomId: 'room-1',
          isPortable: true,
        },
        {
          id: 'chest-1',
          name: 'Wooden Chest',
          description: 'A sturdy wooden chest.',
          roomId: 'room-1',
          isPortable: false,
        },
        {
          id: 'statue-1',
          name: 'Stone Statue',
          description: 'A heavy stone statue.',
          roomId: 'room-1',
          // isPortable undefined - should default to portable
        },
      ]),
      removeObjectFromRoom: jest.fn().mockReturnValue(true),
    };

    mockValidator = {
      validateInput: jest.fn(),
      validateItemName: jest.fn().mockReturnValue({ valid: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TakeCommandHandler,
        { provide: PlayerService, useValue: mockPlayerService },
        { provide: RoomService, useValue: mockRoomService },
        { provide: CommandValidatorService, useValue: mockValidator },
      ],
    }).compile();

    handler = module.get<TakeCommandHandler>(TakeCommandHandler);
  });

  // ==============================================================================
  // VALIDATION TESTS (3 tests)
  // ==============================================================================

  describe('Validation', () => {
    it('should reject empty target', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, '');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Take what');
    });

    it('should reject whitespace-only target', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, '   ');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Take what');
    });

    it('should accept valid target names', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, 'key');

      expect(result.success).toBe(true);
    });
  });

  // ==============================================================================
  // SUCCESSFUL TAKE OPERATIONS (7 tests)
  // ==============================================================================

  describe('Successful Take Operations', () => {
    it('should take portable object from room', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, 'key');

      expect(result.success).toBe(true);
      expect(result.type).toBe('action_success');
      expect(result.message).toBe('You take the Brass Key.');
    });

    it('should add object to player inventory', async () => {
      await handler.handle(mockPlayer, mockRoom, 'key');

      expect(mockPlayerService.addToInventory).toHaveBeenCalledWith(
        'player-1',
        'key-1',
      );
    });

    it('should remove object from room', async () => {
      await handler.handle(mockPlayer, mockRoom, 'key');

      expect(mockRoomService.removeObjectFromRoom).toHaveBeenCalledWith(
        'room-1',
        'key-1',
      );
    });

    it('should handle case insensitive matching', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, 'BRASS KEY');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Brass Key');
    });

    it('should handle mixed case target', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, 'BrAsS kEy');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Brass Key');
    });

    it('should match partial object names', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, 'key');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Brass Key');
    });

    it('should take object when isPortable is undefined', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, 'statue');

      expect(result.success).toBe(true);
      expect(result.message).toBe('You take the Stone Statue.');
    });
  });

  // ==============================================================================
  // PORTABILITY CHECKS (4 tests)
  // ==============================================================================

  describe('Portability Checks', () => {
    it('should prevent taking non-portable object', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, 'chest');

      expect(result.success).toBe(false);
      expect(result.type).toBe('action_failure');
      expect(result.message).toBe('You cannot take the Wooden Chest.');
    });

    it('should not add non-portable object to inventory', async () => {
      await handler.handle(mockPlayer, mockRoom, 'chest');

      expect(mockPlayerService.addToInventory).not.toHaveBeenCalled();
    });

    it('should not remove non-portable object from room', async () => {
      await handler.handle(mockPlayer, mockRoom, 'chest');

      expect(mockRoomService.removeObjectFromRoom).not.toHaveBeenCalled();
    });

    it('should allow taking explicitly portable object', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, 'key');

      expect(result.success).toBe(true);
      expect(mockPlayerService.addToInventory).toHaveBeenCalled();
      expect(mockRoomService.removeObjectFromRoom).toHaveBeenCalled();
    });
  });

  // ==============================================================================
  // TRANSACTION FAILURES & ROLLBACK (5 tests)
  // ==============================================================================

  describe('Transaction Failures & Rollback', () => {
    it('should return error when inventory add fails', async () => {
      mockPlayerService.addToInventory.mockReturnValueOnce(false);

      const result = await handler.handle(mockPlayer, mockRoom, 'key');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Failed to add');
      expect(result.message).toContain('inventory');
    });

    it('should not remove from room when inventory add fails', async () => {
      mockPlayerService.addToInventory.mockReturnValueOnce(false);

      await handler.handle(mockPlayer, mockRoom, 'key');

      expect(mockRoomService.removeObjectFromRoom).not.toHaveBeenCalled();
    });

    it('should rollback inventory add when room remove fails', async () => {
      mockRoomService.removeObjectFromRoom.mockReturnValueOnce(false);

      await handler.handle(mockPlayer, mockRoom, 'key');

      expect(mockPlayerService.removeFromInventory).toHaveBeenCalledWith(
        'player-1',
        'key-1',
      );
    });

    it('should return error when room remove fails', async () => {
      mockRoomService.removeObjectFromRoom.mockReturnValueOnce(false);

      const result = await handler.handle(mockPlayer, mockRoom, 'key');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Failed to take');
      expect(result.message).toContain('could not be removed from the room');
    });

    it('should verify rollback happens in correct order', async () => {
      const callOrder: string[] = [];

      mockPlayerService.addToInventory.mockImplementationOnce(() => {
        callOrder.push('addToInventory');
        return true;
      });

      mockRoomService.removeObjectFromRoom.mockImplementationOnce(() => {
        callOrder.push('removeObjectFromRoom');
        return false; // Fail to trigger rollback
      });

      mockPlayerService.removeFromInventory.mockImplementationOnce(() => {
        callOrder.push('removeFromInventory');
        return true;
      });

      await handler.handle(mockPlayer, mockRoom, 'key');

      // Verify operations happened in correct order
      expect(callOrder).toEqual([
        'addToInventory',
        'removeObjectFromRoom',
        'removeFromInventory',
      ]);
    });
  });

  // ==============================================================================
  // ERROR HANDLING (5 tests)
  // ==============================================================================

  describe('Error Handling', () => {
    it('should return error when object not found in room', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, 'dragon');

      expect(result.success).toBe(false);
      expect(result.type).toBe('action_failure');
      expect(result.message).toContain("don't see");
      expect(result.message).toContain('dragon');
    });

    it('should handle room with no objects', async () => {
      mockRoomService.getObjectsInRoom.mockReturnValueOnce([]);

      const result = await handler.handle(mockPlayer, mockRoom, 'key');

      expect(result.success).toBe(false);
      expect(result.message).toContain("don't see");
    });

    it('should handle room with undefined objects array', async () => {
      const emptyRoom = { ...mockRoom, objects: undefined };
      mockRoomService.getObjectsInRoom.mockReturnValueOnce([]);

      const result = await handler.handle(mockPlayer, emptyRoom, 'key');

      expect(result.success).toBe(false);
    });

    it('should not call services when object not found', async () => {
      mockRoomService.getObjectsInRoom.mockReturnValueOnce([]);

      await handler.handle(mockPlayer, mockRoom, 'nonexistent');

      expect(mockPlayerService.addToInventory).not.toHaveBeenCalled();
      expect(mockRoomService.removeObjectFromRoom).not.toHaveBeenCalled();
    });

    it('should handle invalid item name validation', async () => {
      mockValidator.validateItemName.mockReturnValueOnce({
        valid: false,
        error: 'Item name contains invalid characters',
      });

      const result = await handler.handle(mockPlayer, mockRoom, '@#$%');

      expect(result.success).toBe(false);
      expect(result.message).toContain('invalid');
    });
  });

  // ==============================================================================
  // EDGE CASES (6 tests)
  // ==============================================================================

  describe('Edge Cases', () => {
    it('should handle object with no name property', async () => {
      mockRoomService.getObjectsInRoom.mockReturnValueOnce([
        {
          id: 'broken-1',
          description: 'A broken object.',
          roomId: 'room-1',
        },
      ]);

      const result = await handler.handle(mockPlayer, mockRoom, 'broken');

      expect(result.success).toBe(false);
      expect(result.message).toContain("don't see");
    });

    it('should handle object with empty string name', async () => {
      mockRoomService.getObjectsInRoom.mockReturnValueOnce([
        {
          id: 'empty-1',
          name: '',
          description: 'An unnamed object.',
          roomId: 'room-1',
        },
      ]);

      const result = await handler.handle(mockPlayer, mockRoom, 'object');

      expect(result.success).toBe(false);
    });

    it('should handle multiple objects with similar names', async () => {
      mockRoomService.getObjectsInRoom.mockReturnValueOnce([
        {
          id: 'key-1',
          name: 'Brass Key',
          roomId: 'room-1',
          isPortable: true,
        },
        {
          id: 'key-2',
          name: 'Iron Key',
          roomId: 'room-1',
          isPortable: true,
        },
      ]);

      const result = await handler.handle(mockPlayer, mockRoom, 'key');

      expect(result.success).toBe(true);
      // Should take one of the keys (match scoring determines which)
      expect(result.message).toMatch(/You take the (Brass|Iron) Key\./);
    });

    it('should handle object with null isPortable', async () => {
      mockRoomService.getObjectsInRoom.mockReturnValueOnce([
        {
          id: 'item-1',
          name: 'Mystery Item',
          roomId: 'room-1',
          isPortable: null,
        },
      ]);

      const result = await handler.handle(mockPlayer, mockRoom, 'mystery');

      // null is not strictly false, so should allow taking
      expect(result.success).toBe(true);
    });

    it('should preserve object name in success message', async () => {
      const result = await handler.handle(
        mockPlayer,
        mockRoom,
        'brass key',
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('Brass Key'); // Exact object name
    });

    it('should handle whitespace in target name', async () => {
      const result = await handler.handle(
        mockPlayer,
        mockRoom,
        '  brass key  ',
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('Brass Key');
    });
  });

  // ==============================================================================
  // INTEGRATION TESTS (3 tests)
  // ==============================================================================

  describe('Integration Tests', () => {
    it('should complete full transaction for successful take', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, 'key');

      expect(result.success).toBe(true);
      expect(mockPlayerService.addToInventory).toHaveBeenCalledTimes(1);
      expect(mockRoomService.removeObjectFromRoom).toHaveBeenCalledTimes(1);
      expect(mockPlayerService.removeFromInventory).not.toHaveBeenCalled();
    });

    it('should maintain transaction integrity on failure', async () => {
      mockRoomService.removeObjectFromRoom.mockReturnValueOnce(false);

      const result = await handler.handle(mockPlayer, mockRoom, 'key');

      expect(result.success).toBe(false);
      expect(mockPlayerService.addToInventory).toHaveBeenCalledTimes(1);
      expect(mockRoomService.removeObjectFromRoom).toHaveBeenCalledTimes(1);
      expect(mockPlayerService.removeFromInventory).toHaveBeenCalledTimes(1);
    });

    it('should handle consecutive take operations', async () => {
      // Take first object
      const result1 = await handler.handle(mockPlayer, mockRoom, 'key');
      expect(result1.success).toBe(true);

      // Take second object
      const result2 = await handler.handle(mockPlayer, mockRoom, 'statue');
      expect(result2.success).toBe(true);

      // Verify both operations succeeded
      expect(mockPlayerService.addToInventory).toHaveBeenCalledTimes(2);
      expect(mockRoomService.removeObjectFromRoom).toHaveBeenCalledTimes(2);
    });
  });
});
