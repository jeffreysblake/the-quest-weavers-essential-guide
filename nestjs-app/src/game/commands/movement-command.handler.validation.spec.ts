import { Test, TestingModule } from '@nestjs/testing';
import { MovementCommandHandler } from './movement-command.handler';
import { PlayerService } from '../../entity/player.service';
import { RoomService } from '../../entity/room.service';
import { CommandValidatorService } from '../command-validator.service';
import { RoomNavigationHelperService } from '../room-navigation-helper.service';
import { GameStateService } from '../game-state.service';

describe('MovementCommandHandler - Validation', () => {
  let handler: MovementCommandHandler;
  let playerService: jest.Mocked<PlayerService>;
  let roomService: jest.Mocked<RoomService>;
  let validator: jest.Mocked<CommandValidatorService>;
  let roomNavHelper: jest.Mocked<RoomNavigationHelperService>;
  let gameStateService: jest.Mocked<GameStateService>;

  const mockPlayer = {
    id: 'player-1',
    gameId: 'game-1',
    name: 'Test Player',
    position: { x: 5, y: 5, z: 0 },
  };

  const mockCurrentRoom = {
    id: 'room-1',
    name: 'Starting Room',
    description: 'You are in a starting room.',
    position: { x: 0, y: 0, z: 0 },
    size: { width: 10, height: 10 },
    players: ['player-1'],
  };

  const mockTargetRoom = {
    id: 'room-2',
    name: 'Northern Chamber',
    description: 'A large chamber to the north.',
    position: { x: 0, y: 10, z: 0 },
    size: { width: 10, height: 10 },
    players: [],
  };

  beforeEach(async () => {
    const mockPlayerService = {
      getInventory: jest.fn(),
      movePlayer: jest.fn(),
    };

    const mockRoomService = {
      getObjectsInRoom: jest.fn(),
    };

    const mockValidator = {
      validatePosition: jest.fn(),
    };

    const mockRoomNavHelper = {
      getCurrentRoom: jest.fn(),
      findAdjacentRoom: jest.fn(),
      getAvailableExits: jest.fn(),
    };

    const mockGameStateService = {
      getGameState: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MovementCommandHandler,
        { provide: PlayerService, useValue: mockPlayerService },
        { provide: RoomService, useValue: mockRoomService },
        { provide: CommandValidatorService, useValue: mockValidator },
        {
          provide: RoomNavigationHelperService,
          useValue: mockRoomNavHelper,
        },
        { provide: GameStateService, useValue: mockGameStateService },
      ],
    }).compile();

    handler = module.get<MovementCommandHandler>(MovementCommandHandler);
    playerService = module.get(PlayerService);
    roomService = module.get(RoomService);
    validator = module.get(CommandValidatorService);
    roomNavHelper = module.get(RoomNavigationHelperService);
    gameStateService = module.get(GameStateService);

    // Default mocks
    roomNavHelper.getCurrentRoom.mockReturnValue(mockCurrentRoom);
    validator.validatePosition.mockReturnValue({ valid: true });
    roomService.getObjectsInRoom.mockReturnValue([]);
    gameStateService.getGameState.mockResolvedValue({ npcs: {} });
    roomNavHelper.getAvailableExits.mockReturnValue([
      'north',
      'south',
      'east',
    ]);
  });

  describe('direction validation', () => {
    it('should reject undefined direction', async () => {
      const result = await handler.handle(
        mockPlayer,
        mockCurrentRoom,
        undefined as any,
      );

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Invalid direction specified');
    });

    it('should reject null direction', async () => {
      const result = await handler.handle(
        mockPlayer,
        mockCurrentRoom,
        null as any,
      );

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Invalid direction specified');
    });

    it('should reject empty string direction', async () => {
      const result = await handler.handle(mockPlayer, mockCurrentRoom, '');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Invalid direction specified');
    });

    it('should reject non-string direction', async () => {
      const result = await handler.handle(
        mockPlayer,
        mockCurrentRoom,
        123 as any,
      );

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Invalid direction specified');
    });

    it('should reject invalid direction strings', async () => {
      const result = await handler.handle(
        mockPlayer,
        mockCurrentRoom,
        'invalid',
      );

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain("I don't understand the direction");
      expect(result.message).toContain('north, south, east, west, up, down');
    });

    it('should handle whitespace in direction', async () => {
      roomNavHelper.findAdjacentRoom.mockReturnValue(mockTargetRoom);

      const result = await handler.handle(
        mockPlayer,
        mockCurrentRoom,
        '  north  ',
      );

      expect(result.success).toBe(true);
      expect(roomNavHelper.findAdjacentRoom).toHaveBeenCalledWith(
        mockCurrentRoom,
        'north',
      );
    });
  });

  describe('direction mapping', () => {
    beforeEach(() => {
      roomNavHelper.findAdjacentRoom.mockReturnValue(mockTargetRoom);
    });

    it('should map "n" to "north"', async () => {
      await handler.handle(mockPlayer, mockCurrentRoom, 'n');

      expect(roomNavHelper.findAdjacentRoom).toHaveBeenCalledWith(
        mockCurrentRoom,
        'north',
      );
    });

    it('should map "s" to "south"', async () => {
      await handler.handle(mockPlayer, mockCurrentRoom, 's');

      expect(roomNavHelper.findAdjacentRoom).toHaveBeenCalledWith(
        mockCurrentRoom,
        'south',
      );
    });

    it('should map "e" to "east"', async () => {
      await handler.handle(mockPlayer, mockCurrentRoom, 'e');

      expect(roomNavHelper.findAdjacentRoom).toHaveBeenCalledWith(
        mockCurrentRoom,
        'east',
      );
    });

    it('should map "w" to "west"', async () => {
      await handler.handle(mockPlayer, mockCurrentRoom, 'w');

      expect(roomNavHelper.findAdjacentRoom).toHaveBeenCalledWith(
        mockCurrentRoom,
        'west',
      );
    });

    it('should accept full "north" direction', async () => {
      await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(roomNavHelper.findAdjacentRoom).toHaveBeenCalledWith(
        mockCurrentRoom,
        'north',
      );
    });

    it('should accept full "south" direction', async () => {
      await handler.handle(mockPlayer, mockCurrentRoom, 'south');

      expect(roomNavHelper.findAdjacentRoom).toHaveBeenCalledWith(
        mockCurrentRoom,
        'south',
      );
    });

    it('should accept full "east" direction', async () => {
      await handler.handle(mockPlayer, mockCurrentRoom, 'east');

      expect(roomNavHelper.findAdjacentRoom).toHaveBeenCalledWith(
        mockCurrentRoom,
        'east',
      );
    });

    it('should accept full "west" direction', async () => {
      await handler.handle(mockPlayer, mockCurrentRoom, 'west');

      expect(roomNavHelper.findAdjacentRoom).toHaveBeenCalledWith(
        mockCurrentRoom,
        'west',
      );
    });

    it('should accept "up" direction', async () => {
      await handler.handle(mockPlayer, mockCurrentRoom, 'up');

      expect(roomNavHelper.findAdjacentRoom).toHaveBeenCalledWith(
        mockCurrentRoom,
        'up',
      );
    });

    it('should accept "down" direction', async () => {
      await handler.handle(mockPlayer, mockCurrentRoom, 'down');

      expect(roomNavHelper.findAdjacentRoom).toHaveBeenCalledWith(
        mockCurrentRoom,
        'down',
      );
    });

    it('should be case-insensitive', async () => {
      await handler.handle(mockPlayer, mockCurrentRoom, 'NORTH');

      expect(roomNavHelper.findAdjacentRoom).toHaveBeenCalledWith(
        mockCurrentRoom,
        'north',
      );
    });

    it('should handle mixed case', async () => {
      await handler.handle(mockPlayer, mockCurrentRoom, 'NoRtH');

      expect(roomNavHelper.findAdjacentRoom).toHaveBeenCalledWith(
        mockCurrentRoom,
        'north',
      );
    });
  });

  describe('current room validation', () => {
    it('should return error if current room cannot be determined', async () => {
      roomNavHelper.getCurrentRoom.mockReturnValue(null);

      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Cannot determine current location');
    });

    it('should call getCurrentRoom with player', async () => {
      roomNavHelper.findAdjacentRoom.mockReturnValue(mockTargetRoom);

      await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(roomNavHelper.getCurrentRoom).toHaveBeenCalledWith(mockPlayer);
    });
  });

  describe('adjacent room finding', () => {
    it('should return error when no exit exists in direction', async () => {
      roomNavHelper.findAdjacentRoom.mockReturnValue(null);

      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(result.success).toBe(false);
      expect(result.type).toBe('movement_blocked');
      expect(result.message).toBe('You cannot go north from here.');
    });

    it('should check for adjacent room in specified direction', async () => {
      roomNavHelper.findAdjacentRoom.mockReturnValue(mockTargetRoom);

      await handler.handle(mockPlayer, mockCurrentRoom, 'south');

      expect(roomNavHelper.findAdjacentRoom).toHaveBeenCalledWith(
        mockCurrentRoom,
        'south',
      );
    });

    it('should handle all directions for no exit', async () => {
      roomNavHelper.findAdjacentRoom.mockReturnValue(null);

      const directions = ['north', 'south', 'east', 'west', 'up', 'down'];

      for (const direction of directions) {
        const result = await handler.handle(
          mockPlayer,
          mockCurrentRoom,
          direction,
        );

        expect(result.success).toBe(false);
        expect(result.message).toContain(`cannot go ${direction}`);
      }
    });
  });

  describe('locked door handling', () => {
    const lockedRoom = {
      ...mockTargetRoom,
      locked: true,
      requiredItem: 'brass-key',
    };

    it('should block entry to locked room without required item', async () => {
      roomNavHelper.findAdjacentRoom.mockReturnValue(lockedRoom);
      playerService.getInventory.mockReturnValue([]);

      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(result.success).toBe(false);
      expect(result.type).toBe('movement_blocked');
      expect(result.message).toContain('door');
      expect(result.message).toContain('locked');
      expect(result.message).toContain('brass key');
    });

    it('should allow entry to locked room with required item', async () => {
      const requiredItem = { id: 'brass-key', name: 'Brass Key' };

      roomNavHelper.findAdjacentRoom.mockReturnValue(lockedRoom);
      playerService.getInventory.mockReturnValue([requiredItem]);

      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(result.success).toBe(true);
      expect(result.type).toBe('movement_success');
    });

    it('should check inventory for required item by ID', async () => {
      const wrongItem = { id: 'silver-key', name: 'Silver Key' };

      roomNavHelper.findAdjacentRoom.mockReturnValue(lockedRoom);
      playerService.getInventory.mockReturnValue([wrongItem]);

      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(result.success).toBe(false);
      expect(result.type).toBe('movement_blocked');
    });

    it('should replace hyphens with spaces in required item name', async () => {
      const multiWordKeyRoom = {
        ...mockTargetRoom,
        locked: true,
        requiredItem: 'master-vault-key',
      };

      roomNavHelper.findAdjacentRoom.mockReturnValue(multiWordKeyRoom);
      playerService.getInventory.mockReturnValue([]);

      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(result.message).toContain('master vault key');
      expect(result.message).not.toContain('master-vault-key');
    });

    it('should allow entry if room is not locked', async () => {
      const unlockedRoom = {
        ...mockTargetRoom,
        locked: false,
      };

      roomNavHelper.findAdjacentRoom.mockReturnValue(unlockedRoom);

      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(result.success).toBe(true);
    });

    it('should allow entry if room has no requiredItem property', async () => {
      const roomWithoutRequiredItem = {
        ...mockTargetRoom,
        locked: true,
        requiredItem: undefined,
      };

      roomNavHelper.findAdjacentRoom.mockReturnValue(roomWithoutRequiredItem);

      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(result.success).toBe(true);
    });
  });

  describe('position calculation and validation', () => {
    beforeEach(() => {
      roomNavHelper.findAdjacentRoom.mockReturnValue(mockTargetRoom);
    });

    it('should calculate center position of target room', async () => {
      await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(validator.validatePosition).toHaveBeenCalledWith(5, 15, 0);
    });

    it('should handle rooms with odd dimensions', async () => {
      const oddRoom = {
        ...mockTargetRoom,
        position: { x: 10, y: 10, z: 1 },
        size: { width: 7, height: 9 },
      };

      roomNavHelper.findAdjacentRoom.mockReturnValue(oddRoom);

      await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(validator.validatePosition).toHaveBeenCalledWith(13, 14, 1);
    });

    it('should handle rooms with even dimensions', async () => {
      const evenRoom = {
        ...mockTargetRoom,
        position: { x: 0, y: 0, z: 0 },
        size: { width: 8, height: 6 },
      };

      roomNavHelper.findAdjacentRoom.mockReturnValue(evenRoom);

      await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(validator.validatePosition).toHaveBeenCalledWith(4, 3, 0);
    });

    it('should preserve z-coordinate from target room', async () => {
      const upperRoom = {
        ...mockTargetRoom,
        position: { x: 0, y: 0, z: 5 },
        size: { width: 10, height: 10 },
      };

      roomNavHelper.findAdjacentRoom.mockReturnValue(upperRoom);

      await handler.handle(mockPlayer, mockCurrentRoom, 'up');

      expect(validator.validatePosition).toHaveBeenCalledWith(5, 5, 5);
    });

    it('should return error if position validation fails', async () => {
      validator.validatePosition.mockReturnValue({
        valid: false,
        error: 'Position out of bounds',
      });

      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Cannot move to that location');
      expect(result.message).toContain('Position out of bounds');
    });

    it('should not move player if position validation fails', async () => {
      validator.validatePosition.mockReturnValue({
        valid: false,
        error: 'Invalid position',
      });

      await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(playerService.movePlayer).not.toHaveBeenCalled();
    });
  });

  describe('edge cases - position calculations', () => {
    it('should handle room at position (0, 0, 0)', async () => {
      const originRoom = {
        id: 'origin',
        name: 'Origin',
        description: 'The origin',
        position: { x: 0, y: 0, z: 0 },
        size: { width: 10, height: 10 },
        players: [],
      };

      roomNavHelper.findAdjacentRoom.mockReturnValue(originRoom);

      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(result.success).toBe(true);
      expect(playerService.movePlayer).toHaveBeenCalledWith(mockPlayer.id, {
        x: 5,
        y: 5,
        z: 0,
      });
    });

    it('should handle room with size 1x1', async () => {
      const tinyRoom = {
        id: 'tiny',
        name: 'Tiny Room',
        description: 'A very small room',
        position: { x: 10, y: 10, z: 0 },
        size: { width: 1, height: 1 },
        players: [],
      };

      roomNavHelper.findAdjacentRoom.mockReturnValue(tinyRoom);

      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(result.success).toBe(true);
      expect(playerService.movePlayer).toHaveBeenCalledWith(mockPlayer.id, {
        x: 10,
        y: 10,
        z: 0,
      });
    });

    it('should handle negative z-coordinates', async () => {
      const undergroundRoom = {
        id: 'underground',
        name: 'Underground',
        description: 'Deep underground',
        position: { x: 0, y: 0, z: -5 },
        size: { width: 10, height: 10 },
        players: [],
      };

      roomNavHelper.findAdjacentRoom.mockReturnValue(undergroundRoom);

      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'down');

      expect(result.success).toBe(true);
      expect(validator.validatePosition).toHaveBeenCalledWith(5, 5, -5);
    });

    it('should handle very large room sizes', async () => {
      const largeRoom = {
        id: 'large',
        name: 'Large Room',
        description: 'A massive room',
        position: { x: 0, y: 0, z: 0 },
        size: { width: 1000, height: 1000 },
        players: [],
      };

      roomNavHelper.findAdjacentRoom.mockReturnValue(largeRoom);

      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(result.success).toBe(true);
      expect(playerService.movePlayer).toHaveBeenCalledWith(mockPlayer.id, {
        x: 500,
        y: 500,
        z: 0,
      });
    });
  });
});
