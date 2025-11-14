import { Injectable } from '@nestjs/common';
import { PlayerService } from '../entity/player.service';
import { RoomService } from '../entity/room.service';
import { ObjectService } from '../entity/object.service';
import { EntityService } from '../entity/entity.service';
import { CommandResult } from './game.service';

@Injectable()
export class CommandProcessorService {
  constructor(
    private playerService: PlayerService,
    private roomService: RoomService,
    private objectService: ObjectService,
    private entityService: EntityService,
  ) {}

  async processCommand(
    command: string,
    playerId: string,
    gameId: string,
  ): Promise<CommandResult> {
    console.log(
      `[DEBUG] processCommand called - command: "${command}", playerId: ${playerId}, gameId: ${gameId}`,
    );

    const normalizedCommand = command.toLowerCase().trim();
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
    const currentRoom = this.getCurrentRoom(player);
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
          return await this.handleLook(player, currentRoom, target);

        case 'go':
        case 'move':
        case 'north':
        case 'south':
        case 'east':
        case 'west':
        case 'up':
        case 'down':
          return await this.handleMovement(
            player,
            verb === 'go' || verb === 'move' ? target : verb,
          );

        case 'take':
        case 'get':
        case 'pick':
          return await this.handleTake(player, currentRoom, target);

        case 'drop':
        case 'put':
          return await this.handleDrop(player, currentRoom, target);

        case 'use':
          return await this.handleUse(player, currentRoom, target);

        case 'examine':
        case 'inspect':
          return await this.handleExamine(player, currentRoom, target);

        case 'open':
          return await this.handleOpen(player, currentRoom, target);

        case 'close':
          return await this.handleClose(player, currentRoom, target);

        case 'talk':
        case 'speak':
          return await this.handleTalk(player, currentRoom, target);

        case 'attack':
        case 'fight':
          return await this.handleAttack(player, currentRoom, target);

        case 'cast':
          return await this.handleCast(player, currentRoom, target);

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

  private async handleLook(
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

      const exits = this.getAvailableExits(room);
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
      return await this.handleExamine(player, room, target);
    }
  }

  private async handleMovement(
    player: any,
    direction: string,
  ): Promise<CommandResult> {
    const currentRoom = this.getCurrentRoom(player);
    if (!currentRoom) {
      return {
        success: false,
        type: 'error',
        message: 'Cannot determine current location',
      };
    }

    // Simple movement - adjust player position based on direction
    // Rooms are spaced with 5-unit gaps: Entry Hall (0,0,0), Garden (0,15,0), Library (15,0,0)
    const newPosition = { ...player.position };

    switch (direction.toLowerCase()) {
      case 'north':
        newPosition.y += 15; // Move to next room north
        break;
      case 'south':
        newPosition.y -= 15; // Move to next room south
        break;
      case 'east':
        newPosition.x += 15; // Move to next room east
        break;
      case 'west':
        newPosition.x -= 15; // Move to next room west
        break;
      case 'up':
        newPosition.z += 1;
        break;
      case 'down':
        newPosition.z -= 1;
        break;
      default:
        return {
          success: false,
          type: 'error',
          message: `I don't understand the direction "${direction}"`,
        };
    }

    // Check if there's a room at the new position
    const rooms = this.roomService.getAllRooms();
    const targetRoom = rooms.find((room) =>
      this.isPositionInRoom(newPosition, room),
    );

    if (!targetRoom) {
      return {
        success: false,
        type: 'movement_blocked',
        message: `You cannot go ${direction} from here.`,
      };
    }

    // Move player
    this.playerService.movePlayer(player.id, newPosition);

    // Get objects in new room
    const objects = this.roomService.getObjectsInRoom(targetRoom.id);
    const objectNames = objects.map((obj) => obj.name).filter(Boolean);

    return {
      success: true,
      type: 'movement_success',
      message: `You move ${direction}.`,
      roomDescription: targetRoom.description,
      items: objectNames,
      exits: this.getAvailableExits(targetRoom),
      playerStatus: {
        location: targetRoom.name,
      },
    };
  }

  private async handleTake(
    player: any,
    room: any,
    target: string,
  ): Promise<CommandResult> {
    if (!target) {
      return {
        success: false,
        type: 'error',
        message: 'Take what?',
      };
    }

    const objects = this.roomService.getObjectsInRoom(room.id);
    const targetObject = objects.find((obj) =>
      obj.name?.toLowerCase().includes(target.toLowerCase()),
    );

    if (!targetObject) {
      return {
        success: false,
        type: 'action_failure',
        message: `You don't see a ${target} here.`,
      };
    }

    if (targetObject.canTake === false) {
      return {
        success: false,
        type: 'action_failure',
        message: `You cannot take the ${targetObject.name}.`,
      };
    }

    // Add to player inventory
    this.playerService.addToInventory(player.id, targetObject.id);

    // Remove from room
    this.roomService.removeObjectFromRoom(room.id, targetObject.id);

    return {
      success: true,
      type: 'action_success',
      message: `You take the ${targetObject.name}.`,
    };
  }

