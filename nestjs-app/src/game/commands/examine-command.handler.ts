import { Injectable } from '@nestjs/common';
import { ICommandHandler } from './command-handler.interface';
import { CommandResult } from '../game.service';
import { PlayerService } from '../../entity/player.service';
import { RoomService } from '../../entity/room.service';
import { CommandValidatorService } from '../command-validator.service';

@Injectable()
export class ExamineCommandHandler implements ICommandHandler {
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
        message: 'Examine what?',
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

    // Check inventory first
    const inventory = this.playerService.getInventory(player.id);
    let targetObject = inventory.find((obj) =>
      obj.name?.toLowerCase().includes(target.toLowerCase()),
    );

    // If not in inventory, check room objects
    if (!targetObject) {
      const objects = this.roomService.getObjectsInRoom(room.id);
      targetObject = objects.find((obj) =>
        obj.name?.toLowerCase().includes(target.toLowerCase()),
      );
    }

    if (!targetObject) {
      return {
        success: false,
        type: 'action_failure',
        message: `You don't see a ${target} here.`,
      };
    }

    return {
      success: true,
      type: 'examination',
      message: targetObject.description || `It's a ${targetObject.name}.`,
    };
  }
}
