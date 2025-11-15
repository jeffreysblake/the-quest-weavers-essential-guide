import { Injectable } from '@nestjs/common';
import { EntityService } from './entity.service';
import { ObjectService } from './object.service';
import { RoomService } from './room.service';
import { IObject } from './object.interface';
import {
  IPhysicsEffect,
  IPhysicsResult,
  IMaterialProperties,
  MaterialType,
  EffectType,
} from './physics.interface';

@Injectable()
export class PhysicsService {
  constructor(
    private readonly entityService: EntityService,
    private readonly objectService: ObjectService,
    private readonly roomService: RoomService,
  ) {}

  // Apply an effect to a target object
  async applyEffect(targetId: string, effect: IPhysicsEffect): Promise<IPhysicsResult> {
    const target = this.objectService.getObject(targetId);
    if (!target) {
      return {
        success: false,
        message: 'Target object not found',
      };
    }

    const result = this.calculateEffectOnObject(target, effect);

    // Apply damage and state changes
    if (result.objectsAffected) {
      for (const affected of result.objectsAffected) {
        await this.applyObjectChanges(affected.objectId, affected);
      }
    }

    // Process chain reactions
    if (result.chainReactions) {
      const chainResults: string[] = [];
      for (const chain of result.chainReactions) {
        const chainResult = await this.applyEffect(chain.targetId, chain.effect);
        if (chainResult.success) {
          chainResults.push(chainResult.message);
        }
      }
      if (chainResults.length > 0) {
        result.message += ' ' + chainResults.join(' ');
      }
    }

    return result;
  }

  // Apply area effect to all objects in a room or spatial area
  async applyAreaEffect(
    roomId: string,
    effect: IPhysicsEffect,
    sourcePosition?: { x: number; y: number; z: number },
  ): Promise<IPhysicsResult> {
    const room = this.roomService.getRoom(roomId);
    if (!room) {
      return {
        success: false,
        message: 'Room not found',
      };
    }

    const results: string[] = [];
    const allAffected: any[] = [];
    const allChains: any[] = [];

    // Apply effect to all objects in room
    for (const objectId of room.objects) {
      const objectResult = await this.applyEffect(objectId, effect);
      if (objectResult.success) {
        results.push(objectResult.message);
        if (objectResult.objectsAffected) {
          allAffected.push(...objectResult.objectsAffected);
        }
        if (objectResult.chainReactions) {
          allChains.push(...objectResult.chainReactions);
        }
      }
    }

    return {
      success: results.length > 0,
      message: results.join(' '),
      objectsAffected: allAffected,
      chainReactions: allChains,
    };
  }

  private calculateEffectOnObject(
    target: IObject,
    effect: IPhysicsEffect,
  ): IPhysicsResult {
    if (!target.materialProperties) {
      return {
        success: false,
        message: `${target.name} has no material properties to interact with`,
      };
    }

    const material = target.materialProperties;
    const resistance = material.resistances?.[effect.type] || 0;
    const effectiveIntensity = Math.max(0, effect.intensity - resistance);

    if (effectiveIntensity <= 0) {
      return {
        success: true,
        message: `${target.name} resists the ${effect.type} effect`,
        objectsAffected: [],
      };
    }

    switch (effect.type) {
      case 'fire':
        return this.handleFireEffect(target, effect, effectiveIntensity);
      case 'lightning':
        return this.handleLightningEffect(target, effect, effectiveIntensity);
      case 'ice':
        return this.handleIceEffect(target, effect, effectiveIntensity);
      case 'force':
        return this.handleForceEffect(target, effect, effectiveIntensity);
      default:
        return this.handleGenericEffect(target, effect, effectiveIntensity);
    }
  }

