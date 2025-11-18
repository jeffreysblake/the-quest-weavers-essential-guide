import { Injectable } from '@nestjs/common';
import { ICommandHandler } from './command-handler.interface';
import { CommandResult } from '../game.service';
import { PlayerService } from '../../entity/player.service';
import { RoomService } from '../../entity/room.service';
import { CommandValidatorService } from '../command-validator.service';

@Injectable()
export class TakeCommandHandler implements ICommandHandler {
  constructor(
    private playerService: PlayerService,
    private roomService: RoomService,
    private validator: CommandValidatorService,
  ) {}

  async handle(
    player: any,
    room: any,
    target: string,
  ): Promise<CommandResult> {
    if (!target) {
      return {
        success: false,
        type: 'error',
        message: 'Take what?',
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

    const objects = this.roomService.getObjectsInRoom(room.id);
    const targetObject = objects.find((obj) =>
      obj.name?.toLowerCase().includes(target.toLowerCase()),
    );

    if (!targetObject) {
      return {
        success: false,
        type: 'action_failure',
        message: `You don't see a ${target} here.`,
      };
    }

    // Check if the object is portable (check both canTake and is_portable for compatibility)
    if (targetObject.canTake === false || targetObject.is_portable === false) {
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
