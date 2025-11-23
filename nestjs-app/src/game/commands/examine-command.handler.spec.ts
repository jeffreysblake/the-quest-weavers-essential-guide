import { Test, TestingModule } from '@nestjs/testing';
import { ExamineCommandHandler } from './examine-command.handler';
import { PlayerService } from '../../entity/player.service';
import { RoomService } from '../../entity/room.service';
import { CommandValidatorService } from '../command-validator.service';
import { GameStateService } from '../game-state.service';
import { RoomNavigationHelperService } from '../room-navigation-helper.service';

describe('ExamineCommandHandler', () => {
  let handler: ExamineCommandHandler;
  let mockPlayerService: jest.Mocked<Partial<PlayerService>>;
  let mockRoomService: jest.Mocked<Partial<RoomService>>;
  let mockValidator: jest.Mocked<Partial<CommandValidatorService>>;
  let mockGameStateService: jest.Mocked<Partial<GameStateService>>;
  let mockRoomNavHelper: jest.Mocked<Partial<RoomNavigationHelperService>>;

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
    width: 10,
    height: 10,
    objects: ['chest-1', 'key-1'],
    players: ['player-1', 'npc-1'],
  };

  beforeEach(async () => {
    mockPlayerService = {
      getPlayer: jest.fn(),
      getInventory: jest.fn().mockReturnValue([
        { id: 'sword-1', name: 'Iron Sword', description: 'A sharp iron blade.', roomId: 'room-1' },
        { id: 'potion-1', name: 'Health Potion', description: 'Restores 50 HP.', roomId: 'room-1' },
      ]),
    };

    mockRoomService = {
      getRoom: jest.fn(),
      getRoomObjects: jest.fn().mockReturnValue([
        { id: 'chest-1', name: 'Wooden Chest', description: 'A sturdy wooden chest.', roomId: 'room-1' },
        { id: 'key-1', name: 'Brass Key', description: 'An old brass key.', roomId: 'room-1' },
      ]),
      getObjectsInRoom: jest.fn().mockReturnValue([
        { id: 'chest-1', name: 'Wooden Chest', description: 'A sturdy wooden chest.', roomId: 'room-1' },
        { id: 'key-1', name: 'Brass Key', description: 'An old brass key.', roomId: 'room-1' },
      ]),
    };

    mockValidator = {
      validateInput: jest.fn(),
      validateItemName: jest.fn().mockReturnValue({ valid: true }),
    };

    mockGameStateService = {
      getGameState: jest.fn(),
    };

    mockRoomNavHelper = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExamineCommandHandler,
        { provide: PlayerService, useValue: mockPlayerService },
        { provide: RoomService, useValue: mockRoomService },
        { provide: CommandValidatorService, useValue: mockValidator },
        { provide: GameStateService, useValue: mockGameStateService },
        { provide: RoomNavigationHelperService, useValue: mockRoomNavHelper },
      ],
    }).compile();

    handler = module.get<ExamineCommandHandler>(ExamineCommandHandler);

    // Setup base class protected properties
    (handler as any).objects = new Map([
      ['sword-1', { id: 'sword-1', name: 'Iron Sword', description: 'A sharp iron blade.', roomId: 'room-1' }],
      ['potion-1', { id: 'potion-1', name: 'Health Potion', description: 'Restores 50 HP.', roomId: 'room-1' }],
      ['chest-1', { id: 'chest-1', name: 'Wooden Chest', description: 'A sturdy wooden chest.', roomId: 'room-1' }],
      ['key-1', { id: 'key-1', name: 'Brass Key', description: 'An old brass key.', roomId: 'room-1' }],
    ]);
  });

  // ==============================================================================
  // VALIDATION TESTS (3 tests)
  // ==============================================================================

  describe('Validation', () => {
    it('should reject empty target', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, '');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Examine what');
    });

    it('should reject whitespace-only target', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, '   ');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Examine what');
    });

    it('should accept valid target names', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, 'sword');

      expect(result.success).toBe(true);
    });
  });

  // ==============================================================================
  // OBJECT EXAMINATION TESTS (8 tests)
  // ==============================================================================

  describe('Object Examination', () => {
    describe('Inventory Objects', () => {
      it('should examine object in player inventory', async () => {
        const result = await handler.handle(mockPlayer, mockRoom, 'sword');

        expect(result.success).toBe(true);
        expect(result.type).toBe('examination');
        expect(result.message).toBe('A sharp iron blade.');
      });

      it('should examine potion in inventory', async () => {
        const result = await handler.handle(mockPlayer, mockRoom, 'potion');

        expect(result.success).toBe(true);
        expect(result.message).toBe('Restores 50 HP.');
      });

      it('should prioritize inventory match over room objects', async () => {
        // Both sword and chest exist, sword is in inventory
        const result = await handler.handle(mockPlayer, mockRoom, 'sword');

        expect(result.success).toBe(true);
        expect(result.message).toContain('iron blade');
      });
    });

    describe('Room Objects', () => {
      it('should examine object in room', async () => {
        const result = await handler.handle(mockPlayer, mockRoom, 'chest');

        expect(result.success).toBe(true);
        expect(result.message).toBe('A sturdy wooden chest.');
      });

      it('should examine key in room', async () => {
        const result = await handler.handle(mockPlayer, mockRoom, 'key');

        expect(result.success).toBe(true);
        expect(result.message).toBe('An old brass key.');
      });

      it('should handle object with no description', async () => {
        (handler as any).objects.set('stone-1', {
          id: 'stone-1',
          name: 'Stone',
          roomId: 'room-1',
        });
        mockRoomService.getObjectsInRoom.mockReturnValueOnce([
          ...mockRoomService.getObjectsInRoom(),
          { id: 'stone-1', name: 'Stone', roomId: 'room-1' },
        ]);
        mockGameStateService.getGameState.mockResolvedValue({
          gameId: 'game-123',
          npcs: {},
        });

        const result = await handler.handle(mockPlayer, mockRoom, 'stone');

        expect(result.success).toBe(true);
        expect(result.message).toBe("It's a Stone.");
      });
    });

    describe('Case Insensitive Matching', () => {
      it('should match uppercase target', async () => {
        const result = await handler.handle(mockPlayer, mockRoom, 'SWORD');

        expect(result.success).toBe(true);
        expect(result.message).toContain('iron blade');
      });

      it('should match mixed case target', async () => {
        const result = await handler.handle(mockPlayer, mockRoom, 'IrOn SwOrD');

        expect(result.success).toBe(true);
        expect(result.message).toContain('iron blade');
      });
    });
  });

  // ==============================================================================
  // NPC EXAMINATION TESTS (12 tests)
  // ==============================================================================

  describe('NPC Examination', () => {
    describe('Basic NPC Examination', () => {
      it('should examine NPC in room', async () => {
        mockGameStateService.getGameState.mockResolvedValue({
          gameId: 'game-123',
          npcs: {
            'npc-1': {
              id: 'npc-1',
              name: 'Guard',
              description: 'A stern-looking guard.',
              position: { x: 5, y: 6, z: 0 },
              roomId: 'room-1',
            },
          },
        });

        const result = await handler.handle(mockPlayer, mockRoom, 'guard');

        expect(result.success).toBe(true);
        expect(result.type).toBe('examination');
        expect(result.message).toBe('A stern-looking guard.');
      });

      it('should handle NPC with no description', async () => {
        mockGameStateService.getGameState.mockResolvedValue({
          gameId: 'game-123',
          npcs: {
            'npc-1': {
              id: 'npc-1',
              name: 'Merchant',
              position: { x: 5, y: 6, z: 0 },
              roomId: 'room-1',
            },
          },
        });

        const result = await handler.handle(mockPlayer, mockRoom, 'merchant');

        expect(result.success).toBe(true);
        expect(result.message).toBe('Merchant stands before you.');
      });

      it('should match NPC by partial name', async () => {
        mockGameStateService.getGameState.mockResolvedValue({
          gameId: 'game-123',
          npcs: {
            'npc-1': {
              id: 'npc-1',
              name: 'Town Guard',
              description: 'A guard protecting the town.',
              position: { x: 5, y: 6, z: 0 },
              roomId: 'room-1',
            },
          },
        });

        const result = await handler.handle(mockPlayer, mockRoom, 'guard');

        expect(result.success).toBe(true);
        expect(result.message).toContain('protecting the town');
      });

      it('should not examine NPCs in other rooms', async () => {
        const roomWithoutNPC = { ...mockRoom, players: ['player-1'] };

        mockGameStateService.getGameState.mockResolvedValue({
          gameId: 'game-123',
          npcs: {
            'npc-1': {
              id: 'npc-1',
              name: 'Guard',
              description: 'A guard.',
              position: { x: 15, y: 15, z: 0 },
              roomId: 'room-2', // Different room
            },
          },
        });

        const result = await handler.handle(mockPlayer, roomWithoutNPC, 'guard');

        expect(result.success).toBe(false);
        expect(result.message).toContain('not find');
      });
    });

    describe('NPC Inventory Hints', () => {
      it('should show inventory hint if NPC has items', async () => {
        mockGameStateService.getGameState.mockResolvedValue({
          gameId: 'game-123',
          npcs: {
            'npc-1': {
              id: 'npc-1',
              name: 'Merchant',
              description: 'A traveling merchant.',
              inventory: ['item-1', 'item-2'],
              position: { x: 5, y: 6, z: 0 },
              roomId: 'room-1',
            },
          },
        });

        const result = await handler.handle(mockPlayer, mockRoom, 'merchant');

        expect(result.success).toBe(true);
        expect(result.message).toContain('traveling merchant');
        expect(result.message).toContain('notice Merchant is carrying some items');
      });

      it('should not show inventory hint if NPC has no items', async () => {
        mockGameStateService.getGameState.mockResolvedValue({
          gameId: 'game-123',
          npcs: {
            'npc-1': {
              id: 'npc-1',
              name: 'Guard',
              description: 'A guard.',
              inventory: [],
              position: { x: 5, y: 6, z: 0 },
              roomId: 'room-1',
            },
          },
        });

        const result = await handler.handle(mockPlayer, mockRoom, 'guard');

        expect(result.success).toBe(true);
        expect(result.message).not.toContain('carrying some items');
      });

      it('should not show inventory hint if inventory is undefined', async () => {
        mockGameStateService.getGameState.mockResolvedValue({
          gameId: 'game-123',
          npcs: {
            'npc-1': {
              id: 'npc-1',
              name: 'Guard',
              description: 'A guard.',
              position: { x: 5, y: 6, z: 0 },
              roomId: 'room-1',
            },
          },
        });

        const result = await handler.handle(mockPlayer, mockRoom, 'guard');

        expect(result.success).toBe(true);
        expect(result.message).not.toContain('carrying');
      });
    });

    describe('NPC Health Status', () => {
      it('should show "defeated" status if NPC health is 0', async () => {
        mockGameStateService.getGameState.mockResolvedValue({
          gameId: 'game-123',
          npcs: {
            'npc-1': {
              id: 'npc-1',
              name: 'Goblin',
              description: 'A small goblin.',
              health: 0,
              maxHealth: 50,
              position: { x: 5, y: 6, z: 0 },
              roomId: 'room-1',
            },
          },
        });

        const result = await handler.handle(mockPlayer, mockRoom, 'goblin');

        expect(result.success).toBe(true);
        expect(result.message).toContain('has been defeated');
      });

      it('should show "wounded" status if NPC health is below max', async () => {
        mockGameStateService.getGameState.mockResolvedValue({
          gameId: 'game-123',
          npcs: {
            'npc-1': {
              id: 'npc-1',
              name: 'Orc',
              description: 'A large orc.',
              health: 30,
              maxHealth: 100,
              position: { x: 5, y: 6, z: 0 },
              roomId: 'room-1',
            },
          },
        });

        const result = await handler.handle(mockPlayer, mockRoom, 'orc');

        expect(result.success).toBe(true);
        expect(result.message).toContain('appears to be wounded');
      });

      it('should not show health status if NPC is at full health', async () => {
        mockGameStateService.getGameState.mockResolvedValue({
          gameId: 'game-123',
          npcs: {
            'npc-1': {
              id: 'npc-1',
              name: 'Guard',
              description: 'A guard.',
              health: 100,
              maxHealth: 100,
              position: { x: 5, y: 6, z: 0 },
              roomId: 'room-1',
            },
          },
        });

        const result = await handler.handle(mockPlayer, mockRoom, 'guard');

        expect(result.success).toBe(true);
        expect(result.message).not.toContain('wounded');
        expect(result.message).not.toContain('defeated');
      });

      it('should combine inventory hint and health status', async () => {
        mockGameStateService.getGameState.mockResolvedValue({
          gameId: 'game-123',
          npcs: {
            'npc-1': {
              id: 'npc-1',
              name: 'Bandit',
              description: 'A dangerous bandit.',
              inventory: ['dagger'],
              health: 25,
              maxHealth: 75,
              position: { x: 5, y: 6, z: 0 },
              roomId: 'room-1',
            },
          },
        });

        const result = await handler.handle(mockPlayer, mockRoom, 'bandit');

        expect(result.success).toBe(true);
        expect(result.message).toContain('dangerous bandit');
        expect(result.message).toContain('carrying some items');
        expect(result.message).toContain('appears to be wounded');
      });
    });
  });

  // ==============================================================================
  // ERROR HANDLING TESTS (4 tests)
  // ==============================================================================

  describe('Error Handling', () => {
    it('should return not found error for non-existent object', async () => {
      mockPlayerService.getInventory.mockReturnValueOnce([]);
      mockRoomService.getObjectsInRoom.mockReturnValueOnce([]);
      mockGameStateService.getGameState.mockResolvedValue({
        gameId: 'game-123',
        npcs: {},
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'dragon');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not find');
      expect(result.message).toContain('dragon');
    });

    it('should handle empty game state npcs', async () => {
      mockGameStateService.getGameState.mockResolvedValue({
        gameId: 'game-123',
        npcs: {},
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'guard');

      expect(result.success).toBe(false);
    });

    it('should handle undefined game state npcs', async () => {
      mockGameStateService.getGameState.mockResolvedValue({
        gameId: 'game-123',
      });

      const result = await handler.handle(mockPlayer, mockRoom, 'guard');

      expect(result.success).toBe(false);
    });

    it('should handle game state service errors gracefully', async () => {
      mockGameStateService.getGameState.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        handler.handle(mockPlayer, mockRoom, 'guard'),
      ).rejects.toThrow('Database error');
    });
  });

  // ==============================================================================
  // EDGE CASES (3 tests)
  // ==============================================================================

  describe('Edge Cases', () => {
    it('should handle room with no objects array', async () => {
      const emptyRoom = { ...mockRoom, objects: undefined };
      mockGameStateService.getGameState.mockResolvedValue({
        gameId: 'game-123',
        npcs: {},
      });

      const result = await handler.handle(mockPlayer, emptyRoom, 'sword');

      expect(result.success).toBe(true); // Sword is in inventory
    });

    it('should handle player with no inventory array', async () => {
      const noInventoryPlayer = { ...mockPlayer, inventory: undefined };
      mockGameStateService.getGameState.mockResolvedValue({
        gameId: 'game-123',
        npcs: {},
      });

      const result = await handler.handle(noInventoryPlayer, mockRoom, 'chest');

      expect(result.success).toBe(true); // Chest is in room
    });

    it('should handle room with no players array', async () => {
      const roomNoPlayers = { ...mockRoom, players: undefined };
      mockGameStateService.getGameState.mockResolvedValue({
        gameId: 'game-123',
        npcs: {
          'npc-1': {
            id: 'npc-1',
            name: 'Guard',
            description: 'A guard.',
            roomId: 'room-1',
          },
        },
      });

      const result = await handler.handle(mockPlayer, roomNoPlayers, 'guard');

      expect(result.success).toBe(false); // NPC not found (not in players list)
    });
  });
});
