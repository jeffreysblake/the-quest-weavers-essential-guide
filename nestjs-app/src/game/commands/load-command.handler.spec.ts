import { Test, TestingModule } from '@nestjs/testing';
import { LoadCommandHandler } from './load-command.handler';
import { GameStateService } from '../game-state.service';

describe('LoadCommandHandler', () => {
  let handler: LoadCommandHandler;
  let gameStateService: jest.Mocked<GameStateService>;

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
    const mockGameStateService = {
      loadGameState: jest.fn(),
      saveGameState: jest.fn(),
      getGameState: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoadCommandHandler,
        { provide: GameStateService, useValue: mockGameStateService },
      ],
    }).compile();

    handler = module.get<LoadCommandHandler>(LoadCommandHandler);
    gameStateService = module.get(GameStateService);
  });

  describe('missing game ID validation', () => {
    it('should return error when player has no gameId', async () => {
      const playerWithoutGameId = {
        id: 'player-1',
        name: 'Test Player',
      };

      const result = await handler.handle(
        playerWithoutGameId,
        mockRoom,
        'slot1',
      );

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Cannot load: game ID not found.');
      expect(gameStateService.loadGameState).not.toHaveBeenCalled();
    });

    it('should return error when gameId is null', async () => {
      const playerWithNullGameId = {
        id: 'player-1',
        gameId: null,
        name: 'Test Player',
      };

      const result = await handler.handle(
        playerWithNullGameId,
        mockRoom,
        'slot1',
      );

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Cannot load: game ID not found.');
    });

    it('should return error when gameId is undefined', async () => {
      const playerWithUndefinedGameId = {
        id: 'player-1',
        gameId: undefined,
        name: 'Test Player',
      };

      const result = await handler.handle(
        playerWithUndefinedGameId,
        mockRoom,
        'slot1',
      );

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Cannot load: game ID not found.');
    });

    it('should return error when gameId is empty string', async () => {
      const playerWithEmptyGameId = {
        id: 'player-1',
        gameId: '',
        name: 'Test Player',
      };

      const result = await handler.handle(
        playerWithEmptyGameId,
        mockRoom,
        'slot1',
      );

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Cannot load: game ID not found.');
    });
  });

  describe('successful load operations', () => {
    it('should load game from default quicksave slot when no target specified', async () => {
      gameStateService.loadGameState.mockResolvedValue(undefined);

      const result = await handler.handle(mockPlayer, mockRoom);

      expect(result.success).toBe(true);
      expect(result.type).toBe('action_success');
      expect(result.message).toBe('Game loaded from slot: quicksave');
      expect(gameStateService.loadGameState).toHaveBeenCalledWith(
        'game-1',
        'quicksave',
      );
      expect(gameStateService.loadGameState).toHaveBeenCalledTimes(1);
    });

    it('should load game from default quicksave when target is undefined', async () => {
      gameStateService.loadGameState.mockResolvedValue(undefined);

      const result = await handler.handle(mockPlayer, mockRoom, undefined);

      expect(result.success).toBe(true);
      expect(result.type).toBe('action_success');
      expect(result.message).toBe('Game loaded from slot: quicksave');
      expect(gameStateService.loadGameState).toHaveBeenCalledWith(
        'game-1',
        'quicksave',
      );
    });

    it('should load game from slot 1', async () => {
      gameStateService.loadGameState.mockResolvedValue(undefined);

      const result = await handler.handle(mockPlayer, mockRoom, '1');

      expect(result.success).toBe(true);
      expect(result.type).toBe('action_success');
      expect(result.message).toBe('Game loaded from slot: 1');
      expect(gameStateService.loadGameState).toHaveBeenCalledWith(
        'game-1',
        '1',
      );
    });

    it('should load game from slot 2', async () => {
      gameStateService.loadGameState.mockResolvedValue(undefined);

      const result = await handler.handle(mockPlayer, mockRoom, '2');

      expect(result.success).toBe(true);
      expect(result.type).toBe('action_success');
      expect(result.message).toBe('Game loaded from slot: 2');
      expect(gameStateService.loadGameState).toHaveBeenCalledWith(
        'game-1',
        '2',
      );
    });

    it('should load game from slot 3', async () => {
      gameStateService.loadGameState.mockResolvedValue(undefined);

      const result = await handler.handle(mockPlayer, mockRoom, '3');

      expect(result.success).toBe(true);
      expect(result.type).toBe('action_success');
      expect(result.message).toBe('Game loaded from slot: 3');
      expect(gameStateService.loadGameState).toHaveBeenCalledWith(
        'game-1',
        '3',
      );
    });

    it('should load game from named slot', async () => {
      gameStateService.loadGameState.mockResolvedValue(undefined);

      const result = await handler.handle(mockPlayer, mockRoom, 'autosave');

      expect(result.success).toBe(true);
      expect(result.type).toBe('action_success');
      expect(result.message).toBe('Game loaded from slot: autosave');
      expect(gameStateService.loadGameState).toHaveBeenCalledWith(
        'game-1',
        'autosave',
      );
    });

    it('should load game from custom slot name', async () => {
      gameStateService.loadGameState.mockResolvedValue(undefined);

      const result = await handler.handle(
        mockPlayer,
        mockRoom,
        'checkpoint-boss-battle',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('action_success');
      expect(result.message).toBe('Game loaded from slot: checkpoint-boss-battle');
      expect(gameStateService.loadGameState).toHaveBeenCalledWith(
        'game-1',
        'checkpoint-boss-battle',
      );
    });
  });

  describe('edge cases', () => {
    it('should accept empty string as slot name', async () => {
      gameStateService.loadGameState.mockResolvedValue(undefined);

      const result = await handler.handle(mockPlayer, mockRoom, '');

      expect(result.success).toBe(true);
      expect(result.type).toBe('action_success');
      expect(result.message).toBe('Game loaded from slot: quicksave');
      expect(gameStateService.loadGameState).toHaveBeenCalledWith(
        'game-1',
        'quicksave',
      );
    });

    it('should handle slot number greater than 3', async () => {
      gameStateService.loadGameState.mockResolvedValue(undefined);

      const result = await handler.handle(mockPlayer, mockRoom, '999');

      expect(result.success).toBe(true);
      expect(result.type).toBe('action_success');
      expect(result.message).toBe('Game loaded from slot: 999');
      expect(gameStateService.loadGameState).toHaveBeenCalledWith(
        'game-1',
        '999',
      );
    });

    it('should handle negative slot number', async () => {
      gameStateService.loadGameState.mockResolvedValue(undefined);

      const result = await handler.handle(mockPlayer, mockRoom, '-1');

      expect(result.success).toBe(true);
      expect(result.type).toBe('action_success');
      expect(result.message).toBe('Game loaded from slot: -1');
      expect(gameStateService.loadGameState).toHaveBeenCalledWith(
        'game-1',
        '-1',
      );
    });

    it('should handle slot number 0', async () => {
      gameStateService.loadGameState.mockResolvedValue(undefined);

      const result = await handler.handle(mockPlayer, mockRoom, '0');

      expect(result.success).toBe(true);
      expect(result.type).toBe('action_success');
      expect(result.message).toBe('Game loaded from slot: 0');
      expect(gameStateService.loadGameState).toHaveBeenCalledWith(
        'game-1',
        '0',
      );
    });

    it('should handle whitespace in slot name', async () => {
      gameStateService.loadGameState.mockResolvedValue(undefined);

      const result = await handler.handle(
        mockPlayer,
        mockRoom,
        'my save slot',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('action_success');
      expect(result.message).toBe('Game loaded from slot: my save slot');
      expect(gameStateService.loadGameState).toHaveBeenCalledWith(
        'game-1',
        'my save slot',
      );
    });

    it('should handle special characters in slot name', async () => {
      gameStateService.loadGameState.mockResolvedValue(undefined);

      const result = await handler.handle(
        mockPlayer,
        mockRoom,
        'save@slot#1!',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('action_success');
      expect(result.message).toBe('Game loaded from slot: save@slot#1!');
      expect(gameStateService.loadGameState).toHaveBeenCalledWith(
        'game-1',
        'save@slot#1!',
      );
    });
  });

  describe('error handling', () => {
    it('should handle load failure with error message', async () => {
      const error = new Error('Save file not found');
      gameStateService.loadGameState.mockRejectedValue(error);

      const result = await handler.handle(mockPlayer, mockRoom, 'slot1');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Load failed: Save file not found');
      expect(gameStateService.loadGameState).toHaveBeenCalledWith(
        'game-1',
        'slot1',
      );
    });

    it('should handle corrupted save file error', async () => {
      const error = new Error('Corrupted save data');
      gameStateService.loadGameState.mockRejectedValue(error);

      const result = await handler.handle(mockPlayer, mockRoom, 'corrupted');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Load failed: Corrupted save data');
    });

    it('should handle missing save slot error', async () => {
      const error = new Error('No save exists in this slot');
      gameStateService.loadGameState.mockRejectedValue(error);

      const result = await handler.handle(mockPlayer, mockRoom, '5');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Load failed: No save exists in this slot');
    });

    it('should handle permission denied error', async () => {
      const error = new Error('Permission denied');
      gameStateService.loadGameState.mockRejectedValue(error);

      const result = await handler.handle(mockPlayer, mockRoom, 'slot1');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Load failed: Permission denied');
    });

    it('should handle database connection error', async () => {
      const error = new Error('Database connection failed');
      gameStateService.loadGameState.mockRejectedValue(error);

      const result = await handler.handle(mockPlayer, mockRoom, 'quicksave');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Load failed: Database connection failed');
    });

    it('should handle generic errors', async () => {
      const error = new Error('Unknown error');
      gameStateService.loadGameState.mockRejectedValue(error);

      const result = await handler.handle(mockPlayer, mockRoom, 'test');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Load failed: Unknown error');
    });

    it('should handle errors without message property', async () => {
      const error = { toString: () => 'String error' };
      gameStateService.loadGameState.mockRejectedValue(error);

      const result = await handler.handle(mockPlayer, mockRoom, 'slot1');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toContain('Load failed');
    });
  });

  describe('service integration', () => {
    it('should call loadGameState with correct parameters', async () => {
      gameStateService.loadGameState.mockResolvedValue(undefined);

      await handler.handle(mockPlayer, mockRoom, 'test-slot');

      expect(gameStateService.loadGameState).toHaveBeenCalledWith(
        'game-1',
        'test-slot',
      );
      expect(gameStateService.loadGameState).toHaveBeenCalledTimes(1);
    });

    it('should not call loadGameState when gameId is missing', async () => {
      const playerWithoutGameId = { id: 'player-1', name: 'Test' };

      await handler.handle(playerWithoutGameId, mockRoom, 'slot1');

      expect(gameStateService.loadGameState).not.toHaveBeenCalled();
    });

    it('should await loadGameState completion', async () => {
      let resolveLoad: () => void;
      const loadPromise = new Promise<void>((resolve) => {
        resolveLoad = resolve;
      });

      gameStateService.loadGameState.mockReturnValue(loadPromise);

      const resultPromise = handler.handle(mockPlayer, mockRoom, 'slot1');

      // Load should not be complete yet
      expect(gameStateService.loadGameState).toHaveBeenCalled();

      resolveLoad!();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.message).toBe('Game loaded from slot: slot1');
    });
  });

  describe('message formatting', () => {
    it('should include slot name in success message', async () => {
      gameStateService.loadGameState.mockResolvedValue(undefined);

      const result = await handler.handle(
        mockPlayer,
        mockRoom,
        'custom-checkpoint',
      );

      expect(result.message).toContain('custom-checkpoint');
      expect(result.message).toBe('Game loaded from slot: custom-checkpoint');
    });

    it('should preserve slot name casing in message', async () => {
      gameStateService.loadGameState.mockResolvedValue(undefined);

      const result = await handler.handle(mockPlayer, mockRoom, 'MySlot');

      expect(result.message).toBe('Game loaded from slot: MySlot');
    });

    it('should include error details in failure message', async () => {
      const error = new Error('Detailed error information');
      gameStateService.loadGameState.mockRejectedValue(error);

      const result = await handler.handle(mockPlayer, mockRoom, 'slot1');

      expect(result.message).toContain('Load failed');
      expect(result.message).toContain('Detailed error information');
    });
  });

  describe('response structure', () => {
    it('should return correct response structure for success', async () => {
      gameStateService.loadGameState.mockResolvedValue(undefined);

      const result = await handler.handle(mockPlayer, mockRoom, 'slot1');

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('message');
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.type).toBe('string');
      expect(typeof result.message).toBe('string');
    });

    it('should return correct response structure for error', async () => {
      const error = new Error('Test error');
      gameStateService.loadGameState.mockRejectedValue(error);

      const result = await handler.handle(mockPlayer, mockRoom, 'slot1');

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('message');
      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
    });

    it('should return correct type for validation errors', async () => {
      const playerWithoutGameId = { id: 'player-1', name: 'Test' };

      const result = await handler.handle(playerWithoutGameId, mockRoom);

      expect(result.type).toBe('error');
      expect(result.success).toBe(false);
    });

    it('should return correct type for successful load', async () => {
      gameStateService.loadGameState.mockResolvedValue(undefined);

      const result = await handler.handle(mockPlayer, mockRoom, 'slot1');

      expect(result.type).toBe('action_success');
      expect(result.success).toBe(true);
    });
  });
});
