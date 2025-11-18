import { Injectable } from '@nestjs/common';
import { CommandResult } from '../game.service';
import { PlayerService } from '../../entity/player.service';
import { RoomService } from '../../entity/room.service';
import { ObjectService } from '../../entity/object.service';
import { CommandValidatorService } from '../command-validator.service';
import { BaseCommandHandler } from './base-command.handler';

@Injectable()
export class DropCommandHandler extends BaseCommandHandler {
  constructor(
    playerService: PlayerService,
    roomService: RoomService,
    private objectService: ObjectService,
    validator: CommandValidatorService,
  ) {
    super(playerService, roomService, validator);
  }

  async handle(
    player: any,
    room: any,
    target: string,
  ): Promise<CommandResult> {
    // VALIDATION: Validate target and item name
    const validation = this.validateTarget(target, 'drop');
    if (validation) return validation;

    // Find object in player's inventory
    const targetObject = this.findObjectInInventory(player, target);

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
