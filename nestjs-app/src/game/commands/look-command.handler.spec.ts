import { Test, TestingModule } from '@nestjs/testing';
import { LookCommandHandler } from './look-command.handler';
import { RoomService } from '../../entity/room.service';
import { RoomNavigationHelperService } from '../room-navigation-helper.service';
import { ExamineCommandHandler } from './examine-command.handler';
import { GameStateService } from '../game-state.service';

describe('LookCommandHandler', () => {
  let handler: LookCommandHandler;
  let mockRoomService: jest.Mocked<Partial<RoomService>>;
  let mockRoomNavHelper: jest.Mocked<Partial<RoomNavigationHelperService>>;
  let mockExamineHandler: jest.Mocked<Partial<ExamineCommandHandler>>;
  let mockGameStateService: jest.Mocked<Partial<GameStateService>>;

  const mockPlayer = {
    id: 'player-1',
    gameId: 'game-123',
    name: 'Hero',
    position: { x: 5, y: 5, z: 0 },
    health: 100,
    maxHealth: 100,
    inventory: ['sword-1'],
    roomId: 'room-1',
  };

  const mockRoom = {
    id: 'room-1',
    name: 'Grand Hall',
    description: 'A magnificent hall with marble columns and vaulted ceilings.',
    position: { x: 0, y: 0, z: 0 },
    size: { width: 20, height: 20, depth: 5 },
    width: 20,
    height: 20,
    objects: ['chest-1', 'key-1', 'torch-1'],
    players: ['player-1', 'npc-1', 'npc-2'],
    connections: { north: 'room-2', east: 'room-3' },
  };

  const mockObjects = [
    { id: 'chest-1', name: 'Wooden Chest', description: 'A sturdy chest.', roomId: 'room-1' },
    { id: 'key-1', name: 'Brass Key', description: 'An old key.', roomId: 'room-1' },
    { id: 'torch-1', name: 'Torch', description: 'A flickering torch.', roomId: 'room-1' },
  ];

  const mockGameState = {
    gameId: 'game-123',
    npcs: {
      'npc-1': {
        id: 'npc-1',
        name: 'Guard',
        description: 'A stern guard.',
        health: 100,
        maxHealth: 100,
        position: { x: 5, y: 6, z: 0 },
        roomId: 'room-1',
      },
      'npc-2': {
        id: 'npc-2',
        name: 'Merchant',
        description: 'A friendly merchant.',
        health: 80,
        maxHealth: 100,
        position: { x: 5, y: 7, z: 0 },
        roomId: 'room-1',
      },
    },
  };

  beforeEach(async () => {
    mockRoomService = {
      getObjectsInRoom: jest.fn().mockReturnValue(mockObjects),
      getRoom: jest.fn(),
    };

    mockRoomNavHelper = {
      getAvailableExits: jest.fn().mockReturnValue(['north', 'east']),
    };

    mockExamineHandler = {
      handle: jest.fn().mockResolvedValue({
        success: true,
        type: 'examination',
        message: 'A sturdy chest.',
      }),
    };

    mockGameStateService = {
      getGameState: jest.fn().mockResolvedValue(mockGameState),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LookCommandHandler,
        { provide: RoomService, useValue: mockRoomService },
        { provide: RoomNavigationHelperService, useValue: mockRoomNavHelper },
        { provide: ExamineCommandHandler, useValue: mockExamineHandler },
        { provide: GameStateService, useValue: mockGameStateService },
      ],
    }).compile();

    handler = module.get<LookCommandHandler>(LookCommandHandler);
  });

  // ==============================================================================
  // ROOM DESCRIPTION TESTS (8 tests)
  // ==============================================================================

  describe('Room Description', () => {
    it('should display room description with no target', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, '');

      expect(result.success).toBe(true);
      expect(result.type).toBe('room_description');
      expect(result.roomDescription).toBe('A magnificent hall with marble columns and vaulted ceilings.');
    });

    it('should display room description with null or undefined target', async () => {
      const result1 = await handler.handle(mockPlayer, mockRoom, null as any);
      const result2 = await handler.handle(mockPlayer, mockRoom, undefined as any);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.type).toBe('room_description');
      expect(result2.type).toBe('room_description');
    });

    it('should display room description with "around" keyword', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, 'around');

      expect(result.success).toBe(true);
      expect(result.type).toBe('room_description');
      expect(result.roomDescription).toBe(mockRoom.description);
    });

    it('should display room description with "room" keyword', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, 'room');

      expect(result.success).toBe(true);
      expect(result.type).toBe('room_description');
    });

    it('should include player location in result', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, '');

      expect(result.playerStatus).toBeDefined();
      expect(result.playerStatus.location).toBe('Grand Hall');
    });

    it('should return complete result structure', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, '');

      expect(result).toEqual({
        success: true,
        type: 'room_description',
        roomDescription: mockRoom.description,
        items: expect.any(Array),
        npcs: expect.any(Array),
        exits: expect.any(Array),
        playerStatus: { location: mockRoom.name },
      });
    });

    it('should call services with correct parameters', async () => {
      await handler.handle(mockPlayer, mockRoom, '');

      expect(mockRoomService.getObjectsInRoom).toHaveBeenCalledWith('room-1');
      expect(mockRoomNavHelper.getAvailableExits).toHaveBeenCalledWith(mockRoom);
      expect(mockGameStateService.getGameState).toHaveBeenCalledWith('game-123');
    });

    it('should handle different room names', async () => {
      const dungeonRoom = { ...mockRoom, name: 'Dark Dungeon' };
      mockRoomService.getObjectsInRoom.mockReturnValue([]);
      mockRoomNavHelper.getAvailableExits.mockReturnValue([]);
      mockGameStateService.getGameState.mockResolvedValue({ npcs: {} });

      const result = await handler.handle(mockPlayer, dungeonRoom, '');

      expect(result.playerStatus.location).toBe('Dark Dungeon');
    });
  });

  // ==============================================================================
  // OBJECT LISTING TESTS (6 tests)
  // ==============================================================================

  describe('Object Listing', () => {
    it('should list all objects in room', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, '');

      expect(result.items).toEqual(['Wooden Chest', 'Brass Key', 'Torch']);
    });

    it('should return empty array when room has no objects', async () => {
      mockRoomService.getObjectsInRoom.mockReturnValue([]);

      const result = await handler.handle(mockPlayer, mockRoom, '');

      expect(result.items).toEqual([]);
    });

    it('should filter out objects with no name', async () => {
      mockRoomService.getObjectsInRoom.mockReturnValue([
        { id: 'obj-1', name: 'Valid Object', roomId: 'room-1' },
        { id: 'obj-2', name: '', roomId: 'room-1' },
        { id: 'obj-3', name: null, roomId: 'room-1' },
        { id: 'obj-4', name: undefined, roomId: 'room-1' },
        { id: 'obj-5', name: 'Another Object', roomId: 'room-1' },
      ]);

      const result = await handler.handle(mockPlayer, mockRoom, '');

      expect(result.items).toEqual(['Valid Object', 'Another Object']);
    });

    it('should preserve object name order', async () => {
      mockRoomService.getObjectsInRoom.mockReturnValue([
        { id: 'obj-1', name: 'Armor', roomId: 'room-1' },
        { id: 'obj-2', name: 'Boots', roomId: 'room-1' },
        { id: 'obj-3', name: 'Cloak', roomId: 'room-1' },
      ]);

      const result = await handler.handle(mockPlayer, mockRoom, '');

      expect(result.items).toEqual(['Armor', 'Boots', 'Cloak']);
    });

    it('should handle objects with special characters', async () => {
      mockRoomService.getObjectsInRoom.mockReturnValue([
        { id: 'obj-1', name: "King's Crown", roomId: 'room-1' },
        { id: 'obj-2', name: 'Potion (Red)', roomId: 'room-1' },
      ]);

      const result = await handler.handle(mockPlayer, mockRoom, '');

      expect(result.items).toContain("King's Crown");
      expect(result.items).toContain('Potion (Red)');
    });

    it('should handle many objects', async () => {
      const manyObjects = Array.from({ length: 20 }, (_, i) => ({
        id: `obj-${i}`,
        name: `Object ${i}`,
        roomId: 'room-1',
      }));
      mockRoomService.getObjectsInRoom.mockReturnValue(manyObjects);

      const result = await handler.handle(mockPlayer, mockRoom, '');

      expect(result.items).toHaveLength(20);
    });
  });

  // ==============================================================================
  // NPC LISTING TESTS (10 tests)
  // ==============================================================================

  describe('NPC Listing', () => {
    it('should list NPCs in room', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, '');

      expect(result.npcs).toContain('Guard');
      expect(result.npcs).toContain('Merchant');
    });

    it('should return empty array when room has no NPCs', async () => {
      const emptyRoom = { ...mockRoom, players: ['player-1'] };
      mockGameStateService.getGameState.mockResolvedValue({ npcs: {} });

      const result = await handler.handle(mockPlayer, emptyRoom, '');

      expect(result.npcs).toEqual([]);
    });

    it('should handle null or undefined game state NPCs', async () => {
      mockGameStateService.getGameState.mockResolvedValue({ gameId: 'game-123', npcs: null });
      const result1 = await handler.handle(mockPlayer, mockRoom, '');

      mockGameStateService.getGameState.mockResolvedValue({ gameId: 'game-123' });
      const result2 = await handler.handle(mockPlayer, mockRoom, '');

      expect(result1.npcs).toEqual([]);
      expect(result2.npcs).toEqual([]);
    });

    it('should filter out defeated NPCs with health = 0', async () => {
      mockGameStateService.getGameState.mockResolvedValue({
        gameId: 'game-123',
        npcs: {
          'npc-1': { id: 'npc-1', name: 'Dead Guard', health: 0, maxHealth: 100, roomId: 'room-1' },
          'npc-2': { id: 'npc-2', name: 'Living Merchant', health: 50, maxHealth: 100, roomId: 'room-1' },
        },
      });

      const result = await handler.handle(mockPlayer, mockRoom, '');

      expect(result.npcs).not.toContain('Dead Guard');
      expect(result.npcs).toContain('Living Merchant');
    });

    it('should filter out defeated NPCs with health < 0', async () => {
      mockGameStateService.getGameState.mockResolvedValue({
        gameId: 'game-123',
        npcs: {
          'npc-1': { id: 'npc-1', name: 'Overkilled Guard', health: -10, maxHealth: 100, roomId: 'room-1' },
          'npc-2': { id: 'npc-2', name: 'Healthy Merchant', health: 100, maxHealth: 100, roomId: 'room-1' },
        },
      });

      const result = await handler.handle(mockPlayer, mockRoom, '');

      expect(result.npcs).not.toContain('Overkilled Guard');
      expect(result.npcs).toContain('Healthy Merchant');
    });

    it('should include NPC with health = 1', async () => {
      mockGameStateService.getGameState.mockResolvedValue({
        gameId: 'game-123',
        npcs: {
          'npc-1': { id: 'npc-1', name: 'Barely Alive Guard', health: 1, maxHealth: 100, roomId: 'room-1' },
        },
      });

      const result = await handler.handle(mockPlayer, mockRoom, '');

      expect(result.npcs).toContain('Barely Alive Guard');
    });

    it('should filter NPCs not in room players array', async () => {
      const roomWithLimitedNPCs = { ...mockRoom, players: ['player-1', 'npc-1'] };

      const result = await handler.handle(mockPlayer, roomWithLimitedNPCs, '');

      expect(result.npcs).toContain('Guard');
      expect(result.npcs).not.toContain('Merchant');
    });

    it('should handle NPCs without health property', async () => {
      mockGameStateService.getGameState.mockResolvedValue({
        gameId: 'game-123',
        npcs: {
          'npc-1': { id: 'npc-1', name: 'Invulnerable NPC', roomId: 'room-1' },
        },
      });

      const result = await handler.handle(mockPlayer, mockRoom, '');

      expect(result.npcs).toContain('Invulnerable NPC');
    });

    it('should only show NPCs in current room via players array', async () => {
      const roomWith1NPC = { ...mockRoom, players: ['player-1', 'npc-1'] };
      mockGameStateService.getGameState.mockResolvedValue({
        gameId: 'game-123',
        npcs: {
          'npc-1': { id: 'npc-1', name: 'Room NPC', health: 100, roomId: 'room-1' },
          'npc-2': { id: 'npc-2', name: 'Other Room NPC', health: 100, roomId: 'room-2' },
        },
      });

      const result = await handler.handle(mockPlayer, roomWith1NPC, '');

      expect(result.npcs).toEqual(['Room NPC']);
    });

    it('should handle room with no or empty players array', async () => {
      const roomWithoutPlayers = { ...mockRoom, players: undefined };
      const roomWithEmptyPlayers = { ...mockRoom, players: [] };

      const result1 = await handler.handle(mockPlayer, roomWithoutPlayers, '');
      const result2 = await handler.handle(mockPlayer, roomWithEmptyPlayers, '');

      expect(result1.npcs).toEqual([]);
      expect(result2.npcs).toEqual([]);
    });
  });

  // ==============================================================================
  // EXIT LISTING TESTS (5 tests)
  // ==============================================================================

  describe('Exit Listing', () => {
    it('should list available exits', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, '');

      expect(result.exits).toContain('north');
      expect(result.exits).toContain('east');
    });

    it('should return empty array when room has no exits', async () => {
      mockRoomNavHelper.getAvailableExits.mockReturnValue([]);

      const result = await handler.handle(mockPlayer, mockRoom, '');

      expect(result.exits).toEqual([]);
    });

    it('should list all four cardinal directions', async () => {
      mockRoomNavHelper.getAvailableExits.mockReturnValue(['north', 'south', 'east', 'west']);

      const result = await handler.handle(mockPlayer, mockRoom, '');

      expect(result.exits).toEqual(['north', 'south', 'east', 'west']);
    });

    it('should preserve exit order from helper service', async () => {
      mockRoomNavHelper.getAvailableExits.mockReturnValue(['east', 'west', 'north']);

      const result = await handler.handle(mockPlayer, mockRoom, '');

      expect(result.exits).toEqual(['east', 'west', 'north']);
    });

    it('should delegate exit calculation to RoomNavigationHelperService', async () => {
      await handler.handle(mockPlayer, mockRoom, '');

      expect(mockRoomNavHelper.getAvailableExits).toHaveBeenCalledTimes(1);
      expect(mockRoomNavHelper.getAvailableExits).toHaveBeenCalledWith(mockRoom);
    });
  });

  // ==============================================================================
  // SPECIFIC OBJECT EXAMINATION TESTS (5 tests)
  // ==============================================================================

  describe('Specific Object Examination', () => {
    it('should delegate to ExamineCommandHandler for specific target', async () => {
      await handler.handle(mockPlayer, mockRoom, 'chest');

      expect(mockExamineHandler.handle).toHaveBeenCalledWith(mockPlayer, mockRoom, 'chest');
    });

    it('should return result from ExamineCommandHandler', async () => {
      const examineResult = {
        success: true,
        type: 'examination',
        message: 'A sturdy wooden chest.',
      };
      mockExamineHandler.handle.mockResolvedValue(examineResult);

      const result = await handler.handle(mockPlayer, mockRoom, 'chest');

      expect(result).toEqual(examineResult);
    });

    it('should delegate for any non-keyword target', async () => {
      await handler.handle(mockPlayer, mockRoom, 'mysterious artifact');

      expect(mockExamineHandler.handle).toHaveBeenCalledWith(mockPlayer, mockRoom, 'mysterious artifact');
    });

    it('should not call room services when examining specific object', async () => {
      await handler.handle(mockPlayer, mockRoom, 'chest');

      expect(mockRoomService.getObjectsInRoom).not.toHaveBeenCalled();
      expect(mockRoomNavHelper.getAvailableExits).not.toHaveBeenCalled();
      expect(mockGameStateService.getGameState).not.toHaveBeenCalled();
    });

    it('should handle examine handler returning failure', async () => {
      const failureResult = {
        success: false,
        type: 'action_failure',
        message: 'You cannot find that object.',
      };
      mockExamineHandler.handle.mockResolvedValue(failureResult);

      const result = await handler.handle(mockPlayer, mockRoom, 'nonexistent');

      expect(result).toEqual(failureResult);
      expect(result.success).toBe(false);
    });
  });

  // ==============================================================================
  // EDGE CASES AND INTEGRATION TESTS (6 tests)
  // ==============================================================================

  describe('Edge Cases and Integration', () => {
    it('should handle completely empty room', async () => {
      const emptyRoom = { ...mockRoom, objects: [], players: ['player-1'] };
      mockRoomService.getObjectsInRoom.mockReturnValue([]);
      mockRoomNavHelper.getAvailableExits.mockReturnValue([]);
      mockGameStateService.getGameState.mockResolvedValue({ npcs: {} });

      const result = await handler.handle(mockPlayer, emptyRoom, '');

      expect(result.success).toBe(true);
      expect(result.items).toEqual([]);
      expect(result.npcs).toEqual([]);
      expect(result.exits).toEqual([]);
    });

    it('should handle whitespace target as specific object examination', async () => {
      await handler.handle(mockPlayer, mockRoom, '   ');

      expect(mockExamineHandler.handle).toHaveBeenCalledWith(mockPlayer, mockRoom, '   ');
    });

    it('should handle uppercase keywords as specific objects (case-sensitive)', async () => {
      await handler.handle(mockPlayer, mockRoom, 'AROUND');
      await handler.handle(mockPlayer, mockRoom, 'ROOM');

      expect(mockExamineHandler.handle).toHaveBeenCalledWith(mockPlayer, mockRoom, 'AROUND');
      expect(mockExamineHandler.handle).toHaveBeenCalledWith(mockPlayer, mockRoom, 'ROOM');
    });

    it('should handle rich room with all elements', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, '');

      expect(result.success).toBe(true);
      expect(result.roomDescription).toBeTruthy();
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.npcs.length).toBeGreaterThan(0);
      expect(result.exits.length).toBeGreaterThan(0);
      expect(result.playerStatus.location).toBeTruthy();
    });

    it('should handle transition from look around to look at object', async () => {
      const result1 = await handler.handle(mockPlayer, mockRoom, '');
      expect(result1.type).toBe('room_description');

      const result2 = await handler.handle(mockPlayer, mockRoom, 'chest');
      expect(mockExamineHandler.handle).toHaveBeenCalled();
    });

    it('should handle different players in same room', async () => {
      const player2 = { ...mockPlayer, id: 'player-2', name: 'Warrior' };

      const result1 = await handler.handle(mockPlayer, mockRoom, '');
      const result2 = await handler.handle(player2, mockRoom, '');

      expect(result1.playerStatus.location).toBe('Grand Hall');
      expect(result2.playerStatus.location).toBe('Grand Hall');
      expect(mockGameStateService.getGameState).toHaveBeenCalledTimes(2);
    });
  });
});
