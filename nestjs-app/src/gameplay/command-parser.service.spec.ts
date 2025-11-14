import { Test, TestingModule } from '@nestjs/testing';
import { CommandParserService, IParsedCommand } from './command-parser.service';
import { ActionType } from './action.interfaces';

describe('CommandParserService', () => {
  let service: CommandParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommandParserService],
    }).compile();

    service = module.get<CommandParserService>(CommandParserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('parse() - Basic Command Parsing', () => {
    it('should parse single-word command', () => {
      const result = service.parse('inventory');
      expect(result.verb).toBe('inventory');
      expect(result.action).toBe(ActionType.INVENTORY);
      expect(result.raw).toBe('inventory');
      expect(result.target).toBeUndefined();
    });

    it('should parse empty input', () => {
      const result = service.parse('');
      expect(result.verb).toBe('');
      expect(result.action).toBe(ActionType.CUSTOM);
      expect(result.raw).toBe('');
    });

    it('should parse whitespace-only input', () => {
      const result = service.parse('   ');
      expect(result.verb).toBe('');
      expect(result.action).toBe(ActionType.CUSTOM);
    });

    it('should trim leading and trailing whitespace', () => {
      const result = service.parse('  look  ');
      expect(result.verb).toBe('look');
      expect(result.action).toBe(ActionType.EXAMINE);
    });

    it('should convert to lowercase', () => {
      const result = service.parse('LOOK');
      expect(result.verb).toBe('look');
      expect(result.action).toBe(ActionType.EXAMINE);
    });

    it('should preserve raw input', () => {
      const result = service.parse('  LOOK Around  ');
      expect(result.raw).toBe('LOOK Around');
    });
  });

  describe('parse() - Movement Commands', () => {
    it('should parse "go north"', () => {
      const result = service.parse('go north');
      expect(result.verb).toBe('go');
      expect(result.action).toBe(ActionType.GO);
      expect(result.direction).toBe('north');
    });

    it('should parse abbreviated direction "go n"', () => {
      const result = service.parse('go n');
      expect(result.verb).toBe('go');
      expect(result.action).toBe(ActionType.GO);
      expect(result.direction).toBe('north');
    });

    it('should parse "go e" to east', () => {
      const result = service.parse('go e');
      expect(result.direction).toBe('east');
    });

    it('should parse "go w" to west', () => {
      const result = service.parse('go w');
      expect(result.direction).toBe('west');
    });

    it('should parse "go s" to south', () => {
      const result = service.parse('go s');
      expect(result.direction).toBe('south');
    });

    it('should parse "go ne" to northeast', () => {
      const result = service.parse('go ne');
      expect(result.direction).toBe('northeast');
    });

    it('should parse "go nw" to northwest', () => {
      const result = service.parse('go nw');
      expect(result.direction).toBe('northwest');
    });

    it('should parse "go se" to southeast', () => {
      const result = service.parse('go se');
      expect(result.direction).toBe('southeast');
    });

    it('should parse "go sw" to southwest', () => {
      const result = service.parse('go sw');
      expect(result.direction).toBe('southwest');
    });

    it('should parse "go u" to up', () => {
      const result = service.parse('go u');
      expect(result.direction).toBe('up');
    });

    it('should parse "go d" to down', () => {
      const result = service.parse('go d');
      expect(result.direction).toBe('down');
    });

    it('should parse "move east"', () => {
      const result = service.parse('move east');
      expect(result.verb).toBe('move');
      expect(result.action).toBe(ActionType.GO);
      expect(result.direction).toBe('east');
    });

    it('should parse "walk south"', () => {
      const result = service.parse('walk south');
      expect(result.verb).toBe('walk');
      expect(result.action).toBe(ActionType.GO);
      expect(result.direction).toBe('south');
    });
  });

  describe('parse() - Object Interaction Commands', () => {
    it('should parse "take sword"', () => {
      const result = service.parse('take sword');
      expect(result.verb).toBe('take');
      expect(result.action).toBe(ActionType.TAKE);
      expect(result.target).toBe('sword');
    });

    it('should parse "get key"', () => {
      const result = service.parse('get key');
      expect(result.verb).toBe('get');
      expect(result.action).toBe(ActionType.TAKE);
      expect(result.target).toBe('key');
    });

    it('should parse "drop torch"', () => {
      const result = service.parse('drop torch');
      expect(result.verb).toBe('drop');
      expect(result.action).toBe(ActionType.DROP);
      expect(result.target).toBe('torch');
    });

    it('should parse multi-word object "take brass key"', () => {
      const result = service.parse('take brass key');
      expect(result.target).toBe('brass key');
    });

    it('should parse "examine ancient tome"', () => {
      const result = service.parse('examine ancient tome');
      expect(result.verb).toBe('examine');
      expect(result.action).toBe(ActionType.EXAMINE);
      expect(result.target).toBe('ancient tome');
    });

    it('should filter prepositions "take the sword"', () => {
      const result = service.parse('take the sword');
      expect(result.target).toBe('sword');
    });

    it('should filter multiple prepositions "get a key"', () => {
      const result = service.parse('get a key');
      expect(result.target).toBe('key');
    });

    it('should filter "an" preposition', () => {
      const result = service.parse('take an apple');
      expect(result.target).toBe('apple');
    });
  });

  describe('parse() - Complex Commands with "on" and "with"', () => {
    it('should parse "use key on door"', () => {
      const result = service.parse('use key on door');
      expect(result.verb).toBe('use');
      expect(result.action).toBe(ActionType.USE);
      expect(result.tool).toBe('key');
      expect(result.target).toBe('door');
    });

    it('should parse "unlock door with key"', () => {
      const result = service.parse('unlock door with key');
      expect(result.verb).toBe('unlock');
      expect(result.action).toBe(ActionType.UNLOCK);
      expect(result.target).toBe('door');
      expect(result.tool).toBe('key');
    });

    it('should parse "use brass key on wooden door"', () => {
      const result = service.parse('use brass key on wooden door');
      expect(result.tool).toBe('brass key');
      expect(result.target).toBe('wooden door');
    });

    it('should parse "unlock the door with the key"', () => {
      const result = service.parse('unlock the door with the key');
      expect(result.target).toBe('door');
      expect(result.tool).toBe('key');
    });

    it('should handle "with" in middle of command', () => {
      const result = service.parse('open chest with crowbar');
      expect(result.target).toBe('chest');
      expect(result.tool).toBe('crowbar');
    });
  });

  describe('parse() - Command Aliases', () => {
    it('should map "inv" to INVENTORY action', () => {
      const result = service.parse('inv');
      expect(result.action).toBe(ActionType.INVENTORY);
    });

    it('should map "grab" to TAKE action', () => {
      const result = service.parse('grab sword');
      expect(result.action).toBe(ActionType.TAKE);
    });

    it('should map "inspect" to EXAMINE action', () => {
      const result = service.parse('inspect book');
      expect(result.action).toBe(ActionType.EXAMINE);
    });

    it('should map "talk" to TALK action', () => {
      const result = service.parse('talk guard');
      expect(result.action).toBe(ActionType.TALK);
    });

    it('should map "fight" to ATTACK action', () => {
      const result = service.parse('fight orc');
      expect(result.action).toBe(ActionType.ATTACK);
    });

    it('should map "quit" to QUIT action', () => {
      const result = service.parse('quit');
      expect(result.action).toBe(ActionType.QUIT);
    });

    it('should map "exit" to QUIT action', () => {
      const result = service.parse('exit');
      expect(result.action).toBe(ActionType.QUIT);
    });
  });

  describe('parse() - Special Characters and Punctuation', () => {
    it('should remove punctuation from input', () => {
      const result = service.parse('look!');
      expect(result.verb).toBe('look');
    });

    it('should handle comma in command', () => {
      const result = service.parse('take sword, please');
      expect(result.verb).toBe('take');
      expect(result.target).toBe('sword please');
    });

    it('should handle question mark', () => {
      const result = service.parse('help?');
      expect(result.verb).toBe('help');
    });

    it('should handle semicolon', () => {
      const result = service.parse('look;');
      expect(result.verb).toBe('look');
    });

    it('should handle multiple spaces between words', () => {
      const result = service.parse('take    brass    key');
      expect(result.target).toBe('brass key');
    });
  });

  describe('parse() - Unknown Commands', () => {
    it('should mark unknown verb as CUSTOM action', () => {
      const result = service.parse('dance');
      expect(result.verb).toBe('dance');
      expect(result.action).toBe(ActionType.CUSTOM);
    });

    it('should handle unknown command with target', () => {
      const result = service.parse('tickle guard');
      expect(result.verb).toBe('tickle');
      expect(result.action).toBe(ActionType.CUSTOM);
      expect(result.target).toBe('guard');
    });
  });

  describe('createAction()', () => {
    it('should create action from parsed command', () => {
      const parsedCommand: IParsedCommand = {
        verb: 'take',
        action: ActionType.TAKE,
        target: 'sword',
        raw: 'take sword',
      };

      const action = service.createAction(parsedCommand, 'player123');
      expect(action.type).toBe(ActionType.TAKE);
      expect(action.actor).toBe('player123');
      expect(action.verb).toBe('take');
      expect(action.target).toBe('sword');
      expect(action.timestamp).toBeDefined();
    });

    it('should include direction in parameters', () => {
      const parsedCommand: IParsedCommand = {
        verb: 'go',
        action: ActionType.GO,
        direction: 'north',
        raw: 'go north',
      };

      const action = service.createAction(parsedCommand, 'player123');
      expect(action.parameters.direction).toBe('north');
    });

    it('should include tool when present', () => {
      const parsedCommand: IParsedCommand = {
        verb: 'use',
        action: ActionType.USE,
        tool: 'key',
        target: 'door',
        raw: 'use key on door',
      };

      const action = service.createAction(parsedCommand, 'player123');
      expect(action.tool).toBe('key');
      expect(action.target).toBe('door');
    });
  });

  describe('getSuggestions()', () => {
    it('should return suggestions for partial verb "ta"', () => {
      const suggestions = service.getSuggestions('ta');
      expect(suggestions).toContain('take');
      expect(suggestions).toContain('talk');
    });

    it('should return suggestions for "ex"', () => {
      const suggestions = service.getSuggestions('ex');
      expect(suggestions).toContain('examine');
      expect(suggestions).toContain('exit');
    });

    it('should return empty array for no matches', () => {
      const suggestions = service.getSuggestions('xyz');
      expect(suggestions).toEqual([]);
    });

    it('should limit suggestions to 10', () => {
      const suggestions = service.getSuggestions('');
      expect(suggestions.length).toBeLessThanOrEqual(10);
    });

    it('should handle lowercase conversion', () => {
      const suggestions = service.getSuggestions('TA');
      expect(suggestions).toContain('take');
    });

    it('should return exact match', () => {
      const suggestions = service.getSuggestions('help');
      expect(suggestions).toContain('help');
    });
  });

  describe('getVerbHelp()', () => {
    it('should return help for "take"', () => {
      const help = service.getVerbHelp('take');
      expect(help).toBeDefined();
      expect(help).toContain('take');
      expect(help).toContain('object');
    });

    it('should return help for "go"', () => {
      const help = service.getVerbHelp('go');
      expect(help).toBeDefined();
      expect(help).toContain('direction');
    });

    it('should return undefined for unknown verb', () => {
      const help = service.getVerbHelp('dance');
      expect(help).toBeUndefined();
    });

    it('should handle case-insensitive lookup', () => {
      const help = service.getVerbHelp('TAKE');
      expect(help).toBeDefined();
    });

    it('should return help for "inventory"', () => {
      const help = service.getVerbHelp('inventory');
      expect(help).toBeDefined();
      expect(help).toContain('items');
    });
  });

  describe('getAllVerbs()', () => {
    it('should return all available verbs', () => {
      const verbs = service.getAllVerbs();
      expect(verbs).toContain('take');
      expect(verbs).toContain('drop');
      expect(verbs).toContain('go');
      expect(verbs).toContain('look');
    });

    it('should return sorted array', () => {
      const verbs = service.getAllVerbs();
      const sorted = [...verbs].sort();
      expect(verbs).toEqual(sorted);
    });

    it('should include all movement verbs', () => {
      const verbs = service.getAllVerbs();
      expect(verbs).toContain('go');
      expect(verbs).toContain('move');
      expect(verbs).toContain('walk');
    });

    it('should include system verbs', () => {
      const verbs = service.getAllVerbs();
      expect(verbs).toContain('help');
      expect(verbs).toContain('quit');
      expect(verbs).toContain('save');
    });
  });

  describe('validateCommand()', () => {
    it('should validate command with no verb as invalid', () => {
      const parsedCommand: IParsedCommand = {
        verb: '',
        action: ActionType.CUSTOM,
        raw: '',
      };

      const result = service.validateCommand(parsedCommand);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('No verb provided');
    });

    it('should validate GO command without direction as invalid', () => {
      const parsedCommand: IParsedCommand = {
        verb: 'go',
        action: ActionType.GO,
        raw: 'go',
      };

      const result = service.validateCommand(parsedCommand);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Which direction?');
    });

    it('should validate GO command with direction as valid', () => {
      const parsedCommand: IParsedCommand = {
        verb: 'go',
        action: ActionType.GO,
        direction: 'north',
        raw: 'go north',
      };

      const result = service.validateCommand(parsedCommand);
      expect(result.valid).toBe(true);
    });

    it('should validate TAKE command without target as invalid', () => {
      const parsedCommand: IParsedCommand = {
        verb: 'take',
        action: ActionType.TAKE,
        raw: 'take',
      };

      const result = service.validateCommand(parsedCommand);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('take');
    });

    it('should validate TAKE command with target as valid', () => {
      const parsedCommand: IParsedCommand = {
        verb: 'take',
        action: ActionType.TAKE,
        target: 'sword',
        raw: 'take sword',
      };

      const result = service.validateCommand(parsedCommand);
      expect(result.valid).toBe(true);
    });

    it('should validate DROP command without target as invalid', () => {
      const parsedCommand: IParsedCommand = {
        verb: 'drop',
        action: ActionType.DROP,
        raw: 'drop',
      };

      const result = service.validateCommand(parsedCommand);
      expect(result.valid).toBe(false);
    });

    it('should validate USE command without target as invalid', () => {
      const parsedCommand: IParsedCommand = {
        verb: 'use',
        action: ActionType.USE,
        raw: 'use',
      };

      const result = service.validateCommand(parsedCommand);
      expect(result.valid).toBe(false);
    });

    it('should validate EXAMINE command without target as invalid', () => {
      const parsedCommand: IParsedCommand = {
        verb: 'examine',
        action: ActionType.EXAMINE,
        raw: 'examine',
      };

      const result = service.validateCommand(parsedCommand);
      expect(result.valid).toBe(false);
    });

    it('should validate INVENTORY command as valid', () => {
      const parsedCommand: IParsedCommand = {
        verb: 'inventory',
        action: ActionType.INVENTORY,
        raw: 'inventory',
      };

      const result = service.validateCommand(parsedCommand);
      expect(result.valid).toBe(true);
    });

    it('should validate HELP command as valid', () => {
      const parsedCommand: IParsedCommand = {
        verb: 'help',
        action: ActionType.HELP,
        raw: 'help',
      };

      const result = service.validateCommand(parsedCommand);
      expect(result.valid).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long input', () => {
      const longInput = 'take ' + 'very '.repeat(100) + 'long sword';
      const result = service.parse(longInput);
      expect(result.verb).toBe('take');
      expect(result.target).toContain('very');
    });

    it('should handle numbers in command', () => {
      const result = service.parse('take key123');
      expect(result.target).toBe('key123');
    });

    it('should handle mixed case multi-word commands', () => {
      const result = service.parse('TaKe ThE BrAsS KeY');
      expect(result.verb).toBe('take');
      expect(result.target).toBe('brass key');
    });

    it('should handle command with only prepositions after verb', () => {
      const result = service.parse('look at the');
      expect(result.target).toBe('');
    });

    it('should handle single character command', () => {
      const result = service.parse('n');
      expect(result.verb).toBe('n');
    });
  });
});
