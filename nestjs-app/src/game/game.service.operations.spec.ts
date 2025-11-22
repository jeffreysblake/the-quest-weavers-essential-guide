import { Test, TestingModule } from '@nestjs/testing';
import { GameService, GameSession, CommandResult } from './game.service';
import { GameStateService } from './game-state.service';
import { CommandProcessorService } from './command-processor.service';
import { EntityService } from '../entity/entity.service';
import { RoomService } from '../entity/room.service';
import { PlayerService } from '../entity/player.service';
import { ObjectService } from '../entity/object.service';
import { DatabaseService } from '../database/database.service';

describe('GameService - Operations', () => {
  let service: GameService;
  let gameStateService: jest.Mocked<GameStateService>;
  let commandProcessor: jest.Mocked<CommandProcessorService>;
  let entityService: jest.Mocked<EntityService>;
  let roomService: jest.Mocked<RoomService>;
  let playerService: jest.Mocked<PlayerService>;
  let objectService: jest.Mocked<ObjectService>;
  let databaseService: jest.Mocked<DatabaseService>;

  const mockPlayer = {
    id: 'player-123',
    name: 'Adventurer',
    type: 'player',
    position: { x: 0, y: 0, z: 0 },
    health: 100,
    maxHealth: 100,
    inventory: [],
    level: 1,
    experience: 0,
    gameId: 'game-123',
  };

  const mockRoom = {
    id: 'room-123',
    name: 'Entry Hall',
    description: 'A dimly lit entry hall',
    position: { x: 0, y: 0, z: 0 },
    width: 10,
    height: 10,
    size: { width: 10, height: 10, depth: 3 },
    objects: [],
    players: [],
  };

  const mockGameState = {
    gameId: 'game-123',
    rooms: {},
    npcs: {},
    items: {},
    metadata: {
      version: '2.1.0',
      initialized: true,
    },
  };

  beforeEach(async () => {
    const mockGameStateServiceValue = {
      getGameState: jest.fn(),
      updateGameState: jest.fn(),
      saveGameState: jest.fn(),
      loadGameState: jest.fn(),
    };

    const mockCommandProcessorValue = {
      processCommand: jest.fn(),
    };

    const mockEntityServiceValue = {
      createEntity: jest.fn(),
      getEntity: jest.fn(),
      updateEntity: jest.fn(),
    };

    const mockRoomServiceValue = {
      createRoom: jest.fn(),
      getRoom: jest.fn(),
      getAllRooms: jest.fn(),
      addObjectToRoom: jest.fn(),
      update: jest.fn(),
      connectRooms: jest.fn(),
    };

    const mockPlayerServiceValue = {
      createPlayer: jest.fn(),
      getPlayer: jest.fn(),
      getInventory: jest.fn(),
    };

    const mockObjectServiceValue = {
      createObject: jest.fn(),
      getObject: jest.fn(),
    };

    const mockDatabaseServiceValue = {
      transaction: jest.fn(),
      prepare: jest.fn(),
      saveVersion: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GameService,
        {
          provide: GameStateService,
          useValue: mockGameStateServiceValue,
        },
        {
          provide: CommandProcessorService,
          useValue: mockCommandProcessorValue,
        },
        {
          provide: EntityService,
          useValue: mockEntityServiceValue,
        },
        {
          provide: RoomService,
          useValue: mockRoomServiceValue,
        },
        {
          provide: PlayerService,
          useValue: mockPlayerServiceValue,
        },
        {
          provide: ObjectService,
          useValue: mockObjectServiceValue,
        },
        {
          provide: DatabaseService,
          useValue: mockDatabaseServiceValue,
        },
      ],
    }).compile();

    service = module.get<GameService>(GameService);
    gameStateService = module.get(GameStateService);
    commandProcessor = module.get(CommandProcessorService);
    entityService = module.get(EntityService);
    roomService = module.get(RoomService);
    playerService = module.get(PlayerService);
    objectService = module.get(ObjectService);
    databaseService = module.get(DatabaseService);

    // Default mock implementations
    playerService.createPlayer.mockResolvedValue(mockPlayer);
    playerService.getPlayer.mockReturnValue(mockPlayer);
    roomService.createRoom.mockImplementation((data) => ({
      id: `room-${Math.random()}`,
      ...data,
    }));
    objectService.createObject.mockImplementation((data) => ({
      id: `obj-${Math.random()}`,
      ...data,
    }));
    roomService.getAllRooms.mockReturnValue([mockRoom]);
    gameStateService.getGameState.mockResolvedValue(mockGameState);
    gameStateService.updateGameState.mockResolvedValue(undefined);

    // Mock database operations
    const mockRun = jest.fn();
    const mockPrepare = jest.fn().mockReturnValue({ run: mockRun });
    databaseService.prepare.mockReturnValue({ run: mockRun } as any);
    databaseService.saveVersion.mockResolvedValue(1);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getGame()', () => {
    it('should return null for non-existent game', async () => {
      const result = await service.getGame('non-existent');

      expect(result).toBeNull();
    });

    it('should return game state for existing game', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      const result = await service.getGame(gameId);

      expect(result).not.toBeNull();
      expect(result.gameState).toBeDefined();
    });

    it('should update lastActive timestamp', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      const session1 = (service as any).gameSessions.get(gameId);
      const lastActive1 = session1.lastActive.getTime();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      await service.getGame(gameId);

      const session2 = (service as any).gameSessions.get(gameId);
      const lastActive2 = session2.lastActive.getTime();

      expect(lastActive2).toBeGreaterThan(lastActive1);
    });

    it('should include player in game state', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      const result = await service.getGame(gameId);

      expect(result.gameState.player).toBeDefined();
    });

    it('should handle null game state by creating default', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      gameStateService.getGameState.mockResolvedValue(null);

      const result = await service.getGame(gameId);

      expect(result.gameState).toBeDefined();
      expect(result.gameState.metadata.version).toBe('2.1.0');
    });
  });

  describe('processCommand()', () => {
    it('should return error for non-existent game session', async () => {
      const result = await service.processCommand('non-existent', 'look');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Game session not found');
    });

    it('should process command for existing game', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      const mockCommandResult: CommandResult = {
        success: true,
        type: 'room_description',
        message: 'You look around',
      };

      commandProcessor.processCommand.mockResolvedValue(mockCommandResult);

      const result = await service.processCommand(gameId, 'look');

      expect(result.success).toBe(true);
      expect(commandProcessor.processCommand).toHaveBeenCalledWith(
        'look',
        mockPlayer.id,
        gameId,
      );
    });

    it('should update lastActive timestamp', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      const session1 = (service as any).gameSessions.get(gameId);
      const lastActive1 = session1.lastActive.getTime();

      await new Promise((resolve) => setTimeout(resolve, 10));

      commandProcessor.processCommand.mockResolvedValue({
        success: true,
        type: 'room_description',
      });

      await service.processCommand(gameId, 'look');

      const session2 = (service as any).gameSessions.get(gameId);
      const lastActive2 = session2.lastActive.getTime();

      expect(lastActive2).toBeGreaterThan(lastActive1);
    });

    it('should update game state after successful command', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      const mockCommandResult: CommandResult = {
        success: true,
        type: 'action_success',
      };

      commandProcessor.processCommand.mockResolvedValue(mockCommandResult);

      await service.processCommand(gameId, 'take key');

      expect(gameStateService.updateGameState).toHaveBeenCalledWith(
        gameId,
        expect.objectContaining({
          lastCommand: 'take key',
          lastCommandTime: expect.any(Date),
        }),
      );
    });

    it('should handle command processing errors', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      commandProcessor.processCommand.mockRejectedValue(
        new Error('Command error'),
      );

      const result = await service.processCommand(gameId, 'invalid');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Command processing error');
    });
  });

  describe('getInventory()', () => {
    it('should return error for non-existent game', async () => {
      const result = await service.getInventory('non-existent');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Game session not found');
    });

    it('should return inventory for existing game', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      const mockInventory = [
        { id: 'item-1', name: 'Sword', type: 'weapon' },
        { id: 'item-2', name: 'Potion', type: 'consumable' },
      ];

      playerService.getInventory.mockReturnValue(mockInventory);

      const result = await service.getInventory(gameId);

      expect(result.success).toBe(true);
      expect(result.items).toBeDefined();
      expect(result.items.length).toBe(2);
    });

    it('should handle player not found', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      playerService.getPlayer.mockReturnValue(null);

      const result = await service.getInventory(gameId);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Player not found');
    });

    it('should handle errors gracefully', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      playerService.getInventory.mockImplementation(() => {
        throw new Error('Inventory error');
      });

      const result = await service.getInventory(gameId);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to get inventory');
    });
  });

  describe('getMap()', () => {
    it('should return error for non-existent game', async () => {
      const result = await service.getMap('non-existent');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Game session not found');
    });

    it('should return map for existing game', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      const result = await service.getMap(gameId);

      expect(result.success).toBe(true);
      expect(result.map).toBeDefined();
      expect(result.map.ascii).toBeDefined();
    });

    it('should handle player not found', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      playerService.getPlayer.mockReturnValue(null);

      const result = await service.getMap(gameId);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Player not found');
    });

    it('should show unknown area when room not found', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      roomService.getAllRooms.mockReturnValue([]);

      const result = await service.getMap(gameId);

      expect(result.success).toBe(true);
      expect(result.map.ascii).toContain('UNKNOWN AREA');
    });

    it('should handle errors gracefully', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      roomService.getAllRooms.mockImplementation(() => {
        throw new Error('Map error');
      });

      const result = await service.getMap(gameId);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to get map');
    });
  });

  describe('saveGame()', () => {
    it('should return error for non-existent game', async () => {
      const result = await service.saveGame('non-existent');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Game session not found');
    });

    it('should save game to default slot', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      gameStateService.saveGameState.mockResolvedValue(undefined);

      const result = await service.saveGame(gameId);

      expect(result.success).toBe(true);
      expect(result.message).toContain('quicksave');
      expect(gameStateService.saveGameState).toHaveBeenCalledWith(
        gameId,
        'quicksave',
      );
    });

    it('should save game to named slot', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      gameStateService.saveGameState.mockResolvedValue(undefined);

      const result = await service.saveGame(gameId, 'my-save');

      expect(result.success).toBe(true);
      expect(result.message).toContain('my-save');
      expect(gameStateService.saveGameState).toHaveBeenCalledWith(
        gameId,
        'my-save',
      );
    });

    it('should handle save errors', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      gameStateService.saveGameState.mockRejectedValue(
        new Error('Save failed'),
      );

      const result = await service.saveGame(gameId);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Save failed');
    });
  });

  describe('loadGame()', () => {
    it('should return error for non-existent game', async () => {
      const result = await service.loadGame('non-existent');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Game session not found');
    });

    it('should load game from default slot', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      const mockLoadedState = { ...mockGameState };
      gameStateService.loadGameState.mockResolvedValue(mockLoadedState);

      const result = await service.loadGame(gameId);

      expect(result.success).toBe(true);
      expect(result.gameState).toEqual(mockLoadedState);
      expect(result.message).toContain('quicksave');
      expect(gameStateService.loadGameState).toHaveBeenCalledWith(
        gameId,
        'quicksave',
      );
    });

    it('should load game from named slot', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      const mockLoadedState = { ...mockGameState };
      gameStateService.loadGameState.mockResolvedValue(mockLoadedState);

      const result = await service.loadGame(gameId, 'my-save');

      expect(result.success).toBe(true);
      expect(result.message).toContain('my-save');
      expect(gameStateService.loadGameState).toHaveBeenCalledWith(
        gameId,
        'my-save',
      );
    });

    it('should handle load errors', async () => {
      const createResult = await service.createGame();
      const gameId = createResult.gameId;

      gameStateService.loadGameState.mockRejectedValue(
        new Error('Load failed'),
      );

      const result = await service.loadGame(gameId);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Load failed');
    });
  });
});
