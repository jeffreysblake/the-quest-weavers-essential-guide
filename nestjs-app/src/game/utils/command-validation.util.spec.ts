import {
  validateTargetExists,
  validateItemName,
  createErrorResult,
  createSuccessResult,
  validateObjectExists,
} from './command-validation.util';
import { CommandResult } from '../game.service';

describe('Command Validation Utilities', () => {
  describe('validateTargetExists', () => {
    describe('valid targets', () => {
      it('should return null for valid non-empty target', () => {
        const result = validateTargetExists('sword', 'take');
        expect(result).toBeNull();
      });

      it('should return null for target with multiple words', () => {
        const result = validateTargetExists('brass key', 'examine');
        expect(result).toBeNull();
      });

      it('should return null for target with special characters', () => {
        const result = validateTargetExists("king's sword", 'take');
        expect(result).toBeNull();
      });

      it('should return null for target with numbers', () => {
        const result = validateTargetExists('key-001', 'use');
        expect(result).toBeNull();
      });

      it('should return null for target with leading/trailing spaces', () => {
        const result = validateTargetExists('  item  ', 'drop');
        expect(result).toBeNull();
      });
    });

    describe('invalid targets - missing/empty', () => {
      it('should return error for null target', () => {
        const result = validateTargetExists(null, 'take');
        expect(result).not.toBeNull();
        expect(result?.success).toBe(false);
        expect(result?.type).toBe('error');
        expect(result?.message).toBe('Take what?');
      });

      it('should return error for undefined target', () => {
        const result = validateTargetExists(undefined, 'examine');
        expect(result).not.toBeNull();
        expect(result?.success).toBe(false);
        expect(result?.type).toBe('error');
        expect(result?.message).toBe('Examine what?');
      });

      it('should return error for empty string target', () => {
        const result = validateTargetExists('', 'drop');
        expect(result).not.toBeNull();
        expect(result?.success).toBe(false);
        expect(result?.type).toBe('error');
        expect(result?.message).toBe('Drop what?');
      });

      it('should return error for whitespace-only target', () => {
        const result = validateTargetExists('   ', 'use');
        expect(result).not.toBeNull();
        expect(result?.success).toBe(false);
        expect(result?.type).toBe('error');
        expect(result?.message).toBe('Use what?');
      });

      it('should return error for tab-only target', () => {
        const result = validateTargetExists('\t\t', 'attack');
        expect(result).not.toBeNull();
        expect(result?.success).toBe(false);
        expect(result?.message).toBe('Attack what?');
      });
    });

    describe('action name capitalization', () => {
      it('should capitalize first letter of action name', () => {
        const result = validateTargetExists('', 'take');
        expect(result?.message).toBe('Take what?');
      });

      it('should handle action names starting with uppercase', () => {
        const result = validateTargetExists('', 'Examine');
        expect(result?.message).toBe('Examine what?');
      });

      it('should handle all uppercase action names', () => {
        const result = validateTargetExists('', 'DROP');
        expect(result?.message).toBe('DROP what?');
      });

      it('should handle multi-word action names', () => {
        const result = validateTargetExists('', 'pick up');
        expect(result?.message).toBe('Pick up what?');
      });

      it('should handle single character action name', () => {
        const result = validateTargetExists('', 'x');
        expect(result?.message).toBe('X what?');
      });
    });
  });

  describe('validateItemName', () => {
    describe('valid item names', () => {
      it('should return null for valid item name', () => {
        const result = validateItemName('brass key');
        expect(result).toBeNull();
      });

      it('should return null for item name with special characters', () => {
        const result = validateItemName("king's sword");
        expect(result).toBeNull();
      });

      it('should return null for item name with numbers', () => {
        const result = validateItemName('potion-001');
        expect(result).toBeNull();
      });

      it('should return null for single character item name', () => {
        const result = validateItemName('x');
        expect(result).toBeNull();
      });

      it('should return null for item name with leading/trailing spaces', () => {
        const result = validateItemName('  ancient tome  ');
        expect(result).toBeNull();
      });
    });

    describe('invalid item names - empty', () => {
      it('should return error for null item name', () => {
        const result = validateItemName(null);
        expect(result).not.toBeNull();
        expect(result?.success).toBe(false);
        expect(result?.type).toBe('error');
        expect(result?.message).toBe('Invalid item name');
      });

      it('should return error for undefined item name', () => {
        const result = validateItemName(undefined);
        expect(result).not.toBeNull();
        expect(result?.success).toBe(false);
        expect(result?.type).toBe('error');
        expect(result?.message).toBe('Invalid item name');
      });

      it('should return error for empty string item name', () => {
        const result = validateItemName('');
        expect(result).not.toBeNull();
        expect(result?.success).toBe(false);
        expect(result?.message).toBe('Invalid item name');
      });

      it('should return error for whitespace-only item name', () => {
        const result = validateItemName('   ');
        expect(result).not.toBeNull();
        expect(result?.success).toBe(false);
        expect(result?.message).toBe('Invalid item name');
      });

      it('should return error for tab-only item name', () => {
        const result = validateItemName('\t\t\t');
        expect(result).not.toBeNull();
        expect(result?.message).toBe('Invalid item name');
      });
    });

    describe('item name length validation', () => {
      it('should return null for item name at default max length (100)', () => {
        const itemName = 'a'.repeat(100);
        const result = validateItemName(itemName);
        expect(result).toBeNull();
      });

      it('should return error for item name exceeding default max length', () => {
        const itemName = 'a'.repeat(101);
        const result = validateItemName(itemName);
        expect(result).not.toBeNull();
        expect(result?.success).toBe(false);
        expect(result?.type).toBe('error');
        expect(result?.message).toBe('Item name too long (max 100 characters)');
      });

      it('should return null for item name at custom max length', () => {
        const itemName = 'a'.repeat(50);
        const result = validateItemName(itemName, 50);
        expect(result).toBeNull();
      });

      it('should return error for item name exceeding custom max length', () => {
        const itemName = 'a'.repeat(51);
        const result = validateItemName(itemName, 50);
        expect(result).not.toBeNull();
        expect(result?.message).toBe('Item name too long (max 50 characters)');
      });

      it('should validate against very short max length', () => {
        const result = validateItemName('test', 3);
        expect(result).not.toBeNull();
        expect(result?.message).toBe('Item name too long (max 3 characters)');
      });

      it('should accept item name at boundary (max length - 1)', () => {
        const itemName = 'a'.repeat(99);
        const result = validateItemName(itemName);
        expect(result).toBeNull();
      });

      it('should handle very long item names', () => {
        const itemName = 'a'.repeat(1000);
        const result = validateItemName(itemName);
        expect(result).not.toBeNull();
        expect(result?.message).toBe('Item name too long (max 100 characters)');
      });
    });

    describe('edge cases', () => {
      it('should accept unicode characters', () => {
        const result = validateItemName('古代の剣');
        expect(result).toBeNull();
      });

      it('should accept emoji in item name', () => {
        const result = validateItemName('⚔️ sword');
        expect(result).toBeNull();
      });

      it('should count emoji correctly in length validation', () => {
        // Emoji can be multi-byte, so this tests proper length handling
        const itemName = '⚔️'.repeat(50) + 'a'.repeat(50);
        const result = validateItemName(itemName);
        expect(result).not.toBeNull();
      });
    });
  });

  describe('createErrorResult', () => {
    describe('error result creation', () => {
      it('should create error result with default type', () => {
        const result = createErrorResult('Something went wrong');
        expect(result).toEqual({
          success: false,
          type: 'error',
          message: 'Something went wrong',
        });
      });

      it('should create error result with custom type', () => {
        const result = createErrorResult('Item not found', 'action_failure');
        expect(result).toEqual({
          success: false,
          type: 'action_failure',
          message: 'Item not found',
        });
      });

      it('should handle empty message', () => {
        const result = createErrorResult('');
        expect(result).toEqual({
          success: false,
          type: 'error',
          message: '',
        });
      });

      it('should handle special characters in message', () => {
        const result = createErrorResult("You can't take that!");
        expect(result.message).toBe("You can't take that!");
      });

      it('should handle multi-line message', () => {
        const message = 'Line 1\nLine 2\nLine 3';
        const result = createErrorResult(message);
        expect(result.message).toBe(message);
      });

      it('should handle unicode in message', () => {
        const result = createErrorResult('エラーが発生しました');
        expect(result.message).toBe('エラーが発生しました');
      });

      it('should always set success to false', () => {
        const result = createErrorResult('Error');
        expect(result.success).toBe(false);
      });
    });

    describe('different error types', () => {
      it('should accept validation_error type', () => {
        const result = createErrorResult('Invalid input', 'validation_error');
        expect(result.type).toBe('validation_error');
      });

      it('should accept combat_error type', () => {
        const result = createErrorResult('No target', 'combat_error');
        expect(result.type).toBe('combat_error');
      });

      it('should accept custom error type', () => {
        const result = createErrorResult('Custom error', 'custom_error_type');
        expect(result.type).toBe('custom_error_type');
      });
    });
  });

  describe('createSuccessResult', () => {
    describe('success result creation', () => {
      it('should create success result with default type', () => {
        const result = createSuccessResult('You take the brass key');
        expect(result).toEqual({
          success: true,
          type: 'action_success',
          message: 'You take the brass key',
        });
      });

      it('should create success result with custom type', () => {
        const result = createSuccessResult('Examined the tome', 'examination');
        expect(result).toEqual({
          success: true,
          type: 'examination',
          message: 'Examined the tome',
        });
      });

      it('should handle empty message', () => {
        const result = createSuccessResult('');
        expect(result.message).toBe('');
      });

      it('should always set success to true', () => {
        const result = createSuccessResult('Success');
        expect(result.success).toBe(true);
      });
    });

    describe('additional data handling', () => {
      it('should include additional data in result', () => {
        const result = createSuccessResult('Found items', 'search', {
          items: ['key', 'sword'],
        });
        expect(result).toEqual({
          success: true,
          type: 'search',
          message: 'Found items',
          items: ['key', 'sword'],
        });
      });

      it('should handle multiple additional fields', () => {
        const result = createSuccessResult('Combat result', 'combat', {
          damage: 10,
          targetHealth: 90,
          weaponUsed: 'sword',
        });
        expect(result).toMatchObject({
          success: true,
          type: 'combat',
          message: 'Combat result',
          damage: 10,
          targetHealth: 90,
          weaponUsed: 'sword',
        });
      });

      it('should work without additional data', () => {
        const result = createSuccessResult('Simple success');
        expect(result).toEqual({
          success: true,
          type: 'action_success',
          message: 'Simple success',
        });
      });

      it('should merge additional data correctly', () => {
        const additionalData = { customField: 'value', anotherField: 42 };
        const result = createSuccessResult('Test', 'test', additionalData);
        expect(result.customField).toBe('value');
        expect(result.anotherField).toBe(42);
      });

      it('should handle nested objects in additional data', () => {
        const result = createSuccessResult('Complex data', 'action', {
          nested: { key: 'value', num: 123 },
        });
        expect(result.nested).toEqual({ key: 'value', num: 123 });
      });

      it('should handle arrays in additional data', () => {
        const result = createSuccessResult('List data', 'list', {
          items: ['item1', 'item2', 'item3'],
        });
        expect(result.items).toEqual(['item1', 'item2', 'item3']);
      });
    });

    describe('different success types', () => {
      it('should accept movement type', () => {
        const result = createSuccessResult('You move north', 'movement');
        expect(result.type).toBe('movement');
      });

      it('should accept dialogue type', () => {
        const result = createSuccessResult('NPC speaks', 'dialogue');
        expect(result.type).toBe('dialogue');
      });

      it('should accept combat type', () => {
        const result = createSuccessResult('Hit enemy', 'combat');
        expect(result.type).toBe('combat');
      });
    });
  });

  describe('validateObjectExists', () => {
    describe('object exists cases', () => {
      it('should return null when object exists (truthy object)', () => {
        const object = { id: '1', name: 'Brass Key' };
        const result = validateObjectExists(object, 'brass key', 'inventory');
        expect(result).toBeNull();
      });

      it('should return null for non-empty string object', () => {
        const result = validateObjectExists('valid', 'item', 'here');
        expect(result).toBeNull();
      });

      it('should return null for number object', () => {
        const result = validateObjectExists(42, 'item', 'here');
        expect(result).toBeNull();
      });

      it('should return null for array object', () => {
        const result = validateObjectExists([1, 2, 3], 'items', 'inventory');
        expect(result).toBeNull();
      });

      it('should return null for boolean true', () => {
        const result = validateObjectExists(true, 'flag', 'here');
        expect(result).toBeNull();
      });
    });

    describe('object does not exist - inventory location', () => {
      it('should return error for null object in inventory', () => {
        const result = validateObjectExists(null, 'brass key', 'inventory');
        expect(result).not.toBeNull();
        expect(result?.success).toBe(false);
        expect(result?.type).toBe('action_failure');
        expect(result?.message).toBe("You don't have a brass key.");
      });

      it('should return error for undefined object in inventory', () => {
        const result = validateObjectExists(undefined, 'sword', 'inventory');
        expect(result).not.toBeNull();
        expect(result?.message).toBe("You don't have a sword.");
      });

      it('should return error for false object in inventory', () => {
        const result = validateObjectExists(false, 'key', 'inventory');
        expect(result).not.toBeNull();
        expect(result?.message).toBe("You don't have a key.");
      });

      it('should return error for 0 object in inventory', () => {
        const result = validateObjectExists(0, 'item', 'inventory');
        expect(result).not.toBeNull();
        expect(result?.message).toBe("You don't have a item.");
      });

      it('should return error for empty string object in inventory', () => {
        const result = validateObjectExists('', 'potion', 'inventory');
        expect(result).not.toBeNull();
        expect(result?.message).toBe("You don't have a potion.");
      });
    });

    describe('object does not exist - here location', () => {
      it('should return error for null object here', () => {
        const result = validateObjectExists(null, 'chest', 'here');
        expect(result).not.toBeNull();
        expect(result?.success).toBe(false);
        expect(result?.type).toBe('action_failure');
        expect(result?.message).toBe("You don't see a chest here.");
      });

      it('should return error for undefined object here', () => {
        const result = validateObjectExists(undefined, 'door', 'here');
        expect(result).not.toBeNull();
        expect(result?.message).toBe("You don't see a door here.");
      });

      it('should use here as default location', () => {
        const result = validateObjectExists(null, 'statue');
        expect(result).not.toBeNull();
        expect(result?.message).toBe("You don't see a statue here.");
      });
    });

    describe('object does not exist - custom location', () => {
      it('should return error with custom location in message', () => {
        const result = validateObjectExists(null, 'book', 'in the chest');
        expect(result).not.toBeNull();
        expect(result?.message).toBe("You don't see a book in the chest.");
      });

      it('should handle custom location with preposition', () => {
        const result = validateObjectExists(null, 'gem', 'on the pedestal');
        expect(result).not.toBeNull();
        expect(result?.message).toBe("You don't see a gem on the pedestal.");
      });

      it('should handle custom location as room name', () => {
        const result = validateObjectExists(null, 'key', 'the throne room');
        expect(result).not.toBeNull();
        expect(result?.message).toBe("You don't see a key the throne room.");
      });
    });

    describe('item name variations', () => {
      it('should handle simple item names', () => {
        const result = validateObjectExists(null, 'key', 'inventory');
        expect(result?.message).toBe("You don't have a key.");
      });

      it('should handle multi-word item names', () => {
        const result = validateObjectExists(null, 'brass key', 'inventory');
        expect(result?.message).toBe("You don't have a brass key.");
      });

      it('should handle item names with special characters', () => {
        const result = validateObjectExists(null, "king's sword", 'here');
        expect(result?.message).toBe("You don't see a king's sword here.");
      });

      it('should handle item names with numbers', () => {
        const result = validateObjectExists(null, 'key-001', 'inventory');
        expect(result?.message).toBe("You don't have a key-001.");
      });
    });

    describe('edge cases', () => {
      it('should handle empty item name', () => {
        const result = validateObjectExists(null, '', 'inventory');
        expect(result?.message).toBe("You don't have a .");
      });

      it('should handle NaN as object', () => {
        const result = validateObjectExists(NaN, 'item', 'here');
        // NaN is falsy, should return error
        expect(result).not.toBeNull();
        expect(result?.message).toBe("You don't see a item here.");
      });

      it('should handle empty array as object (truthy)', () => {
        const result = validateObjectExists([], 'items', 'here');
        // Empty array is truthy, should return null
        expect(result).toBeNull();
      });

      it('should handle empty object as object (truthy)', () => {
        const result = validateObjectExists({}, 'data', 'here');
        // Empty object is truthy, should return null
        expect(result).toBeNull();
      });
    });
  });
});
