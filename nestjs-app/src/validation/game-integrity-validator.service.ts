import { Injectable, Logger } from '@nestjs/common';
import { GameData, RoomData, ObjectData, NPCData, RoomConnection } from '../database/database.interfaces';

export interface IntegrityValidationResult {
  isValid: boolean;
  errors: IntegrityError[];
  warnings: IntegrityWarning[];
  summary: {
    totalErrors: number;
    totalWarnings: number;
    criticalErrors: number;
    blockingIssues: string[];
  };
}

export interface IntegrityError {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  message: string;
  entity?: {
    type: 'room' | 'object' | 'npc' | 'connection';
    id: string;
    name?: string;
  };
  affectedEntities?: string[];
  blocking: boolean;
}

export interface IntegrityWarning {
  category: string;
  message: string;
  suggestion?: string;
}

/**
 * Game Integrity Validator Service
 *
 * Validates the complete integrity of game data before save/load operations.
 * Catches missing references, orphaned objects, circular dependencies, and other issues.
 *
 * This prevents runtime errors by ensuring all data is consistent and complete.
 */
@Injectable()
export class GameIntegrityValidatorService {
  private readonly logger = new Logger(GameIntegrityValidatorService.name);

  /**
   * Comprehensive validation of entire game data
   */
  validate(
    gameData: GameData | undefined,
    rooms: RoomData[],
    objects: ObjectData[],
    npcs: NPCData[],
    connections: RoomConnection[],
  ): IntegrityValidationResult {
    const errors: IntegrityError[] = [];
    const warnings: IntegrityWarning[] = [];

    this.logger.log('Starting comprehensive game integrity validation...');

    // Build lookup maps for efficient validation
    const roomIds = new Set(rooms.map(r => r.id));
    const objectIds = new Set(objects.map(o => o.id));
    const npcIds = new Set(npcs.map(n => n.id));

    // 1. Validate game config
    if (gameData) {
      this.validateGameConfig(gameData, errors, warnings);
    } else {
      errors.push({
        severity: 'critical',
        category: 'game_config',
        message: 'Game configuration is missing',
        blocking: true,
      });
    }

    // 2. Validate rooms
    this.validateRooms(rooms, objectIds, npcIds, errors, warnings);

    // 3. Validate objects
    this.validateObjects(objects, roomIds, npcIds, errors, warnings);

    // 4. Validate NPCs
    this.validateNPCs(npcs, roomIds, objectIds, errors, warnings);

    // 5. Validate connections
    this.validateConnections(connections, roomIds, objectIds, errors, warnings);

    // 6. Validate object placement
    this.validateObjectPlacement(objects, rooms, npcs, errors, warnings);

    // 7. Validate quest items (if applicable)
    if (gameData?.metadata?.victory_conditions) {
      this.validateQuestItems(gameData, objectIds, errors, warnings);
    }

    // 8. Check for orphaned entities
    this.checkOrphanedEntities(objects, rooms, npcs, errors, warnings);

    // Compile results
    const criticalErrors = errors.filter(e => e.severity === 'critical').length;
    const blockingIssues = errors.filter(e => e.blocking).map(e => e.message);

    const result: IntegrityValidationResult = {
      isValid: errors.length === 0,
      errors,
      warnings,
      summary: {
        totalErrors: errors.length,
        totalWarnings: warnings.length,
        criticalErrors,
        blockingIssues,
      },
    };

    this.logResults(result);
    return result;
  }

  private validateGameConfig(
    gameData: GameData,
    errors: IntegrityError[],
    warnings: IntegrityWarning[],
  ): void {
    if (!gameData.id) {
      errors.push({
        severity: 'critical',
        category: 'game_config',
        message: 'Game ID is missing',
        blocking: true,
      });
    }

    if (!gameData.name) {
      errors.push({
        severity: 'high',
        category: 'game_config',
        message: 'Game name is missing',
        blocking: false,
      });
    }

    if (gameData.metadata?.starting_room) {
      // Will be validated in room validation
    } else {
      warnings.push({
        category: 'game_config',
        message: 'No starting room specified in game metadata',
        suggestion: 'Set metadata.starting_room to define where players begin',
      });
    }
  }

