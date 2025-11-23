import { Test, TestingModule } from '@nestjs/testing';
import { HelpCommandHandler } from './help-command.handler';

describe('HelpCommandHandler', () => {
  let handler: HelpCommandHandler;

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
    name: 'Test Room',
    description: 'A test room',
    position: { x: 0, y: 0, z: 0 },
    size: { width: 10, height: 10, depth: 3 },
    width: 10,
    height: 10,
    objects: ['chest-1'],
    players: ['player-1'],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HelpCommandHandler],
    }).compile();

    handler = module.get<HelpCommandHandler>(HelpCommandHandler);
  });

  // ==============================================================================
  // BASIC FUNCTIONALITY TESTS (4 tests)
  // ==============================================================================

  describe('Basic Functionality', () => {
    it('should be defined', () => {
      expect(handler).toBeDefined();
    });

    it('should return help text successfully', async () => {
      const result = await handler.handle(mockPlayer, mockRoom);

      expect(result.success).toBe(true);
      expect(result.type).toBe('help');
      expect(result.message).toBeDefined();
      expect(result.message.length).toBeGreaterThan(0);
    });

    it('should return help text when called with target parameter', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, 'inventory');

      expect(result.success).toBe(true);
      expect(result.type).toBe('help');
      expect(result.message).toBeDefined();
    });

    it('should return same help text regardless of target', async () => {
      const result1 = await handler.handle(mockPlayer, mockRoom);
      const result2 = await handler.handle(mockPlayer, mockRoom, 'commands');
      const result3 = await handler.handle(mockPlayer, mockRoom, 'anything');

      expect(result1.message).toBe(result2.message);
      expect(result2.message).toBe(result3.message);
    });
  });

  // ==============================================================================
  // RESPONSE STRUCTURE TESTS (3 tests)
  // ==============================================================================

  describe('Response Structure', () => {
    it('should return correct CommandResult structure', async () => {
      const result = await handler.handle(mockPlayer, mockRoom);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('message');
    });

    it('should always return success true', async () => {
      const result = await handler.handle(mockPlayer, mockRoom);

      expect(result.success).toBe(true);
    });

    it('should return type as "help"', async () => {
      const result = await handler.handle(mockPlayer, mockRoom);

      expect(result.type).toBe('help');
    });
  });

  // ==============================================================================
  // HELP TEXT CONTENT TESTS (10 tests)
  // ==============================================================================

  describe('Help Text Content', () => {
    describe('Command Categories', () => {
      it('should include MOVEMENT category', async () => {
        const result = await handler.handle(mockPlayer, mockRoom);

        expect(result.message).toContain('MOVEMENT:');
      });

      it('should include INVENTORY category', async () => {
        const result = await handler.handle(mockPlayer, mockRoom);

        expect(result.message).toContain('INVENTORY:');
      });

      it('should include INTERACTION category', async () => {
        const result = await handler.handle(mockPlayer, mockRoom);

        expect(result.message).toContain('INTERACTION:');
      });

      it('should include SYSTEM category', async () => {
        const result = await handler.handle(mockPlayer, mockRoom);

        expect(result.message).toContain('SYSTEM:');
      });

      it('should include TIPS section', async () => {
        const result = await handler.handle(mockPlayer, mockRoom);

        expect(result.message).toContain('TIPS:');
      });
    });

    describe('Movement Commands', () => {
      it('should list cardinal direction commands', async () => {
        const result = await handler.handle(mockPlayer, mockRoom);

        expect(result.message).toContain('north, south, east, west');
        expect(result.message).toContain('n, s, e, w');
      });

      it('should list diagonal direction commands', async () => {
        const result = await handler.handle(mockPlayer, mockRoom);

        expect(result.message).toContain('northeast, northwest, southeast, southwest');
        expect(result.message).toContain('ne, nw, se, sw');
      });

      it('should list vertical movement commands', async () => {
        const result = await handler.handle(mockPlayer, mockRoom);

        expect(result.message).toContain('up, down');
      });
    });

    describe('Inventory Commands', () => {
      it('should list take and drop commands', async () => {
        const result = await handler.handle(mockPlayer, mockRoom);

        expect(result.message).toContain('take [item]');
        expect(result.message).toContain('drop [item]');
      });

      it('should list inventory command with aliases', async () => {
        const result = await handler.handle(mockPlayer, mockRoom);

        expect(result.message).toContain('inventory');
        expect(result.message).toContain('i, inv');
      });

      it('should list examine and use commands', async () => {
        const result = await handler.handle(mockPlayer, mockRoom);

        expect(result.message).toContain('examine [item]');
        expect(result.message).toContain('use [item]');
      });
    });

    describe('Interaction Commands', () => {
      it('should list look command with alias', async () => {
        const result = await handler.handle(mockPlayer, mockRoom);

        expect(result.message).toContain('look');
        expect(result.message).toContain('or l');
      });

      it('should list talk command', async () => {
        const result = await handler.handle(mockPlayer, mockRoom);

        expect(result.message).toContain('talk [npc]');
      });

      it('should list dialogue reply commands', async () => {
        const result = await handler.handle(mockPlayer, mockRoom);

        expect(result.message).toContain('reply [number]');
        expect(result.message).toContain('choose, answer, select');
      });

      it('should list quick dialogue choice syntax', async () => {
        const result = await handler.handle(mockPlayer, mockRoom);

        expect(result.message).toContain('1, 2, 3, etc.');
        expect(result.message).toContain('Quick dialogue choice');
      });

      it('should list attack command', async () => {
        const result = await handler.handle(mockPlayer, mockRoom);

        expect(result.message).toContain('attack [npc]');
      });

      it('should list open and close commands', async () => {
        const result = await handler.handle(mockPlayer, mockRoom);

        expect(result.message).toContain('open [container]');
        expect(result.message).toContain('close [container]');
      });
    });

    describe('System Commands', () => {
      it('should list help command', async () => {
        const result = await handler.handle(mockPlayer, mockRoom);

        expect(result.message).toContain('help');
        expect(result.message).toContain('Show this help message');
      });

      it('should list save and load commands', async () => {
        const result = await handler.handle(mockPlayer, mockRoom);

        expect(result.message).toContain('save');
        expect(result.message).toContain('load');
        expect(result.message).toContain('Save your progress');
        expect(result.message).toContain('Load your saved game');
      });
    });

    describe('Tips Section', () => {
      it('should include NPC interaction tips', async () => {
        const result = await handler.handle(mockPlayer, mockRoom);

        expect(result.message).toContain('Talk to NPCs');
      });

      it('should include dialogue choice tips', async () => {
        const result = await handler.handle(mockPlayer, mockRoom);

        expect(result.message).toContain('Use dialogue choices');
        expect(result.message).toContain('1, 2, 3');
      });

      it('should include examine tips', async () => {
        const result = await handler.handle(mockPlayer, mockRoom);

        expect(result.message).toContain('Examine NPCs');
      });

      it('should include combat tips', async () => {
        const result = await handler.handle(mockPlayer, mockRoom);

        expect(result.message).toContain('defeated in combat');
        expect(result.message).toContain('quest items');
      });
    });
  });

  // ==============================================================================
  // MESSAGE FORMATTING TESTS (2 tests)
  // ==============================================================================

  describe('Message Formatting', () => {
    it('should return trimmed message without leading/trailing whitespace', async () => {
      const result = await handler.handle(mockPlayer, mockRoom);

      expect(result.message).toBe(result.message.trim());
      expect(result.message.startsWith(' ')).toBe(false);
      expect(result.message.endsWith(' ')).toBe(false);
    });

    it('should return multi-line formatted message', async () => {
      const result = await handler.handle(mockPlayer, mockRoom);

      expect(result.message).toContain('\n');
      expect(result.message.split('\n').length).toBeGreaterThan(10);
    });
  });

  // ==============================================================================
  // EDGE CASES AND PARAMETER HANDLING (6 tests)
  // ==============================================================================

  describe('Edge Cases and Parameter Handling', () => {
    it('should handle null target parameter', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, null);

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
    });

    it('should handle undefined target parameter', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, undefined);

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
    });

    it('should handle empty string target parameter', async () => {
      const result = await handler.handle(mockPlayer, mockRoom, '');

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
    });

    it('should handle various player states', async () => {
      const differentPlayer = {
        ...mockPlayer,
        health: 50,
        inventory: [],
      };

      const result = await handler.handle(differentPlayer, mockRoom);

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
    });

    it('should handle various room states', async () => {
      const differentRoom = {
        ...mockRoom,
        objects: [],
        players: [],
      };

      const result = await handler.handle(mockPlayer, differentRoom);

      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
    });

    it('should be consistent across multiple calls', async () => {
      const result1 = await handler.handle(mockPlayer, mockRoom);
      const result2 = await handler.handle(mockPlayer, mockRoom);
      const result3 = await handler.handle(mockPlayer, mockRoom);

      expect(result1.message).toBe(result2.message);
      expect(result2.message).toBe(result3.message);
    });
  });

  // ==============================================================================
  // COMPLETENESS VERIFICATION (1 test)
  // ==============================================================================

  describe('Help Text Completeness', () => {
    it('should include all essential command categories and commands', async () => {
      const result = await handler.handle(mockPlayer, mockRoom);
      const message = result.message;

      // Verify categories
      const categories = ['MOVEMENT:', 'INVENTORY:', 'INTERACTION:', 'SYSTEM:', 'TIPS:'];
      categories.forEach(category => {
        expect(message).toContain(category);
      });

      // Verify essential commands
      const essentialCommands = [
        'north', 'south', 'east', 'west',
        'take', 'drop', 'inventory', 'examine', 'use',
        'look', 'talk', 'reply', 'attack', 'open', 'close',
        'help', 'save', 'load',
      ];

      essentialCommands.forEach(command => {
        expect(message.toLowerCase()).toContain(command);
      });
    });
  });
});
