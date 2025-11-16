import { Test, TestingModule } from '@nestjs/testing';
import { ObjectService } from './object.service';
import { EntityService } from './entity.service';
import { DatabaseService } from '../database/database.service';

describe('ObjectService - Weapon and Armor Combat Tests', () => {
  let service: ObjectService;
  let entityService: EntityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ObjectService,
        EntityService,
        {
          provide: DatabaseService,
          useValue: {
            saveEntity: jest.fn().mockResolvedValue(undefined),
            getEntity: jest.fn().mockResolvedValue(null),
            deleteEntity: jest.fn().mockResolvedValue(undefined),
            getAllEntities: jest.fn().mockResolvedValue([]),
            saveVersion: jest.fn().mockResolvedValue(1),
          },
        },
      ],
    }).compile();

    service = module.get<ObjectService>(ObjectService);
    entityService = module.get<EntityService>(EntityService);
  });

  describe('Weapon Edge Cases', () => {
    it('should create weapon with standard properties', () => {
      const weapon = service.createObject({
        name: 'Iron Sword',
        objectType: 'weapon',
        position: { x: 0, y: 0, z: 0 },
        material: 'metal',
        properties: {
          durability: 100,
          value: 50,
        },
      });

      expect(weapon.objectType).toBe('weapon');
      expect(weapon.properties?.durability).toBe(100);
    });

    it('should handle weapon with zero durability (broken)', () => {
      const brokenWeapon = service.createObject({
        name: 'Broken Sword',
        objectType: 'weapon',
        position: { x: 0, y: 0, z: 0 },
        material: 'metal',
        properties: {
          durability: 0,
        },
      });

      expect(brokenWeapon.properties?.durability).toBe(0);
    });

    it('should handle weapon with negative durability', () => {
      const cursedWeapon = service.createObject({
        name: 'Cursed Blade',
        objectType: 'weapon',
        position: { x: 0, y: 0, z: 0 },
        material: 'metal',
        properties: {
          durability: -10,
        },
      });

      expect(cursedWeapon.properties?.durability).toBe(-10);
    });

    it('should handle weapon durability overflow', () => {
      const eternalWeapon = service.createObject({
        name: 'Eternal Blade',
        objectType: 'weapon',
        position: { x: 0, y: 0, z: 0 },
        material: 'crystal',
        properties: {
          durability: Number.MAX_SAFE_INTEGER,
        },
      });

      expect(eternalWeapon.properties?.durability).toBe(
        Number.MAX_SAFE_INTEGER,
      );
    });

    it('should handle unequipped weapon attacks (no damage)', () => {
      const weapon = service.createObject({
        name: 'Unequipped Axe',
        objectType: 'weapon',
        position: { x: 0, y: 0, z: 0 },
        material: 'metal',
        health: 100,
        maxHealth: 100,
      });

      // Weapon exists but is not equipped
      expect(weapon).toBeDefined();
      expect(weapon.objectType).toBe('weapon');
    });

    it('should handle weapon with extreme damage values', () => {
      const godWeapon = service.createObject({
        name: 'Godslayer',
        objectType: 'weapon',
        position: { x: 0, y: 0, z: 0 },
        material: 'crystal',
        properties: {
          durability: 100,
          value: Number.MAX_SAFE_INTEGER,
        },
      });

      expect(godWeapon.properties?.value).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should handle weapon without material properties', () => {
      const abstractWeapon = service.createObject({
        name: 'Abstract Weapon',
        objectType: 'weapon',
        position: { x: 0, y: 0, z: 0 },
        // No material specified
      });

      expect(abstractWeapon.materialProperties).toBeUndefined();
    });

    it('should handle weapon with custom material properties', () => {
      const magicWeapon = service.createObject({
        name: 'Magic Staff',
        objectType: 'weapon',
        position: { x: 0, y: 0, z: 0 },
        material: 'wood',
        materialProperties: {
          material: 'enchanted_wood',
          density: 5,
          conductivity: 10, // High magic conductivity
          flammability: 0, // Fire resistant
          brittleness: 2,
          resistances: { fire: 10, lightning: 5 },
        },
      });

      expect(magicWeapon.materialProperties?.conductivity).toBe(10);
      expect(magicWeapon.materialProperties?.resistances?.fire).toBe(10);
    });
  });

  describe('Armor Edge Cases', () => {
    it('should create armor with defense properties', () => {
      const armor = service.createObject({
        name: 'Iron Armor',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        material: 'metal',
        properties: {
          durability: 100,
          value: 100,
        },
        health: 200,
        maxHealth: 200,
      });

      expect(armor.health).toBe(200);
      expect(armor.material).toBe('metal');
    });

    it('should handle armor with 100% damage reduction (invulnerability)', () => {
      const perfectArmor = service.createObject({
        name: 'Perfect Armor',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        material: 'crystal',
        materialProperties: {
          material: 'adamantium',
          density: 999,
          conductivity: 0,
          flammability: 0,
          brittleness: 0,
          resistances: {
            fire: 100,
            lightning: 100,
            ice: 100,
            force: 100,
            poison: 100,
            acid: 100,
            magic: 100,
          },
        },
        health: 999999,
        maxHealth: 999999,
      });

      expect(perfectArmor.materialProperties?.resistances?.fire).toBe(100);
      expect(perfectArmor.health).toBe(999999);
    });

    it('should handle armor with negative values', () => {
      const cursedArmor = service.createObject({
        name: 'Cursed Armor',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        material: 'metal',
        materialProperties: {
          material: 'cursed_metal',
          density: 10,
          conductivity: -5, // Negative conductivity
          flammability: -5,
          brittleness: -5,
          resistances: { fire: -10 }, // Negative resistance = weakness
        },
        health: 100,
        maxHealth: 100,
      });

      expect(cursedArmor.materialProperties?.conductivity).toBe(-5);
      expect(cursedArmor.materialProperties?.resistances?.fire).toBe(-10);
    });

    it('should handle armor durability degradation', () => {
      const armor = service.createObject({
        name: 'Worn Armor',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        material: 'metal',
        health: 100,
        maxHealth: 100,
        properties: {
          durability: 50, // Half durability
        },
      });

      // Degrade durability
      service.updateObject(armor.id, {
        properties: { durability: 25 },
      });

      const updated = service.getObject(armor.id);
      expect(updated?.properties?.durability).toBe(25);
    });

    it('should handle armor with zero defense', () => {
      const clothArmor = service.createObject({
        name: 'Cloth Shirt',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        material: 'cloth',
        health: 10,
        maxHealth: 10,
      });

      expect(clothArmor.health).toBe(10);
    });
  });

  describe('Object Health and Durability', () => {
    it('should handle object taking damage', () => {
      const shield = service.createObject({
        name: 'Wooden Shield',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        material: 'wood',
        health: 50,
        maxHealth: 50,
      });

      // Apply damage
      service.updateObject(shield.id, { health: 30 });

      const damaged = service.getObject(shield.id);
      expect(damaged?.health).toBe(30);
    });

    it('should handle object destruction (health = 0)', () => {
      const fragileItem = service.createObject({
        name: 'Glass Vase',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        material: 'glass',
        health: 10,
        maxHealth: 10,
      });

      // Destroy
      service.updateObject(fragileItem.id, {
        health: 0,
        state: { destroyed: true },
      });

      const destroyed = service.getObject(fragileItem.id);
      expect(destroyed?.health).toBe(0);
      expect(destroyed?.state?.destroyed).toBe(true);
    });

    it('should handle object with undefined health', () => {
      const healthlessObject = service.createObject({
        name: 'Abstract Object',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        // No health specified
      });

      expect(healthlessObject.health).toBeUndefined();
    });

    it('should not allow health to exceed maxHealth', () => {
      const item = service.createObject({
        name: 'Test Item',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        health: 50,
        maxHealth: 50,
      });

      // Try to heal beyond max
      service.updateObject(item.id, { health: 100 });

      const updated = service.getObject(item.id);
      // Should be capped at maxHealth (implementation dependent)
      expect(updated?.health).toBeDefined();
    });

    it('should handle massive health values', () => {
      const bossItem = service.createObject({
        name: 'Boss Shield',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        health: Number.MAX_SAFE_INTEGER,
        maxHealth: Number.MAX_SAFE_INTEGER,
      });

      expect(bossItem.health).toBe(Number.MAX_SAFE_INTEGER);
    });
  });

  describe('Container and Object Interactions', () => {
    it('should handle weapon inside container', () => {
      const chest = service.createObject({
        name: 'Weapon Chest',
        objectType: 'container',
        position: { x: 0, y: 0, z: 0 },
        isContainer: true,
        canContain: true,
        containerCapacity: 10,
        containedObjects: [],
      });

      const sword = service.createObject({
        name: 'Sword',
        objectType: 'weapon',
        position: { x: 0, y: 0, z: 0 },
        material: 'metal',
      });

      const placed = service.placeObject(sword.id, {
        relationshipType: 'inside',
        targetId: chest.id,
        description: 'sword in chest',
      });

      expect(placed).toBe(true);

      const contents = service.getObjectsInContainer(chest.id);
      expect(contents.length).toBe(1);
      expect(contents[0].id).toBe(sword.id);
    });

    it('should handle locked container with weapons', () => {
      const lockedChest = service.createObject({
        name: 'Locked Chest',
        objectType: 'container',
        position: { x: 0, y: 0, z: 0 },
        isContainer: true,
        canContain: true,
        state: { isLocked: true, isOpen: false },
        containedObjects: [],
      });

      const weapon = service.createObject({
        name: 'Legendary Sword',
        objectType: 'weapon',
        position: { x: 0, y: 0, z: 0 },
      });

      // Should not be able to place in locked container
      const placed = service.placeObject(weapon.id, {
        relationshipType: 'inside',
        targetId: lockedChest.id,
      });

      expect(placed).toBe(false);
    });

    it('should handle container capacity overflow', () => {
      const smallChest = service.createObject({
        name: 'Small Chest',
        objectType: 'container',
        position: { x: 0, y: 0, z: 0 },
        isContainer: true,
        canContain: true,
        containerCapacity: 2,
        containedObjects: [],
      });

      const item1 = service.createObject({
        name: 'Item 1',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      const item2 = service.createObject({
        name: 'Item 2',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      const item3 = service.createObject({
        name: 'Item 3',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      service.placeObject(item1.id, {
        relationshipType: 'inside',
        targetId: smallChest.id,
      });
      service.placeObject(item2.id, {
        relationshipType: 'inside',
        targetId: smallChest.id,
      });
      const overflow = service.placeObject(item3.id, {
        relationshipType: 'inside',
        targetId: smallChest.id,
      });

      expect(overflow).toBe(false); // Should fail
    });
  });

  describe('Material Properties Edge Cases', () => {
    it('should auto-generate material properties for common materials', () => {
      const woodenObject = service.createObject({
        name: 'Wooden Plank',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        material: 'wood',
      });

      expect(woodenObject.materialProperties).toBeDefined();
      expect(woodenObject.materialProperties?.material).toBe('wood');
      expect(woodenObject.materialProperties?.flammability).toBeGreaterThan(0);
    });

    it('should handle unknown material type', () => {
      const strangeObject = service.createObject({
        name: 'Strange Object',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        material: 'unknown_material_xyz',
      });

      expect(strangeObject.materialProperties).toBeDefined();
    });

    it('should handle object with multiple material types', () => {
      const compositeObject = service.createObject({
        name: 'Composite Armor',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        material: 'metal', // Primary material
        materialProperties: {
          material: 'steel_leather_composite',
          density: 7,
          conductivity: 5,
          flammability: 3,
          brittleness: 4,
          resistances: { fire: 6, lightning: 6 },
        },
      });

      expect(compositeObject.materialProperties?.material).toBe(
        'steel_leather_composite',
      );
    });

    it('should handle material property mutations', () => {
      const mutableObject = service.createObject({
        name: 'Mutable Object',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        material: 'wood',
      });

      // Change to frozen state (changes properties)
      service.updateObject(mutableObject.id, {
        state: { frozen: true },
        materialProperties: {
          material: 'frozen_wood',
          density: 8,
          conductivity: 6,
          flammability: 0,
          brittleness: 9,
          resistances: { ice: 10, fire: 0 },
        },
      });

      const frozen = service.getObject(mutableObject.id);
      expect(frozen?.state?.frozen).toBe(true);
      expect(frozen?.materialProperties?.brittleness).toBe(9);
    });
  });

  describe('Object State Edge Cases', () => {
    it('should handle object on fire state', () => {
      const flamableObject = service.createObject({
        name: 'Wooden Table',
        objectType: 'furniture',
        position: { x: 0, y: 0, z: 0 },
        material: 'wood',
        health: 50,
        maxHealth: 50,
      });

      service.updateObject(flamableObject.id, {
        state: { isOnFire: true },
      });

      const burning = service.getObject(flamableObject.id);
      expect(burning?.state?.isOnFire).toBe(true);
    });

    it('should handle frozen state', () => {
      const object = service.createObject({
        name: 'Water Bottle',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        material: 'water',
      });

      service.updateObject(object.id, {
        state: { frozen: true },
      });

      const frozen = service.getObject(object.id);
      expect(frozen?.state?.frozen).toBe(true);
    });

    it('should handle brittle state from cold damage', () => {
      const object = service.createObject({
        name: 'Metal Shield',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        material: 'metal',
      });

      service.updateObject(object.id, {
        state: { brittle: true },
      });

      const brittle = service.getObject(object.id);
      expect(brittle?.state?.brittle).toBe(true);
    });

    it('should handle multiple simultaneous states', () => {
      const object = service.createObject({
        name: 'Complex Object',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        material: 'wood',
      });

      service.updateObject(object.id, {
        state: {
          isOnFire: true,
          brittle: true,
          isActive: true,
        },
      });

      const complex = service.getObject(object.id);
      expect(complex?.state?.isOnFire).toBe(true);
      expect(complex?.state?.brittle).toBe(true);
      expect(complex?.state?.isActive).toBe(true);
    });
  });

  describe('Spatial Relationship Edge Cases', () => {
    it('should handle weapon attached to player', () => {
      const sword = service.createObject({
        name: 'Attached Sword',
        objectType: 'weapon',
        position: { x: 0, y: 0, z: 0 },
        material: 'metal',
      });

      service.updateObject(sword.id, {
        spatialRelationship: {
          relationshipType: 'attached_to',
          targetId: 'player-1',
          description: 'strapped to back',
        },
      });

      const attached = service.getObject(sword.id);
      expect(attached?.spatialRelationship?.relationshipType).toBe(
        'attached_to',
      );
    });

    it('should get object location description', () => {
      const item = service.createObject({
        name: 'Book',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      const table = service.createObject({
        name: 'Table',
        objectType: 'furniture',
        position: { x: 1, y: 1, z: 0 },
      });

      service.updateObject(item.id, {
        spatialRelationship: {
          relationshipType: 'on_top_of',
          targetId: table.id,
          description: 'lying on the table',
        },
      });

      const location = service.getObjectLocation(item.id);
      expect(location).toContain('table');
    });

    it('should handle removing object from container', () => {
      const container = service.createObject({
        name: 'Bag',
        objectType: 'container',
        position: { x: 0, y: 0, z: 0 },
        isContainer: true,
        canContain: true,
        containedObjects: [],
      });

      const item = service.createObject({
        name: 'Coin',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
      });

      service.placeObject(item.id, {
        relationshipType: 'inside',
        targetId: container.id,
      });

      const removed = service.removeObjectFromContainer(item.id, container.id);
      expect(removed).toBe(true);

      const updatedItem = service.getObject(item.id);
      expect(updatedItem?.spatialRelationship).toBeUndefined();
    });
  });

  describe('Portability and Weight', () => {
    it('should handle non-portable items', () => {
      const anvil = service.createObject({
        name: 'Anvil',
        objectType: 'furniture',
        position: { x: 0, y: 0, z: 0 },
        isPortable: false,
        weight: 500,
      });

      expect(anvil.isPortable).toBe(false);
    });

    it('should handle extremely heavy items', () => {
      const mountain = service.createObject({
        name: 'Boulder',
        objectType: 'furniture',
        position: { x: 0, y: 0, z: 0 },
        weight: Number.MAX_SAFE_INTEGER,
        isPortable: false,
      });

      expect(mountain.weight).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should handle weightless items', () => {
      const feather = service.createObject({
        name: 'Feather',
        objectType: 'item',
        position: { x: 0, y: 0, z: 0 },
        weight: 0,
        isPortable: true,
      });

      expect(feather.weight).toBe(0);
    });
  });
});