  private validateRooms(
    rooms: RoomData[],
    objectIds: Set<string>,
    npcIds: Set<string>,
    errors: IntegrityError[],
    warnings: IntegrityWarning[],
  ): void {
    if (rooms.length === 0) {
      errors.push({
        severity: 'critical',
        category: 'rooms',
        message: 'No rooms defined in game',
        blocking: true,
      });
      return;
    }

    const roomIds = new Set<string>();
    const duplicateRoomIds: string[] = [];

    for (const room of rooms) {
      // Check for duplicate IDs
      if (roomIds.has(room.id)) {
        duplicateRoomIds.push(room.id);
      }
      roomIds.add(room.id);

      // Validate room has required fields
      if (!room.name) {
        errors.push({
          severity: 'medium',
          category: 'rooms',
          message: `Room ${room.id} has no name`,
          entity: { type: 'room', id: room.id },
          blocking: false,
        });
      }

      // Validate room items reference existing objects
      if (room.items && Array.isArray(room.items)) {
        for (const itemId of room.items) {
          if (!objectIds.has(itemId)) {
            errors.push({
              severity: 'high',
              category: 'room_items',
              message: `Room '${room.name || room.id}' references non-existent object '${itemId}'`,
              entity: { type: 'room', id: room.id, name: room.name },
              affectedEntities: [itemId],
              blocking: true,
            });
          }
        }
      }

      // Check for empty rooms (warning only)
      if (!room.items || room.items.length === 0) {
        warnings.push({
          category: 'room_content',
          message: `Room '${room.name || room.id}' has no items`,
          suggestion: 'Consider adding objects to make the room more interesting',
        });
      }
    }

    if (duplicateRoomIds.length > 0) {
      errors.push({
        severity: 'critical',
        category: 'rooms',
        message: `Duplicate room IDs found: ${duplicateRoomIds.join(', ')}`,
        blocking: true,
      });
    }
  }

  private validateObjects(
    objects: ObjectData[],
    roomIds: Set<string>,
    npcIds: Set<string>,
    errors: IntegrityError[],
    warnings: IntegrityWarning[],
  ): void {
    const objectIds = new Set<string>();
    const duplicateObjectIds: string[] = [];

    for (const object of objects) {
      // Check for duplicate IDs
      if (objectIds.has(object.id)) {
        duplicateObjectIds.push(object.id);
      }
      objectIds.add(object.id);

      // Validate object has required fields
      if (!object.name) {
        errors.push({
          severity: 'medium',
          category: 'objects',
          message: `Object ${object.id} has no name`,
          entity: { type: 'object', id: object.id },
          blocking: false,
        });
      }

      // Validate object type
      if (!object.objectType) {
        warnings.push({
          category: 'objects',
          message: `Object '${object.name || object.id}' has no object_type defined`,
          suggestion: 'Set object_type for better game mechanics',
        });
      }
    }

    if (duplicateObjectIds.length > 0) {
      errors.push({
        severity: 'critical',
        category: 'objects',
        message: `Duplicate object IDs found: ${duplicateObjectIds.join(', ')}`,
        blocking: true,
      });
    }
  }

