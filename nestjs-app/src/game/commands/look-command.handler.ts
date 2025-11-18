import { Injectable } from '@nestjs/common';
import { ICommandHandler } from './command-handler.interface';
import { CommandResult } from '../game.service';
import { RoomService } from '../../entity/room.service';
import { RoomNavigationHelperService } from '../room-navigation-helper.service';
import { ExamineCommandHandler } from './examine-command.handler';
import { GameStateService } from '../game-state.service';

@Injectable()
export class LookCommandHandler implements ICommandHandler {
  constructor(
    private roomService: RoomService,
    private roomNavHelper: RoomNavigationHelperService,
    private examineHandler: ExamineCommandHandler,
    private gameStateService: GameStateService,
  ) {}

  async handle(
    player: any,
    room: any,
    target: string,
  ): Promise<CommandResult> {
    console.log(
      `[DEBUG] handleLook called - player: ${player?.id}, room: ${room?.name}, target: "${target}"`,
    );

    if (!target || target === 'around' || target === 'room') {
      // Look at the room
      const objects = this.roomService.getObjectsInRoom(room.id);
      console.log(`[DEBUG] Found ${objects.length} objects in room ${room.id}`);
      const objectNames = objects.map((obj) => obj.name).filter(Boolean);
      console.log(`[DEBUG] Object names: ${objectNames.join(', ')}`);

      const exits = this.roomNavHelper.getAvailableExits(room);
      console.log(`[DEBUG] Available exits: ${exits.join(', ')}`);

      // Get NPCs in the room (filter out defeated NPCs)
      const gameState = await this.gameStateService.getGameState(player.gameId);
      const npcsInRoom: string[] = [];

      if (gameState.npcs) {
        Object.values(gameState.npcs).forEach((npc: any) => {
          // Skip defeated NPCs (health <= 0)
          if (npc.health !== undefined && npc.health <= 0) {
            return;
          }

          // Only check if NPC is in this room via room.players array
          // Position-based matching is disabled to avoid NPCs appearing in multiple rooms
          if (room.players && room.players.includes(npc.id)) {
            npcsInRoom.push(npc.name);
          }
        });
      }

      console.log(`[DEBUG] NPCs in room: ${npcsInRoom.join(', ')}`);

      const result = {
        success: true,
        type: 'room_description',
        roomDescription: room.description,
        items: objectNames,
        npcs: npcsInRoom,
        exits: exits,
        playerStatus: {
          location: room.name,
        },
      };

      console.log(
        `[DEBUG] Returning look result:`,
        JSON.stringify(result, null, 2),
      );
      return result;
    } else {
      // Look at specific object
      console.log(`[DEBUG] Looking at specific object: ${target}`);
      return await this.examineHandler.handle(player, room, target);
    }
  }
}
