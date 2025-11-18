import { Injectable } from '@nestjs/common';
import { ICommandHandler } from './command-handler.interface';
import { CommandResult } from '../game.service';
import { PlayerService } from '../../entity/player.service';
import { RoomService } from '../../entity/room.service';
import { CommandValidatorService } from '../command-validator.service';
import { BaseCommandHandler } from './base-command.handler';
import { GameStateService } from '../game-state.service';
import { RoomNavigationHelperService } from '../room-navigation-helper.service';

@Injectable()
export class ExamineCommandHandler extends BaseCommandHandler implements ICommandHandler {
  constructor(
    playerService: PlayerService,
    roomService: RoomService,
    validator: CommandValidatorService,
    private gameStateService: GameStateService,
    private roomNavHelper: RoomNavigationHelperService,
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

    // First, try to find as an object in inventory or room
    const targetObject = this.findObjectInInventoryOrRoom(player, room, target);

    if (targetObject) {
      return {
        success: true,
        type: 'examination',
        message: targetObject.description || `It's a ${targetObject.name}.`,
      };
    }

    // If not found as object, check if it's an NPC in the room
    const gameState = await this.gameStateService.getGameState(player.gameId);
    if (gameState.npcs) {
      const npcsInRoom = Object.values(gameState.npcs).filter((npc: any) => {
        // Only check if NPC is in this room via room.players array
        // Position-based matching is disabled to avoid NPCs appearing in multiple rooms
        if (room.players && room.players.includes(npc.id)) {
          return true;
        }

        return false;
      });

      const targetNpc = npcsInRoom.find((npc: any) =>
        npc.name?.toLowerCase().includes(target.toLowerCase()),
      );

      if (targetNpc) {
        // Build NPC description with inventory hints
        let message = targetNpc.description || `${targetNpc.name} stands before you.`;

        // Add inventory hint if NPC has items
        if (targetNpc.inventory && targetNpc.inventory.length > 0) {
          message += `\n\nYou notice ${targetNpc.name} is carrying some items.`;
        }

        // Add health status if NPC is in combat
        if (targetNpc.health !== undefined) {
          if (targetNpc.health <= 0) {
            message += `\n\n${targetNpc.name} has been defeated.`;
          } else if (targetNpc.health < targetNpc.maxHealth) {
            message += `\n\n${targetNpc.name} appears to be wounded.`;
          }
        }

        return {
          success: true,
          type: 'examination',
          message: message,
        };
      }
    }

    // Not found as object or NPC
    return this.createNotFoundError(target);
  }
}
