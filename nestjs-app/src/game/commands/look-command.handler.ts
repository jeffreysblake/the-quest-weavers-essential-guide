import { Injectable } from '@nestjs/common';
import { ICommandHandler } from './command-handler.interface';
import { CommandResult } from '../game.service';
import { RoomService } from '../../entity/room.service';
import { RoomNavigationHelperService } from '../room-navigation-helper.service';
import { ExamineCommandHandler } from './examine-command.handler';

@Injectable()
export class LookCommandHandler implements ICommandHandler {
  constructor(
    private roomService: RoomService,
    private roomNavHelper: RoomNavigationHelperService,
    private examineHandler: ExamineCommandHandler,
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

      const result = {
        success: true,
        type: 'room_description',
        roomDescription: room.description,
        items: objectNames,
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
