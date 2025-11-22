import { Test, TestingModule } from '@nestjs/testing';
import { SaveCommandHandler } from './save-command.handler';
import { GameStateService } from '../game-state.service';

describe('SaveCommandHandler', () => {
  let handler: SaveCommandHandler;
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
      saveGameState: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SaveCommandHandler,
        { provide: GameStateService, useValue: mockGameStateService },
      ],
    }).compile();

    handler = module.get<SaveCommandHandler>(SaveCommandHandler);
    gameStateService = module.get(GameStateService);
  });

  describe('successful save operations', () => {
    it('should save game to default slot "quicksave" when no target specified', async () => {
      const result = await handler.handle(mockPlayer, mockRoom);

      expect(result.success).toBe(true);
      expect(result.type).toBe('action_success');
      expect(result.message).toBe('Game saved to slot: quicksave');
      expect(gameStateService.saveGameState).toHaveBeenCalledWith(
        'game-1',
        'quicksave',
      );
    });

    it('should save game to default slot "quicksave" when target is undefined', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, undefined);

      expect(result.success).toBe(true);
      expect(result.type).toBe('action_success');
      expect(result.message).toBe('Game saved to slot: quicksave');
      expect(gameStateService.saveGameState).toHaveBeenCalledWith(
        'game-1',
        'quicksave',
      );
    });

    it('should save game to slot 1 when specified', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, '1');

      expect(result.success).toBe(true);
      expect(result.type).toBe('action_success');
      expect(result.message).toBe('Game saved to slot: 1');
      expect(gameStateService.saveGameState).toHaveBeenCalledWith(
        'game-1',
        '1',
      );
    });

    it('should save game to slot 2 when specified', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, '2');

      expect(result.success).toBe(true);
      expect(result.type).toBe('action_success');
      expect(result.message).toBe('Game saved to slot: 2');
      expect(gameStateService.saveGameState).toHaveBeenCalledWith(
        'game-1',
        '2',
      );
    });

    it('should save game to slot 3 when specified', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, '3');

      expect(result.success).toBe(true);
      expect(result.type).toBe('action_success');
      expect(result.message).toBe('Game saved to slot: 3');
      expect(gameStateService.saveGameState).toHaveBeenCalledWith(
        'game-1',
        '3',
      );
    });

    it('should save game to custom named slot', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, 'mysave');

      expect(result.success).toBe(true);
      expect(result.type).toBe('action_success');
      expect(result.message).toBe('Game saved to slot: mysave');
      expect(gameStateService.saveGameState).toHaveBeenCalledWith(
        'game-1',
        'mysave',
      );
    });

    it('should call saveGameState exactly once per save', async () => {
      await handler.handle(mockPlayer, mockRoom, '1');

      expect(gameStateService.saveGameState).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling - missing gameId', () => {
    it('should return error when player has no gameId', async () => {
      const playerWithoutGameId = {
        id: 'player-2',
        name: 'Test Player',
      };

      const result = await handler.handle(
        playerWithoutGameId,
        mockRoom,
        'slot1',
      );

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Cannot save: game ID not found.');
      expect(gameStateService.saveGameState).not.toHaveBeenCalled();
    });

    it('should return error when gameId is null', async () => {
      const playerWithNullGameId = {
        id: 'player-3',
        gameId: null,
        name: 'Test Player',
      };

      const result = await handler.handle(
        playerWithNullGameId,
        mockRoom,
        'quicksave',
      );

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Cannot save: game ID not found.');
      expect(gameStateService.saveGameState).not.toHaveBeenCalled();
    });

    it('should return error when gameId is undefined', async () => {
      const playerWithUndefinedGameId = {
        id: 'player-4',
        gameId: undefined,
        name: 'Test Player',
      };

      const result = await handler.handle(
        playerWithUndefinedGameId,
        mockRoom,
      );

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Cannot save: game ID not found.');
      expect(gameStateService.saveGameState).not.toHaveBeenCalled();
    });

    it('should return error when gameId is empty string', async () => {
      const playerWithEmptyGameId = {
        id: 'player-5',
        gameId: '',
        name: 'Test Player',
      };

      const result = await handler.handle(playerWithEmptyGameId, mockRoom, '1');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Cannot save: game ID not found.');
      expect(gameStateService.saveGameState).not.toHaveBeenCalled();
    });
  });

  describe('error handling - save failures', () => {
    it('should handle save failure and return error message', async () => {
      gameStateService.saveGameState.mockRejectedValue(
        new Error('Database connection failed'),
      );

      const result = await handler.handle(mockPlayer, mockRoom, 'slot1');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Save failed: Database connection failed');
    });

    it('should handle generic error during save', async () => {
      gameStateService.saveGameState.mockRejectedValue(
        new Error('Disk full'),
      );

      const result = await handler.handle(mockPlayer, mockRoom, 'quicksave');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Save failed: Disk full');
    });

    it('should handle permission error during save', async () => {
      gameStateService.saveGameState.mockRejectedValue(
        new Error('Permission denied'),
      );

      const result = await handler.handle(mockPlayer, mockRoom, '2');

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Save failed: Permission denied');
    });

    it('should handle network error during save', async () => {
      gameStateService.saveGameState.mockRejectedValue(
        new Error('Network timeout'),
      );

      const result = await handler.handle(mockPlayer, mockRoom);

      expect(result.success).toBe(false);
      expect(result.type).toBe('error');
      expect(result.message).toBe('Save failed: Network timeout');
    });
  });

  describe('edge cases - slot names', () => {
    it('should accept negative slot numbers (treated as strings)', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, '-1');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Game saved to slot: -1');
      expect(gameStateService.saveGameState).toHaveBeenCalledWith(
        'game-1',
        '-1',
      );
    });

    it('should accept slot numbers greater than 3', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, '999');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Game saved to slot: 999');
      expect(gameStateService.saveGameState).toHaveBeenCalledWith(
        'game-1',
        '999',
      );
    });

    it('should accept slot number 0', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, '0');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Game saved to slot: 0');
      expect(gameStateService.saveGameState).toHaveBeenCalledWith(
        'game-1',
        '0',
      );
    });

    it('should accept alphanumeric slot names', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, 'slot1a');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Game saved to slot: slot1a');
      expect(gameStateService.saveGameState).toHaveBeenCalledWith(
        'game-1',
        'slot1a',
      );
    });

    it('should accept slot names with spaces', async () => {
      const result = await handler.handle(
        mockPlayer,
        mockRoom,
        'my save slot',
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Game saved to slot: my save slot');
      expect(gameStateService.saveGameState).toHaveBeenCalledWith(
        'game-1',
        'my save slot',
      );
    });

    it('should accept slot names with special characters', async () => {
      const result = await handler.handle(
        mockPlayer,
        mockRoom,
        'save_slot-1.bak',
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Game saved to slot: save_slot-1.bak');
      expect(gameStateService.saveGameState).toHaveBeenCalledWith(
        'game-1',
        'save_slot-1.bak',
      );
    });

    it('should accept very long slot names', async () => {
      const longSlotName = 'a'.repeat(100);
      const result = await handler.handle(mockPlayer, mockRoom, longSlotName);

      expect(result.success).toBe(true);
      expect(result.message).toBe(`Game saved to slot: ${longSlotName}`);
      expect(gameStateService.saveGameState).toHaveBeenCalledWith(
        'game-1',
        longSlotName,
      );
    });

    it('should default to quicksave when empty string provided', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, '');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Game saved to slot: quicksave');
      expect(gameStateService.saveGameState).toHaveBeenCalledWith(
        'game-1',
        'quicksave',
      );
    });
  });

  describe('integration scenarios', () => {
    it('should handle multiple consecutive saves to different slots', async () => {
      const result1 = await handler.handle(mockPlayer, mockRoom, '1');
      const result2 = await handler.handle(mockPlayer, mockRoom, '2');
      const result3 = await handler.handle(mockPlayer, mockRoom, 'quicksave');

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result3.success).toBe(true);
      expect(gameStateService.saveGameState).toHaveBeenCalledTimes(3);
    });

    it('should handle save after failure recovery', async () => {
      gameStateService.saveGameState.mockRejectedValueOnce(
        new Error('First attempt failed'),
      );
      gameStateService.saveGameState.mockResolvedValueOnce(undefined);

      const result1 = await handler.handle(mockPlayer, mockRoom, '1');
      const result2 = await handler.handle(mockPlayer, mockRoom, '1');

      expect(result1.success).toBe(false);
      expect(result1.message).toBe('Save failed: First attempt failed');
      expect(result2.success).toBe(true);
      expect(result2.message).toBe('Game saved to slot: 1');
    });

    it('should preserve gameId and slot name through the entire flow', async () => {
      const customPlayer = {
        id: 'custom-player',
        gameId: 'custom-game-123',
        name: 'Custom Player',
      };

      await handler.handle(customPlayer, mockRoom, 'my-custom-slot');

      expect(gameStateService.saveGameState).toHaveBeenCalledWith(
        'custom-game-123',
        'my-custom-slot',
      );
    });
  });

  describe('service call verification', () => {
    it('should pass correct parameters to saveGameState', async () => {
      await handler.handle(mockPlayer, mockRoom, 'test-slot');

      expect(gameStateService.saveGameState).toHaveBeenCalledWith(
        mockPlayer.gameId,
        'test-slot',
      );
    });

    it('should not call saveGameState when gameId is missing', async () => {
      const playerWithoutGameId = { id: 'player-x', name: 'Test' };

      await handler.handle(playerWithoutGameId, mockRoom, 'slot');

      expect(gameStateService.saveGameState).not.toHaveBeenCalled();
    });

    it('should await saveGameState completion', async () => {
      let resolvePromise: () => void;
      const savePromise = new Promise<void>((resolve) => {
        resolvePromise = resolve;
      });

      gameStateService.saveGameState.mockReturnValue(savePromise);

      const resultPromise = handler.handle(mockPlayer, mockRoom, '1');

      // Should not be resolved yet
      let resolved = false;
      resultPromise.then(() => {
        resolved = true;
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(resolved).toBe(false);

      // Now resolve the save
      resolvePromise!();
      await resultPromise;

      expect(resolved).toBe(true);
    });
  });
});
