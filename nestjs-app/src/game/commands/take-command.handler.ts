import { Injectable } from '@nestjs/common';
import { CommandResult } from '../game.service';
import { PlayerService } from '../../entity/player.service';
import { RoomService } from '../../entity/room.service';
import { CommandValidatorService } from '../command-validator.service';
import { BaseCommandHandler } from './base-command.handler';

@Injectable()
export class TakeCommandHandler extends BaseCommandHandler {
  constructor(
    playerService: PlayerService,
    roomService: RoomService,
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
    const validation = this.validateTarget(target, 'take');
    if (validation) return validation;

    // Find the target object in the room
    const targetObject = this.findObjectInRoom(room, target);

    if (!targetObject) {
      return this.createNotFoundError(target);
    }

    // Check if the object is portable
    // Note: Entity converter ensures all naming conventions (canTake, is_portable, isPortable)
    // are normalized to isPortable, so we only need to check one property
    if (targetObject.isPortable === false) {
      return {
        success: false,
        type: 'action_failure',
        message: `You cannot take the ${targetObject.name}.`,
      };
    }

    // Transaction: Add to player inventory
    const inventoryAdded = this.playerService.addToInventory(
      player.id,
      targetObject.id,
    );

    if (!inventoryAdded) {
      return {
        success: false,
        type: 'error',
        message: `Failed to add ${targetObject.name} to inventory. Your inventory may be full or corrupted.`,
      };
    }

    // Transaction: Remove from room
    const removedFromRoom = this.roomService.removeObjectFromRoom(
      room.id,
      targetObject.id,
    );

    if (!removedFromRoom) {
      // Rollback: Remove from inventory since we couldn't remove from room
      this.playerService.removeFromInventory(player.id, targetObject.id);
      return {
        success: false,
        type: 'error',
        message: `Failed to take ${targetObject.name}. The object could not be removed from the room.`,
      };
    }

    // Both operations succeeded - transaction complete
    return {
      success: true,
      type: 'action_success',
      message: `You take the ${targetObject.name}.`,
    };
  }
}