  private handleFireEffect(
    target: IObject,
    effect: IPhysicsEffect,
    intensity: number,
  ): IPhysicsResult {
    const material = target.materialProperties!;
    const flammability = material.flammability || 0;
    const damage = Math.floor(intensity * (flammability / 10));

    let message = `${target.name} is hit by ${effect.description}`;
    const chainReactions: any[] = [];
    const objectsAffected = [
      {
        objectId: target.id,
        damage: damage,
        newState: { ...target.state },
      },
    ];

    if (flammability > 5 && intensity > 3) {
      message += ` and catches fire!`;
      objectsAffected[0].newState = {
        ...target.state,
        isOnFire: true,
      };

      // Fix Bug 3: Highly flammable materials take much more damage when they catch fire
      // This ensures one-hit kills work properly on flammable objects
      if (flammability >= 7 && intensity >= 8) {
        // Very flammable + intense fire = complete destruction
        const maxDamage =
          target.health !== undefined ? target.health : target.maxHealth || 10;
        objectsAffected[0].damage = Math.max(damage, maxDamage);
        message += ` The ${target.name} is consumed by flames!`;
      }

      // Check for explosive contents or materials
      if (material.properties?.explosive || this.hasExplosiveContents(target)) {
        message += ` The ${target.name} explodes!`;
        // Fix: Use explicit undefined check to avoid zombie resurrection
        objectsAffected[0].damage =
          target.health !== undefined ? target.health : target.maxHealth || 10;

        // Create explosion effect for nearby objects
        chainReactions.push(
          ...this.getObjectsInRange(target.id, 2).map((nearbyId) => ({
            targetId: nearbyId,
            effect: {
              type: 'force' as EffectType,
              intensity: intensity + 2,
              description: `explosion from ${target.name}`,
            },
          })),
        );
      }
    } else if (flammability > 0) {
      message += ` and is scorched`;
    } else {
      message += ` but the ${material.material} does not burn`;

      // Even if the container doesn't burn, check for explosive contents
      if (this.hasExplosiveContents(target) && intensity > 4) {
        message += ` However, the heat ignites the contents and the ${target.name} explodes!`;
        // Fix: Use explicit undefined check to avoid zombie resurrection
        const maxDamage =
          target.health !== undefined ? target.health : target.maxHealth || 10;
        objectsAffected[0].damage = Math.floor(maxDamage * 0.8);

        // Create explosion effect for nearby objects
        chainReactions.push(
          ...this.getObjectsInRange(target.id, 2).map((nearbyId) => ({
            targetId: nearbyId,
            effect: {
              type: 'force' as EffectType,
              intensity: intensity + 1,
              description: `explosion from ${target.name}`,
            },
          })),
        );
      }
    }

    return {
      success: true,
      message,
      objectsAffected,
      chainReactions,
    };
  }

  private handleLightningEffect(
    target: IObject,
    effect: IPhysicsEffect,
    intensity: number,
  ): IPhysicsResult {
    const material = target.materialProperties!;
    const conductivity = material.conductivity || 0;
    let damage = Math.floor(intensity * (conductivity > 5 ? 1.5 : 0.5));

    let message = `${target.name} is struck by ${effect.description}`;
    const chainReactions: any[] = [];

    if (conductivity > 7) {
      message += ` and conducts the electricity!`;

      // Chain to conductive objects in contact
      chainReactions.push(
        ...this.getConnectedObjects(target.id)
          .filter((id) => {
            const obj = this.objectService.getObject(id);
            return (
              obj?.materialProperties?.conductivity &&
              obj.materialProperties.conductivity > 5
            );
          })
          .map((nearbyId) => ({
            targetId: nearbyId,
            effect: {
              type: 'lightning' as EffectType,
              intensity: Math.max(1, intensity - 2),
              description: `electrical conduction from ${target.name}`,
            },
          })),
      );

      // BUG FIX #1: Chain to nearby conductive objects in the same room
      const nearbyObjects = this.getObjectsInRange(target.id, 5);
      chainReactions.push(
        ...nearbyObjects
          .filter((id) => {
            const obj = this.objectService.getObject(id);
            return (
              obj?.materialProperties?.conductivity &&
              obj.materialProperties.conductivity > 5
            );
          })
          .map((nearbyId) => ({
            targetId: nearbyId,
            effect: {
              type: 'lightning' as EffectType,
              intensity: Math.max(1, intensity - 2),
              description: `electrical chain from ${target.name}`,
            },
          })),
      );

      // Special case: water conducts to everything touching it
      if (material.material === 'water') {
        const objectsInWater = this.getObjectsInSameLocation(target.id);
        chainReactions.push(
          ...objectsInWater.map((id) => ({
            targetId: id,
            effect: {
              type: 'lightning' as EffectType,
              intensity: intensity,
              description: `electrical conduction through water`,
            },
          })),
        );
      }
    } else if (conductivity < 2) {
      message += ` but the ${material.material} does not conduct electricity`;
      damage = Math.floor(damage * 0.1);
    }

    return {
      success: true,
      message,
      objectsAffected: [
        {
          objectId: target.id,
          damage,
        },
      ],
      chainReactions,
    };
  }

