import { Injectable } from '@nestjs/common';
import { ICommandHandler } from './command-handler.interface';
import { CommandResult } from '../game.service';
import { PlayerService } from '../../entity/player.service';
import { RoomService } from '../../entity/room.service';
import { CommandValidatorService } from '../command-validator.service';
import { matchesName as utilMatchesName } from '../utils/item-name-matcher.util';

/**
 * Abstract base class for all command handlers.
 * Provides common functionality and utilities that all command handlers can use.
 *
 * Subclasses must implement the handle() method to define command-specific behavior.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class MyCommandHandler extends BaseCommandHandler {
 *   async handle(player: any, room: any, target: string, gameId?: string): Promise<CommandResult> {
 *     const validation = this.validateTarget(target, 'use');
 *     if (validation) return validation;
 *
 *     const object = this.findObjectInInventoryOrRoom(player, room, target);
 *     if (!object) {
 *       return {
 *         success: false,
 *         type: 'action_failure',
 *         message: `You don't see a ${target} here.`,
 *       };
 *     }
 *
 *     // Command-specific logic...
 *   }
 * }
 * ```
 */
@Injectable()
export abstract class BaseCommandHandler implements ICommandHandler {
  constructor(
    protected readonly playerService: PlayerService,
    protected readonly roomService: RoomService,
    protected readonly validator: CommandValidatorService,
  ) {}

  /**
   * Abstract method that subclasses must implement to handle the command.
   * @param player - The player executing the command
   * @param room - The current room the player is in
   * @param target - The target of the command (e.g., item name, direction)
   * @param gameId - Optional game ID for multi-game support
   * @returns A promise resolving to the command result
   */
  abstract handle(
    player: any,
    room: any,
    target: string,
    gameId?: string,
  ): Promise<CommandResult>;

  /**
   * Check if a target string matches an object name.
   * Handles variations in naming conventions (hyphens, underscores, spaces).
   *
   * @param objectName - The name of the object to match against
   * @param target - The target string to match
   * @returns true if the target matches the object name
   *
   * @example
   * ```typescript
   * this.matchesName('space-helmet', 'space helmet') // returns true
   * this.matchesName('laser_gun', 'laser gun') // returns true
   * this.matchesName('first-aid-kit', 'first aid') // returns true
   * ```
   */
  protected matchesName(objectName: string, target: string): boolean {
    return utilMatchesName(objectName, target);
  }

  /**
   * Validates that a target is provided and passes item name validation.
   * Returns a CommandResult error if validation fails, or null if validation passes.
   *
   * This is a convenience method that combines common validation steps.
   *
   * @param target - The target string to validate
   * @param actionName - The name of the action for error messages (e.g., 'take', 'examine')
   * @returns CommandResult with error if invalid, null if valid
   *
   * @example
   * ```typescript
   * const validation = this.validateTarget(target, 'take');
   * if (validation) return validation; // Return error if invalid
   * // Continue with command logic if valid...
   * ```
   */
  protected validateTarget(
    target: string,
    actionName: string,
  ): CommandResult | null {
    if (!target) {
      return {
        success: false,
        type: 'error',
        message: `${actionName.charAt(0).toUpperCase() + actionName.slice(1)} what?`,
      };
    }

    const itemValidation = this.validator.validateItemName(target);
    if (!itemValidation.valid) {
      return {
        success: false,
        type: 'error',
        message: itemValidation.error || 'Invalid item name',
      };
    }

    return null;
  }

  /**
   * Finds an object by name in the player's inventory or the current room.
   * Searches inventory first (prioritizing items the player is carrying),
   * then checks room objects.
   *
   * @param player - The player to search inventory for
   * @param room - The room to search objects in
   * @param target - The target object name to find
   * @returns The found object, or null if not found
   *
   * @example
   * ```typescript
   * const object = this.findObjectInInventoryOrRoom(player, room, 'laser gun');
   * if (!object) {
   *   return { success: false, message: "You don't see that here." };
   * }
   * ```
   */
  protected findObjectInInventoryOrRoom(
    player: any,
    room: any,
    target: string,
  ): any | null {
    // Check inventory first (prioritize inventory over room objects)
    const inventory = this.playerService.getInventory(player.id);
    let targetObject = inventory.find((obj) =>
      obj.name ? this.matchesName(obj.name, target) : false,
    );

    // If not in inventory, check room objects
    if (!targetObject) {
      const objects = this.roomService.getObjectsInRoom(room.id);
      targetObject = objects.find((obj) =>
        obj.name ? this.matchesName(obj.name, target) : false,
      );
    }

    return targetObject || null;
  }

  /**
   * Finds an object by name only in the player's inventory.
   *
   * @param player - The player to search inventory for
   * @param target - The target object name to find
   * @returns The found object, or null if not found
   *
   * @example
   * ```typescript
   * const item = this.findObjectInInventory(player, 'key card');
   * if (!item) {
   *   return { success: false, message: "You don't have that item." };
   * }
   * ```
   */
  protected findObjectInInventory(player: any, target: string): any | null {
    const inventory = this.playerService.getInventory(player.id);
    const targetObject = inventory.find((obj) =>
      obj.name ? this.matchesName(obj.name, target) : false,
    );
    return targetObject || null;
  }

  /**
   * Finds an object by name only in the current room.
   *
   * @param room - The room to search objects in
   * @param target - The target object name to find
   * @returns The found object, or null if not found
   *
   * @example
   * ```typescript
   * const object = this.findObjectInRoom(room, 'control panel');
   * if (!object) {
   *   return { success: false, message: "You don't see that here." };
   * }
   * ```
   */
  protected findObjectInRoom(room: any, target: string): any | null {
    const objects = this.roomService.getObjectsInRoom(room.id);
    const targetObject = objects.find((obj) =>
      obj.name ? this.matchesName(obj.name, target) : false,
    );
    return targetObject || null;
  }

  /**
   * Creates a standard error result for when an object is not found.
   *
   * @param target - The name of the object that wasn't found
   * @returns A CommandResult with a standardized error message
   *
   * @example
   * ```typescript
   * const object = this.findObjectInRoom(room, target);
   * if (!object) {
   *   return this.createNotFoundError(target);
   * }
   * ```
   */
  protected createNotFoundError(target: string): CommandResult {
    return {
      success: false,
      type: 'action_failure',
      message: `You don't see a ${target} here.`,
    };
  }
}
