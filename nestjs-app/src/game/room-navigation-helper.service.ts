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

    // Filter rooms by player's gameId to avoid cross-game contamination
    const rooms = player.gameId
      ? this.roomService.getAllRooms().filter(room => room.gameId === player.gameId)
      : this.roomService.getAllRooms();

    // Find all rooms containing the player
    const matchingRooms = rooms.filter((room) => this.isPositionInRoom(player.position, room));

    // If multiple rooms match, prefer the smallest one (most specific location)
    if (matchingRooms.length > 1) {
      return matchingRooms.reduce((smallest, room) => {
        const roomVolume = room.size.width * room.size.height * room.size.depth;
        const smallestVolume = smallest.size.width * smallest.size.height * smallest.size.depth;
        return roomVolume < smallestVolume ? room : smallest;
      });
    }

    return matchingRooms[0];
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
    // Use room's connections if available (from game data files)
    if (room.connections && typeof room.connections === 'object') {
      return Object.keys(room.connections);
    }

    // Fallback to position-based detection
    const exits: string[] = [];

    // Filter rooms by gameId if available
    const rooms = room.gameId
      ? this.roomService.getAllRooms().filter(r => r.gameId === room.gameId)
      : this.roomService.getAllRooms();

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

    // Return actual exits found, or empty array if none (remove default fallback)
    return exits;
  }

  findAdjacentRoom(currentRoom: any, direction: string): any {
    // Use room's connections if available (from game data files)
    if (currentRoom.connections && currentRoom.connections[direction]) {
      const roomId = currentRoom.connections[direction];
      const targetRoom = this.roomService.getRoom(roomId);

      if (targetRoom) {
        console.log(
          `[RoomNav] Using connection: ${currentRoom.name} --${direction}--> ${targetRoom.name}`,
        );
        return targetRoom;
      } else {
        console.warn(
          `[RoomNav] Connection exists but target room ${roomId} not found for ${currentRoom.name} --${direction}-->`,
        );
      }
    } else {
      console.log(
        `[RoomNav] No connection found for ${currentRoom.name} --${direction}-->, using position-based fallback. Connections: ${JSON.stringify(Object.keys(currentRoom.connections || {}))}`,
      );
    }

    // Fallback to position-based detection
    // Filter rooms by gameId if available
    const rooms = currentRoom.gameId
      ? this.roomService.getAllRooms().filter(r => r.gameId === currentRoom.gameId)
      : this.roomService.getAllRooms();

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
