import { Test, TestingModule } from '@nestjs/testing';
import { PlayerService } from './player.service';
import { EntityService } from './entity.service';
import { ObjectService } from './object.service';
import { PhysicsService } from './physics.service';
import { RoomService } from './room.service';
import { DatabaseService } from '../database/database.service';

describe('PlayerService - Combat System Tests', () => {
  let service: PlayerService;
  let entityService: EntityService;
  let objectService: ObjectService;
  let physicsService: PhysicsService;
  let roomService: RoomService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayerService,
        EntityService,
        ObjectService,
        PhysicsService,
        RoomService,
        {
          provide: DatabaseService,
          useValue: null, // No database for unit tests
        },
      ],
    }).compile();

    service = module.get<PlayerService>(PlayerService);
    entityService = module.get<EntityService>(EntityService);
    objectService = module.get<ObjectService>(ObjectService);
    physicsService = module.get<PhysicsService>(PhysicsService);
    roomService = module.get<RoomService>(RoomService);
  });

  describe('Player Death and Respawn', () => {
    it('should handle player death (health reaches 0)', () => {
      const player = service.createPlayer({
        name: 'Test Hero',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 1,
        experience: 0,
      });

      // Reduce health to 0
      service.updatePlayer(player.id, { health: 0 });

      const updatedPlayer = service.getPlayer(player.id);
      expect(updatedPlayer?.health).toBe(0);
    });

    it('should handle multiple deaths in succession', () => {
      const player = service.createPlayer({
        name: 'Unlucky Hero',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 1,
        experience: 0,
      });

      // First death
      service.updatePlayer(player.id, { health: 0 });
      let updatedPlayer = service.getPlayer(player.id);
      expect(updatedPlayer?.health).toBe(0);

      // Respawn
      service.updatePlayer(player.id, { health: 100 });
      updatedPlayer = service.getPlayer(player.id);
      expect(updatedPlayer?.health).toBe(100);

      // Second death
      service.updatePlayer(player.id, { health: 0 });
      updatedPlayer = service.getPlayer(player.id);
      expect(updatedPlayer?.health).toBe(0);

      // Should maintain player state
      expect(updatedPlayer).toBeDefined();
      expect(updatedPlayer?.level).toBe(1);
    });

    it('should preserve inventory items on death', () => {
      const player = service.createPlayer({
        name: 'Hero',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 1,
        experience: 0,
      });

      const item = objectService.createObject({
        name: 'Magic Sword',
        objectType: 'weapon',
        position: { x: 0, y: 0, z: 0 },
      });

      service.addToInventory(player.id, item.id);

      // Die
      service.updatePlayer(player.id, { health: 0 });

      const deadPlayer = service.getPlayer(player.id);
      expect(deadPlayer?.inventory).toContain(item.id);
    });

    it('should handle death with negative health', () => {
      const player = service.createPlayer({
        name: 'Hero',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 1,
        experience: 0,
      });

      // Set to negative health
      service.updatePlayer(player.id, { health: -50 });

      const updatedPlayer = service.getPlayer(player.id);
      // Health should be negative or clamped to 0 depending on implementation
      expect(updatedPlayer?.health).toBeLessThanOrEqual(0);
    });

    it('should validate respawn location', () => {
      const player = service.createPlayer({
        name: 'Hero',
        position: { x: 0, y: 0, z: 0 },
        health: 0, // Dead
        inventory: [],
        level: 1,
        experience: 0,
      });

      const room = roomService.createRoom({
        name: 'Respawn Room',
        description: 'Safe room',
        position: { x: 10, y: 10, z: 0 },
        width: 10,
        height: 10,
        size: { width: 10, height: 10, depth: 3 },
        objects: [],
        players: [],
      });

      // Respawn player
      service.updatePlayer(player.id, {
        health: 100,
        position: { x: 10, y: 10, z: 0 },
        roomId: room.id,
      });

      const respawnedPlayer = service.getPlayer(player.id);
      expect(respawnedPlayer?.health).toBe(100);
      expect(respawnedPlayer?.roomId).toBe(room.id);
    });
  });

  describe('Health Edge Cases', () => {
    it('should not allow health to exceed maxHealth', () => {
      const player = service.createPlayer({
        name: 'Hero',
        position: { x: 0, y: 0, z: 0 },
        health: 50,
        maxHealth: 100,
        inventory: [],
        level: 1,
        experience: 0,
      });

      // Try to set health above max
      service.updatePlayer(player.id, { health: 150 });

      const updatedPlayer = service.getPlayer(player.id);
      // Implementation should cap at maxHealth
      expect(updatedPlayer?.health).toBeLessThanOrEqual(updatedPlayer?.maxHealth || 100);
    });

    it('should handle health with undefined maxHealth', () => {
      const player = service.createPlayer({
        name: 'Hero',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        // No maxHealth specified
        inventory: [],
        level: 1,
        experience: 0,
      });

      expect(player.health).toBe(100);
      // maxHealth should default or be undefined
    });

    it('should handle zero health edge case', () => {
      const player = service.createPlayer({
        name: 'Hero',
        position: { x: 0, y: 0, z: 0 },
        health: 0,
        inventory: [],
        level: 1,
        experience: 0,
      });

      expect(player.health).toBe(0);
    });

    it('should handle MAX_SAFE_INTEGER health', () => {
      const player = service.createPlayer({
        name: 'Immortal',
        position: { x: 0, y: 0, z: 0 },
        health: Number.MAX_SAFE_INTEGER,
        maxHealth: Number.MAX_SAFE_INTEGER,
        inventory: [],
        level: 1,
        experience: 0,
      });

      expect(player.health).toBe(Number.MAX_SAFE_INTEGER);
    });
  });

  describe('Spell Casting and Combat', () => {
    it('should cast spell on target successfully', () => {
      const player = service.createPlayer({
        name: 'Mage',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 5,
        experience: 100,
      });

      const target = objectService.createObject({
        name: 'Enemy',
        objectType: 'item',
        position: { x: 1, y: 1, z: 0 },
        material: 'wood',
        health: 50,
        maxHealth: 50,
      });

      const result = service.castSpell(player.id, 'fire', target.id, 5);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Fireball');
    });

    it('should handle spell casting with invalid target', () => {
      const player = service.createPlayer({
        name: 'Mage',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 5,
        experience: 100,
      });

      const result = service.castSpell(player.id, 'fire', 'nonexistent-target', 5);

      // Should fail or return appropriate error
      expect(result).toBeDefined();
    });

    it('should handle spell casting with zero intensity', () => {
      const player = service.createPlayer({
        name: 'Mage',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 5,
        experience: 100,
      });

      const target = objectService.createObject({
        name: 'Enemy',
        objectType: 'item',
        position: { x: 1, y: 1, z: 0 },
        material: 'wood',
        health: 50,
        maxHealth: 50,
      });

      const result = service.castSpell(player.id, 'fire', target.id, 0);

      expect(result).toBeDefined();
    });

    it('should handle area spell casting', () => {
      const player = service.createPlayer({
        name: 'Mage',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 5,
        experience: 100,
      });

      const room = roomService.createRoom({
        name: 'Battle Room',
        description: 'A room for combat',
        position: { x: 0, y: 0, z: 0 },
        width: 10,
        height: 10,
        size: { width: 10, height: 10, depth: 3 },
        objects: [],
        players: [],
      });

      const result = service.castAreaSpell(player.id, 'fire', room.id, 5);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Fireball');
    });

    it('should handle spell casting by nonexistent player', () => {
      const target = objectService.createObject({
        name: 'Enemy',
        objectType: 'item',
        position: { x: 1, y: 1, z: 0 },
        material: 'wood',
        health: 50,
        maxHealth: 50,
      });

      const result = service.castSpell('nonexistent-player', 'fire', target.id, 5);

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should handle extreme spell intensity', () => {
      const player = service.createPlayer({
        name: 'Archmage',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 99,
        experience: 999999,
      });

      const target = objectService.createObject({
        name: 'Boss',
        objectType: 'item',
        position: { x: 1, y: 1, z: 0 },
        material: 'stone',
        health: 1000,
        maxHealth: 1000,
      });

      const result = service.castSpell(player.id, 'force', target.id, 999);

      expect(result).toBeDefined();
      // Should not crash
    });
  });

  describe('Inventory Management in Combat', () => {
    it('should handle using weapon from inventory', () => {
      const player = service.createPlayer({
        name: 'Warrior',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 5,
        experience: 100,
      });

      const weapon = objectService.createObject({
        name: 'Sword',
        objectType: 'weapon',
        position: { x: 0, y: 0, z: 0 },
        material: 'metal',
        properties: {
          durability: 100,
        },
      });

      service.addToInventory(player.id, weapon.id);

      const result = service.useObject(player.id, weapon.id);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Sword');
    });

    it('should handle consumable item usage in combat', () => {
      const player = service.createPlayer({
        name: 'Hero',
        position: { x: 0, y: 0, z: 0 },
        health: 50,
        inventory: [],
        level: 1,
        experience: 0,
      });

      const potion = objectService.createObject({
        name: 'Health Potion',
        objectType: 'consumable',
        position: { x: 0, y: 0, z: 0 },
      });

      service.addToInventory(player.id, potion.id);

      const result = service.useObject(player.id, potion.id);

      expect(result.success).toBe(true);

      // Consumable should be removed from inventory
      const updatedPlayer = service.getPlayer(player.id);
      expect(updatedPlayer?.inventory).not.toContain(potion.id);
    });

    it('should handle dropping item during combat', () => {
      const player = service.createPlayer({
        name: 'Hero',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 1,
        experience: 0,
        roomId: 'room-1',
      });

      const item = objectService.createObject({
        name: 'Heavy Shield',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      service.addToInventory(player.id, item.id);

      const result = service.dropObject(player.id, item.id);

      expect(result.success).toBe(true);

      const updatedPlayer = service.getPlayer(player.id);
      expect(updatedPlayer?.inventory).not.toContain(item.id);
    });

    it('should handle inventory overflow', () => {
      const player = service.createPlayer({
        name: 'Hoarder',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 1,
        experience: 0,
      });

      // Add many items
      for (let i = 0; i < 100; i++) {
        const item = objectService.createObject({
          name: `Item ${i}`,
          objectType: 'item',
          position: { x: 0, y: 0, z: 0 },
        });
        service.addToInventory(player.id, item.id);
      }

      const updatedPlayer = service.getPlayer(player.id);
      expect(updatedPlayer?.inventory.length).toBe(100);
    });
  });

  describe('Player Object Interactions', () => {
    it('should examine object in combat scenario', () => {
      const player = service.createPlayer({
        name: 'Hero',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 1,
        experience: 0,
      });

      const enemy = objectService.createObject({
        name: 'Goblin',
        objectType: 'item',
        position: { x: 1, y: 1, z: 0 },
        description: 'A hostile goblin',
      });

      const result = service.examineObject(player.id, enemy.id);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Goblin');
    });

    it('should take object during combat', () => {
      const player = service.createPlayer({
        name: 'Hero',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 1,
        experience: 0,
      });

      const loot = objectService.createObject({
        name: 'Gold Coin',
        objectType: 'item',
        position: { x: 1, y: 1, z: 0 },
        isPortable: true,
      });

      const result = service.takeObject(player.id, loot.id);

      expect(result.success).toBe(true);

      const updatedPlayer = service.getPlayer(player.id);
      expect(updatedPlayer?.inventory).toContain(loot.id);
    });

    it('should handle interacting with locked container in combat', () => {
      const player = service.createPlayer({
        name: 'Hero',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 1,
        experience: 0,
      });

      const chest = objectService.createObject({
        name: 'Locked Chest',
        objectType: 'container',
        position: { x: 1, y: 1, z: 0 },
        isContainer: true,
        state: { isLocked: true, isOpen: false },
      });

      const result = service.interactWithObject(player.id, chest.id, 'open');

      expect(result.success).toBe(false);
      expect(result.message).toContain('locked');
    });
  });

  describe('Player State Corruption Prevention', () => {
    it('should handle player with missing required fields', () => {
      const player = service.createPlayer({
        name: 'Broken Hero',
        position: { x: 0, y: 0, z: 0 },
        // Missing health, should use default
        inventory: [],
        level: 1,
        experience: 0,
      } as any);

      expect(player.health).toBeDefined();
      expect(player.health).toBe(100); // Default value
    });

    it('should handle concurrent player updates', () => {
      const player = service.createPlayer({
        name: 'Hero',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 1,
        experience: 0,
      });

      // Simulate concurrent updates
      service.updatePlayer(player.id, { health: 90 });
      service.updatePlayer(player.id, { level: 2 });
      service.updatePlayer(player.id, { experience: 100 });

      const updatedPlayer = service.getPlayer(player.id);
      expect(updatedPlayer?.health).toBe(90);
      expect(updatedPlayer?.level).toBe(2);
      expect(updatedPlayer?.experience).toBe(100);
    });

    it('should handle player in invalid position', () => {
      const player = service.createPlayer({
        name: 'Lost Hero',
        position: { x: NaN, y: NaN, z: NaN },
        health: 100,
        inventory: [],
        level: 1,
        experience: 0,
      });

      expect(player).toBeDefined();
      // Position should still be set even if invalid
    });

    it('should get inventory stats without errors', () => {
      const player = service.createPlayer({
        name: 'Hero',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 1,
        experience: 0,
      });

      const item1 = objectService.createObject({
        name: 'Sword',
        objectType: 'weapon',
        position: { x: 0, y: 0, z: 0 },
        weight: 10,
        properties: { value: 100 },
      });

      const item2 = objectService.createObject({
        name: 'Shield',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        weight: 15,
        properties: { value: 75 },
      });

      service.addToInventory(player.id, item1.id);
      service.addToInventory(player.id, item2.id);

      const stats = service.getInventoryStats(player.id);

      expect(stats.totalItems).toBe(2);
      expect(stats.totalWeight).toBe(25);
      expect(stats.totalValue).toBe(175);
    });
  });

  describe('Player Level and Experience', () => {
    it('should handle experience overflow', () => {
      const player = service.createPlayer({
        name: 'Max Level Hero',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 99,
        experience: Number.MAX_SAFE_INTEGER,
      });

      expect(player.experience).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should handle negative experience', () => {
      const player = service.createPlayer({
        name: 'Cursed Hero',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 1,
        experience: -100,
      });

      expect(player.experience).toBe(-100);
    });

    it('should handle level 0 edge case', () => {
      const player = service.createPlayer({
        name: 'Newborn Hero',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        inventory: [],
        level: 0,
        experience: 0,
      });

      expect(player.level).toBe(0);
    });
  });
});
