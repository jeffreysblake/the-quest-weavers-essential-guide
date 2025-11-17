import { CommandResult } from '../game.service';

export interface ICommandHandler {
  handle(
    player: any,
    room: any,
    target: string,
    gameId?: string,
  ): Promise<CommandResult>;
}
