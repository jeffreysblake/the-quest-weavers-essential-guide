import { Injectable } from '@nestjs/common';
import { ICommandHandler } from './command-handler.interface';
import { CommandResult } from '../game.service';
import { GameStateService } from '../game-state.service';

@Injectable()
export class LoadCommandHandler implements ICommandHandler {
  constructor(private gameStateService: GameStateService) {}

  async handle(
    player: any,
    room: any,
    target?: string,
  ): Promise<CommandResult> {
    if (!player.gameId) {
      return {
        success: false,
        type: 'error',
        message: 'Cannot load: game ID not found.',
      };
    }

    // Use target as slot name, or default to 'quicksave'
    const slotName = target || 'quicksave';

    try {
      await this.gameStateService.loadGameState(player.gameId, slotName);
      return {
        success: true,
        type: 'action_success',
        message: `Game loaded from slot: ${slotName}`,
      };
    } catch (error) {
      return {
        success: false,
        type: 'error',
        message: `Load failed: ${error.message}`,
      };
    }
  }
}
