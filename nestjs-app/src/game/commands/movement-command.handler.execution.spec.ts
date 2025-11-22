import { Test, TestingModule } from '@nestjs/testing';
import { MovementCommandHandler } from './movement-command.handler';
import { PlayerService } from '../../entity/player.service';
import { RoomService } from '../../entity/room.service';
import { CommandValidatorService } from '../command-validator.service';
import { RoomNavigationHelperService } from '../room-navigation-helper.service';
import { GameStateService } from '../game-state.service';

describe('MovementCommandHandler - Execution', () => {
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

  describe('player movement', () => {
    beforeEach(() => {
      roomNavHelper.findAdjacentRoom.mockReturnValue(mockTargetRoom);
    });

    it('should move player to calculated position', async () => {
      await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(playerService.movePlayer).toHaveBeenCalledWith(mockPlayer.id, {
        x: 5,
        y: 15,
        z: 0,
      });
    });

    it('should move player to correct position for different rooms', async () => {
      const customRoom = {
        id: 'custom',
        name: 'Custom Room',
        description: 'A custom room',
        position: { x: 20, y: 30, z: 2 },
        size: { width: 6, height: 4 },
        players: [],
      };

      roomNavHelper.findAdjacentRoom.mockReturnValue(customRoom);

      await handler.handle(mockPlayer, mockCurrentRoom, 'east');

      expect(playerService.movePlayer).toHaveBeenCalledWith(mockPlayer.id, {
        x: 23,
        y: 32,
        z: 2,
      });
    });
  });

  describe('room objects and NPCs', () => {
    beforeEach(() => {
      roomNavHelper.findAdjacentRoom.mockReturnValue(mockTargetRoom);
    });

    it('should retrieve objects in target room', async () => {
      const objects = [
        { id: 'obj-1', name: 'Golden Key' },
        { id: 'obj-2', name: 'Ancient Scroll' },
      ];

      roomService.getObjectsInRoom.mockReturnValue(objects);

      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(roomService.getObjectsInRoom).toHaveBeenCalledWith(
        mockTargetRoom.id,
      );
      expect(result.items).toEqual(['Golden Key', 'Ancient Scroll']);
    });

    it('should filter out objects without names', async () => {
      const objects = [
        { id: 'obj-1', name: 'Golden Key' },
        { id: 'obj-2' }, // No name
        { id: 'obj-3', name: null }, // Null name
        { id: 'obj-4', name: 'Ancient Scroll' },
      ];

      roomService.getObjectsInRoom.mockReturnValue(objects);

      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(result.items).toEqual(['Golden Key', 'Ancient Scroll']);
    });

    it('should return empty items array when no objects in room', async () => {
      roomService.getObjectsInRoom.mockReturnValue([]);

      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(result.items).toEqual([]);
    });

    it('should retrieve NPCs in target room', async () => {
      const gameState = {
        npcs: {
          'npc-1': {
            id: 'npc-1',
            name: 'Guard',
            health: 100,
          },
          'npc-2': {
            id: 'npc-2',
            name: 'Merchant',
            health: 50,
          },
        },
      };

      const roomWithNPCs = {
        ...mockTargetRoom,
        players: ['npc-1', 'npc-2'],
      };

      roomNavHelper.findAdjacentRoom.mockReturnValue(roomWithNPCs);
      gameStateService.getGameState.mockResolvedValue(gameState);

      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(gameStateService.getGameState).toHaveBeenCalledWith(
        mockPlayer.gameId,
      );
      expect(result.npcs).toEqual(['Guard', 'Merchant']);
    });

    it('should filter out defeated NPCs (health <= 0)', async () => {
      const gameState = {
        npcs: {
          'npc-1': {
            id: 'npc-1',
            name: 'Guard',
            health: 100,
          },
          'npc-2': {
            id: 'npc-2',
            name: 'Defeated Enemy',
            health: 0,
          },
          'npc-3': {
            id: 'npc-3',
            name: 'Dead Foe',
            health: -10,
          },
        },
      };

      const roomWithNPCs = {
        ...mockTargetRoom,
        players: ['npc-1', 'npc-2', 'npc-3'],
      };

      roomNavHelper.findAdjacentRoom.mockReturnValue(roomWithNPCs);
      gameStateService.getGameState.mockResolvedValue(gameState);

      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(result.npcs).toEqual(['Guard']);
    });

    it('should include NPCs without health property (non-combat NPCs)', async () => {
      const gameState = {
        npcs: {
          'npc-1': {
            id: 'npc-1',
            name: 'Friendly Shopkeeper',
            // No health property
          },
        },
      };

      const roomWithNPCs = {
        ...mockTargetRoom,
        players: ['npc-1'],
      };

      roomNavHelper.findAdjacentRoom.mockReturnValue(roomWithNPCs);
      gameStateService.getGameState.mockResolvedValue(gameState);

      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(result.npcs).toEqual(['Friendly Shopkeeper']);
    });

    it('should handle rooms with no NPCs', async () => {
      gameStateService.getGameState.mockResolvedValue({ npcs: {} });

      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(result.npcs).toEqual([]);
    });

    it('should handle missing room.players array', async () => {
      const roomWithoutPlayers = {
        ...mockTargetRoom,
        players: undefined,
      };

      gameStateService.getGameState.mockResolvedValue({
        npcs: {
          'npc-1': { id: 'npc-1', name: 'Guard', health: 100 },
        },
      });

      roomNavHelper.findAdjacentRoom.mockReturnValue(roomWithoutPlayers);

      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(result.npcs).toEqual([]);
    });

    it('should only include NPCs that are in room.players array', async () => {
      const gameState = {
        npcs: {
          'npc-1': {
            id: 'npc-1',
            name: 'Guard in Room',
            health: 100,
          },
          'npc-2': {
            id: 'npc-2',
            name: 'Guard in Other Room',
            health: 100,
          },
        },
      };

      const roomWithNPCs = {
        ...mockTargetRoom,
        players: ['npc-1'], // Only npc-1 is in this room
      };

      roomNavHelper.findAdjacentRoom.mockReturnValue(roomWithNPCs);
      gameStateService.getGameState.mockResolvedValue(gameState);

      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(result.npcs).toEqual(['Guard in Room']);
    });

    it('should handle null or undefined npcs in game state', async () => {
      gameStateService.getGameState.mockResolvedValue({ npcs: null });

      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(result.npcs).toEqual([]);
    });
  });

  describe('successful movement response', () => {
    beforeEach(() => {
      roomNavHelper.findAdjacentRoom.mockReturnValue(mockTargetRoom);
      roomNavHelper.getAvailableExits.mockReturnValue(['south', 'east']);
    });

    it('should return success with movement message', async () => {
      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(result.success).toBe(true);
      expect(result.type).toBe('movement_success');
      expect(result.message).toBe('You move north.');
    });

    it('should include room description', async () => {
      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(result.roomDescription).toBe('A large chamber to the north.');
    });

    it('should include player location in status', async () => {
      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(result.playerStatus).toEqual({
        location: 'Northern Chamber',
      });
    });

    it('should include available exits', async () => {
      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(result.exits).toEqual(['south', 'east']);
      expect(roomNavHelper.getAvailableExits).toHaveBeenCalledWith(
        mockTargetRoom,
      );
    });

    it('should show correct direction in message for all directions', async () => {
      const directions = ['north', 'south', 'east', 'west', 'up', 'down'];

      for (const direction of directions) {
        const result = await handler.handle(
          mockPlayer,
          mockCurrentRoom,
          direction,
        );

        expect(result.message).toBe(`You move ${direction}.`);
      }
    });

    it('should show mapped direction in message for shorthand', async () => {
      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'n');

      expect(result.message).toBe('You move north.');
    });
  });

  describe('edge cases - objects and NPCs', () => {
    it('should handle room with many objects', async () => {
      const manyObjects = Array.from({ length: 100 }, (_, i) => ({
        id: `obj-${i}`,
        name: `Object ${i}`,
      }));

      roomService.getObjectsInRoom.mockReturnValue(manyObjects);
      roomNavHelper.findAdjacentRoom.mockReturnValue(mockTargetRoom);

      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(result.success).toBe(true);
      expect(result.items).toHaveLength(100);
    });

    it('should handle room with many NPCs', async () => {
      const gameState = {
        npcs: Object.fromEntries(
          Array.from({ length: 50 }, (_, i) => [
            `npc-${i}`,
            { id: `npc-${i}`, name: `NPC ${i}`, health: 100 },
          ]),
        ),
      };

      const roomWithManyNPCs = {
        ...mockTargetRoom,
        players: Array.from({ length: 50 }, (_, i) => `npc-${i}`),
      };

      roomNavHelper.findAdjacentRoom.mockReturnValue(roomWithManyNPCs);
      gameStateService.getGameState.mockResolvedValue(gameState);

      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(result.success).toBe(true);
      expect(result.npcs).toHaveLength(50);
    });
  });

  describe('integration scenarios', () => {
    it('should complete full successful movement flow', async () => {
      const targetRoom = {
        id: 'target',
        name: 'Target Room',
        description: 'You have arrived',
        position: { x: 10, y: 10, z: 0 },
        size: { width: 8, height: 8 },
        players: ['npc-1'],
      };

      const objects = [{ id: 'obj-1', name: 'Treasure Chest' }];

      const gameState = {
        npcs: {
          'npc-1': { id: 'npc-1', name: 'Friendly Guard', health: 100 },
        },
      };

      roomNavHelper.findAdjacentRoom.mockReturnValue(targetRoom);
      roomService.getObjectsInRoom.mockReturnValue(objects);
      gameStateService.getGameState.mockResolvedValue(gameState);
      roomNavHelper.getAvailableExits.mockReturnValue(['north', 'west']);

      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'e');

      expect(result.success).toBe(true);
      expect(result.type).toBe('movement_success');
      expect(result.message).toBe('You move east.');
      expect(result.roomDescription).toBe('You have arrived');
      expect(result.items).toEqual(['Treasure Chest']);
      expect(result.npcs).toEqual(['Friendly Guard']);
      expect(result.exits).toEqual(['north', 'west']);
      expect(result.playerStatus).toEqual({ location: 'Target Room' });
      expect(playerService.movePlayer).toHaveBeenCalledWith(mockPlayer.id, {
        x: 14,
        y: 14,
        z: 0,
      });
    });

    it('should handle complete locked door scenario with item', async () => {
      const lockedRoom = {
        id: 'locked',
        name: 'Vault',
        description: 'The vault is open',
        position: { x: 0, y: 10, z: 0 },
        size: { width: 10, height: 10 },
        locked: true,
        requiredItem: 'vault-key',
        players: [],
      };

      const key = { id: 'vault-key', name: 'Vault Key' };

      roomNavHelper.findAdjacentRoom.mockReturnValue(lockedRoom);
      playerService.getInventory.mockReturnValue([key]);
      roomNavHelper.getAvailableExits.mockReturnValue([]);

      const result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');

      expect(result.success).toBe(true);
      expect(result.playerStatus.location).toBe('Vault');
    });

    it('should properly sequence all validation checks', async () => {
      // First: direction validation
      let result = await handler.handle(
        mockPlayer,
        mockCurrentRoom,
        'invalid-direction',
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain("I don't understand the direction");

      // Second: current room validation
      roomNavHelper.getCurrentRoom.mockReturnValue(null);
      result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');
      expect(result.success).toBe(false);
      expect(result.message).toBe('Cannot determine current location');

      // Third: adjacent room validation
      roomNavHelper.getCurrentRoom.mockReturnValue(mockCurrentRoom);
      roomNavHelper.findAdjacentRoom.mockReturnValue(null);
      result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');
      expect(result.success).toBe(false);
      expect(result.message).toContain('cannot go north');

      // Fourth: locked door check
      const lockedRoom = {
        ...mockTargetRoom,
        locked: true,
        requiredItem: 'key',
      };
      roomNavHelper.findAdjacentRoom.mockReturnValue(lockedRoom);
      playerService.getInventory.mockReturnValue([]);
      result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');
      expect(result.success).toBe(false);
      expect(result.message).toContain('locked');

      // Fifth: position validation
      playerService.getInventory.mockReturnValue([
        { id: 'key', name: 'Key' },
      ]);
      validator.validatePosition.mockReturnValue({
        valid: false,
        error: 'Out of bounds',
      });
      result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Cannot move to that location');

      // Finally: success
      validator.validatePosition.mockReturnValue({ valid: true });
      result = await handler.handle(mockPlayer, mockCurrentRoom, 'north');
      expect(result.success).toBe(true);
    });
  });
});