  private validateNPCs(
    npcs: NPCData[],
    roomIds: Set<string>,
    objectIds: Set<string>,
    errors: IntegrityError[],
    warnings: IntegrityWarning[],
  ): void {
    const npcIds = new Set<string>();
    const duplicateNpcIds: string[] = [];

    for (const npc of npcs) {
      // Check for duplicate IDs
      if (npcIds.has(npc.id)) {
        duplicateNpcIds.push(npc.id);
      }
      npcIds.add(npc.id);

      // Validate NPC has required fields
      if (!npc.name) {
        errors.push({
          severity: 'medium',
          category: 'npcs',
          message: `NPC ${npc.id} has no name`,
          entity: { type: 'npc', id: npc.id },
          blocking: false,
        });
      }

      // Validate NPC inventory items exist
      if (npc.inventory && Array.isArray(npc.inventory)) {
        for (const itemId of npc.inventory) {
          if (!objectIds.has(itemId)) {
            errors.push({
              severity: 'high',
              category: 'npc_inventory',
              message: `NPC '${npc.name || npc.id}' has non-existent object '${itemId}' in inventory`,
              entity: { type: 'npc', id: npc.id, name: npc.name },
              affectedEntities: [itemId],
              blocking: true,
            });
          }
        }
      }

      // Validate health values
      if (npc.health > npc.maxHealth) {
        warnings.push({
          category: 'npcs',
          message: `NPC '${npc.name || npc.id}' has health (${npc.health}) > max health (${npc.maxHealth})`,
          suggestion: 'Ensure health values are logical',
        });
      }
    }

    if (duplicateNpcIds.length > 0) {
      errors.push({
        severity: 'critical',
        category: 'npcs',
        message: `Duplicate NPC IDs found: ${duplicateNpcIds.join(', ')}`,
        blocking: true,
      });
    }
  }

  private validateConnections(
    connections: RoomConnection[],
    roomIds: Set<string>,
    objectIds: Set<string>,
    errors: IntegrityError[],
    warnings: IntegrityWarning[],
  ): void {
    for (const connection of connections) {
      // Validate source room exists
      if (!roomIds.has(connection.fromRoom)) {
        errors.push({
          severity: 'critical',
          category: 'connections',
          message: `Connection references non-existent source room '${connection.fromRoom}'`,
          entity: { type: 'connection', id: `${connection.fromRoom}->${connection.toRoom}` },
          blocking: true,
        });
      }

      // Validate target room exists
      if (!roomIds.has(connection.toRoom)) {
        errors.push({
          severity: 'critical',
          category: 'connections',
          message: `Connection references non-existent target room '${connection.toRoom}'`,
          entity: { type: 'connection', id: `${connection.fromRoom}->${connection.toRoom}` },
          blocking: true,
        });
      }

      // Validate required key exists (if specified)
      if (connection.requiredKey && !objectIds.has(connection.requiredKey)) {
        errors.push({
          severity: 'high',
          category: 'connections',
          message: `Connection from '${connection.fromRoom}' to '${connection.toRoom}' requires non-existent key '${connection.requiredKey}'`,
          entity: { type: 'connection', id: `${connection.fromRoom}->${connection.toRoom}` },
          affectedEntities: [connection.requiredKey],
          blocking: true,
        });
      }

      // Validate direction is valid
      const validDirections = ['north', 'south', 'east', 'west', 'up', 'down', 'northeast', 'northwest', 'southeast', 'southwest'];
      if (connection.direction && !validDirections.includes(connection.direction)) {
        warnings.push({
          category: 'connections',
          message: `Connection from '${connection.fromRoom}' uses non-standard direction '${connection.direction}'`,
          suggestion: `Consider using standard directions: ${validDirections.join(', ')}`,
        });
      }
    }

    // Check for isolated rooms (rooms with no connections)
    const connectedRooms = new Set<string>();
    for (const connection of connections) {
      connectedRooms.add(connection.fromRoom);
      connectedRooms.add(connection.toRoom);
    }

    for (const roomId of roomIds) {
      if (!connectedRooms.has(roomId)) {
        warnings.push({
          category: 'connections',
          message: `Room '${roomId}' has no connections to other rooms`,
          suggestion: 'Add connections to integrate this room into the game world',
        });
      }
    }
  }

