import { Test, TestingModule } from '@nestjs/testing';
import { BaseCommandHandler } from './base-command.handler';
import { PlayerService } from '../../entity/player.service';
import { RoomService } from '../../entity/room.service';
import { CommandValidatorService } from '../command-validator.service';
import { CommandResult } from '../game.service';
import { Injectable } from '@nestjs/common';

/**
 * Concrete implementation of BaseCommandHandler for testing purposes
 */
@Injectable()
class TestCommandHandler extends BaseCommandHandler {
  async handle(
    player: any,
    room: any,
    target: string,
    gameId?: string,
  ): Promise<CommandResult> {
    return {
      success: true,
      type: 'action_result',
      message: 'Test command executed',
    };
  }

  // Expose protected methods for testing
  public testMatchesName(objectName: string, target: string): boolean {
    return this.matchesName(objectName, target);
  }

  public testValidateTarget(
    target: string,
    actionName: string,
  ): CommandResult | null {
    return this.validateTarget(target, actionName);
  }

  public testFindObjectInInventoryOrRoom(
    player: any,
    room: any,
    target: string,
  ): any | null {
    return this.findObjectInInventoryOrRoom(player, room, target);
  }

  public testFindObjectInInventory(player: any, target: string): any | null {
    return this.findObjectInInventory(player, target);
  }

  public testFindObjectInRoom(room: any, target: string): any | null {
    return this.findObjectInRoom(room, target);
  }

  public testCreateNotFoundError(target: string): CommandResult {
    return this.createNotFoundError(target);
  }
}

