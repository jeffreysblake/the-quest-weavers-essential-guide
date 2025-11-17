import { Injectable } from '@nestjs/common';
import { RoomService } from '../entity/room.service';

@Injectable()
export class RoomNavigationHelperService {
  constructor(private roomService: RoomService) {}

  getCurrentRoom(player: any): any {
    // NULL CHECK: Ensure player has a valid position
    if (!player || !player.position) {
      console.error(
        `[RoomNavigationHelper] getCurrentRoom: Player or player.position is null/undefined`,
      );
      return undefined;
    }

    // NULL CHECK: Validate position has required coordinates
    if (
      typeof player.position.x !== 'number' ||
      typeof player.position.y !== 'number' ||
      typeof player.position.z !== 'number'
    ) {
      console.error(
        `[RoomNavigationHelper] getCurrentRoom: Player position is invalid: ${JSON.stringify(player.position)}`,
      );
      return undefined;
    }

    const rooms = this.roomService.getAllRooms();
    return rooms.find((room) => this.isPositionInRoom(player.position, room));
  }

  isPositionInRoom(position: any, room: any): boolean {
    // NULL CHECK: Ensure position is valid
    if (
      !position ||
      typeof position.x !== 'number' ||
      typeof position.y !== 'number' ||
      typeof position.z !== 'number'
    ) {
      return false;
    }

    // NULL CHECK: Ensure room is valid
    if (!room || !room.position || !room.size) {
      return false;
    }

    // NULL CHECK: Ensure room.position has required coordinates
    if (
      typeof room.position.x !== 'number' ||
      typeof room.position.y !== 'number' ||
      typeof room.position.z !== 'number'
    ) {
      return false;
    }

    // NULL CHECK: Ensure room.size has required dimensions
    if (
      typeof room.size.width !== 'number' ||
      typeof room.size.height !== 'number' ||
      typeof room.size.depth !== 'number'
    ) {
      return false;
    }

    return (
      position.x >= room.position.x &&
      position.x < room.position.x + room.size.width &&
      position.y >= room.position.y &&
      position.y < room.position.y + room.size.height &&
      position.z >= room.position.z &&
      position.z < room.position.z + room.size.depth
    );
  }

  getAvailableExits(room: any): string[] {
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

  findAdjacentRoom(currentRoom: any, direction: string): any {
    const rooms = this.roomService.getAllRooms();

    switch (direction) {
      case 'north':
        // Find room directly north (adjacent on the north side)
        return rooms.find(
          (r) =>
            r.position.y === currentRoom.position.y + currentRoom.size.height &&
            r.position.x < currentRoom.position.x + currentRoom.size.width &&
            r.position.x + r.size.width > currentRoom.position.x &&
            r.position.z === currentRoom.position.z,
        );

      case 'south':
        // Find room directly south (adjacent on the south side)
        return rooms.find(
          (r) =>
            r.position.y + r.size.height === currentRoom.position.y &&
            r.position.x < currentRoom.position.x + currentRoom.size.width &&
            r.position.x + r.size.width > currentRoom.position.x &&
            r.position.z === currentRoom.position.z,
        );

      case 'east':
        // Find room directly east (adjacent on the east side)
        return rooms.find(
          (r) =>
            r.position.x === currentRoom.position.x + currentRoom.size.width &&
            r.position.y < currentRoom.position.y + currentRoom.size.height &&
            r.position.y + r.size.height > currentRoom.position.y &&
            r.position.z === currentRoom.position.z,
        );

      case 'west':
        // Find room directly west (adjacent on the west side)
        return rooms.find(
          (r) =>
            r.position.x + r.size.width === currentRoom.position.x &&
            r.position.y < currentRoom.position.y + currentRoom.size.height &&
            r.position.y + r.size.height > currentRoom.position.y &&
            r.position.z === currentRoom.position.z,
        );

      case 'up':
        // Find room directly above (same x,y position, higher z)
        return rooms.find(
          (r) =>
            r.position.x === currentRoom.position.x &&
            r.position.y === currentRoom.position.y &&
            r.position.z === currentRoom.position.z + 1,
        );

      case 'down':
        // Find room directly below (same x,y position, lower z)
        return rooms.find(
          (r) =>
            r.position.x === currentRoom.position.x &&
            r.position.y === currentRoom.position.y &&
            r.position.z === currentRoom.position.z - 1,
        );

      default:
        return null;
    }
  }
}
