import { Test, TestingModule } from '@nestjs/testing';
import { CommandValidatorService } from './command-validator.service';

describe('CommandValidatorService', () => {
  let service: CommandValidatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommandValidatorService],
    }).compile();

    service = module.get<CommandValidatorService>(CommandValidatorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateCommandString', () => {
    describe('basic validation', () => {
      it('should accept valid simple commands', () => {
        const result = service.validateCommandString('look around');
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBe('look around');
        expect(result.error).toBeUndefined();
      });

      it('should accept commands with allowed punctuation', () => {
        const validCommands = [
          'say hello world',
          "examine the king's sword",
          'use item carefully',
          'take the key',
          'look at the door!',
          'who are you?',
        ];

        validCommands.forEach((cmd) => {
          const result = service.validateCommandString(cmd);
          expect(result.valid).toBe(true);
          expect(result.sanitized).toBe(cmd);
        });
      });

      it('should accept commands with numbers and hyphens', () => {
        const result = service.validateCommandString('use key-card-001');
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBe('use key-card-001');
      });

      it('should trim whitespace', () => {
        const result = service.validateCommandString('  look around  ');
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBe('look around');
      });

      it('should remove null bytes during sanitization', () => {
        const result = service.validateCommandString('look\0around');
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBe('lookaround');
      });
    });

    describe('input validation - null/empty/type checking', () => {
      it('should reject null command', () => {
        const result = service.validateCommandString(null as any);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Command must be a non-empty string');
      });

      it('should reject undefined command', () => {
        const result = service.validateCommandString(undefined as any);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Command must be a non-empty string');
      });

      it('should reject non-string command', () => {
        const result = service.validateCommandString(123 as any);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Command must be a non-empty string');
      });

      it('should reject empty string', () => {
        const result = service.validateCommandString('');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Command must be a non-empty string');
      });

      it('should reject whitespace-only string', () => {
        const result = service.validateCommandString('   ');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Command cannot be empty');
      });

      it('should reject string with only null bytes', () => {
        const result = service.validateCommandString('\0\0\0');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Command cannot be empty');
      });
    });

    describe('DOS prevention - length limits', () => {
      it('should accept commands up to 1000 characters', () => {
        const validCommand = 'a'.repeat(1000);
        const result = service.validateCommandString(validCommand);
        expect(result.valid).toBe(true);
      });

      it('should reject commands over 1000 characters', () => {
        const tooLong = 'a'.repeat(1001);
        const result = service.validateCommandString(tooLong);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Command too long');
        expect(result.error).toContain('1000');
      });

      it('should reject massively long commands (DOS attack)', () => {
        const massive = 'a'.repeat(100000);
        const result = service.validateCommandString(massive);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Command too long');
      });
    });

    describe('SQL injection prevention', () => {
      it('should reject UNION injection attempts', () => {
        const attacks = [
          'look UNION SELECT * FROM users',
          'examine item\' UNION SELECT password FROM accounts--',
          'search union all select',
        ];

        attacks.forEach((attack) => {
          const result = service.validateCommandString(attack);
          expect(result.valid).toBe(false);
          expect(result.error).toContain('potential injection detected');
        });
      });

      it('should reject SELECT injection attempts', () => {
        const attacks = [
          'look SELECT * FROM players',
          'examine SELECT password',
        ];

        attacks.forEach((attack) => {
          const result = service.validateCommandString(attack);
          expect(result.valid).toBe(false);
          expect(result.error).toContain('potential injection detected');
        });
      });

      it('should reject INSERT injection attempts', () => {
        const result = service.validateCommandString(
          'look INSERT INTO users VALUES',
        );
        expect(result.valid).toBe(false);
        expect(result.error).toContain('potential injection detected');
      });

      it('should reject UPDATE injection attempts', () => {
        const result = service.validateCommandString(
          'look UPDATE users SET admin=1',
        );
        expect(result.valid).toBe(false);
        expect(result.error).toContain('potential injection detected');
      });

      it('should reject DELETE injection attempts', () => {
        const result = service.validateCommandString(
          'look DELETE FROM players',
        );
        expect(result.valid).toBe(false);
        expect(result.error).toContain('potential injection detected');
      });

      it('should reject DROP injection attempts', () => {
        const result = service.validateCommandString('look DROP TABLE users');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('potential injection detected');
      });

      it('should reject CREATE injection attempts', () => {
        const result = service.validateCommandString(
          'look CREATE TABLE hacked',
        );
        expect(result.valid).toBe(false);
        expect(result.error).toContain('potential injection detected');
      });

      it('should reject ALTER injection attempts', () => {
        const result = service.validateCommandString(
          'look ALTER TABLE users',
        );
        expect(result.valid).toBe(false);
        expect(result.error).toContain('potential injection detected');
      });

      it('should reject SQL comments (--)', () => {
        const result = service.validateCommandString("look around-- ");
        expect(result.valid).toBe(false);
        expect(result.error).toContain('potential injection detected');
      });

      it('should reject semicolon followed by SQL commands', () => {
        const result = service.validateCommandString('look; DROP TABLE users');
        expect(result.valid).toBe(false);
        // Note: SQL injection check happens before command injection check
        expect(result.error).toContain('potential injection detected');
      });

      it('should reject OR conditions in quotes (string injection)', () => {
        const attacks = [
          "look 'OR'1'='1",
          'examine "OR"1"="1',
          "search ' OR 'a'='a",
        ];

        attacks.forEach((attack) => {
          const result = service.validateCommandString(attack);
          expect(result.valid).toBe(false);
          expect(result.error).toContain('potential injection detected');
        });
      });
    });

    describe('game verb whitelisting - false positive prevention', () => {
      it('should ALLOW game command: drop', () => {
        const result = service.validateCommandString('drop the sword');
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBe('drop the sword');
      });

      it('should ALLOW game command: put', () => {
        const result = service.validateCommandString('put key in box');
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBe('put key in box');
      });

      it('should ALLOW game command: insert', () => {
        const result = service.validateCommandString('insert coin into slot');
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBe('insert coin into slot');
      });

      it('should ALLOW game command: create', () => {
        const result = service.validateCommandString('create campfire');
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBe('create campfire');
      });

      it('should ALLOW game command: delete', () => {
        const result = service.validateCommandString('delete old save');
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBe('delete old save');
      });

      it('should ALLOW game command: update', () => {
        const result = service.validateCommandString('update inventory');
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBe('update inventory');
      });

      it('should ALLOW game command: select', () => {
        const result = service.validateCommandString('select option 1');
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBe('select option 1');
      });

      it('should REJECT SQL keywords when NOT first word', () => {
        const result = service.validateCommandString(
          'examine DROP TABLE users',
        );
        expect(result.valid).toBe(false);
        expect(result.error).toContain('potential injection detected');
      });

      it('should REJECT SQL keywords in middle of command', () => {
        const result = service.validateCommandString(
          'look at UNION SELECT thing',
        );
        expect(result.valid).toBe(false);
        expect(result.error).toContain('potential injection detected');
      });
    });

    describe('command injection prevention', () => {
      it('should reject shell metacharacters: semicolon', () => {
        const result = service.validateCommandString('look; rm -rf /');
        expect(result.valid).toBe(false);
        // Note: SQL injection check catches semicolon first
        expect(result.error).toContain('potential injection detected');
      });

      it('should reject shell metacharacters: ampersand', () => {
        const result = service.validateCommandString('look & whoami');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('unsafe characters detected');
      });

      it('should reject shell metacharacters: pipe', () => {
        const result = service.validateCommandString('look | cat /etc/passwd');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('unsafe characters detected');
      });

      it('should reject shell metacharacters: backtick', () => {
        const result = service.validateCommandString('look `whoami`');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('unsafe characters detected');
      });

      it('should reject shell metacharacters: dollar sign', () => {
        const result = service.validateCommandString('look $(whoami)');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('unsafe characters detected');
      });

      it('should reject path traversal attempts', () => {
        const attacks = [
          'look ../../etc/passwd',
          'examine ../../../secret',
          'use item ../config',
        ];

        attacks.forEach((attack) => {
          const result = service.validateCommandString(attack);
          expect(result.valid).toBe(false);
          expect(result.error).toContain('unsafe characters detected');
        });
      });

      it('should reject null byte injection (after sanitization check)', () => {
        // Null bytes are removed during sanitization, so this tests the second check
        const result = service.validateCommandString('look\x00secret');
        expect(result.valid).toBe(true); // Null byte removed, becomes valid
        expect(result.sanitized).toBe('looksecret');
      });
    });

    describe('XSS and script injection prevention', () => {
      it('should reject HTML tags (angle brackets)', () => {
        const attacks = [
          'look <script>alert(1)</script>',
          'examine <img src=x onerror=alert(1)>',
          'use <iframe src="evil.com">',
        ];

        attacks.forEach((attack) => {
          const result = service.validateCommandString(attack);
          expect(result.valid).toBe(false);
          expect(result.error).toContain('disallowed characters');
        });
      });

      it('should reject other special characters not in whitelist', () => {
        const attacks = [
          'look <test>',
          'examine {code}',
          'use @admin',
          'search #hashtag',
          'find %wildcard',
          'get ^caret',
          'take ~tilde',
          'put \\backslash',
          'drop /slash',
          'insert =equals',
          'create +plus',
        ];

        attacks.forEach((attack) => {
          const result = service.validateCommandString(attack);
          expect(result.valid).toBe(false);
          expect(result.error).toContain('disallowed characters');
        });
      });
    });

    describe('allowed character validation', () => {
      it('should accept only whitelisted characters', () => {
        const validChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_.,\'":!?()[]';
        const result = service.validateCommandString(validChars);
        expect(result.valid).toBe(true);
      });

      it('should reject any character outside whitelist', () => {
        const invalidChars = ['<', '>', '{', '}', '&', '|', ';', '$', '`', '@', '#', '%', '^', '~', '\\', '/', '=', '+', '*'];

        invalidChars.forEach((char) => {
          const result = service.validateCommandString(`look ${char} test`);
          expect(result.valid).toBe(false);
          // Error message varies depending on which check catches it first
          expect(result.error).toMatch(/unsafe characters detected|disallowed characters|potential injection detected/);
        });
      });
    });
  });

  describe('validatePosition', () => {
    describe('valid positions', () => {
      it('should accept valid coordinates within bounds', () => {
        const result = service.validatePosition(0, 0, 0);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should accept negative coordinates within bounds', () => {
        const result = service.validatePosition(-100, -50, -25);
        expect(result.valid).toBe(true);
      });

      it('should accept positive coordinates within bounds', () => {
        const result = service.validatePosition(500, 1000, 750);
        expect(result.valid).toBe(true);
      });

      it('should accept coordinates at minimum boundary', () => {
        const result = service.validatePosition(-10000, -10000, -10000);
        expect(result.valid).toBe(true);
      });

      it('should accept coordinates at maximum boundary', () => {
        const result = service.validatePosition(10000, 10000, 10000);
        expect(result.valid).toBe(true);
      });

      it('should accept decimal coordinates', () => {
        const result = service.validatePosition(1.5, 2.7, -3.2);
        expect(result.valid).toBe(true);
      });
    });

    describe('type validation', () => {
      it('should reject non-number x coordinate', () => {
        const result = service.validatePosition('100' as any, 0, 0);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Position coordinates must be numbers');
      });

      it('should reject non-number y coordinate', () => {
        const result = service.validatePosition(0, '50' as any, 0);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Position coordinates must be numbers');
      });

      it('should reject non-number z coordinate', () => {
        const result = service.validatePosition(0, 0, null as any);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Position coordinates must be numbers');
      });

      it('should reject undefined coordinates', () => {
        const result = service.validatePosition(undefined as any, 0, 0);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Position coordinates must be numbers');
      });
    });

    describe('NaN validation', () => {
      it('should reject NaN x coordinate', () => {
        const result = service.validatePosition(NaN, 0, 0);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Position coordinates cannot be NaN');
      });

      it('should reject NaN y coordinate', () => {
        const result = service.validatePosition(0, NaN, 0);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Position coordinates cannot be NaN');
      });

      it('should reject NaN z coordinate', () => {
        const result = service.validatePosition(0, 0, NaN);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Position coordinates cannot be NaN');
      });

      it('should reject all NaN coordinates', () => {
        const result = service.validatePosition(NaN, NaN, NaN);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Position coordinates cannot be NaN');
      });
    });

    describe('Infinity validation', () => {
      it('should reject Infinity x coordinate', () => {
        const result = service.validatePosition(Infinity, 0, 0);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Position coordinates cannot be Infinity');
      });

      it('should reject -Infinity x coordinate', () => {
        const result = service.validatePosition(-Infinity, 0, 0);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Position coordinates cannot be Infinity');
      });

      it('should reject Infinity y coordinate', () => {
        const result = service.validatePosition(0, Infinity, 0);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Position coordinates cannot be Infinity');
      });

      it('should reject Infinity z coordinate', () => {
        const result = service.validatePosition(0, 0, Infinity);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Position coordinates cannot be Infinity');
      });
    });

    describe('bounds validation', () => {
      it('should reject x coordinate below minimum', () => {
        const result = service.validatePosition(-10001, 0, 0);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('X coordinate must be between');
        expect(result.error).toContain('-10000');
        expect(result.error).toContain('10000');
      });

      it('should reject x coordinate above maximum', () => {
        const result = service.validatePosition(10001, 0, 0);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('X coordinate must be between');
      });

      it('should reject y coordinate below minimum', () => {
        const result = service.validatePosition(0, -10001, 0);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Y coordinate must be between');
      });

      it('should reject y coordinate above maximum', () => {
        const result = service.validatePosition(0, 10001, 0);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Y coordinate must be between');
      });

      it('should reject z coordinate below minimum', () => {
        const result = service.validatePosition(0, 0, -10001);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Z coordinate must be between');
      });

      it('should reject z coordinate above maximum', () => {
        const result = service.validatePosition(0, 0, 10001);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Z coordinate must be between');
      });

      it('should reject all coordinates out of bounds', () => {
        const result = service.validatePosition(-20000, 20000, -20000);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('coordinate must be between');
      });
    });
  });

  describe('validateItemName', () => {
    describe('valid item names', () => {
      it('should accept simple item names', () => {
        const result = service.validateItemName('Brass Key');
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBe('Brass Key');
      });

      it('should accept names with hyphens', () => {
        const result = service.validateItemName('First-Aid-Kit');
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBe('First-Aid-Kit');
      });

      it('should accept names with underscores', () => {
        const result = service.validateItemName('laser_gun');
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBe('laser_gun');
      });

      it('should accept names with apostrophes', () => {
        const result = service.validateItemName("King's Sword");
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBe("King's Sword");
      });

      it('should accept names with basic punctuation', () => {
        const names = [
          'Ancient Tome, Vol. 1',
          'Potion (healing)',
          'Staff of Power!',
          'Who are you?',
          'Key [master]',
        ];

        names.forEach((name) => {
          const result = service.validateItemName(name);
          expect(result.valid).toBe(true);
          expect(result.sanitized).toBe(name);
        });
      });

      it('should trim whitespace', () => {
        const result = service.validateItemName('  Brass Key  ');
        expect(result.valid).toBe(true);
        expect(result.sanitized).toBe('Brass Key');
      });

      it('should accept names up to 100 characters', () => {
        const longName = 'a'.repeat(100);
        const result = service.validateItemName(longName);
        expect(result.valid).toBe(true);
      });
    });

    describe('input validation - null/empty/type checking', () => {
      it('should reject null name', () => {
        const result = service.validateItemName(null as any);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Item name must be a non-empty string');
      });

      it('should reject undefined name', () => {
        const result = service.validateItemName(undefined as any);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Item name must be a non-empty string');
      });

      it('should reject non-string name', () => {
        const result = service.validateItemName(123 as any);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Item name must be a non-empty string');
      });

      it('should reject empty string', () => {
        const result = service.validateItemName('');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Item name must be a non-empty string');
      });

      it('should reject whitespace-only string', () => {
        const result = service.validateItemName('   ');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Item name cannot be empty');
      });
    });

    describe('length validation', () => {
      it('should reject names over 100 characters', () => {
        const tooLong = 'a'.repeat(101);
        const result = service.validateItemName(tooLong);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Item name too long');
        expect(result.error).toContain('100');
      });

      it('should reject extremely long names', () => {
        const massive = 'a'.repeat(10000);
        const result = service.validateItemName(massive);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Item name too long');
      });
    });

    describe('script injection prevention', () => {
      it('should reject <script> tags', () => {
        const attacks = [
          '<script>alert(1)</script>',
          'Item <script>evil</script>',
          '<SCRIPT>alert("XSS")</SCRIPT>',
        ];

        attacks.forEach((attack) => {
          const result = service.validateItemName(attack);
          expect(result.valid).toBe(false);
          expect(result.error).toContain('potential script injection detected');
        });
      });

      it('should reject javascript: protocol', () => {
        const attacks = [
          'javascript:alert(1)',
          'item javascript:void(0)',
          'JAVASCRIPT:evil()',
        ];

        attacks.forEach((attack) => {
          const result = service.validateItemName(attack);
          expect(result.valid).toBe(false);
          expect(result.error).toContain('potential script injection detected');
        });
      });

      it('should reject event handlers', () => {
        const attacks = [
          'item onclick=alert(1)',
          'name onerror=evil()',
          'test onload=hack()',
          'item onmouseover=bad()',
        ];

        attacks.forEach((attack) => {
          const result = service.validateItemName(attack);
          expect(result.valid).toBe(false);
          expect(result.error).toContain('potential script injection detected');
        });
      });

      it('should reject <iframe> tags', () => {
        const result = service.validateItemName('<iframe src="evil.com">');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('potential script injection detected');
      });

      it('should reject <object> tags', () => {
        const result = service.validateItemName('<object data="evil">');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('potential script injection detected');
      });

      it('should reject <embed> tags', () => {
        const result = service.validateItemName('<embed src="evil">');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('potential script injection detected');
      });
    });

    describe('allowed character validation', () => {
      it('should accept only whitelisted characters', () => {
        const validChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_.,!?()[]\'';
        const result = service.validateItemName(validChars);
        expect(result.valid).toBe(true);
      });

      it('should reject angle brackets', () => {
        const result = service.validateItemName('Item <test>');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('disallowed characters');
      });

      it('should reject special characters outside whitelist', () => {
        const invalidChars = ['&', '|', ';', '$', '`', '@', '#', '%', '^', '~', '\\', '/', '=', '+', '*', '{', '}'];

        invalidChars.forEach((char) => {
          const result = service.validateItemName(`Item ${char} Test`);
          expect(result.valid).toBe(false);
          expect(result.error).toContain('disallowed characters');
        });
      });
    });
  });

  describe('validateHealthValue', () => {
    describe('valid health values', () => {
      it('should accept zero health', () => {
        const result = service.validateHealthValue(0);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should accept positive health', () => {
        const result = service.validateHealthValue(100);
        expect(result.valid).toBe(true);
      });

      it('should accept decimal health', () => {
        const result = service.validateHealthValue(99.5);
        expect(result.valid).toBe(true);
      });

      it('should accept maximum safe integer health', () => {
        const result = service.validateHealthValue(Number.MAX_SAFE_INTEGER);
        expect(result.valid).toBe(true);
      });

      it('should accept large health values', () => {
        const result = service.validateHealthValue(999999999);
        expect(result.valid).toBe(true);
      });
    });

    describe('type validation', () => {
      it('should reject non-number health', () => {
        const result = service.validateHealthValue('100' as any);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Health must be a number');
      });

      it('should reject null health', () => {
        const result = service.validateHealthValue(null as any);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Health must be a number');
      });

      it('should reject undefined health', () => {
        const result = service.validateHealthValue(undefined as any);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Health must be a number');
      });
    });

    describe('NaN validation', () => {
      it('should reject NaN health', () => {
        const result = service.validateHealthValue(NaN);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Health cannot be NaN');
      });

      it('should reject NaN from arithmetic (0/0)', () => {
        const result = service.validateHealthValue(0 / 0);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Health cannot be NaN');
      });
    });

    describe('Infinity validation', () => {
      it('should reject Infinity health', () => {
        const result = service.validateHealthValue(Infinity);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Health cannot be Infinity');
      });

      it('should reject -Infinity health', () => {
        const result = service.validateHealthValue(-Infinity);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Health cannot be Infinity');
      });

      it('should reject Infinity from arithmetic', () => {
        const result = service.validateHealthValue(1 / 0);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Health cannot be Infinity');
      });
    });

    describe('range validation', () => {
      it('should reject negative health', () => {
        const result = service.validateHealthValue(-1);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Health cannot be negative');
      });

      it('should reject large negative health', () => {
        const result = service.validateHealthValue(-999999);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Health cannot be negative');
      });

      it('should reject health exceeding MAX_SAFE_INTEGER', () => {
        const result = service.validateHealthValue(Number.MAX_SAFE_INTEGER + 1);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Health cannot exceed');
      });
    });
  });

  describe('validateInventoryQuantity', () => {
    describe('valid quantities', () => {
      it('should accept zero quantity', () => {
        const result = service.validateInventoryQuantity(0);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should accept positive integer quantities', () => {
        const result = service.validateInventoryQuantity(50);
        expect(result.valid).toBe(true);
      });

      it('should accept maximum allowed quantity', () => {
        const result = service.validateInventoryQuantity(999999);
        expect(result.valid).toBe(true);
      });

      it('should accept quantity of 1', () => {
        const result = service.validateInventoryQuantity(1);
        expect(result.valid).toBe(true);
      });
    });

    describe('type validation', () => {
      it('should reject non-number quantity', () => {
        const result = service.validateInventoryQuantity('50' as any);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Quantity must be a number');
      });

      it('should reject null quantity', () => {
        const result = service.validateInventoryQuantity(null as any);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Quantity must be a number');
      });

      it('should reject undefined quantity', () => {
        const result = service.validateInventoryQuantity(undefined as any);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Quantity must be a number');
      });
    });

    describe('NaN validation', () => {
      it('should reject NaN quantity', () => {
        const result = service.validateInventoryQuantity(NaN);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Quantity cannot be NaN');
      });
    });

    describe('Infinity validation', () => {
      it('should reject Infinity quantity', () => {
        const result = service.validateInventoryQuantity(Infinity);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Quantity cannot be Infinity');
      });

      it('should reject -Infinity quantity', () => {
        const result = service.validateInventoryQuantity(-Infinity);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Quantity cannot be Infinity');
      });
    });

    describe('range validation', () => {
      it('should reject negative quantity', () => {
        const result = service.validateInventoryQuantity(-1);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Quantity cannot be negative');
      });

      it('should reject quantity exceeding maximum', () => {
        const result = service.validateInventoryQuantity(1000000);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Quantity cannot exceed');
        expect(result.error).toContain('999999');
      });

      it('should reject extremely large quantity', () => {
        const result = service.validateInventoryQuantity(Number.MAX_SAFE_INTEGER);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('Quantity cannot exceed');
      });
    });

    describe('integer validation', () => {
      it('should reject decimal quantities', () => {
        const result = service.validateInventoryQuantity(5.5);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Quantity must be an integer');
      });

      it('should reject float quantities', () => {
        const result = service.validateInventoryQuantity(10.999);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Quantity must be an integer');
      });

      it('should reject very small decimals', () => {
        const result = service.validateInventoryQuantity(1.0001);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Quantity must be an integer');
      });
    });
  });

  describe('integration - combined validation scenarios', () => {
    it('should handle multiple validation methods independently', () => {
      // Command validation
      const cmd = service.validateCommandString('drop sword');
      expect(cmd.valid).toBe(true);

      // Position validation
      const pos = service.validatePosition(100, 200, 300);
      expect(pos.valid).toBe(true);

      // Item name validation
      const item = service.validateItemName('Magic Sword');
      expect(item.valid).toBe(true);

      // Health validation
      const health = service.validateHealthValue(100);
      expect(health.valid).toBe(true);

      // Quantity validation
      const qty = service.validateInventoryQuantity(5);
      expect(qty.valid).toBe(true);
    });

    it('should maintain security boundaries across all methods', () => {
      // SQL injection should fail when not a game verb
      expect(service.validateCommandString('look UNION SELECT').valid).toBe(false);
      expect(service.validateItemName('<script>alert(1)</script>').valid).toBe(false);

      // All invalid types should fail
      expect(service.validatePosition(NaN, 0, 0).valid).toBe(false);
      expect(service.validateHealthValue(Infinity).valid).toBe(false);
      expect(service.validateInventoryQuantity(-1).valid).toBe(false);
    });
  });
});
