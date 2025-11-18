import { Injectable } from '@nestjs/common';
import { ICommandHandler } from './command-handler.interface';
import { CommandResult } from '../game.service';
import { GameStateService } from '../game-state.service';

@Injectable()
export class SaveCommandHandler implements ICommandHandler {
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
        message: 'Cannot save: game ID not found.',
      };
    }

    // Use target as slot name, or default to 'quicksave'
    const slotName = target || 'quicksave';

    try {
      await this.gameStateService.saveGameState(player.gameId, slotName);
      return {
        success: true,
        type: 'action_success',
        message: `Game saved to slot: ${slotName}`,
      };
    } catch (error) {
      return {
        success: false,
        type: 'error',
        message: `Save failed: ${error.message}`,
      };
    }
  }
}
