import { Injectable } from '@nestjs/common';
import { ICommandHandler } from './command-handler.interface';
import { CommandResult } from '../game.service';
import { PlayerService } from '../../entity/player.service';
import { RoomService } from '../../entity/room.service';
import { CommandValidatorService } from '../command-validator.service';
import { RoomNavigationHelperService } from '../room-navigation-helper.service';
import { GameStateService } from '../game-state.service';

@Injectable()
export class MovementCommandHandler implements ICommandHandler {
  constructor(
    private playerService: PlayerService,
    private roomService: RoomService,
    private validator: CommandValidatorService,
    private roomNavHelper: RoomNavigationHelperService,
    private gameStateService: GameStateService,
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

    // Map shorthand directions to full names
    const directionMap: { [key: string]: string } = {
      'n': 'north',
      's': 'south',
      'e': 'east',
      'w': 'west',
      'north': 'north',
      'south': 'south',
      'east': 'east',
      'west': 'west',
      'up': 'up',
      'down': 'down',
    };

    const mappedDirection = directionMap[normalizedDirection];
    if (!mappedDirection) {
      return {
        success: false,
        type: 'error',
        message: `I don't understand the direction "${direction}". Valid directions are: north, south, east, west, up, down (or n, s, e, w).`,
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
      mappedDirection,
    );

    if (!targetRoom) {
      return {
        success: false,
        type: 'movement_blocked',
        message: `You cannot go ${mappedDirection} from here.`,
      };
    }

    // Check if room is locked and requires a specific item
    if ((targetRoom as any).locked && (targetRoom as any).requiredItem) {
      const requiredItemId = (targetRoom as any).requiredItem;
      const playerInventory = this.playerService.getInventory(player.id);
      const hasRequiredItem = playerInventory.some(item => item.id === requiredItemId);

      if (!hasRequiredItem) {
        return {
          success: false,
          type: 'movement_blocked',
          message: `The door to the ${targetRoom.name} is locked. You need the ${requiredItemId.replace(/-/g, ' ')} to enter.`,
        };
      }
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

    // Get NPCs in the new room (filter out defeated NPCs)
    const gameState = await this.gameStateService.getGameState(player.gameId);
    const npcsInRoom: string[] = [];

    if (gameState.npcs) {
      Object.values(gameState.npcs).forEach((npc: any) => {
        // Skip defeated NPCs (health <= 0)
        if (npc.health !== undefined && npc.health <= 0) {
          return;
        }

        // Only check if NPC is in this room via room.players array
        if (targetRoom.players && targetRoom.players.includes(npc.id)) {
          npcsInRoom.push(npc.name);
        }
      });
    }

    return {
      success: true,
      type: 'movement_success',
      message: `You move ${mappedDirection}.`,
      roomDescription: targetRoom.description,
      items: objectNames,
      npcs: npcsInRoom,
      exits: this.roomNavHelper.getAvailableExits(targetRoom),
      playerStatus: {
        location: targetRoom.name,
      },
    };
  }
}
