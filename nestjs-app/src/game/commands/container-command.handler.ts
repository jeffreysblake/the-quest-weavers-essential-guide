import { Injectable } from '@nestjs/common';
import { ICommandHandler } from './command-handler.interface';
import { CommandResult } from '../game.service';
import { CommandValidatorService } from '../command-validator.service';

@Injectable()
export class OpenCommandHandler implements ICommandHandler {
  constructor(private validator: CommandValidatorService) {}

  async handle(
    player: any,
    room: any,
    target: string,
  ): Promise<CommandResult> {
    if (!target) {
      return {
        success: false,
        type: 'error',
        message: 'Open what?',
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

    return {
      success: true,
      type: 'action_result',
      message: `You attempt to open the ${target}. It appears to be locked or stuck.`,
    };
  }
}

@Injectable()
export class CloseCommandHandler implements ICommandHandler {
  constructor(private validator: CommandValidatorService) {}

  async handle(
    player: any,
    room: any,
    target: string,
  ): Promise<CommandResult> {
    if (!target) {
      return {
        success: false,
        type: 'error',
        message: 'Close what?',
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

    return {
      success: true,
      type: 'action_result',
      message: `You close the ${target}.`,
    };
  }
}
