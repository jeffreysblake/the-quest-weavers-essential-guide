import { Injectable } from '@nestjs/common';
import { ICommandHandler } from './command-handler.interface';
import { CommandResult } from '../game.service';
import { PlayerService } from '../../entity/player.service';
import { RoomService } from '../../entity/room.service';
import { CommandValidatorService } from '../command-validator.service';
import { BaseCommandHandler } from './base-command.handler';

@Injectable()
export class ExamineCommandHandler extends BaseCommandHandler implements ICommandHandler {
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
    // Validate target using base class method
    const validation = this.validateTarget(target, 'examine');
    if (validation) return validation;

    // Find object in inventory or room using base class method
    const targetObject = this.findObjectInInventoryOrRoom(player, room, target);

    if (!targetObject) {
      return this.createNotFoundError(target);
    }

    return {
      success: true,
      type: 'examination',
      message: targetObject.description || `It's a ${targetObject.name}.`,
    };
  }
}