  private async handleDrop(
    player: any,
    room: any,
    target: string,
  ): Promise<CommandResult> {
    if (!target) {
      return {
        success: false,
        type: 'error',
        message: 'Drop what?',
      };
    }

    const inventory = this.playerService.getInventory(player.id);
    const targetObject = inventory.find((obj) =>
      obj.name?.toLowerCase().includes(target.toLowerCase()),
    );

    if (!targetObject) {
      return {
        success: false,
        type: 'action_failure',
        message: `You don't have a ${target}.`,
      };
    }

    // Remove from inventory
    this.playerService.removeFromInventory(player.id, targetObject.id);

    // Add to room (update object position to room)
    this.objectService.updateObjectPosition(targetObject.id, {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
    });
    this.roomService.addObjectToRoom(room.id, targetObject.id);

    return {
      success: true,
      type: 'action_success',
      message: `You drop the ${targetObject.name}.`,
    };
  }

  private async handleExamine(
    player: any,
    room: any,
    target: string,
  ): Promise<CommandResult> {
    if (!target) {
      return {
        success: false,
        type: 'error',
        message: 'Examine what?',
      };
    }

    // Check inventory first
    const inventory = this.playerService.getInventory(player.id);
    let targetObject = inventory.find((obj) =>
      obj.name?.toLowerCase().includes(target.toLowerCase()),
    );

    // If not in inventory, check room objects
    if (!targetObject) {
      const objects = this.roomService.getObjectsInRoom(room.id);
      targetObject = objects.find((obj) =>
        obj.name?.toLowerCase().includes(target.toLowerCase()),
      );
    }

    if (!targetObject) {
      return {
        success: false,
        type: 'action_failure',
        message: `You don't see a ${target} here.`,
      };
    }

    return {
      success: true,
      type: 'examination',
      message: targetObject.description || `It's a ${targetObject.name}.`,
    };
  }

  private async handleUse(
    player: any,
    room: any,
    target: string,
  ): Promise<CommandResult> {
    // Simple use implementation
    return {
      success: true,
      type: 'action_result',
      message: `You attempt to use the ${target}. Nothing obvious happens.`,
    };
  }

  private async handleOpen(
    player: any,
    room: any,
    target: string,
  ): Promise<CommandResult> {
    return {
      success: true,
      type: 'action_result',
      message: `You attempt to open the ${target}. It appears to be locked or stuck.`,
    };
  }

  private async handleClose(
    player: any,
    room: any,
    target: string,
  ): Promise<CommandResult> {
    return {
      success: true,
      type: 'action_result',
      message: `You close the ${target}.`,
    };
  }

  private async handleTalk(
    player: any,
    room: any,
    target: string,
  ): Promise<CommandResult> {
    return {
      success: true,
      type: 'dialogue',
      message: `You speak to the ${target}.`,
      dialogue: {
        npcName: target,
        text: "Hello, traveler. I don't have much to say right now.",
        choices: ['Goodbye'],
      },
    };
  }

  private async handleAttack(
    player: any,
    room: any,
    target: string,
  ): Promise<CommandResult> {
    return {
      success: true,
      type: 'combat',
      message: `You attack the ${target}! The battle rages...`,
    };
  }

  private async handleCast(
    player: any,
    room: any,
    target: string,
  ): Promise<CommandResult> {
    return {
      success: true,
      type: 'magic',
      message: `You cast a spell! Magical energies swirl around you...`,
    };
  }

  // Helper methods
  private getCurrentRoom(player: any): any {
    const rooms = this.roomService.getAllRooms();
    return rooms.find((room) => this.isPositionInRoom(player.position, room));
  }

  private isPositionInRoom(position: any, room: any): boolean {
    return (
      position.x >= room.position.x &&
      position.x < room.position.x + room.size.width &&
      position.y >= room.position.y &&
      position.y < room.position.y + room.size.height &&
      position.z >= room.position.z &&
      position.z < room.position.z + room.size.depth
    );
  }

  private getAvailableExits(room: any): string[] {
    // Simple exit detection based on room boundaries
    // In a real implementation, this would be more sophisticated
    const exits: string[] = [];

    // Check for adjacent rooms (simplified)
    const rooms = this.roomService.getAllRooms();

    // North
    if (
      rooms.some((r) => r.position.y === room.position.y + room.size.height)
    ) {
      exits.push('north');
    }
    // South
    if (rooms.some((r) => r.position.y + r.size.height === room.position.y)) {
      exits.push('south');
    }
    // East
    if (rooms.some((r) => r.position.x === room.position.x + room.size.width)) {
      exits.push('east');
    }
    // West
    if (rooms.some((r) => r.position.x + r.size.width === room.position.x)) {
      exits.push('west');
    }

    return exits.length > 0 ? exits : ['north', 'east']; // Default exits for demo
  }
}
