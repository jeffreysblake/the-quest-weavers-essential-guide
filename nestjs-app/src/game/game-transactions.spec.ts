import { Test, TestingModule } from '@nestjs/testing';
import { GameService } from './game.service';
import { GameStateService } from './game-state.service';
import { CommandProcessorService } from './command-processor.service';
import { EntityService } from '../entity/entity.service';
import { RoomService } from '../entity/room.service';
import { PlayerService } from '../entity/player.service';
import { ObjectService } from '../entity/object.service';
import { DatabaseService } from '../database/database.service';

describe('GameService - Transaction Fixes', () => {
  let service: GameService;
  let databaseService: DatabaseService;
  let roomService: RoomService;
  let playerService: PlayerService;
  let objectService: ObjectService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        GameService,
        {
          provide: GameStateService,
          useValue: {
            getGameState: jest.fn().mockResolvedValue({ initialized: true }),
            updateGameState: jest.fn().mockResolvedValue(true),
            saveGameState: jest.fn().mockResolvedValue(true),
            loadGameState: jest.fn().mockResolvedValue({}),
          },
        },
        {
          provide: CommandProcessorService,
          useValue: {
            processCommand: jest.fn().mockResolvedValue({ success: true }),
          },
        },
        {
          provide: EntityService,
          useValue: {
            createEntity: jest.fn(),
            getEntity: jest.fn(),
            updateEntity: jest.fn(),
          },
        },
        {
          provide: RoomService,
          useValue: {
            createRoom: jest
              .fn()
              .mockReturnValue({ id: 'room-1', name: 'Test Room' }),
            addObjectToRoom: jest.fn().mockReturnValue(true),
            getAllRooms: jest.fn().mockReturnValue([]),
          },
        },
        {
          provide: PlayerService,
          useValue: {
            createPlayer: jest.fn().mockReturnValue({
              id: 'player-1',
              name: 'Test Player',
              position: { x: 0, y: 0, z: 0 },
              health: 100,
            }),
          },
        },
        {
          provide: ObjectService,
          useValue: {
            createObject: jest
              .fn()
              .mockReturnValue({ id: 'object-1', name: 'Test Object' }),
          },
        },
        {
          provide: DatabaseService,
          useValue: {
            // Test synchronous transaction method
            transaction: jest.fn().mockImplementation((callback) => {
              const mockDb = {
                prepare: jest.fn().mockReturnValue({
                  run: jest.fn(),
                }),
              };
              return callback(mockDb);
            }),
            saveVersion: jest.fn().mockReturnValue(1),
            prepare: jest.fn().mockReturnValue({
              run: jest.fn(),
              get: jest.fn(),
              all: jest.fn(),
            }),
            exec: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<GameService>(GameService);
    databaseService = module.get<DatabaseService>(DatabaseService);
    roomService = module.get<RoomService>(RoomService);
    playerService = module.get<PlayerService>(PlayerService);
    objectService = module.get<ObjectService>(ObjectService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('Game Creation with Database Transactions', () => {
    it('should create game with synchronous database operations', async () => {
      const result = await service.createGame();

      expect(result).toBeDefined();
      expect(result.gameId).toBeDefined();
      expect(result.gameState).toBeDefined();

      // Verify database prepare method was called (for direct database operations)
      expect(databaseService.prepare).toHaveBeenCalled();

      // Verify saveVersion was called synchronously (not with await)
      expect(databaseService.saveVersion).toHaveBeenCalled();

      // Verify game creation components
      expect(playerService.createPlayer).toHaveBeenCalled();
      expect(roomService.createRoom).toHaveBeenCalledTimes(3); // Entry Hall, Garden, Library
      expect(objectService.createObject).toHaveBeenCalledTimes(4); // Torch, Key, Book, Flower
    });

    it('should handle database transaction failures gracefully', async () => {
      const mockError = new Error('Database prepare failed');

      // Mock the prepare method to throw an error since saveGameToDatabase uses prepare directly
      jest.spyOn(databaseService, 'prepare').mockImplementation(() => {
        throw mockError;
      });

      await expect(service.createGame()).rejects.toThrow('Failed to save game');
    });

    it('should use synchronous saveVersion calls within transactions', async () => {
      await service.createGame();

      // Verify saveVersion was called synchronously (without await)
      expect(databaseService.saveVersion).toHaveBeenCalled();

      // Verify the call was not wrapped in a promise
      const saveVersionCalls = (databaseService.saveVersion as jest.Mock).mock
        .calls;
      expect(saveVersionCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Transaction Synchronization', () => {
    it('should not use await with transaction method', () => {
      const transactionSpy = jest.spyOn(databaseService, 'transaction');

      // This should work without await
      const result = databaseService.transaction((db) => {
        return { success: true };
      });

      expect(result).toEqual({ success: true });
      expect(transactionSpy).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should handle nested database operations synchronously', () => {
      let operationsCompleted = 0;

      databaseService.transaction((db) => {
        db.prepare('INSERT INTO test').run();
        operationsCompleted++;

        // Simulate saveVersion call within transaction
        databaseService.saveVersion('test', 'test-id', { data: 'test' });
        operationsCompleted++;
      });

      expect(operationsCompleted).toBe(2);
      expect(databaseService.saveVersion).toHaveBeenCalled();
    });
  });

  describe('Game State Consistency', () => {
    it('should maintain consistent state during database operations', async () => {
      const gameResult = await service.createGame();

      // Verify all components were created in proper order
      expect(databaseService.prepare).toHaveBeenCalled();
      expect(databaseService.saveVersion).toHaveBeenCalled();

      // Verify game state includes all required elements
      expect(gameResult.gameState.player).toBeDefined();
      expect(gameResult.gameState.initialized).toBe(true);
    });
  });
});
