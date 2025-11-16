import { Injectable } from '@nestjs/common';
import { CommandResult } from './game.service';
import { CommandValidatorService } from './command-validator.service';
import { RoomNavigationHelperService } from './room-navigation-helper.service';
import { PlayerService } from '../entity/player.service';

// Command handlers
import { LookCommandHandler } from './commands/look-command.handler';
import { MovementCommandHandler } from './commands/movement-command.handler';
import { TakeCommandHandler } from './commands/take-command.handler';
import { DropCommandHandler } from './commands/drop-command.handler';
import { ExamineCommandHandler } from './commands/examine-command.handler';
import { UseCommandHandler } from './commands/use-command.handler';
import { OpenCommandHandler, CloseCommandHandler } from './commands/container-command.handler';
import { DialogueCommandHandler } from './commands/dialogue-command.handler';
import { AttackCommandHandler } from './commands/attack-command.handler';
import { CastCommandHandler } from './commands/cast-command.handler';

@Injectable()
export class CommandProcessorService {
  constructor(
    private playerService: PlayerService,
    private validator: CommandValidatorService,
    private roomNavHelper: RoomNavigationHelperService,
    private lookHandler: LookCommandHandler,
    private movementHandler: MovementCommandHandler,
    private takeHandler: TakeCommandHandler,
    private dropHandler: DropCommandHandler,
    private examineHandler: ExamineCommandHandler,
    private useHandler: UseCommandHandler,
    private openHandler: OpenCommandHandler,
    private closeHandler: CloseCommandHandler,
    private dialogueHandler: DialogueCommandHandler,
    private attackHandler: AttackCommandHandler,
    private castHandler: CastCommandHandler,
  ) {}

  async processCommand(
    command: string,
    playerId: string,
    gameId: string,
  ): Promise<CommandResult> {
    console.log(
      `[DEBUG] processCommand called - command: "${command}", playerId: ${playerId}, gameId: ${gameId}`,
    );

    // VALIDATION: Validate and sanitize command string at entry point
    const commandValidation = this.validator.validateCommandString(command);
    if (!commandValidation.valid) {
      return {
        success: false,
        type: 'error',
        message: commandValidation.error || 'Invalid command',
      };
    }

    // Use sanitized command
    const normalizedCommand = commandValidation.sanitized!.toLowerCase();
    const parts = normalizedCommand.split(' ');
    const verb = parts[0];
    const target = parts.slice(1).join(' ');

    console.log(
      `[DEBUG] Parsed command - verb: "${verb}", target: "${target}"`,
    );

    const player = this.playerService.getPlayer(playerId);
    if (!player) {
      console.log(`[DEBUG] Player not found: ${playerId}`);
      return {
        success: false,
        type: 'error',
        message: 'Player not found',
      };
    }

    console.log(
      `[DEBUG] Player found - position: (${player.position.x}, ${player.position.y}, ${player.position.z})`,
    );

    // Get current room
    const currentRoom = this.roomNavHelper.getCurrentRoom(player);
    if (!currentRoom) {
      console.log(`[DEBUG] Current room not found for player position`);
      return {
        success: false,
        type: 'error',
        message: 'Current location not found',
      };
    }

    console.log(
      `[DEBUG] Current room: ${currentRoom.name} at (${currentRoom.position.x}, ${currentRoom.position.y}, ${currentRoom.position.z})`,
    );

    try {
      console.log(`[DEBUG] Processing verb: "${verb}"`);
      switch (verb) {
        case 'look':
        case 'l':
          console.log(`[DEBUG] Handling look command`);
          return await this.lookHandler.handle(player, currentRoom, target);

        case 'go':
        case 'move':
        case 'north':
        case 'south':
        case 'east':
        case 'west':
        case 'up':
        case 'down':
          return await this.movementHandler.handle(
            player,
            currentRoom,
            verb === 'go' || verb === 'move' ? target : verb,
          );

        case 'take':
        case 'get':
        case 'pick':
          return await this.takeHandler.handle(player, currentRoom, target);

        case 'drop':
        case 'put':
          return await this.dropHandler.handle(player, currentRoom, target);

        case 'use':
          return await this.useHandler.handle(player, currentRoom, target);

        case 'examine':
        case 'inspect':
          return await this.examineHandler.handle(player, currentRoom, target);

        case 'open':
          return await this.openHandler.handle(player, currentRoom, target);

        case 'close':
          return await this.closeHandler.handle(player, currentRoom, target);

        case 'talk':
        case 'speak':
          return await this.dialogueHandler.handle(
            player,
            currentRoom,
            target,
            gameId,
          );

        case 'attack':
        case 'fight':
          return await this.attackHandler.handle(player, currentRoom, target);

        case 'cast':
          return await this.castHandler.handle(player, currentRoom, target);

        default:
          return {
            success: false,
            type: 'error',
            message: `I don't understand the command "${verb}". Type "help" for available commands.`,
          };
      }
    } catch (error) {
      return {
        success: false,
        type: 'error',
        message: `Command processing failed: ${error.message}`,
      };
    }
  }
}
