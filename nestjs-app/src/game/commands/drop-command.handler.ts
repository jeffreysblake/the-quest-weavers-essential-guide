import { Injectable } from '@nestjs/common';
import { ICommandHandler } from './command-handler.interface';
import { CommandResult } from '../game.service';
import { PlayerService } from '../../entity/player.service';
import { RoomService } from '../../entity/room.service';
import { ObjectService } from '../../entity/object.service';
import { CommandValidatorService } from '../command-validator.service';

@Injectable()
export class DropCommandHandler implements ICommandHandler {
  constructor(
    private playerService: PlayerService,
    private roomService: RoomService,
    private objectService: ObjectService,
    private validator: CommandValidatorService,
  ) {}

  /**
   * Normalize item name for matching - handles hyphens, underscores, and spaces
   */
  private normalizeNameForMatching(name: string): string {
    return name
      .toLowerCase()
      .replace(/[-_]/g, ' ') // Replace hyphens and underscores with spaces
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim();
  }

  /**
   * Check if target matches object name (handles variations like hyphens vs spaces)
   */
  private matchesName(objectName: string, target: string): boolean {
    const normalizedObjectName = this.normalizeNameForMatching(objectName);
    const normalizedTarget = this.normalizeNameForMatching(target);
    return normalizedObjectName.includes(normalizedTarget);
  }

  async handle(
    player: any,
    room: any,
    target: string,
  ): Promise<CommandResult> {
    if (!target) {
      return {
        success: false,
        type: 'error',
        message: 'Drop what?',
      };
    }

    // VALIDATION: Validate item name
    const itemValidation = this.validator.validateItemName(target);
    if (!itemValidation.valid) {
      return {
        success: false,
        type: 'error',
        message: itemValidation.error || 'Invalid item name',
      };
    }

    const inventory = this.playerService.getInventory(player.id);
    const targetObject = inventory.find((obj) =>
      obj.name ? this.matchesName(obj.name, target) : false,
    );

    if (!targetObject) {
      return {
        success: false,
        type: 'action_failure',
        message: `You don't have a ${target}.`,
      };
    }

    // Transaction: Remove from inventory
    const removedFromInventory = this.playerService.removeFromInventory(
      player.id,
      targetObject.id,
    );

    if (!removedFromInventory) {
      return {
        success: false,
        type: 'error',
        message: `Failed to remove ${targetObject.name} from inventory. The item may have already been removed.`,
      };
    }

    // VALIDATION: Validate player position before using it
    const positionValidation = this.validator.validatePosition(
      player.position.x,
      player.position.y,
      player.position.z,
    );
    if (!positionValidation.valid) {
      // Rollback: Add back to inventory
      this.playerService.addToInventory(player.id, targetObject.id);
      return {
        success: false,
        type: 'error',
        message: `Cannot drop item: ${positionValidation.error}`,
      };
    }

    // Transaction: Update object position to room
    const positionUpdated = this.objectService.updateObjectPosition(
      targetObject.id,
      {
        x: player.position.x,
        y: player.position.y,
        z: player.position.z,
      },
    );

    if (!positionUpdated) {
      // Rollback: Add back to inventory since position update failed
      this.playerService.addToInventory(player.id, targetObject.id);
      return {
        success: false,
        type: 'error',
        message: `Failed to drop ${targetObject.name}. The object position could not be updated.`,
      };
    }

    // Transaction: Add to room
    const addedToRoom = this.roomService.addObjectToRoom(
      room.id,
      targetObject.id,
    );

    if (!addedToRoom) {
      // Rollback: Restore to inventory since we couldn't add to room
      // Note: We don't need to undo the position update as it will be corrected
      // when the item is back in inventory
      this.playerService.addToInventory(player.id, targetObject.id);
      return {
        success: false,
        type: 'error',
        message: `Failed to drop ${targetObject.name}. The object could not be placed in the room.`,
      };
    }

    // All operations succeeded - transaction complete
    return {
      success: true,
      type: 'action_success',
      message: `You drop the ${targetObject.name}.`,
    };
  }
}