describe('BaseCommandHandler', () => {
  let handler: TestCommandHandler;
  let playerService: jest.Mocked<PlayerService>;
  let roomService: jest.Mocked<RoomService>;
  let validator: jest.Mocked<CommandValidatorService>;

  const mockPlayer = {
    id: 'player-1',
    gameId: 'game-1',
    name: 'Test Player',
  };

  const mockRoom = {
    id: 'room-1',
    name: 'Test Room',
  };

  beforeEach(async () => {
    const mockPlayerService = {
      getInventory: jest.fn(),
    };

    const mockRoomService = {
      getObjectsInRoom: jest.fn(),
    };

    const mockValidator = {
      validateItemName: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TestCommandHandler,
        { provide: PlayerService, useValue: mockPlayerService },
        { provide: RoomService, useValue: mockRoomService },
        { provide: CommandValidatorService, useValue: mockValidator },
      ],
    }).compile();

    handler = module.get<TestCommandHandler>(TestCommandHandler);
    playerService = module.get(PlayerService);
    roomService = module.get(RoomService);
    validator = module.get(CommandValidatorService);
  });

  describe('matchesName', () => {
    it('should match exact names', () => {
      expect(handler.testMatchesName('Reality Anchor', 'reality anchor')).toBe(
        true,
      );
      expect(handler.testMatchesName('Brass-Key', 'brass key')).toBe(true);
    });

    it('should match partial names', () => {
      expect(handler.testMatchesName('Reality Anchor Fragment', 'reality')).toBe(
        true,
      );
      expect(handler.testMatchesName('Brass Key', 'key')).toBe(true);
    });

    it('should not match different names', () => {
      expect(handler.testMatchesName('Brass Key', 'silver')).toBe(false);
      expect(handler.testMatchesName('Reality Anchor', 'void')).toBe(false);
    });
  });

  describe('validateTarget', () => {
    it('should return error when target is empty', () => {
      const result = handler.testValidateTarget('', 'take');

      expect(result).not.toBeNull();
      expect(result?.success).toBe(false);
      expect(result?.type).toBe('error');
      expect(result?.message).toBe('Take what?');
    });

    it('should capitalize action name in error message', () => {
      const result = handler.testValidateTarget('', 'examine');

      expect(result?.message).toBe('Examine what?');
    });

    it('should return error when validator fails', () => {
      validator.validateItemName.mockReturnValue({
        valid: false,
        error: 'Invalid characters in item name',
      });

      const result = handler.testValidateTarget('test@item', 'use');

      expect(result).not.toBeNull();
      expect(result?.success).toBe(false);
      expect(result?.type).toBe('error');
      expect(result?.message).toBe('Invalid characters in item name');
    });

    it('should return null when validation passes', () => {
      validator.validateItemName.mockReturnValue({ valid: true });

      const result = handler.testValidateTarget('brass key', 'take');

      expect(result).toBeNull();
    });
  });

  describe('findObjectInInventoryOrRoom', () => {
    it('should prioritize inventory over room objects', () => {
      const inventoryItem = { id: 'inv-1', name: 'Brass Key' };
      const roomItem = { id: 'room-1', name: 'Brass Key' };

      playerService.getInventory.mockReturnValue([inventoryItem]);
      roomService.getObjectsInRoom.mockReturnValue([roomItem]);

      const result = handler.testFindObjectInInventoryOrRoom(
        mockPlayer,
        mockRoom,
        'brass key',
      );

      expect(result).toBe(inventoryItem);
      expect(result).not.toBe(roomItem);
    });

    it('should fall back to room objects if not in inventory', () => {
      const roomItem = { id: 'room-1', name: 'Ancient Tome' };

      playerService.getInventory.mockReturnValue([]);
      roomService.getObjectsInRoom.mockReturnValue([roomItem]);

      const result = handler.testFindObjectInInventoryOrRoom(
        mockPlayer,
        mockRoom,
        'ancient tome',
      );

      expect(result).toBe(roomItem);
    });

    it('should return null if object not found anywhere', () => {
      playerService.getInventory.mockReturnValue([]);
      roomService.getObjectsInRoom.mockReturnValue([]);

      const result = handler.testFindObjectInInventoryOrRoom(
        mockPlayer,
        mockRoom,
        'nonexistent item',
      );

      expect(result).toBeNull();
    });

    describe('match scoring - critical bug fix', () => {
      it('should prefer exact matches over partial matches in inventory', () => {
        const exactMatch = { id: 'exact', name: 'Reality Anchor' };
        const partialMatch = {
          id: 'partial',
          name: 'Reality Anchor Fragment',
        };

        // Return fragment first to test scoring (not order)
        playerService.getInventory.mockReturnValue([
          partialMatch,
          exactMatch,
        ]);
        roomService.getObjectsInRoom.mockReturnValue([]);

        const result = handler.testFindObjectInInventoryOrRoom(
          mockPlayer,
          mockRoom,
          'reality anchor',
        );

        expect(result).toBe(exactMatch);
        expect(result.id).toBe('exact');
      });

      it('should prefer shorter matches over longer matches', () => {
        const shortMatch = { id: 'short', name: 'Master Key' };
        const longMatch = { id: 'long', name: 'Master Key Fragment' };

        playerService.getInventory.mockReturnValue([longMatch, shortMatch]);
        roomService.getObjectsInRoom.mockReturnValue([]);

        const result = handler.testFindObjectInInventoryOrRoom(
          mockPlayer,
          mockRoom,
          'master key',
        );

        expect(result).toBe(shortMatch);
        expect(result.id).toBe('short');
      });

      it('should prefer exact matches in room objects', () => {
        const exactMatch = { id: 'exact', name: 'Brass Key' };
        const partialMatch = { id: 'partial', name: 'Brass Key Fragment' };

        playerService.getInventory.mockReturnValue([]);
        roomService.getObjectsInRoom.mockReturnValue([
          partialMatch,
          exactMatch,
        ]);

        const result = handler.testFindObjectInInventoryOrRoom(
          mockPlayer,
          mockRoom,
          'brass key',
        );

        expect(result).toBe(exactMatch);
      });

      it('should handle multiple items with different match qualities', () => {
        const items = [
          { id: '1', name: 'Reality Anchor Fragment A' },
          { id: '2', name: 'Reality Anchor Fragment' },
          { id: '3', name: 'Reality Anchor' }, // Exact match
          { id: '4', name: 'Reality Anchor Fragment of Power' },
        ];

        playerService.getInventory.mockReturnValue(items);
        roomService.getObjectsInRoom.mockReturnValue([]);

        const result = handler.testFindObjectInInventoryOrRoom(
          mockPlayer,
          mockRoom,
          'reality anchor',
        );

        expect(result).toBe(items[2]); // Should pick the exact match
        expect(result.id).toBe('3');
      });

      it('should ignore items without names', () => {
        const validItem = { id: 'valid', name: 'Brass Key' };
        const noNameItem = { id: 'no-name' }; // Missing name property

        playerService.getInventory.mockReturnValue([noNameItem, validItem]);
        roomService.getObjectsInRoom.mockReturnValue([]);

        const result = handler.testFindObjectInInventoryOrRoom(
          mockPlayer,
          mockRoom,
          'brass key',
        );

        expect(result).toBe(validItem);
      });
    });
  });

  describe('findObjectInInventory', () => {
    it('should find object in inventory', () => {
      const item = { id: 'inv-1', name: 'Laser Gun' };
      playerService.getInventory.mockReturnValue([item]);

      const result = handler.testFindObjectInInventory(mockPlayer, 'laser gun');

      expect(result).toBe(item);
    });

    it('should return null if not in inventory', () => {
      playerService.getInventory.mockReturnValue([]);

      const result = handler.testFindObjectInInventory(
        mockPlayer,
        'nonexistent',
      );

      expect(result).toBeNull();
    });

    it('should use match scoring to prefer better matches', () => {
      const exactMatch = { id: 'exact', name: 'Key' };
      const partialMatch = { id: 'partial', name: 'Master Key Fragment' };

      playerService.getInventory.mockReturnValue([partialMatch, exactMatch]);

      const result = handler.testFindObjectInInventory(mockPlayer, 'key');

      expect(result).toBe(exactMatch);
    });

    it('should handle items without names gracefully', () => {
      const validItem = { id: 'valid', name: 'Sword' };
      const invalidItem = { id: 'invalid' };

      playerService.getInventory.mockReturnValue([invalidItem, validItem]);

      const result = handler.testFindObjectInInventory(mockPlayer, 'sword');

      expect(result).toBe(validItem);
    });
  });

  describe('findObjectInRoom', () => {
    it('should find object in room', () => {
      const object = { id: 'obj-1', name: 'Control Panel' };
      roomService.getObjectsInRoom.mockReturnValue([object]);

      const result = handler.testFindObjectInRoom(mockRoom, 'control panel');

      expect(result).toBe(object);
    });

    it('should return null if not in room', () => {
      roomService.getObjectsInRoom.mockReturnValue([]);

      const result = handler.testFindObjectInRoom(mockRoom, 'nonexistent');

      expect(result).toBeNull();
    });

    it('should use match scoring to prefer better matches', () => {
      const exactMatch = { id: 'exact', name: 'Mop' };
      const partialMatch = { id: 'partial', name: 'Standard Issue Mop' };

      roomService.getObjectsInRoom.mockReturnValue([partialMatch, exactMatch]);

      const result = handler.testFindObjectInRoom(mockRoom, 'mop');

      expect(result).toBe(exactMatch);
    });

    it('should handle objects without names gracefully', () => {
      const validObject = { id: 'valid', name: 'Table' };
      const invalidObject = { id: 'invalid' };

      roomService.getObjectsInRoom.mockReturnValue([
        invalidObject,
        validObject,
      ]);

      const result = handler.testFindObjectInRoom(mockRoom, 'table');

      expect(result).toBe(validObject);
    });
  });

  describe('createNotFoundError', () => {
    it('should create standardized error message', () => {
      const result = handler.testCreateNotFoundError('brass key');

      expect(result.success).toBe(false);
      expect(result.type).toBe('action_failure');
      expect(result.message).toBe("You don't see a brass key here.");
    });

    it('should preserve target name in message', () => {
      const result = handler.testCreateNotFoundError('ancient tome');

      expect(result.message).toContain('ancient tome');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete command flow with validation and finding', () => {
      validator.validateItemName.mockReturnValue({ valid: true });

      const item = { id: 'item-1', name: 'Reality Anchor' };
      playerService.getInventory.mockReturnValue([item]);
      roomService.getObjectsInRoom.mockReturnValue([]);

      // Validate target
      const validation = handler.testValidateTarget('reality anchor', 'use');
      expect(validation).toBeNull(); // Validation passes

      // Find object
      const found = handler.testFindObjectInInventoryOrRoom(
        mockPlayer,
        mockRoom,
        'reality anchor',
      );
      expect(found).toBe(item);
    });

    it('should handle failed validation before searching', () => {
      validator.validateItemName.mockReturnValue({
        valid: false,
        error: 'Invalid item',
      });

      const validation = handler.testValidateTarget('bad@item', 'take');

      expect(validation).not.toBeNull();
      expect(validation?.success).toBe(false);
      // Should not call search methods when validation fails
      expect(playerService.getInventory).not.toHaveBeenCalled();
    });

    it('should handle not found scenario with proper error', () => {
      validator.validateItemName.mockReturnValue({ valid: true });
      playerService.getInventory.mockReturnValue([]);
      roomService.getObjectsInRoom.mockReturnValue([]);

      const found = handler.testFindObjectInInventoryOrRoom(
        mockPlayer,
        mockRoom,
        'nonexistent',
      );
      expect(found).toBeNull();

      const error = handler.testCreateNotFoundError('nonexistent');
      expect(error.success).toBe(false);
      expect(error.message).toContain('nonexistent');
    });
  });
});
