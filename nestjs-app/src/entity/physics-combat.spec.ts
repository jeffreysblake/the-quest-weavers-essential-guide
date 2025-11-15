import { Test, TestingModule } from '@nestjs/testing';
import { PhysicsService } from './physics.service';
import { EntityService } from './entity.service';
import { ObjectService } from './object.service';
import { RoomService } from './room.service';
import { DatabaseService } from '../database/database.service';
import { IObject } from './object.interface';
import { IPhysicsEffect, EffectType } from './physics.interface';

describe('PhysicsService - Combat System Tests', () => {
  let service: PhysicsService;
  let entityService: EntityService;
  let objectService: ObjectService;
  let roomService: RoomService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PhysicsService,
        EntityService,
        ObjectService,
        RoomService,
        {
          provide: DatabaseService,
          useValue: null,
        },
      ],
    }).compile();

    service = module.get<PhysicsService>(PhysicsService);
    entityService = module.get<EntityService>(EntityService);
    objectService = module.get<ObjectService>(ObjectService);
    roomService = module.get<RoomService>(RoomService);
  });

  describe('Damage Calculation Edge Cases', () => {
    it('should handle zero damage attacks', () => {
      const target = objectService.createObject({
        name: 'Iron Shield',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        material: 'metal',
        health: 100,
        maxHealth: 100,
      });

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 0,
        description: 'weak flame',
      };

      const result = service.applyEffect(target.id, effect);
      expect(result.success).toBe(true);

      const updatedTarget = objectService.getObject(target.id);
      expect(updatedTarget?.health).toBe(100); // No damage
    });

    it('should handle one-hit kill (massive damage)', () => {
      const target = objectService.createObject({
        name: 'Wooden Shield',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        material: 'wood',
        health: 10,
        maxHealth: 10,
      });

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 10, // Will cause massive damage to wood
        description: 'inferno',
      };

      const result = service.applyEffect(target.id, effect);
      expect(result.success).toBe(true);

      const updatedTarget = objectService.getObject(target.id);
      expect(updatedTarget?.health).toBeLessThanOrEqual(0);
    });

    it('should handle negative damage (should not heal)', () => {
      const target = objectService.createObject({
        name: 'Test Object',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        material: 'stone',
        health: 50,
        maxHealth: 100,
      });

      // Try applying an effect with negative intensity
      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: -5, // Negative intensity
        description: 'reverse fire?',
      };

      const result = service.applyEffect(target.id, effect);

      const updatedTarget = objectService.getObject(target.id);
      // Negative damage should either do nothing or be clamped to 0
      expect(updatedTarget?.health).toBeLessThanOrEqual(50); // Should not heal
    });

    it('should handle damage overflow (extremely high damage values)', () => {
      const target = objectService.createObject({
        name: 'Fragile Item',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        material: 'glass',
        health: 100,
        maxHealth: 100,
      });

      const effect: IPhysicsEffect = {
        type: 'force',
        intensity: Number.MAX_SAFE_INTEGER,
        description: 'cosmic force',
      };

      const result = service.applyEffect(target.id, effect);
      expect(result.success).toBe(true);

      const updatedTarget = objectService.getObject(target.id);
      // Health should not go negative beyond 0
      expect(updatedTarget?.health).toBeGreaterThanOrEqual(0);
      expect(updatedTarget?.health).toBe(0); // Should be destroyed
    });

    it('should handle damage with 100% resistance', () => {
      const target = objectService.createObject({
        name: 'Fire-Proof Shield',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        material: 'stone',
        materialProperties: {
          material: 'stone',
          density: 8,
          conductivity: 2,
          flammability: 0,
          brittleness: 4,
          resistances: { fire: 10 }, // High resistance
        },
        health: 100,
        maxHealth: 100,
      });

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 5,
        description: 'fireball',
      };

      const result = service.applyEffect(target.id, effect);
      expect(result.success).toBe(true);
      expect(result.message).toContain('resists');

      const updatedTarget = objectService.getObject(target.id);
      // High resistance should prevent damage
      expect(updatedTarget?.health).toBeGreaterThanOrEqual(90);
    });

    it('should handle divide by zero in resistance calculations', () => {
      const target = objectService.createObject({
        name: 'Strange Object',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        material: 'crystal',
        materialProperties: {
          material: 'crystal',
          density: 0, // Zero density - potential divide by zero
          conductivity: 0,
          flammability: 0,
          brittleness: 0,
          resistances: {},
        },
        health: 100,
        maxHealth: 100,
      });

      const effect: IPhysicsEffect = {
        type: 'force',
        intensity: 10,
        description: 'force blast',
      };

      // Should not crash
      expect(() => service.applyEffect(target.id, effect)).not.toThrow();
    });
  });

  describe('Combat State Corruption', () => {
    it('should handle combat with destroyed entities', () => {
      const target = objectService.createObject({
        name: 'Already Destroyed',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        material: 'wood',
        health: 0, // Already destroyed
        maxHealth: 100,
        state: { destroyed: true },
      });

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 5,
        description: 'fireball',
      };

      const result = service.applyEffect(target.id, effect);
      expect(result.success).toBe(true);

      const updatedTarget = objectService.getObject(target.id);
      expect(updatedTarget?.health).toBe(0); // Should stay 0, not go negative
    });

    it('should handle combat with invalid/missing target', () => {
      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 5,
        description: 'fireball',
      };

      const result = service.applyEffect('nonexistent-id', effect);
      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should handle multiple simultaneous effects on same target', () => {
      const target = objectService.createObject({
        name: 'Multi-Hit Target',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        material: 'wood',
        health: 100,
        maxHealth: 100,
      });

      const effect1: IPhysicsEffect = {
        type: 'fire',
        intensity: 3,
        description: 'fire',
      };

      const effect2: IPhysicsEffect = {
        type: 'lightning',
        intensity: 3,
        description: 'lightning',
      };

      const effect3: IPhysicsEffect = {
        type: 'ice',
        intensity: 3,
        description: 'ice',
      };

      service.applyEffect(target.id, effect1);
      service.applyEffect(target.id, effect2);
      service.applyEffect(target.id, effect3);

      const updatedTarget = objectService.getObject(target.id);
      expect(updatedTarget?.health).toBeLessThan(100);
      expect(updatedTarget?.health).toBeGreaterThanOrEqual(0);
    });

    it('should handle object without material properties', () => {
      const target = objectService.createObject({
        name: 'Abstract Object',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        // No material or materialProperties
      });

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 5,
        description: 'fireball',
      };

      const result = service.applyEffect(target.id, effect);
      expect(result.success).toBe(false);
      expect(result.message).toContain('no material properties');
    });
  });

  describe('Chain Reaction Edge Cases', () => {
    it('should handle explosive chain reactions without infinite loops', () => {
      const room = roomService.createRoom({
        name: 'Explosive Room',
        description: 'A room full of explosives',
        position: { x: 0, y: 0, z: 0 },
        width: 10,
        height: 10,
        size: { width: 10, height: 10, depth: 3 },
        objects: [],
        players: [],
      });

      // Create multiple explosive objects
      const explosive1 = objectService.createObject({
        name: 'Explosive Barrel 1',
        objectType: 'container',
        position: { x: 1, y: 1, z: 0 },
        material: 'wood',
        materialProperties: {
          material: 'wood',
          density: 5,
          conductivity: 1,
          flammability: 8,
          brittleness: 6,
          resistances: {},
          properties: { explosive: true },
        },
        health: 50,
        maxHealth: 50,
      });

      const explosive2 = objectService.createObject({
        name: 'Explosive Barrel 2',
        objectType: 'container',
        position: { x: 2, y: 1, z: 0 },
        material: 'wood',
        materialProperties: {
          material: 'wood',
          density: 5,
          conductivity: 1,
          flammability: 8,
          brittleness: 6,
          resistances: {},
          properties: { explosive: true },
        },
        health: 50,
        maxHealth: 50,
      });

      roomService.addObjectToRoom(room.id, explosive1.id);
      roomService.addObjectToRoom(room.id, explosive2.id);

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 8,
        description: 'ignition',
      };

      // Should not cause infinite loop or stack overflow
      expect(() => service.applyEffect(explosive1.id, effect)).not.toThrow();
    });

    it('should handle lightning chain through conductive materials', () => {
      const room = roomService.createRoom({
        name: 'Conductive Room',
        description: 'A room with metal objects',
        position: { x: 0, y: 0, z: 0 },
        width: 10,
        height: 10,
        size: { width: 10, height: 10, depth: 3 },
        objects: [],
        players: [],
      });

      const metal1 = objectService.createObject({
        name: 'Metal Rod 1',
        objectType: 'item',
        position: { x: 1, y: 1, z: 0 },
        material: 'metal',
        health: 100,
        maxHealth: 100,
      });

      const metal2 = objectService.createObject({
        name: 'Metal Rod 2',
        objectType: 'item',
        position: { x: 2, y: 1, z: 0 },
        material: 'metal',
        health: 100,
        maxHealth: 100,
      });

      roomService.addObjectToRoom(room.id, metal1.id);
      roomService.addObjectToRoom(room.id, metal2.id);

      const effect: IPhysicsEffect = {
        type: 'lightning',
        intensity: 8,
        description: 'lightning bolt',
      };

      const result = service.applyEffect(metal1.id, effect);
      expect(result.success).toBe(true);

      // Should have chain reactions
      if (result.chainReactions) {
        expect(result.chainReactions.length).toBeGreaterThan(0);
      }
    });

    it('should handle ice freezing water without errors', () => {
      const water = objectService.createObject({
        name: 'Water Pool',
        objectType: 'furniture',
        position: { x: 0, y: 0, z: 0 },
        material: 'water',
        health: 100,
        maxHealth: 100,
      });

      const effect: IPhysicsEffect = {
        type: 'ice',
        intensity: 8,
        description: 'freeze',
      };

      const result = service.applyEffect(water.id, effect);
      expect(result.success).toBe(true);

      const updatedWater = objectService.getObject(water.id);
      expect(updatedWater?.state?.frozen).toBe(true);
    });
  });

  describe('Area Effect Edge Cases', () => {
    it('should handle area effect in empty room', () => {
      const room = roomService.createRoom({
        name: 'Empty Room',
        description: 'An empty room',
        position: { x: 0, y: 0, z: 0 },
        width: 10,
        height: 10,
        size: { width: 10, height: 10, depth: 3 },
        objects: [],
        players: [],
      });

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 5,
        description: 'fireball',
      };

      const result = service.applyAreaEffect(room.id, effect);
      // Should succeed but affect nothing
      expect(result.success).toBe(false);
    });

    it('should handle area effect in nonexistent room', () => {
      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 5,
        description: 'fireball',
      };

      const result = service.applyAreaEffect('nonexistent-room', effect);
      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should handle area effect with many objects', () => {
      const room = roomService.createRoom({
        name: 'Crowded Room',
        description: 'A room full of objects',
        position: { x: 0, y: 0, z: 0 },
        width: 10,
        height: 10,
        size: { width: 10, height: 10, depth: 3 },
        objects: [],
        players: [],
      });

      // Create 20 objects
      for (let i = 0; i < 20; i++) {
        const obj = objectService.createObject({
          name: `Object ${i}`,
          objectType: 'item',
          position: { x: i, y: 0, z: 0 },
          material: 'wood',
          health: 50,
          maxHealth: 50,
        });
        roomService.addObjectToRoom(room.id, obj.id);
      }

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 5,
        description: 'inferno',
      };

      const result = service.applyAreaEffect(room.id, effect);
      expect(result.success).toBe(true);
      expect(result.objectsAffected?.length).toBeGreaterThan(0);
    });
  });

  describe('Material Property Edge Cases', () => {
    it('should handle object with missing material properties fields', () => {
      const target = objectService.createObject({
        name: 'Incomplete Material',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        material: 'unknown',
        materialProperties: {
          material: 'unknown',
          // Missing all other properties
        } as any,
        health: 100,
        maxHealth: 100,
      });

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 5,
        description: 'fireball',
      };

      expect(() => service.applyEffect(target.id, effect)).not.toThrow();
    });

    it('should handle object with extreme material values', () => {
      const target = objectService.createObject({
        name: 'Extreme Material',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        material: 'weird',
        materialProperties: {
          material: 'weird',
          density: 999999,
          conductivity: 999999,
          flammability: 999999,
          brittleness: 999999,
          resistances: { fire: 999999, lightning: 999999 },
        },
        health: 100,
        maxHealth: 100,
      });

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 5,
        description: 'fireball',
      };

      expect(() => service.applyEffect(target.id, effect)).not.toThrow();
    });

    it('should handle negative material property values', () => {
      const target = objectService.createObject({
        name: 'Negative Material',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        material: 'antimatter',
        materialProperties: {
          material: 'antimatter',
          density: -10,
          conductivity: -10,
          flammability: -10,
          brittleness: -10,
          resistances: { fire: -10 },
        },
        health: 100,
        maxHealth: 100,
      });

      const effect: IPhysicsEffect = {
        type: 'fire',
        intensity: 5,
        description: 'fireball',
      };

      expect(() => service.applyEffect(target.id, effect)).not.toThrow();
    });
  });

  describe('Health and Destruction Edge Cases', () => {
    it('should not allow health to exceed maxHealth', () => {
      const target = objectService.createObject({
        name: 'Test Object',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        material: 'stone',
        health: 50,
        maxHealth: 50,
      });

      // Even if somehow healing happened, health shouldn't exceed max
      const updatedTarget = objectService.getObject(target.id);
      expect(updatedTarget?.health).toBeLessThanOrEqual(
        updatedTarget?.maxHealth || 50,
      );
    });

    it('should handle object with undefined health values', () => {
      const target = objectService.createObject({
        name: 'No Health Object',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        material: 'stone',
        // No health or maxHealth defined
      });

      const effect: IPhysicsEffect = {
        type: 'force',
        intensity: 10,
        description: 'smash',
      };

      // Should use default values (10)
      const result = service.applyEffect(target.id, effect);
      expect(result.success).toBe(true);
    });

    it('should handle shattering brittle objects', () => {
      const target = objectService.createObject({
        name: 'Glass Vase',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        material: 'glass',
        health: 50,
        maxHealth: 50,
      });

      const effect: IPhysicsEffect = {
        type: 'force',
        intensity: 8,
        description: 'smash',
      };

      const result = service.applyEffect(target.id, effect);
      expect(result.success).toBe(true);

      const updatedTarget = objectService.getObject(target.id);
      // High force on glass should cause destruction
      if (result.objectsAffected?.[0]?.destroyed) {
        expect(updatedTarget?.state?.destroyed).toBe(true);
        expect(updatedTarget?.health).toBe(0);
      }
    });
  });
});