  private handleIceEffect(
    target: IObject,
    effect: IPhysicsEffect,
    intensity: number,
  ): IPhysicsResult {
    const material = target.materialProperties!;
    const damage = Math.floor(intensity * 0.8);

    let message = `${target.name} is hit by ${effect.description}`;

    // Ice effects can freeze water, make things brittle
    const newState = { ...target.state };
    if (material.material === 'water') {
      message += ` and freezes solid!`;
      newState.frozen = true;
    } else {
      message += ` and becomes brittle from the cold`;
      newState.brittle = true;
    }

    return {
      success: true,
      message,
      objectsAffected: [
        {
          objectId: target.id,
          damage,
          newState,
        },
      ],
    };
  }

  private handleForceEffect(
    target: IObject,
    effect: IPhysicsEffect,
    intensity: number,
  ): IPhysicsResult {
    const material = target.materialProperties!;
    const brittleness = material.brittleness || 5;
    const damage = Math.floor(intensity * (brittleness / 10));

    let message = `${target.name} is hit by ${effect.description}`;

    if (brittleness > 7 && intensity > 6) {
      message += ` and shatters!`;
      // Fix: Use explicit undefined check to avoid zombie resurrection
      const fullDamage =
        target.health !== undefined ? target.health : target.maxHealth || 10;
      return {
        success: true,
        message,
        objectsAffected: [
          {
            objectId: target.id,
            damage: fullDamage,
            destroyed: true,
          },
        ],
      };
    } else {
      message += ` and is damaged`;
    }

    return {
      success: true,
      message,
      objectsAffected: [
        {
          objectId: target.id,
          damage,
        },
      ],
    };
  }

  private handleGenericEffect(
    target: IObject,
    effect: IPhysicsEffect,
    intensity: number,
  ): IPhysicsResult {
    return {
      success: true,
      message: `${target.name} is affected by ${effect.description}`,
      objectsAffected: [
        {
          objectId: target.id,
          damage: Math.floor(intensity),
        },
      ],
    };
  }

  private async applyObjectChanges(objectId: string, changes: any): Promise<void> {
    const object = this.objectService.getObject(objectId);
    if (!object) return;

    if (changes.damage) {
      // Fix Bug 1 & 3: Use explicit undefined check to avoid zombie resurrection
      // When health is 0, the || operator would fall through to maxHealth, resurrecting the object
      const currentHealth =
        object.health !== undefined ? object.health : object.maxHealth || 10;

      // Fix Bug 1: Don't apply damage to already destroyed objects
      if (currentHealth <= 0) {
        object.health = 0; // Keep at 0, don't resurrect
      } else {
        object.health = Math.max(0, currentHealth - changes.damage);
      }
    }

    if (changes.newState) {
      object.state = { ...object.state, ...changes.newState };
    }

    if (changes.destroyed) {
      object.health = 0;
      object.state = { ...object.state, destroyed: true };
    }

    try {
      await this.entityService.updateEntity(objectId, object);
    } catch (error) {
      // Log error but don't throw - physics effects should continue even if DB update fails
      console.error(`Failed to update object entity ${objectId}:`, error);
    }
  }

  private hasExplosiveContents(target: IObject): boolean {
    if (!target.containedObjects) return false;

    return target.containedObjects.some((id) => {
      const contained = this.objectService.getObject(id);
      return (
        contained?.materialProperties?.properties?.explosive ||
        contained?.objectType === 'consumable'
      ); // potions might explode
    });
  }

  private getObjectsInRange(sourceId: string, range: number): string[] {
    // Simplified: get objects in same room for now
    // In a full implementation, this would use actual spatial calculations
    const sourceObject = this.objectService.getObject(sourceId);
    if (!sourceObject) return [];

    // Find room containing this object
    const rooms = this.roomService.getAllRooms();
    const room = rooms.find((r) => r.objects.includes(sourceId));
    if (!room) return [];

    return room.objects.filter((id) => id !== sourceId);
  }

