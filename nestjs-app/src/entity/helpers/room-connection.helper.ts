import { Injectable, Logger } from '@nestjs/common';
import { IRoom } from '../room.interface';

/**
 * Room Connection Helper
 * Handles room connectivity and spatial calculations including:
 * - Connecting rooms with bidirectional links
 * - Calculating distances between positions
 * - Reverse direction mapping
 */
@Injectable()
export class RoomConnectionHelper {
  private readonly logger = new Logger(RoomConnectionHelper.name);

  // Reverse direction mapping
  private readonly reverseDirections: { [key: string]: string } = {
    north: 'south',
    south: 'north',
    east: 'west',
    west: 'east',
    up: 'down',
    down: 'up',
  };

  /**
   * Connect two rooms bidirectionally
   */
  connectRooms(
    room1: IRoom,
    room2: IRoom,
    direction: string,
  ): boolean {
    // Initialize connections if they don't exist
    if (!room1.connections) {
      room1.connections = {};
    }
    if (!room2.connections) {
      room2.connections = {};
    }

    // Add forward connection
    room1.connections[direction] = room2.id;

    // Add reverse direction mapping
    const reverseDirection = this.reverseDirections[direction];
    if (reverseDirection) {
      room2.connections[reverseDirection] = room1.id;
    }

    return true;
  }

  /**
   * Calculate 3D Euclidean distance between two positions
   */
  calculateDistance(
    pos1: { x: number; y: number; z: number },
    pos2: { x: number; y: number; z: number },
  ): number {
    // Validate inputs
    if (!pos1 || !pos2) {
      this.logger.warn('Invalid positions provided to calculateDistance');
      return 0;
    }

    // Ensure positions have valid numeric coordinates
    const x1 = typeof pos1.x === 'number' ? pos1.x : 0;
    const y1 = typeof pos1.y === 'number' ? pos1.y : 0;
    const z1 = typeof pos1.z === 'number' ? pos1.z : 0;

    const x2 = typeof pos2.x === 'number' ? pos2.x : 0;
    const y2 = typeof pos2.y === 'number' ? pos2.y : 0;
    const z2 = typeof pos2.z === 'number' ? pos2.z : 0;

    // Calculate Euclidean distance: sqrt((x2-x1)² + (y2-y1)² + (z2-z1)²)
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;

    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    return distance;
  }

  /**
   * Get the reverse direction for a given direction
   */
  getReverseDirection(direction: string): string | undefined {
    return this.reverseDirections[direction];
  }
}
