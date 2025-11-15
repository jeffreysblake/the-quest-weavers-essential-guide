import { Injectable, Logger } from '@nestjs/common';
import { FileScannerService } from '../file-system/file-scanner.service';
import * as fs from 'fs';
import * as path from 'path';

export interface GameLogicValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  stats?: {
    roomCount: number;
    objectCount: number;
    npcCount: number;
    connectionCount: number;
    orphanedConnections: number;
    unreachableRooms: number;
    duplicateIds: number;
  };
}

interface GameEntity {
  id: string;
  type: 'room' | 'object' | 'npc';
  data: any;
}

interface Connection {
  from_room: string;
  to_room: string;
  direction: string;
}

@Injectable()
export class GameLogicValidatorService {
  private readonly logger = new Logger(GameLogicValidatorService.name);

  constructor(private readonly fileScannerService: FileScannerService) {}

  /**
   * Validate game logic for a game directory
   */
  async validateGameLogic(gameId: string): Promise<GameLogicValidationResult> {
    this.logger.log(`Validating game logic for ${gameId}`);

    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const gameDir = `${this.fileScannerService.getGamesDirectory()}/${gameId}`;

      // Load all entities
      const rooms = await this.loadEntities(gameDir, 'rooms');
      const objects = await this.loadEntities(gameDir, 'objects');
      const npcs = await this.loadEntities(gameDir, 'npcs');
      const connections = await this.loadConnections(gameDir);

      // Load game config
      const gameConfig = await this.loadGameConfig(gameDir);

      // Create ID sets for quick lookup
      const roomIds = new Set(rooms.map((r) => r.id));
      const objectIds = new Set(objects.map((o) => o.id));
      const npcIds = new Set(npcs.map((n) => n.id));

      // 1. Check for duplicate IDs within each entity type
      const duplicateRooms = this.findDuplicateIds(rooms);
      const duplicateObjects = this.findDuplicateIds(objects);
      const duplicateNPCs = this.findDuplicateIds(npcs);

      if (duplicateRooms.length > 0) {
        duplicateRooms.forEach((id) => {
          errors.push(`Duplicate room ID found: ${id}`);
        });
      }

      if (duplicateObjects.length > 0) {
        duplicateObjects.forEach((id) => {
          errors.push(`Duplicate object ID found: ${id}`);
        });
      }

      if (duplicateNPCs.length > 0) {
        duplicateNPCs.forEach((id) => {
          errors.push(`Duplicate NPC ID found: ${id}`);
        });
      }

      // 2. Check for orphaned connections (connections to non-existent rooms)
      let orphanedCount = 0;
      connections.forEach((conn, index) => {
        if (!roomIds.has(conn.from_room)) {
          errors.push(
            `Orphaned connection #${index + 1}: from_room '${conn.from_room}' does not exist`,
          );
          orphanedCount++;
        }
        if (!roomIds.has(conn.to_room)) {
          errors.push(
            `Orphaned connection #${index + 1}: to_room '${conn.to_room}' does not exist`,
          );
          orphanedCount++;
        }
      });

      // 3. Check for unreachable rooms
      const startingRoom = gameConfig?.starting_room;
      if (startingRoom) {
        if (!roomIds.has(startingRoom)) {
          errors.push(
            `Starting room '${startingRoom}' specified in config does not exist`,
          );
        } else {
          const reachable = this.findReachableRooms(
            startingRoom,
            connections,
            roomIds,
          );
          const unreachable = Array.from(roomIds).filter(
            (id) => !reachable.has(id),
          );

          if (unreachable.length > 0) {
            warnings.push(
              `${unreachable.length} room(s) are unreachable from starting room '${startingRoom}': ${unreachable.join(', ')}`,
            );
          }
        }
      } else {
        warnings.push(
          'No starting room specified in game config - cannot check for unreachable rooms',
        );
      }

      // 4. Check for rooms with no connections
      const connectedRooms = new Set<string>();
      connections.forEach((conn) => {
        connectedRooms.add(conn.from_room);
        connectedRooms.add(conn.to_room);
      });

      const isolatedRooms = Array.from(roomIds).filter(
        (id) => !connectedRooms.has(id) && id !== startingRoom,
      );

      if (isolatedRooms.length > 0) {
        warnings.push(
          `${isolatedRooms.length} room(s) have no connections: ${isolatedRooms.join(', ')}`,
        );
      }

      // 5. Check for circular dependencies in connections
      const cycles = this.findCircularPaths(connections, roomIds);
      if (cycles.length > 0) {
        // Circular paths are actually valid in games (you can go back)
        // So this is just informational
        this.logger.log(
          `Found ${cycles.length} circular path(s) (this is usually fine)`,
        );
      }

      // 6. Check for bidirectional connections
      const bidirectional =
        this.findMissingBidirectionalConnections(connections);
      if (bidirectional.length > 0) {
        warnings.push(
          `${bidirectional.length} connection(s) may be missing return paths`,
        );
        bidirectional.slice(0, 5).forEach((conn) => {
          warnings.push(
            `  ${conn.from_room} -> ${conn.to_room} (direction: ${conn.direction})`,
          );
        });
        if (bidirectional.length > 5) {
          warnings.push(`  ... and ${bidirectional.length - 5} more`);
        }
      }

      // 7. Check for empty or minimal game content
      if (rooms.length === 0) {
        errors.push('Game has no rooms defined');
      } else if (rooms.length === 1) {
        warnings.push('Game only has one room - consider adding more content');
      }

      if (connections.length === 0 && rooms.length > 1) {
        warnings.push('No connections defined between rooms');
      }

      if (objects.length === 0 && npcs.length === 0) {
        warnings.push(
          'Game has no objects or NPCs - consider adding interactive elements',
        );
      }

      const stats = {
        roomCount: rooms.length,
        objectCount: objects.length,
        npcCount: npcs.length,
        connectionCount: connections.length,
        orphanedConnections: orphanedCount,
        unreachableRooms:
          startingRoom && roomIds.has(startingRoom)
            ? Array.from(roomIds).filter(
                (id) =>
                  !this.findReachableRooms(
                    startingRoom,
                    connections,
                    roomIds,
                  ).has(id),
              ).length
            : 0,
        duplicateIds:
          duplicateRooms.length +
          duplicateObjects.length +
          duplicateNPCs.length,
      };

      const isValid = errors.length === 0;

      this.logger.log(
        `Validation complete: ${errors.length} error(s), ${warnings.length} warning(s)`,
      );

      return {
        isValid,
        errors,
        warnings,
        stats,
      };
    } catch (error) {
      this.logger.error(`Validation failed: ${error.message}`);
      return {
        isValid: false,
        errors: [`Validation failed: ${error.message}`],
        warnings: [],
      };
    }
  }

  /**
   * Load entities from a directory
   */
  private async loadEntities(
    gameDir: string,
    subdir: string,
  ): Promise<GameEntity[]> {
    const entitiesDir = path.join(gameDir, subdir);
    const entities: GameEntity[] = [];

    if (!fs.existsSync(entitiesDir)) {
      return entities;
    }

    const files = fs
      .readdirSync(entitiesDir)
      .filter((f) => f.endsWith('.json'));

    for (const file of files) {
      try {
        const filePath = path.join(entitiesDir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);

        entities.push({
          id: data.id,
          type: subdir as any,
          data,
        });
      } catch (error) {
        this.logger.warn(`Failed to load ${subdir}/${file}: ${error.message}`);
      }
    }

    return entities;
  }

  /**
   * Load connections
   */
  private async loadConnections(gameDir: string): Promise<Connection[]> {
    const connectionsPath = path.join(gameDir, 'connections.json');

    if (!fs.existsSync(connectionsPath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(connectionsPath, 'utf-8');
      const data = JSON.parse(content);
      return data.connections || [];
    } catch (error) {
      this.logger.warn(`Failed to load connections: ${error.message}`);
      return [];
    }
  }

  /**
   * Load game config
   */
  private async loadGameConfig(gameDir: string): Promise<any> {
    const configPath = path.join(gameDir, 'game-config.json');

    if (!fs.existsSync(configPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      this.logger.warn(`Failed to load game config: ${error.message}`);
      return null;
    }
  }

  /**
   * Find duplicate IDs in a list of entities
   */
  private findDuplicateIds(entities: GameEntity[]): string[] {
    const idCounts = new Map<string, number>();

    entities.forEach((entity) => {
      idCounts.set(entity.id, (idCounts.get(entity.id) || 0) + 1);
    });

    return Array.from(idCounts.entries())
      .filter(([_, count]) => count > 1)
      .map(([id, _]) => id);
  }

  /**
   * Find all rooms reachable from a starting room
   */
  private findReachableRooms(
    startingRoom: string,
    connections: Connection[],
    allRooms: Set<string>,
  ): Set<string> {
    const reachable = new Set<string>();
    const queue = [startingRoom];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (reachable.has(current)) {
        continue;
      }

      reachable.add(current);

      // Find all connected rooms
      connections.forEach((conn) => {
        if (conn.from_room === current && allRooms.has(conn.to_room)) {
          if (!reachable.has(conn.to_room)) {
            queue.push(conn.to_room);
          }
        }
        // Also check bidirectional (some games allow going back)
        if (conn.to_room === current && allRooms.has(conn.from_room)) {
          if (!reachable.has(conn.from_room)) {
            queue.push(conn.from_room);
          }
        }
      });
    }

    return reachable;
  }

  /**
   * Find circular paths (cycles) in the connection graph
   */
  private findCircularPaths(
    connections: Connection[],
    allRooms: Set<string>,
  ): string[][] {
    const cycles: string[][] = [];

    // Build adjacency list
    const graph = new Map<string, string[]>();
    connections.forEach((conn) => {
      if (!graph.has(conn.from_room)) {
        graph.set(conn.from_room, []);
      }
      graph.get(conn.from_room)!.push(conn.to_room);
    });

    // DFS to find cycles
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (node: string, path: string[]): void => {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, [...path]);
        } else if (recStack.has(neighbor)) {
          // Found a cycle
          const cycleStart = path.indexOf(neighbor);
          const cycle = path.slice(cycleStart);
          cycles.push(cycle);
        }
      }

      recStack.delete(node);
    };

    allRooms.forEach((room) => {
      if (!visited.has(room)) {
        dfs(room, []);
      }
    });

    return cycles;
  }

  /**
   * Find connections that might be missing return paths
   */
  private findMissingBidirectionalConnections(
    connections: Connection[],
  ): Connection[] {
    const missing: Connection[] = [];

    connections.forEach((conn) => {
      // Check if there's a reverse connection
      const hasReverse = connections.some(
        (other) =>
          other.from_room === conn.to_room && other.to_room === conn.from_room,
      );

      if (!hasReverse) {
        missing.push(conn);
      }
    });

    return missing;
  }
}
