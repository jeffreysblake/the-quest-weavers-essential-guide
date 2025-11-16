import { Injectable } from '@nestjs/common';
import { ICommandHandler } from './command-handler.interface';
import { CommandResult } from '../game.service';
import { PlayerService } from '../../entity/player.service';
import { RoomService } from '../../entity/room.service';
import { CommandValidatorService } from '../command-validator.service';
import { RoomNavigationHelperService } from '../room-navigation-helper.service';

@Injectable()
export class MovementCommandHandler implements ICommandHandler {
  constructor(
    private playerService: PlayerService,
    private roomService: RoomService,
    private validator: CommandValidatorService,
    private roomNavHelper: RoomNavigationHelperService,
  ) {}

  async handle(
    player: any,
    room: any,
    direction: string,
  ): Promise<CommandResult> {
    // Validate direction parameter
    if (!direction || typeof direction !== 'string') {
      return {
        success: false,
        type: 'error',
        message: 'Invalid direction specified',
      };
    }

    const normalizedDirection = direction.toLowerCase().trim();
    const validDirections = ['north', 'south', 'east', 'west', 'up', 'down'];

    if (!validDirections.includes(normalizedDirection)) {
      return {
        success: false,
        type: 'error',
        message: `I don't understand the direction "${direction}". Valid directions are: ${validDirections.join(', ')}.`,
      };
    }

    const currentRoom = this.roomNavHelper.getCurrentRoom(player);
    if (!currentRoom) {
      return {
        success: false,
        type: 'error',
        message: 'Cannot determine current location',
      };
    }

    // Find the adjacent room in the specified direction
    const targetRoom = this.roomNavHelper.findAdjacentRoom(
      currentRoom,
      normalizedDirection,
    );

    if (!targetRoom) {
      return {
        success: false,
        type: 'movement_blocked',
        message: `You cannot go ${normalizedDirection} from here.`,
      };
    }

    // Calculate new position - move player to the center of the target room
    const newPosition = {
      x: targetRoom.position.x + Math.floor(targetRoom.size.width / 2),
      y: targetRoom.position.y + Math.floor(targetRoom.size.height / 2),
      z: targetRoom.position.z,
    };

    // VALIDATION: Validate new position before moving
    const positionValidation = this.validator.validatePosition(
      newPosition.x,
      newPosition.y,
      newPosition.z,
    );
    if (!positionValidation.valid) {
      return {
        success: false,
        type: 'error',
        message: `Cannot move to that location: ${positionValidation.error}`,
      };
    }

    // Move player to the new position
    this.playerService.movePlayer(player.id, newPosition);

    // Get objects in new room
    const objects = this.roomService.getObjectsInRoom(targetRoom.id);
    const objectNames = objects.map((obj) => obj.name).filter(Boolean);

    return {
      success: true,
      type: 'movement_success',
      message: `You move ${normalizedDirection}.`,
      roomDescription: targetRoom.description,
      items: objectNames,
      exits: this.roomNavHelper.getAvailableExits(targetRoom),
      playerStatus: {
        location: targetRoom.name,
      },
    };
  }
}
