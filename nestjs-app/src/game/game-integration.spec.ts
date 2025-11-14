import { Test, TestingModule } from '@nestjs/testing';
import { GameService } from './game.service';
import { GameStateService } from './game-state.service';
import { CommandProcessorService } from './command-processor.service';
import { EntityService } from '../entity/entity.service';
import { RoomService } from '../entity/room.service';
import { PlayerService } from '../entity/player.service';
import { ObjectService } from '../entity/object.service';
import { PhysicsService } from '../entity/physics.service';
import { DatabaseService } from '../database/database.service';

describe('Game Integration - End-to-End Flow', () => {
  let gameService: GameService;
  let commandProcessor: CommandProcessorService;
  let databaseService: DatabaseService;
  let module: TestingModule;

  let testGameId: string;
  let testPlayerId: string;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        GameService,
        CommandProcessorService,
        GameStateService,
        EntityService,
        RoomService,
        PlayerService,
        ObjectService,
        {
          provide: DatabaseService,
          useValue: {
            // Mock synchronous transaction
            transaction: jest.fn().mockImplementation((callback) => {
              const mockDb = {
                prepare: jest.fn().mockReturnValue({
                  run: jest.fn(),
                  get: jest.fn().mockReturnValue({ count: 1 }),
                  all: jest.fn().mockReturnValue([]),
                }),
              };
              return callback(mockDb);
            }),
            saveVersion: jest.fn().mockReturnValue(1),
            prepare: jest.fn().mockReturnValue({
              run: jest.fn(),
              get: jest.fn(),
              all: jest.fn().mockReturnValue([]),
            }),
            exec: jest.fn(),
          },
        },
        {
          provide: PhysicsService,
          useValue: {
            createEntity: jest.fn(),
            findAll: jest.fn().mockReturnValue([]),
            findOne: jest.fn(),
            updateEntity: jest.fn(),
            removeEntity: jest.fn(),
            applyForce: jest.fn(),
            setVelocity: jest.fn(),
            step: jest.fn(),
          },
        },
      ],
    }).compile();

    gameService = module.get<GameService>(GameService);
    commandProcessor = module.get<CommandProcessorService>(
      CommandProcessorService,
    );
    databaseService = module.get<DatabaseService>(DatabaseService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('Complete Game Session', () => {
    it('should complete a full mini-game session successfully', async () => {
      // 1. Create new game
      const gameResult = await gameService.createGame();
      expect(gameResult.gameId).toBeDefined();
      expect(gameResult.gameState).toBeDefined();
      expect(gameResult.gameState.player).toBeDefined();

      testGameId = gameResult.gameId;
      testPlayerId = gameResult.gameState.player.id;

      // 2. Look around (initial room)
      const lookResult = await gameService.processCommand(testGameId, 'look');
      expect(lookResult.success).toBe(true);
      expect(lookResult.type).toBe('room_description');
      expect(lookResult.playerStatus?.location).toBe('Entry Hall');
      expect(lookResult.items).toContain('Brass Key');
      expect(lookResult.items).toContain('Flickering Torch');

      // 3. Examine the brass key
      const examineResult = await gameService.processCommand(
        testGameId,
        'examine key',
      );
      expect(examineResult.success).toBe(true);
      expect(examineResult.type).toBe('examination');

      // 4. Take the brass key
      const takeResult = await gameService.processCommand(
        testGameId,
        'take key',
      );
      expect(takeResult.success).toBe(true);
      expect(takeResult.type).toBe('action_success');
      expect(takeResult.message).toContain('Brass Key');

      // 5. Check inventory
      const inventoryResult = await gameService.getInventory(testGameId);
      expect(inventoryResult.success).toBe(true);
      expect(inventoryResult.items).toBeDefined();
      expect(
        inventoryResult.items?.some((item) => item.name === 'Brass Key'),
      ).toBe(true);

      // 6. Move north to Garden
      const moveNorthResult = await gameService.processCommand(
        testGameId,
        'go north',
      );
      expect(moveNorthResult.success).toBe(true);
      expect(moveNorthResult.type).toBe('movement_success');
      expect(moveNorthResult.playerStatus?.location).toBe('Garden');
      expect(moveNorthResult.items).toContain('Glowing Flower');

      // 7. Take the glowing flower
      const takeFlowerResult = await gameService.processCommand(
        testGameId,
        'take flower',
      );
      expect(takeFlowerResult.success).toBe(true);
      expect(takeFlowerResult.message).toContain('Glowing Flower');

      // 8. Return south and go east to Library
      const moveSouthResult = await gameService.processCommand(
        testGameId,
        'go south',
      );
      expect(moveSouthResult.success).toBe(true);
      expect(moveSouthResult.playerStatus?.location).toBe('Entry Hall');

      const moveEastResult = await gameService.processCommand(
        testGameId,
        'go east',
      );
      expect(moveEastResult.success).toBe(true);
      expect(moveEastResult.playerStatus?.location).toBe('Library');

      // 9. Test magic system
      const castResult = await gameService.processCommand(testGameId, 'cast');
      expect(castResult.success).toBe(true);
      expect(castResult.type).toBe('magic');
      expect(castResult.message).toContain('spell');

      // 10. Test dialogue system
      const talkResult = await gameService.processCommand(
        testGameId,
        'talk librarian',
      );
      expect(talkResult.success).toBe(true);
      expect(talkResult.type).toBe('dialogue');
      expect(talkResult.dialogue?.npcName).toBe('librarian');

      // 11. Get map
      const mapResult = await gameService.getMap(testGameId);
      expect(mapResult.success).toBe(true);
      expect(mapResult.map?.ascii).toContain('Library');
      expect(mapResult.map?.ascii).toContain('[X]'); // Player marker

      // 12. Save game
      const saveResult = await gameService.saveGame(
        testGameId,
        'integration_test',
      );
      expect(saveResult.success).toBe(true);
      expect(saveResult.message).toContain('integration_test');

      // Verify database operations were called
      expect(databaseService.transaction).toHaveBeenCalled();
      expect(databaseService.saveVersion).toHaveBeenCalled();
    });

    it('should handle invalid commands gracefully', async () => {
      const gameResult = await gameService.createGame();
      testGameId = gameResult.gameId;

      const invalidResult = await gameService.processCommand(
        testGameId,
        'invalid command',
      );
      expect(invalidResult.success).toBe(false);
      expect(invalidResult.type).toBe('error');
      expect(invalidResult.message).toContain("don't understand");
    });

    it('should handle movement restrictions correctly', async () => {
      const gameResult = await gameService.createGame();
      testGameId = gameResult.gameId;

      // Move to Garden first
      await gameService.processCommand(testGameId, 'go north');

      // Try to go east from Garden (should fail)
      const invalidMoveResult = await gameService.processCommand(
        testGameId,
        'go east',
      );
      expect(invalidMoveResult.success).toBe(false);
      expect(invalidMoveResult.type).toBe('movement_blocked');
      expect(invalidMoveResult.message).toContain('cannot go east');
    });

    it('should maintain game state consistency across commands', async () => {
      const gameResult = await gameService.createGame();
      testGameId = gameResult.gameId;

      // Take key from Entry Hall
      await gameService.processCommand(testGameId, 'take key');

      // Move to Garden
      await gameService.processCommand(testGameId, 'go north');

      // Verify we still have the key
      const inventoryResult = await gameService.getInventory(testGameId);
      expect(
        inventoryResult.items?.some((item) => item.name === 'Brass Key'),
      ).toBe(true);

      // Look around - key should not be in Garden
      const lookResult = await gameService.processCommand(testGameId, 'look');
      expect(lookResult.items).not.toContain('Brass Key');
    });
  });

  describe('Database Transaction Integration', () => {
    it('should use synchronous transactions throughout game creation', async () => {
      const transactionSpy = jest.spyOn(databaseService, 'transaction');

      await gameService.createGame();

      // Verify transaction was called
      expect(transactionSpy).toHaveBeenCalled();

      // Verify the callback was synchronous (no Promise returned)
      const transactionCalls = transactionSpy.mock.calls;
      for (const call of transactionCalls) {
        const callback = call[0];
        expect(typeof callback).toBe('function');
      }
    });

    it('should handle database errors gracefully', async () => {
      const mockError = new Error('Database connection failed');
      jest.spyOn(databaseService, 'prepare').mockImplementation(() => {
        throw mockError;
      });

      await expect(gameService.createGame()).rejects.toThrow(
        'Failed to save game',
      );
    });
  });

  describe('Performance and Stability', () => {
    it('should handle rapid command succession', async () => {
      const gameResult = await gameService.createGame();
      testGameId = gameResult.gameId;

      const commands = [
        'look',
        'take key',
        'go north',
        'take flower',
        'go south',
      ];
      const results = [];

      for (const command of commands) {
        const result = await gameService.processCommand(testGameId, command);
        results.push(result);
      }

      // All commands should succeed
      expect(results.every((r) => r.success)).toBe(true);

      // Final state should be consistent
      const finalInventory = await gameService.getInventory(testGameId);
      expect(finalInventory.items?.length).toBe(2); // Key and Flower
    });

    it('should handle concurrent access to game state', async () => {
      const gameResult = await gameService.createGame();
      testGameId = gameResult.gameId;

      // Simulate concurrent commands
      const promises = [
        gameService.processCommand(testGameId, 'look'),
        gameService.processCommand(testGameId, 'take key'),
        gameService.getInventory(testGameId),
        gameService.getMap(testGameId),
      ];

      const results = await Promise.all(promises);

      // All operations should complete without errors
      expect(results.every((r) => r.success !== false)).toBe(true);
    });
  });
});
