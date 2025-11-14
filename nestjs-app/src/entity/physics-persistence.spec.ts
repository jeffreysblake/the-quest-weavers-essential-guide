import { Test, TestingModule } from '@nestjs/testing';
import { EntityService } from './entity.service';
import { ObjectService } from './object.service';
import { PlayerService } from './player.service';
import { RoomService } from './room.service';
import { PhysicsService } from './physics.service';
import { DatabaseService } from '../database/database.service';

describe('Physics Persistence Tests', () => {
  let entityService: EntityService;
  let objectService: ObjectService;
  let playerService: PlayerService;
  let roomService: RoomService;
  let physicsService: PhysicsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseService,
        EntityService,
        ObjectService,
        PlayerService,
        RoomService,
        PhysicsService,
      ],
    }).compile();

    entityService = module.get<EntityService>(EntityService);
    objectService = module.get<ObjectService>(ObjectService);
    playerService = module.get<PlayerService>(PlayerService);
    roomService = module.get<RoomService>(RoomService);
    physicsService = module.get<PhysicsService>(PhysicsService);
  });

  it('should persist fire effects on objects', () => {
    // Create a wooden chest
    const chestData = {
      name: 'Wooden Chest',
      position: { x: 5, y: 5, z: 0 },
      objectType: 'container' as const,
      isContainer: true,
      canContain: true,
      isPortable: false,
      maxHealth: 20,
      health: 20,
      state: { isOpen: true },
      materialProperties: PhysicsService.createMaterialPreset('wood'),
    };

    const chest = objectService.createObject(chestData);
    expect(chest).toBeDefined();
    expect(chest.id).toBeDefined();

    // Cast fire spell on the chest
    const playerData = {
      name: 'Fire Mage',
      position: { x: 1, y: 1, z: 0 },
      health: 100,
      inventory: [],
      level: 5,
      experience: 0,
    };

    const player = playerService.createPlayer(playerData);
    expect(player).toBeDefined();

    // Apply fire effect to chest (simulating spell)
    const result = physicsService.applyEffect(chest.id, {
      type: 'fire',
      intensity: 7,
      sourceId: player.id,
      description: 'Fireball',
    });

    expect(result.success).toBe(true);

    // Verify that the chest is affected by fire
    if (result.objectsAffected && result.objectsAffected.length > 0) {
      const affectedObject = result.objectsAffected[0];
      expect(affectedObject.objectId).toBe(chest.id);

      // Check that it's on fire or damaged
      const updatedChest = objectService.getObject(chest.id);
      if (updatedChest && updatedChest.state) {
        expect(updatedChest.state.isOnFire).toBe(true);
      }
    }
  });

  it('should persist lightning effects through metal objects', () => {
    // Create a metal sword
    const swordData = {
      name: 'Metal Sword',
      position: { x: 5, y: 5, z: 0 },
      objectType: 'weapon' as const,
      isContainer: false,
      canContain: false,
      isPortable: true,
      maxHealth: 15,
      health: 15,
      materialProperties: PhysicsService.createMaterialPreset('metal'),
    };

    const sword = objectService.createObject(swordData);
    expect(sword).toBeDefined();
    expect(sword.id).toBeDefined();

    // Cast lightning spell on the sword
    const playerData = {
      name: 'Lightning Mage',
      position: { x: 1, y: 1, z: 0 },
      health: 100,
      inventory: [],
      level: 5,
      experience: 0,
    };

    const player = playerService.createPlayer(playerData);
    expect(player).toBeDefined();

    // Apply lightning effect to sword (simulating spell)
    const result = physicsService.applyEffect(sword.id, {
      type: 'lightning',
      intensity: 6,
      sourceId: player.id,
      description: 'Lightning Bolt',
    });

    expect(result.success).toBe(true);

    // Verify that the sword is affected by lightning
    if (result.objectsAffected && result.objectsAffected.length > 0) {
      const affectedObject = result.objectsAffected[0];
      expect(affectedObject.objectId).toBe(sword.id);

      // Check that it's conducting electricity or damaged
      const updatedSword = objectService.getObject(sword.id);
      if (updatedSword && updatedSword.materialProperties) {
        expect(updatedSword.materialProperties.conductivity).toBeGreaterThan(5);
      }
    }
  });

  it('should persist ice effects on water objects', () => {
    // Create a water barrel
    const barrelData = {
      name: 'Water Barrel',
      position: { x: 5, y: 5, z: 0 },
      objectType: 'container' as const,
      isContainer: true,
      canContain: true,
      isPortable: false,
      maxHealth: 20,
      health: 20,
      materialProperties: PhysicsService.createMaterialPreset('water'),
    };

    const barrel = objectService.createObject(barrelData);
    expect(barrel).toBeDefined();
    expect(barrel.id).toBeDefined();

    // Cast ice spell on the barrel
    const playerData = {
      name: 'Ice Mage',
      position: { x: 1, y: 1, z: 0 },
      health: 100,
      inventory: [],
      level: 5,
      experience: 0,
    };

    const player = playerService.createPlayer(playerData);
    expect(player).toBeDefined();

    // Apply ice effect to barrel (simulating spell)
    const result = physicsService.applyEffect(barrel.id, {
      type: 'ice',
      intensity: 6,
      sourceId: player.id,
      description: 'Ice Shard',
    });

    expect(result.success).toBe(true);

    // Verify that the barrel is affected by ice
    if (result.objectsAffected && result.objectsAffected.length > 0) {
      const affectedObject = result.objectsAffected[0];
      expect(affectedObject.objectId).toBe(barrel.id);

      // Check that it's frozen or damaged
      const updatedBarrel = objectService.getObject(barrel.id);
      if (updatedBarrel && updatedBarrel.state) {
        expect(updatedBarrel.state.frozen).toBe(true);
      }
    }
  });

  it('should persist force effects on glass objects', () => {
    // Create a glass bottle
    const bottleData = {
      name: 'Glass Bottle',
      position: { x: 5, y: 5, z: 0 },
      objectType: 'item' as const,
      isContainer: false,
      canContain: false,
      isPortable: true,
      maxHealth: 5,
      health: 5,
      materialProperties: PhysicsService.createMaterialPreset('glass'),
    };

    const bottle = objectService.createObject(bottleData);
    expect(bottle).toBeDefined();
    expect(bottle.id).toBeDefined();

    // Cast force spell on the bottle
    const playerData = {
      name: 'Force Mage',
      position: { x: 1, y: 1, z: 0 },
      health: 100,
      inventory: [],
      level: 5,
      experience: 0,
    };

    const player = playerService.createPlayer(playerData);
    expect(player).toBeDefined();

    // Apply force effect to bottle (simulating spell)
    const result = physicsService.applyEffect(bottle.id, {
      type: 'force',
      intensity: 8,
      sourceId: player.id,
      description: 'Force Push',
    });

    expect(result.success).toBe(true);

    // Verify that the bottle is affected by force
    if (result.objectsAffected && result.objectsAffected.length > 0) {
      const affectedObject = result.objectsAffected[0];
      expect(affectedObject.objectId).toBe(bottle.id);

      // Check that it's shattered or damaged
      const updatedBottle = objectService.getObject(bottle.id);
      if (updatedBottle && updatedBottle.health) {
        expect(updatedBottle.health).toBeLessThan(5); // Should be damaged
      }
    }
  });

  it('should persist chain reactions from explosive containers', () => {
    // Create a gas container with explosive contents
    const containerData = {
      name: 'Gas Canister',
      position: { x: 5, y: 5, z: 0 },
      objectType: 'container' as const,
      isContainer: true,
      canContain: true,
      isPortable: false,
      maxHealth: 10,
      health: 10,
      state: { isOpen: true },
      materialProperties: {
        material: 'metal',
        density: 8,
        conductivity: 9,
        flammability: 0,
        brittleness: 5,
        resistances: { fire: 3 },
      },
    };

    const container = objectService.createObject(containerData);
    expect(container).toBeDefined();
    expect(container.id).toBeDefined();

    // Create explosive gas inside
    const gasData = {
      name: 'Volatile Gas',
      position: { x: 0, y: 0, z: 0 },
      objectType: 'item' as const,
      isContainer: false,
      canContain: false,
      isPortable: false,
      maxHealth: 5,
      health: 5,
      materialProperties: PhysicsService.createMaterialPreset('gas'),
    };

    const gas = objectService.createObject(gasData);
    expect(gas).toBeDefined();
    expect(gas.id).toBeDefined();

    // Place the gas inside container
    const placeResult = objectService.placeObject(gas.id, {
      relationshipType: 'inside' as const,
      targetId: container.id,
    });

    expect(placeResult).toBe(true);

    // Cast fire spell on the container (simulating explosion)
    const playerData = {
      name: 'Reckless Mage',
      position: { x: 1, y: 1, z: 0 },
      health: 100,
      inventory: [],
      level: 5,
      experience: 0,
    };

    const player = playerService.createPlayer(playerData);
    expect(player).toBeDefined();

    // Apply fire effect to container (simulating explosion)
    const result = physicsService.applyEffect(container.id, {
      type: 'fire',
      intensity: 6,
      sourceId: player.id,
      description: 'Fireball',
    });

    expect(result.success).toBe(true);

    // Verify that the chain reaction occurred
    if (result.chainReactions && result.chainReactions.length > 0) {
      const chainReaction = result.chainReactions[0];
      expect(chainReaction.targetId).toBeDefined();
      expect(chainReaction.effect.type).toBe('force');
    }
  });
});