  private validateObjectPlacement(
    objects: ObjectData[],
    rooms: RoomData[],
    npcs: NPCData[],
    errors: IntegrityError[],
    warnings: IntegrityWarning[],
  ): void {
    // Build sets of placed objects
    const objectsInRooms = new Set<string>();
    const objectsInNPCs = new Set<string>();

    // Collect objects from rooms
    for (const room of rooms) {
      if (room.items && Array.isArray(room.items)) {
        for (const itemId of room.items) {
          if (objectsInRooms.has(itemId)) {
            errors.push({
              severity: 'high',
              category: 'object_placement',
              message: `Object '${itemId}' appears in multiple rooms`,
              blocking: false,
            });
          }
          objectsInRooms.add(itemId);
        }
      }
    }

    // Collect objects from NPCs
    for (const npc of npcs) {
      if (npc.inventory && Array.isArray(npc.inventory)) {
        for (const itemId of npc.inventory) {
          if (objectsInNPCs.has(itemId)) {
            warnings.push({
              category: 'object_placement',
              message: `Object '${itemId}' appears in multiple NPC inventories`,
              suggestion: 'Ensure this is intentional (e.g., common items)',
            });
          }
          objectsInNPCs.add(itemId);

          // Check if object is in both room and NPC
          if (objectsInRooms.has(itemId)) {
            errors.push({
              severity: 'high',
              category: 'object_placement',
              message: `Object '${itemId}' is in both a room AND an NPC inventory`,
              blocking: false,
            });
          }
        }
      }
    }

    // Check for quest-critical objects not placed anywhere
    for (const object of objects) {
      const isQuestItem = object.objectType === 'quest-item' ||
                         object.properties?.quest_item === true ||
                         object.id.includes('shard') ||
                         object.id.includes('artifact');

      if (isQuestItem && !objectsInRooms.has(object.id) && !objectsInNPCs.has(object.id)) {
        errors.push({
          severity: 'critical',
          category: 'object_placement',
          message: `Quest-critical object '${object.name || object.id}' is not placed in any room or NPC inventory`,
          entity: { type: 'object', id: object.id, name: object.name },
          blocking: true,
        });
      }
    }
  }

  private validateQuestItems(
    gameData: GameData,
    objectIds: Set<string>,
    errors: IntegrityError[],
    warnings: IntegrityWarning[],
  ): void {
    const victoryConditions = gameData.metadata.victory_conditions;

    for (const condition of victoryConditions) {
      if (condition.type === 'obtain_item') {
        const requiredItemId = condition.item_id;
        if (!objectIds.has(requiredItemId)) {
          errors.push({
            severity: 'critical',
            category: 'victory_conditions',
            message: `Victory condition requires non-existent item '${requiredItemId}'`,
            blocking: true,
          });
        }
      }
    }
  }

  private checkOrphanedEntities(
    objects: ObjectData[],
    rooms: RoomData[],
    npcs: NPCData[],
    errors: IntegrityError[],
    warnings: IntegrityWarning[],
  ): void {
    // Find objects not in any room or NPC (excluding non-portable items like repair stations)
    const placedObjects = new Set<string>();

    for (const room of rooms) {
      if (room.items) {
        room.items.forEach(id => placedObjects.add(id));
      }
    }

    for (const npc of npcs) {
      if (npc.inventory) {
        npc.inventory.forEach(id => placedObjects.add(id));
      }
    }

    for (const object of objects) {
      if (!placedObjects.has(object.id) && object.isPortable !== false) {
        warnings.push({
          category: 'orphaned_entities',
          message: `Portable object '${object.name || object.id}' is not placed in any room or NPC inventory`,
          suggestion: 'Place this object in a room or NPC, or set is_portable: false',
        });
      }
    }
  }

  private logResults(result: IntegrityValidationResult): void {
    if (result.isValid) {
      this.logger.log('✓ Game integrity validation PASSED');
    } else {
      this.logger.warn(`✗ Game integrity validation FAILED with ${result.summary.totalErrors} errors and ${result.summary.totalWarnings} warnings`);

      if (result.summary.criticalErrors > 0) {
        this.logger.error(`CRITICAL: ${result.summary.criticalErrors} critical errors found`);
      }

      if (result.summary.blockingIssues.length > 0) {
        this.logger.error('BLOCKING ISSUES:');
        result.summary.blockingIssues.forEach(issue => {
          this.logger.error(`  - ${issue}`);
        });
      }
    }
  }
}
