import { Injectable, Logger } from '@nestjs/common';
import {
  GameData,
  RoomData,
  ObjectData,
  NPCData,
  RoomConnection,
} from '../../database/database.interfaces';

/**
 * Entity Converter Helper
 * Handles conversion between file format and database format including:
 * - Converting raw JSON to database entity format
 * - Converting database entities back to file format
 * - Field mapping and default value handling
 * - Type coercion and validation
 */
@Injectable()
export class EntityConverterHelper {
  private readonly logger = new Logger(EntityConverterHelper.name);

  /**
   * Convert raw game config JSON to GameData format
   */
  convertToGameData(rawConfig: any): GameData {
    return {
      id: rawConfig.id,
      name: rawConfig.name,
      description: rawConfig.description,
      version: rawConfig.version || 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true,
      metadata: rawConfig.metadata,
    };
  }

  /**
   * Convert raw room JSON to RoomData format
   */
  convertToRoomData(rawRoom: any, gameId: string): RoomData {
    return {
      id: rawRoom.id,
      gameId: gameId,
      name: rawRoom.name,
      description: rawRoom.description,
      longDescription: rawRoom.long_description,
      position: rawRoom.position || { x: 0, y: 0, z: 0 },
      width: rawRoom.size?.width || rawRoom.width || 10,
      height: rawRoom.size?.height || rawRoom.height || 10,
      depth: rawRoom.size?.depth || rawRoom.depth || 3,
      environmentData: rawRoom.environment,
      version: 1,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Convert raw object JSON to ObjectData format
   *
   * PORTABLE ATTRIBUTE HANDLING:
   * This converter accepts all three naming conventions for backward compatibility:
   * - is_portable (snake_case, preferred in JSON files)
   * - canTake (legacy property name)
   * - isPortable (camelCase, canonical TypeScript property)
   *
   * All three are converted to the canonical "isPortable" property internally.
   * Priority order: isPortable > is_portable > canTake
   * Default value: true (objects are portable by default)
   */
  convertToObjectData(rawObject: any, gameId: string): ObjectData {
    // Portable attribute conversion with backward compatibility
    // Priority: isPortable > is_portable > canTake, default to true
    let isPortable = true;
    if (rawObject.isPortable !== undefined) {
      isPortable = rawObject.isPortable;
    } else if (rawObject.is_portable !== undefined) {
      isPortable = rawObject.is_portable;
    } else if (rawObject.canTake !== undefined) {
      isPortable = rawObject.canTake;
    }

    return {
      id: rawObject.id,
      gameId: gameId,
      name: rawObject.name,
      description: rawObject.description,
      objectType: rawObject.object_type,
      position: rawObject.position || { x: 0, y: 0, z: 0 },
      material: rawObject.material,
      materialProperties: rawObject.material_properties,
      weight: rawObject.weight || 0,
      health: rawObject.health,
      maxHealth: rawObject.max_health,
      isPortable: isPortable,
      isContainer: rawObject.is_container ?? false,
      canContain: rawObject.can_contain ?? false,
      containerCapacity: rawObject.container_capacity || 0,
      stateData: rawObject.state_data,
      properties: rawObject.properties,
      version: 1,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Convert raw NPC JSON to NPCData format
   */
  convertToNPCData(rawNpc: any, gameId: string): NPCData {
    return {
      id: rawNpc.id,
      gameId: gameId,
      name: rawNpc.name,
      description: rawNpc.description,
      npcType: rawNpc.npc_type || 'npc',
      position: rawNpc.position || { x: 0, y: 0, z: 0 },
      health: rawNpc.health || 100,
      maxHealth: rawNpc.max_health || rawNpc.health || 100,
      level: rawNpc.level || 1,
      experience: rawNpc.experience || 0,
      inventoryData: rawNpc.inventory_data,
      dialogueTreeData: rawNpc.dialogue_tree_data,
      behaviorConfig: rawNpc.behavior_config,
      attributes: rawNpc.attributes,
      version: 1,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Convert raw connection JSON to RoomConnection format
   */
  convertToRoomConnection(rawConnection: any, index: number): RoomConnection {
    return {
      id: index + 1, // Will be assigned by database
      roomId: rawConnection.from_room,
      connectedRoomId: rawConnection.to_room,
      direction: rawConnection.direction,
      description: rawConnection.description,
      isLocked: rawConnection.is_locked || false,
      requiredKeyId: rawConnection.required_key || null,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Convert GameData to file export format
   */
  convertGameDataToFile(gameData: GameData): any {
    return {
      id: gameData.id,
      name: gameData.name,
      description: gameData.description,
      version: gameData.version,
      metadata: gameData.metadata,
    };
  }

  /**
   * Convert RoomData to file export format
   */
  convertRoomDataToFile(roomData: RoomData): any {
    return {
      id: roomData.id,
      name: roomData.name,
      description: roomData.description,
      long_description: roomData.longDescription,
      position: roomData.position,
      size: {
        width: roomData.width,
        height: roomData.height,
        depth: roomData.depth,
      },
      width: roomData.width,
      height: roomData.height,
      environment: roomData.environmentData,
    };
  }

  /**
   * Convert ObjectData to file export format
   */
  convertObjectDataToFile(objectData: ObjectData): any {
    return {
      id: objectData.id,
      name: objectData.name,
      description: objectData.description,
      object_type: objectData.objectType,
      position: objectData.position,
      material: objectData.material,
      material_properties: objectData.materialProperties,
      weight: objectData.weight,
      health: objectData.health,
      max_health: objectData.maxHealth,
      is_portable: objectData.isPortable,
      is_container: objectData.isContainer,
      can_contain: objectData.canContain,
      container_capacity: objectData.containerCapacity,
      state_data: objectData.stateData,
      properties: objectData.properties,
    };
  }

  /**
   * Convert NPCData to file export format
   */
  convertNPCDataToFile(npcData: NPCData): any {
    return {
      id: npcData.id,
      name: npcData.name,
      description: npcData.description,
      npc_type: npcData.npcType,
      position: npcData.position,
      health: npcData.health,
      max_health: npcData.maxHealth,
      level: npcData.level,
      experience: npcData.experience,
      inventory_data: npcData.inventoryData,
      dialogue_tree_data: npcData.dialogueTreeData,
      behavior_config: npcData.behaviorConfig,
      attributes: npcData.attributes,
    };
  }

  /**
   * Convert RoomConnection to file export format
   */
  convertRoomConnectionToFile(connection: RoomConnection): any {
    return {
      from_room: connection.roomId,
      to_room: connection.connectedRoomId,
      direction: connection.direction,
      description: connection.description,
      is_locked: connection.isLocked,
      required_key: connection.requiredKeyId,
    };
  }
}
