import { Test, TestingModule } from '@nestjs/testing';
import {
  OpenCommandHandler,
  CloseCommandHandler,
} from './container-command.handler';
import { CommandValidatorService } from '../command-validator.service';

describe('Container Command Handlers', () => {
  // =============================================================================
  // OPEN COMMAND HANDLER TESTS
  // =============================================================================

  describe('OpenCommandHandler', () => {
    let handler: OpenCommandHandler;
    let mockValidator: jest.Mocked<Partial<CommandValidatorService>>;

    const mockPlayer = {
      id: 'player-1',
      gameId: 'game-123',
      name: 'Hero',
      position: { x: 5, y: 5, z: 0 },
      health: 100,
      maxHealth: 100,
      inventory: [],
      roomId: 'room-1',
    };

    const mockRoom = {
      id: 'room-1',
      name: 'Test Room',
      description: 'A test room with containers',
      position: { x: 0, y: 0, z: 0 },
      size: { width: 10, height: 10, depth: 3 },
      width: 10,
      height: 10,
      objects: ['chest-1', 'door-1'],
      players: ['player-1'],
    };

    beforeEach(async () => {
      mockValidator = {
        validateInput: jest.fn(),
        validateItemName: jest.fn().mockReturnValue({ valid: true }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OpenCommandHandler,
          { provide: CommandValidatorService, useValue: mockValidator },
        ],
      }).compile();

      handler = module.get<OpenCommandHandler>(OpenCommandHandler);
    });

    // ===========================================================================
    // VALIDATION TESTS (5 tests)
    // ===========================================================================

    describe('Validation', () => {
      it('should reject empty target', async () => {
        const result = await handler.handle(mockPlayer, mockRoom, '');

        expect(result.success).toBe(false);
        expect(result.type).toBe('error');
        expect(result.message).toContain('Open what');
      });

      it('should reject null target', async () => {
        const result = await handler.handle(mockPlayer, mockRoom, null as any);

        expect(result.success).toBe(false);
        expect(result.type).toBe('error');
        expect(result.message).toContain('Open what');
      });

      it('should reject undefined target', async () => {
        const result = await handler.handle(
          mockPlayer,
          mockRoom,
          undefined as any,
        );

        expect(result.success).toBe(false);
        expect(result.type).toBe('error');
        expect(result.message).toContain('Open what');
      });

      it('should reject invalid item names', async () => {
        mockValidator.validateItemName.mockReturnValueOnce({
          valid: false,
          error: 'Item name contains invalid characters',
        });

        const result = await handler.handle(mockPlayer, mockRoom, 'ch3st!@#');

        expect(result.success).toBe(false);
        expect(result.type).toBe('error');
        expect(result.message).toBe('Item name contains invalid characters');
      });

      it('should validate item name format', async () => {
        await handler.handle(mockPlayer, mockRoom, 'chest');

        expect(mockValidator.validateItemName).toHaveBeenCalledWith('chest');
      });
    });

    // ===========================================================================
    // OPEN OPERATIONS (6 tests)
    // ===========================================================================

    describe('Open Operations', () => {
      it('should attempt to open a valid container', async () => {
        const result = await handler.handle(mockPlayer, mockRoom, 'chest');

        expect(result.success).toBe(true);
        expect(result.type).toBe('action_result');
        expect(result.message).toContain('You attempt to open the chest');
      });

      it('should indicate locked/stuck status', async () => {
        const result = await handler.handle(mockPlayer, mockRoom, 'chest');

        expect(result.message).toContain('locked or stuck');
      });

      it('should handle opening a door', async () => {
        const result = await handler.handle(mockPlayer, mockRoom, 'door');

        expect(result.success).toBe(true);
        expect(result.message).toContain('You attempt to open the door');
      });

      it('should handle opening a box', async () => {
        const result = await handler.handle(mockPlayer, mockRoom, 'box');

        expect(result.success).toBe(true);
        expect(result.message).toContain('You attempt to open the box');
      });

      it('should preserve target name in message', async () => {
        const result = await handler.handle(
          mockPlayer,
          mockRoom,
          'treasure chest',
        );

        expect(result.message).toContain('treasure chest');
      });

      it('should handle long container names', async () => {
        const longName =
          'ornate golden chest with intricate carvings and precious gems';
        const result = await handler.handle(mockPlayer, mockRoom, longName);

        expect(result.success).toBe(true);
        expect(result.message).toContain(longName);
      });
    });

    // ===========================================================================
    // EDGE CASES (4 tests)
    // ===========================================================================

    describe('Edge Cases', () => {
      it('should handle special characters in valid names', async () => {
        const result = await handler.handle(
          mockPlayer,
          mockRoom,
          "wizard's chest",
        );

        expect(result.success).toBe(true);
      });

      it('should handle numbers in container names', async () => {
        const result = await handler.handle(mockPlayer, mockRoom, 'chest 1');

        expect(result.success).toBe(true);
        expect(result.message).toContain('chest 1');
      });

      it('should handle case sensitivity', async () => {
        const result = await handler.handle(mockPlayer, mockRoom, 'CHEST');

        expect(result.success).toBe(true);
        expect(result.message).toContain('CHEST');
      });

      it('should return consistent result structure', async () => {
        const result = await handler.handle(mockPlayer, mockRoom, 'chest');

        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('type');
        expect(result).toHaveProperty('message');
        expect(typeof result.success).toBe('boolean');
        expect(typeof result.type).toBe('string');
        expect(typeof result.message).toBe('string');
      });
    });
  });

  // =============================================================================
  // CLOSE COMMAND HANDLER TESTS
  // =============================================================================

  describe('CloseCommandHandler', () => {
    let handler: CloseCommandHandler;
    let mockValidator: jest.Mocked<Partial<CommandValidatorService>>;

    const mockPlayer = {
      id: 'player-1',
      gameId: 'game-123',
      name: 'Hero',
      position: { x: 5, y: 5, z: 0 },
      health: 100,
      maxHealth: 100,
      inventory: [],
      roomId: 'room-1',
    };

    const mockRoom = {
      id: 'room-1',
      name: 'Test Room',
      description: 'A test room with containers',
      position: { x: 0, y: 0, z: 0 },
      size: { width: 10, height: 10, depth: 3 },
      width: 10,
      height: 10,
      objects: ['chest-1', 'door-1'],
      players: ['player-1'],
    };

    beforeEach(async () => {
      mockValidator = {
        validateInput: jest.fn(),
        validateItemName: jest.fn().mockReturnValue({ valid: true }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CloseCommandHandler,
          { provide: CommandValidatorService, useValue: mockValidator },
        ],
      }).compile();

      handler = module.get<CloseCommandHandler>(CloseCommandHandler);
    });

    // ===========================================================================
    // VALIDATION TESTS (5 tests)
    // ===========================================================================

    describe('Validation', () => {
      it('should reject empty target', async () => {
        const result = await handler.handle(mockPlayer, mockRoom, '');

        expect(result.success).toBe(false);
        expect(result.type).toBe('error');
        expect(result.message).toContain('Close what');
      });

      it('should reject null target', async () => {
        const result = await handler.handle(mockPlayer, mockRoom, null as any);

        expect(result.success).toBe(false);
        expect(result.type).toBe('error');
        expect(result.message).toContain('Close what');
      });

      it('should reject undefined target', async () => {
        const result = await handler.handle(
          mockPlayer,
          mockRoom,
          undefined as any,
        );

        expect(result.success).toBe(false);
        expect(result.type).toBe('error');
        expect(result.message).toContain('Close what');
      });

      it('should reject invalid item names', async () => {
        mockValidator.validateItemName.mockReturnValueOnce({
          valid: false,
          error: 'Item name contains invalid characters',
        });

        const result = await handler.handle(mockPlayer, mockRoom, 'ch3st!@#');

        expect(result.success).toBe(false);
        expect(result.type).toBe('error');
        expect(result.message).toBe('Item name contains invalid characters');
      });

      it('should validate item name format', async () => {
        await handler.handle(mockPlayer, mockRoom, 'chest');

        expect(mockValidator.validateItemName).toHaveBeenCalledWith('chest');
      });
    });

    // ===========================================================================
    // CLOSE OPERATIONS (6 tests)
    // ===========================================================================

    describe('Close Operations', () => {
      it('should successfully close a valid container', async () => {
        const result = await handler.handle(mockPlayer, mockRoom, 'chest');

        expect(result.success).toBe(true);
        expect(result.type).toBe('action_result');
        expect(result.message).toContain('You close the chest');
      });

      it('should handle closing a door', async () => {
        const result = await handler.handle(mockPlayer, mockRoom, 'door');

        expect(result.success).toBe(true);
        expect(result.message).toContain('You close the door');
      });

      it('should handle closing a box', async () => {
        const result = await handler.handle(mockPlayer, mockRoom, 'box');

        expect(result.success).toBe(true);
        expect(result.message).toContain('You close the box');
      });

      it('should handle closing a window', async () => {
        const result = await handler.handle(mockPlayer, mockRoom, 'window');

        expect(result.success).toBe(true);
        expect(result.message).toContain('You close the window');
      });

      it('should preserve target name in message', async () => {
        const result = await handler.handle(
          mockPlayer,
          mockRoom,
          'treasure chest',
        );

        expect(result.message).toContain('treasure chest');
      });

      it('should handle long container names', async () => {
        const longName =
          'ornate golden chest with intricate carvings and precious gems';
        const result = await handler.handle(mockPlayer, mockRoom, longName);

        expect(result.success).toBe(true);
        expect(result.message).toContain(longName);
      });
    });

    // ===========================================================================
    // EDGE CASES (4 tests)
    // ===========================================================================

    describe('Edge Cases', () => {
      it('should handle special characters in valid names', async () => {
        const result = await handler.handle(
          mockPlayer,
          mockRoom,
          "wizard's chest",
        );

        expect(result.success).toBe(true);
      });

      it('should handle numbers in container names', async () => {
        const result = await handler.handle(mockPlayer, mockRoom, 'chest 1');

        expect(result.success).toBe(true);
        expect(result.message).toContain('chest 1');
      });

      it('should handle case sensitivity', async () => {
        const result = await handler.handle(mockPlayer, mockRoom, 'CHEST');

        expect(result.success).toBe(true);
        expect(result.message).toContain('CHEST');
      });

      it('should return consistent result structure', async () => {
        const result = await handler.handle(mockPlayer, mockRoom, 'chest');

        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('type');
        expect(result).toHaveProperty('message');
        expect(typeof result.success).toBe('boolean');
        expect(typeof result.type).toBe('string');
        expect(typeof result.message).toBe('string');
      });
    });
  });
});
