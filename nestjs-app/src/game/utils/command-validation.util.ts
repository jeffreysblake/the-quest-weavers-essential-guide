/**
 * Command Validation Utilities
 *
 * Provides common validation functions for game commands that return
 * CommandResult-compatible error responses. These utilities standardize
 * validation logic across command handlers.
 *
 * @example
 * ```typescript
 * import { validateTargetExists, createErrorResult } from './command-validation.util';
 *
 * // In a command handler:
 * const targetError = validateTargetExists(target, 'take');
 * if (targetError) {
 *   return targetError;
 * }
 * ```
 */

import { CommandResult } from '../game.service';

/**
 * Validate that a target string is provided
 *
 * Checks if a target parameter is missing or empty and returns an appropriate
 * error CommandResult. This is commonly used in commands that require a target
 * object or item name.
 *
 * @param target - The target string to validate
 * @param actionName - The name of the action (e.g., 'take', 'drop', 'examine')
 * @returns CommandResult with error if target is missing, null if valid
 *
 * @example
 * ```typescript
 * // In TakeCommandHandler:
 * const error = validateTargetExists(target, 'take');
 * if (error) {
 *   return error; // Returns: { success: false, type: 'error', message: 'Take what?' }
 * }
 *
 * // In ExamineCommandHandler:
 * const error = validateTargetExists(target, 'examine');
 * if (error) {
 *   return error; // Returns: { success: false, type: 'error', message: 'Examine what?' }
 * }
 * ```
 */
export function validateTargetExists(
  target: string | undefined | null,
  actionName: string,
): CommandResult | null {
  if (!target || target.trim() === '') {
    const capitalizedAction =
      actionName.charAt(0).toUpperCase() + actionName.slice(1);
    return {
      success: false,
      type: 'error',
      message: `${capitalizedAction} what?`,
    };
  }
  return null;
}

/**
 * Validate basic item name format
 *
 * Performs basic validation on an item name to ensure it meets minimum
 * requirements. Checks for empty strings and excessively long names.
 *
 * @param itemName - The item name to validate
 * @param maxLength - Maximum allowed length (default: 100)
 * @returns CommandResult with error if invalid, null if valid
 *
 * @example
 * ```typescript
 * const error = validateItemName('');
 * if (error) {
 *   return error; // Returns: { success: false, type: 'error', message: 'Invalid item name' }
 * }
 *
 * const error2 = validateItemName('x'.repeat(200));
 * if (error2) {
 *   return error2; // Returns: { success: false, type: 'error', message: 'Item name too long...' }
 * }
 * ```
 */
export function validateItemName(
  itemName: string | undefined | null,
  maxLength: number = 100,
): CommandResult | null {
  if (!itemName || itemName.trim() === '') {
    return {
      success: false,
      type: 'error',
      message: 'Invalid item name',
    };
  }

  if (itemName.length > maxLength) {
    return {
      success: false,
      type: 'error',
      message: `Item name too long (max ${maxLength} characters)`,
    };
  }

  return null;
}

/**
 * Create a standard error CommandResult
 *
 * Helper function to create error CommandResult objects with consistent structure.
 * Useful for generating error responses in command handlers.
 *
 * @param message - The error message to display
 * @param type - The error type (default: 'error')
 * @returns CommandResult object with success: false
 *
 * @example
 * ```typescript
 * return createErrorResult('You cannot take that item');
 * // Returns: { success: false, type: 'error', message: 'You cannot take that item' }
 *
 * return createErrorResult('Item not found', 'action_failure');
 * // Returns: { success: false, type: 'action_failure', message: 'Item not found' }
 * ```
 */
export function createErrorResult(
  message: string,
  type: string = 'error',
): CommandResult {
  return {
    success: false,
    type,
    message,
  };
}

/**
 * Create a standard success CommandResult
 *
 * Helper function to create success CommandResult objects with consistent structure.
 * Useful for generating success responses in command handlers.
 *
 * @param message - The success message to display
 * @param type - The result type (default: 'action_success')
 * @param additionalData - Additional data to include in the result
 * @returns CommandResult object with success: true
 *
 * @example
 * ```typescript
 * return createSuccessResult('You take the brass key');
 * // Returns: { success: true, type: 'action_success', message: 'You take the brass key' }
 *
 * return createSuccessResult('Examined the tome', 'examination', { items: [...] });
 * // Returns: { success: true, type: 'examination', message: 'Examined the tome', items: [...] }
 * ```
 */
export function createSuccessResult(
  message: string,
  type: string = 'action_success',
  additionalData?: Partial<CommandResult>,
): CommandResult {
  return {
    success: true,
    type,
    message,
    ...additionalData,
  };
}

/**
 * Validate object existence in a collection
 *
 * Checks if an object exists in a collection and returns an appropriate error
 * if not found. Useful for validating that an item exists in inventory or room.
 *
 * @param object - The object to check (should be truthy if exists)
 * @param itemName - The name of the item being searched for
 * @param location - Where the item should be ('here', 'inventory', etc.)
 * @returns CommandResult with error if object not found, null if valid
 *
 * @example
 * ```typescript
 * const item = inventory.find(obj => matchesName(obj.name, target));
 * const error = validateObjectExists(item, target, 'inventory');
 * if (error) {
 *   return error; // Returns: { success: false, type: 'action_failure', message: "You don't have a brass key." }
 * }
 * ```
 */
export function validateObjectExists(
  object: any,
  itemName: string,
  location: string = 'here',
): CommandResult | null {
  if (!object) {
    let message: string;
    if (location === 'inventory') {
      message = `You don't have a ${itemName}.`;
    } else if (location === 'here') {
      message = `You don't see a ${itemName} here.`;
    } else {
      message = `You don't see a ${itemName} ${location}.`;
    }

    return {
      success: false,
      type: 'action_failure',
      message,
    };
  }
  return null;
}
