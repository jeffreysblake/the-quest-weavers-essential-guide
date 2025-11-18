import { Injectable } from '@nestjs/common';

@Injectable()
export class CommandValidatorService {
  // Validation constants
  private readonly MAX_COMMAND_LENGTH = 1000; // Prevent DOS with massive commands
  private readonly MIN_POSITION = -10000;
  private readonly MAX_POSITION = 10000;
  private readonly MAX_HEALTH = Number.MAX_SAFE_INTEGER;
  private readonly MAX_INVENTORY_QUANTITY = 999999;
  private readonly ALLOWED_COMMAND_PATTERN = /^[a-z0-9\s\-_.,'":!?]+$/i;

  /**
   * Validate command string - sanitize and check for malicious input
   */
  validateCommandString(command: string): {
    valid: boolean;
    sanitized?: string;
    error?: string;
  } {
    // Check if command exists
    if (!command || typeof command !== 'string') {
      return { valid: false, error: 'Command must be a non-empty string' };
    }

    // Check command length to prevent DOS attacks
    if (command.length > this.MAX_COMMAND_LENGTH) {
      return {
        valid: false,
        error: `Command too long. Maximum length is ${this.MAX_COMMAND_LENGTH} characters`,
      };
    }

    // Sanitize: trim whitespace and remove null bytes
    const sanitized = command.trim().replace(/\0/g, '');

    // Check for empty command after sanitization
    if (sanitized.length === 0) {
      return { valid: false, error: 'Command cannot be empty' };
    }

    // Check for SQL injection patterns
    // Note: Allow common game verbs like "drop", "put", "insert" when used as game commands
    const lowerSanitized = sanitized.toLowerCase();
    const firstWord = lowerSanitized.split(/\s+/)[0];
    const allowedGameVerbs = ['drop', 'put', 'insert', 'create', 'delete', 'update', 'select'];

    // Only check for SQL injection if it's not a known game verb
    const sqlInjectionPatterns = [
      /(\bUNION\b|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bCREATE\b|\bALTER\b)/i,
      /--\s*$/,
      /[;]\s*\w/,
      /'.*OR.*'/i,
      /".*OR.*"/i,
    ];

    // Skip SQL injection check if the first word is a game verb
    if (!allowedGameVerbs.includes(firstWord)) {
      for (const pattern of sqlInjectionPatterns) {
        if (pattern.test(sanitized)) {
          return {
            valid: false,
            error: 'Invalid command: potential injection detected',
          };
        }
      }
    }

    // Check for command injection patterns (shell commands)
    // Note: Relaxed for game commands - only blocking truly dangerous patterns
    const commandInjectionPatterns = [
      /[;&|`$]/,  // Shell metacharacters
      /\.\.\//,   // Path traversal
      /\0/,       // Null byte (already removed but check again)
    ];

    for (const pattern of commandInjectionPatterns) {
      if (pattern.test(sanitized)) {
        return {
          valid: false,
          error: 'Invalid command: unsafe characters detected',
        };
      }
    }

    // Verify command contains only allowed characters
    if (!this.ALLOWED_COMMAND_PATTERN.test(sanitized)) {
      return {
        valid: false,
        error: 'Invalid command: contains disallowed characters',
      };
    }

    return { valid: true, sanitized };
  }

  /**
   * Validate position coordinates - ensure valid numbers, no Infinity/NaN
   */
  validatePosition(
    x: number,
    y: number,
    z: number,
  ): { valid: boolean; error?: string } {
    // Check if values are numbers
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      typeof z !== 'number'
    ) {
      return { valid: false, error: 'Position coordinates must be numbers' };
    }

    // Check for NaN
    if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) {
      return { valid: false, error: 'Position coordinates cannot be NaN' };
    }

    // Check for Infinity
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return { valid: false, error: 'Position coordinates cannot be Infinity' };
    }

    // Check bounds
    if (x < this.MIN_POSITION || x > this.MAX_POSITION) {
      return {
        valid: false,
        error: `X coordinate must be between ${this.MIN_POSITION} and ${this.MAX_POSITION}`,
      };
    }

    if (y < this.MIN_POSITION || y > this.MAX_POSITION) {
      return {
        valid: false,
        error: `Y coordinate must be between ${this.MIN_POSITION} and ${this.MAX_POSITION}`,
      };
    }

    if (z < this.MIN_POSITION || z > this.MAX_POSITION) {
      return {
        valid: false,
        error: `Z coordinate must be between ${this.MIN_POSITION} and ${this.MAX_POSITION}`,
      };
    }

    return { valid: true };
  }

  /**
   * Validate item/object name - prevent injection and ensure safe string
   */
  validateItemName(name: string): {
    valid: boolean;
    sanitized?: string;
    error?: string;
  } {
    // Check if name exists
    if (!name || typeof name !== 'string') {
      return { valid: false, error: 'Item name must be a non-empty string' };
    }

    // Sanitize: trim whitespace
    const sanitized = name.trim();

    // Check for empty name after sanitization
    if (sanitized.length === 0) {
      return { valid: false, error: 'Item name cannot be empty' };
    }

    // Check reasonable length
    if (sanitized.length > 100) {
      return {
        valid: false,
        error: 'Item name too long. Maximum length is 100 characters',
      };
    }

    // Check for script injection patterns
    const scriptPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+=/i,
      /<iframe/i,
      /<object/i,
      /<embed/i,
    ];

    for (const pattern of scriptPatterns) {
      if (pattern.test(sanitized)) {
        return {
          valid: false,
          error: 'Invalid item name: potential script injection detected',
        };
      }
    }

    // Only allow alphanumeric, spaces, hyphens, underscores, and basic punctuation
    const allowedPattern = /^[a-z0-9\s\-_',.!?]+$/i;
    if (!allowedPattern.test(sanitized)) {
      return {
        valid: false,
        error: 'Invalid item name: contains disallowed characters',
      };
    }

    return { valid: true, sanitized };
  }

  /**
   * Validate health value
   */
  validateHealthValue(health: number): {
    valid: boolean;
    error?: string;
  } {
    if (typeof health !== 'number') {
      return { valid: false, error: 'Health must be a number' };
    }

    if (Number.isNaN(health)) {
      return { valid: false, error: 'Health cannot be NaN' };
    }

    if (!Number.isFinite(health)) {
      return { valid: false, error: 'Health cannot be Infinity' };
    }

    if (health < 0) {
      return { valid: false, error: 'Health cannot be negative' };
    }

    if (health > this.MAX_HEALTH) {
      return { valid: false, error: `Health cannot exceed ${this.MAX_HEALTH}` };
    }

    return { valid: true };
  }

  /**
   * Validate inventory quantity
   */
  validateInventoryQuantity(quantity: number): {
    valid: boolean;
    error?: string;
  } {
    if (typeof quantity !== 'number') {
      return { valid: false, error: 'Quantity must be a number' };
    }

    if (Number.isNaN(quantity)) {
      return { valid: false, error: 'Quantity cannot be NaN' };
    }

    if (!Number.isFinite(quantity)) {
      return { valid: false, error: 'Quantity cannot be Infinity' };
    }

    if (quantity < 0) {
      return { valid: false, error: 'Quantity cannot be negative' };
    }

    if (quantity > this.MAX_INVENTORY_QUANTITY) {
      return {
        valid: false,
        error: `Quantity cannot exceed ${this.MAX_INVENTORY_QUANTITY}`,
      };
    }

    // Ensure it's an integer
    if (!Number.isInteger(quantity)) {
      return { valid: false, error: 'Quantity must be an integer' };
    }

    return { valid: true };
  }
}