  private getConnectedObjects(sourceId: string): string[] {
    const sourceObject = this.objectService.getObject(sourceId);
    if (!sourceObject || !sourceObject.spatialRelationship) return [];

    // Get objects that are touching or connected
    const connected: string[] = [];

    // Object this one is placed on/in
    if (sourceObject.spatialRelationship.targetId) {
      connected.push(sourceObject.spatialRelationship.targetId);
    }

    // Objects placed on this one
    const rooms = this.roomService.getAllRooms();
    const room = rooms.find((r) => r.objects.includes(sourceId));
    if (room) {
      room.objects.forEach((id) => {
        const obj = this.objectService.getObject(id);
        if (obj?.spatialRelationship?.targetId === sourceId) {
          connected.push(id);
        }
      });
    }

    return connected;
  }

  private getObjectsInSameLocation(sourceId: string): string[] {
    // Get all objects that share the same spatial relationship target
    const sourceObject = this.objectService.getObject(sourceId);
    if (!sourceObject?.spatialRelationship) return [];

    const targetId = sourceObject.spatialRelationship.targetId;
    const sameLocation: string[] = [];

    const rooms = this.roomService.getAllRooms();
    const room = rooms.find((r) => r.objects.includes(sourceId));
    if (room) {
      room.objects.forEach((id) => {
        if (id !== sourceId) {
          const obj = this.objectService.getObject(id);
          if (obj?.spatialRelationship?.targetId === targetId) {
            sameLocation.push(id);
          }
        }
      });
    }

    return sameLocation;
  }

  // Helper method to create common material presets
  static createMaterialPreset(material: MaterialType): IMaterialProperties {
    const presets: Record<MaterialType, IMaterialProperties> = {
      wood: {
        material: 'wood',
        density: 5,
        conductivity: 1,
        flammability: 8,
        brittleness: 6,
        resistances: { fire: 2, lightning: 8, ice: 5 },
      },
      metal: {
        material: 'metal',
        density: 9,
        conductivity: 9,
        flammability: 0,
        brittleness: 3,
        resistances: { fire: 8, lightning: 1, ice: 7 },
      },
      stone: {
        material: 'stone',
        density: 8,
        conductivity: 2,
        flammability: 0,
        brittleness: 4,
        resistances: { fire: 9, lightning: 9, ice: 8, force: 8 },
      },
      water: {
        material: 'water',
        density: 10,
        conductivity: 8,
        flammability: 0,
        brittleness: 10,
        resistances: { fire: 9, lightning: 1 },
      },
      cloth: {
        material: 'cloth',
        density: 2,
        conductivity: 1,
        flammability: 9,
        brittleness: 7,
        resistances: { lightning: 8, ice: 3 },
      },
      glass: {
        material: 'glass',
        density: 6,
        conductivity: 1,
        flammability: 0,
        brittleness: 9,
        resistances: { fire: 6, lightning: 9 },
        properties: { transparent: true },
      },
      leather: {
        material: 'leather',
        density: 4,
        conductivity: 2,
        flammability: 6,
        brittleness: 5,
        resistances: { lightning: 7, ice: 6 },
      },
      paper: {
        material: 'paper',
        density: 1,
        conductivity: 1,
        flammability: 10,
        brittleness: 8,
        resistances: { lightning: 8 },
      },
      organic: {
        material: 'organic',
        density: 3,
        conductivity: 3,
        flammability: 7,
        brittleness: 6,
        resistances: { lightning: 6, ice: 4 },
      },
      crystal: {
        material: 'crystal',
        density: 7,
        conductivity: 8,
        flammability: 0,
        brittleness: 8,
        resistances: { fire: 7, force: 3 },
        properties: { transparent: true },
      },
      ice: {
        material: 'ice',
        density: 9,
        conductivity: 6,
        flammability: 0,
        brittleness: 7,
        resistances: { ice: 10, fire: 1 },
      },
      gas: {
        material: 'gas',
        density: 1,
        conductivity: 2,
        flammability: 8,
        brittleness: 10,
        resistances: { force: 9 },
        properties: { explosive: true },
      },
    };

    return presets[material] || presets.stone;
  }
}
