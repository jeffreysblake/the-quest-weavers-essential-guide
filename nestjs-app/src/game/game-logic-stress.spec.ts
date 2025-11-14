import { Test, TestingModule } from '@nestjs/testing';
import { EntityService } from '../entity/entity.service';
import { RoomService } from '../entity/room.service';
import { ObjectService } from '../entity/object.service';
import { PlayerService } from '../entity/player.service';
import { PhysicsService } from '../entity/physics.service';
import { DatabaseService } from '../database/database.service';
import * as fs from 'fs';
import * as path from 'path';

describe('Game Logic Stress Tests', () => {
  let entityService: EntityService;
  let roomService: RoomService;
  let objectService: ObjectService;
  let playerService: PlayerService;
  let physicsService: PhysicsService;
  let databaseService: DatabaseService;
  let testDbPath: string;

  beforeEach(async () => {
    testDbPath = path.join(
      __dirname,
      '../../game-logic-stress-test-' +
        Date.now() +
        '-' +
        Math.random().toString(36).substr(2, 9) +
        '.db',
    );
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Create test database service
    databaseService = new DatabaseService(testDbPath);
    await databaseService.connect();
    await databaseService.migrate();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EntityService,
        RoomService,
        ObjectService,
        PlayerService,
        PhysicsService,
        { provide: DatabaseService, useValue: databaseService },
      ],
    }).compile();

    entityService = module.get<EntityService>(EntityService);
    roomService = module.get<RoomService>(RoomService);
    objectService = module.get<ObjectService>(ObjectService);
    playerService = module.get<PlayerService>(PlayerService);
    physicsService = module.get<PhysicsService>(PhysicsService);
  });

  afterEach(async () => {
    await databaseService.disconnect();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Player Interaction Stress Tests', () => {
    it('should handle rapid action sequences (100+ actions per second)', async () => {
      const gameId =
        'rapid-actions-test-' +
        Date.now() +
        '-' +
        Math.random().toString(36).substr(2, 9);

      // Clean up existing data first
      databaseService
        .prepare('DELETE FROM rooms WHERE game_id = ?')
        .run(gameId);
      databaseService
        .prepare('DELETE FROM objects WHERE game_id = ?')
        .run(gameId);
      databaseService.prepare('DELETE FROM npcs WHERE game_id = ?').run(gameId);
      databaseService.prepare('DELETE FROM games WHERE id = ?').run(gameId);

      // Create the game record first
      const insertGame = databaseService.prepare(`
        INSERT INTO games (id, name, description, version, created_at, updated_at, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const now = new Date().toISOString();
      insertGame.run(
        gameId,
        'Stress Test Game',
        'Test game description',
        1,
        now,
        now,
        1,
      );

      // Create test environment
      const room = roomService.createRoom({
        gameId,
        name: 'Action Test Room',
        description: 'Room for rapid action testing',
        position: { x: 0, y: 0, z: 0 },
      });

      const player = playerService.createPlayer({
        gameId,
        name: 'Speed Player',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        level: 10,
      });

      // Create many interactable objects
      const objects = [];
      for (let i = 0; i < 50; i++) {
        const obj = objectService.createObject({
          gameId,
          name: `Test Object ${i}`,
          description: `Interactive object ${i}`,
          position: { x: i % 10, y: Math.floor(i / 10), z: 0 },
          material: 'wood',
          isPortable: true,
          properties: { canExamine: true, canTake: true },
        });
        objects.push(obj);
        await roomService.placeObjectInRoom(room.id, obj.id);
      }

      await roomService.placePlayerInRoom(room.id, player.id);

      // Perform rapid actions
      const actionsPerSecond = 100;
      const durationMs = 2000; // 2 seconds
      const totalActions = (actionsPerSecond * durationMs) / 1000;

      const actionTypes = ['examine', 'take', 'drop', 'use'];
      let successfulActions = 0;
      let failedActions = 0;

      const startTime = Date.now();
      const promises = [];

      for (let i = 0; i < totalActions; i++) {
        const actionType = actionTypes[i % actionTypes.length];
        const targetObject = objects[i % objects.length];

        const actionPromise = (async () => {
          try {
            let result;
            switch (actionType) {
              case 'examine':
                result = await playerService.examineObject(
                  player.id,
                  targetObject.id,
                );
                break;
              case 'take':
                result = await playerService.takeObject(
                  player.id,
                  targetObject.id,
                );
                break;
              case 'drop':
                if (player.inventory?.includes(targetObject.id)) {
                  result = await playerService.dropObject(
                    player.id,
                    targetObject.id,
                  );
                }
                break;
              case 'use':
                result = await playerService.useObject(
                  player.id,
                  targetObject.id,
                );
                break;
            }

            if (result?.success) {
              successfulActions++;
            } else {
              failedActions++;
            }
          } catch (error) {
            failedActions++;
          }
        })();

        promises.push(actionPromise);

        // Add small delay to control rate
        if (i % 10 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 1));
        }
      }

      await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      const actualRate =
        (successfulActions + failedActions) / (totalTime / 1000);

      console.log(
        `Processed ${successfulActions + failedActions} actions in ${totalTime}ms`,
      );
      console.log(`Actual rate: ${actualRate.toFixed(1)} actions/second`);
      console.log(
        `Success rate: ${((successfulActions / (successfulActions + failedActions)) * 100).toFixed(1)}%`,
      );

      expect(successfulActions).toBeGreaterThan(totalActions * 0.7); // At least 70% success rate
      expect(actualRate).toBeGreaterThan(50); // Should process at least 50 actions/second
    }, 10000);

    it('should handle complex magic spell chains and cascading effects', async () => {
      const gameId =
        'magic-chains-test-' +
        Date.now() +
        '-' +
        Math.random().toString(36).substr(2, 9);

      // Clean up existing data first
      databaseService
        .prepare('DELETE FROM rooms WHERE game_id = ?')
        .run(gameId);
      databaseService
        .prepare('DELETE FROM objects WHERE game_id = ?')
        .run(gameId);
      databaseService.prepare('DELETE FROM npcs WHERE game_id = ?').run(gameId);
      databaseService.prepare('DELETE FROM games WHERE id = ?').run(gameId);

      // Create the game record first
      const insertGame = databaseService.prepare(`
        INSERT INTO games (id, name, description, version, created_at, updated_at, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const now = new Date().toISOString();
      insertGame.run(
        gameId,
        'Stress Test Game',
        'Test game description',
        1,
        now,
        now,
        1,
      );

      // Create magical test environment
      const room = roomService.createRoom({
        gameId,
        name: 'Magic Laboratory',
        description: 'A room filled with magical objects',
        position: { x: 0, y: 0, z: 0 },
      });

      const wizard = playerService.createPlayer({
        gameId,
        name: 'Test Wizard',
        position: { x: 5, y: 5, z: 0 },
        health: 100,
        level: 20,
        magicLevel: 10,
      });

      // Create objects with different materials for effect testing
      const materials = ['wood', 'metal', 'fabric', 'stone', 'ice', 'crystal'];
      const objects = [];

      for (let i = 0; i < 30; i++) {
        const obj = objectService.createObject({
          gameId,
          name: `${materials[i % materials.length]} Object ${i}`,
          description: `A ${materials[i % materials.length]} object for magic testing`,
          position: {
            x: (i % 6) * 2,
            y: Math.floor(i / 6) * 2,
            z: 0,
          },
          material: materials[i % materials.length],
          health: 100,
          maxHealth: 100,
        });
        objects.push(obj);
        await roomService.placeObjectInRoom(room.id, obj.id);
      }

      await roomService.placePlayerInRoom(room.id, wizard.id);

      // Test rapid spell casting with cascading effects
      const effectTypes = ['fire', 'ice', 'lightning', 'force', 'acid'];
      let successfulSpells = 0;
      let totalEffects = 0;

      const spellStart = Date.now();

      for (let i = 0; i < 50; i++) {
        const effectType = effectTypes[i % effectTypes.length];
        const targetObject = objects[i % objects.length];

        try {
          const spellResult = await playerService.castSpell(
            wizard.id,
            effectType as any,
            targetObject.id,
            { intensity: 50, duration: 1000 },
          );

          if (spellResult.success) {
            successfulSpells++;
            totalEffects += spellResult.effectsTriggered || 1;

            // Check for chain reactions
            if (
              spellResult.chainReactions &&
              spellResult.chainReactions.length > 0
            ) {
              totalEffects += spellResult.chainReactions.length;
            }
          }
        } catch (error) {
          console.log(`Spell failed: ${error.message}`);
        }

        // Small delay between spells
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      const spellTime = Date.now() - spellStart;
      console.log(
        `Cast ${successfulSpells} spells with ${totalEffects} total effects in ${spellTime}ms`,
      );

      expect(successfulSpells).toBeGreaterThan(40); // Most spells should succeed
      expect(totalEffects).toBeGreaterThan(successfulSpells); // Should have chain reactions
      expect(spellTime).toBeLessThan(5000); // Should complete within 5 seconds
    }, 15000);

    it('should handle massive inventory management (1000+ items)', async () => {
      const gameId =
        'inventory-stress-test-' +
        Date.now() +
        '-' +
        Math.random().toString(36).substr(2, 9);

      // Clean up existing data first
      databaseService
        .prepare('DELETE FROM rooms WHERE game_id = ?')
        .run(gameId);
      databaseService
        .prepare('DELETE FROM objects WHERE game_id = ?')
        .run(gameId);
      databaseService.prepare('DELETE FROM npcs WHERE game_id = ?').run(gameId);
      databaseService.prepare('DELETE FROM games WHERE id = ?').run(gameId);

      // Create the game record first
      const insertGame = databaseService.prepare(`
        INSERT INTO games (id, name, description, version, created_at, updated_at, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const now = new Date().toISOString();
      insertGame.run(
        gameId,
        'Stress Test Game',
        'Test game description',
        1,
        now,
        now,
        1,
      );

      const player = playerService.createPlayer({
        gameId,
        name: 'Pack Rat',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        level: 1,
        inventory: [],
      });

      // Create many items
      const items = [];
      const itemTypes = ['weapon', 'armor', 'consumable', 'misc', 'quest'];

      const creationStart = Date.now();
      for (let i = 0; i < 1000; i++) {
        const item = objectService.createObject({
          gameId,
          name: `Item ${i}`,
          description: `Test item number ${i}`,
          position: { x: 0, y: 0, z: 0 },
          material: 'various',
          isPortable: true,
          weight: Math.random() * 10,
          value: Math.random() * 100,
          properties: {
            type: itemTypes[i % itemTypes.length],
            rarity: Math.floor(Math.random() * 5) + 1,
            stackable: i % 10 === 0,
          },
        });
        items.push(item);
      }
      const creationTime = Date.now() - creationStart;
      console.log(`Created 1000 items in ${creationTime}ms`);

      // Add all items to inventory
      const addStart = Date.now();
      let successfulAdds = 0;

      for (const item of items) {
        const result = await playerService.giveObjectToPlayer(
          player.id,
          item.id,
        );
        if (result.success) {
          successfulAdds++;
        }
      }
      const addTime = Date.now() - addStart;
      console.log(
        `Added ${successfulAdds}/1000 items to inventory in ${addTime}ms`,
      );

      // Test inventory operations
      const operationsStart = Date.now();

      // Sort inventory by type
      const sortResult = await playerService.sortInventory(player.id, 'type');

      // Find items by criteria
      const weapons = await playerService.findInventoryItems(player.id, {
        type: 'weapon',
      });
      const rareItems = await playerService.findInventoryItems(player.id, {
        rarity: { min: 4 },
      });
      const heavyItems = await playerService.findInventoryItems(player.id, {
        weight: { min: 8 },
      });

      // Calculate total weight and value
      const stats = await playerService.getInventoryStats(player.id);

      const operationsTime = Date.now() - operationsStart;
      console.log(`Completed inventory operations in ${operationsTime}ms`);

      expect(successfulAdds).toBe(1000);
      expect(weapons.length).toBeGreaterThan(150); // ~200 weapons expected
      expect(rareItems.length).toBeGreaterThan(300); // ~400 rare items expected
      expect(stats.totalItems).toBe(1000);
      expect(stats.totalWeight).toBeGreaterThan(0);
      expect(stats.totalValue).toBeGreaterThan(0);
      expect(addTime).toBeLessThan(3000);
      expect(operationsTime).toBeLessThan(1000);
    }, 20000);

    it('should handle complex physics interactions under load', async () => {
      const gameId =
        'physics-stress-test-' +
        Date.now() +
        '-' +
        Math.random().toString(36).substr(2, 9);

      // Clean up existing data first
      databaseService
        .prepare('DELETE FROM rooms WHERE game_id = ?')
        .run(gameId);
      databaseService
        .prepare('DELETE FROM objects WHERE game_id = ?')
        .run(gameId);
      databaseService.prepare('DELETE FROM npcs WHERE game_id = ?').run(gameId);
      databaseService.prepare('DELETE FROM games WHERE id = ?').run(gameId);

      // Create the game record first
      const insertGame = databaseService.prepare(`
        INSERT INTO games (id, name, description, version, created_at, updated_at, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const now = new Date().toISOString();
      insertGame.run(
        gameId,
        'Stress Test Game',
        'Test game description',
        1,
        now,
        now,
        1,
      );

      // Create physics world with many objects
      const room = roomService.createRoom({
        gameId,
        name: 'Physics Test Chamber',
        description: 'Room for physics stress testing',
        position: { x: 0, y: 0, z: 0 },
      });

      // Create many physics-enabled objects
      const objects = [];
      for (let i = 0; i < 100; i++) {
        const obj = objectService.createObject({
          gameId,
          name: `Physics Object ${i}`,
          description: `Object with physics properties`,
          position: {
            x: (i % 10) * 2,
            y: Math.floor(i / 10) * 2 + 10, // Start elevated
            z: 0,
          },
          material: ['wood', 'metal', 'stone'][i % 3],
          weight: Math.random() * 5 + 1,
          size: {
            width: Math.random() * 2 + 0.5,
            height: Math.random() * 2 + 0.5,
            depth: Math.random() * 2 + 0.5,
          },
        });
        objects.push(obj);

        // Add to physics simulation
        physicsService.addEntity({
          id: obj.id,
          name: obj.name,
          position: obj.position,
          rotation: { x: 0, y: 0, z: 0 },
          size: obj.size || { width: 1, height: 1, depth: 1 },
          mass: obj.weight || 1,
          active: true,
        });
      }

      // Start physics simulation
      const simulationStart = Date.now();
      physicsService.startSimulation();

      // Run simulation for a period
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Apply forces to test interaction
      for (let i = 0; i < 20; i++) {
        const randomObject =
          objects[Math.floor(Math.random() * objects.length)];
        physicsService.applyForce(randomObject.id, {
          x: (Math.random() - 0.5) * 100,
          y: Math.random() * 50,
          z: (Math.random() - 0.5) * 100,
        });
      }

      // Continue simulation
      await new Promise((resolve) => setTimeout(resolve, 2000));

      physicsService.stopSimulation();
      const simulationTime = Date.now() - simulationStart;

      // Get final positions and verify physics worked
      let objectsMoved = 0;
      for (const obj of objects) {
        const currentPos = physicsService.getEntityPosition(obj.id);
        if (
          currentPos &&
          (Math.abs(currentPos.x - obj.position.x) > 0.1 ||
            Math.abs(currentPos.y - obj.position.y) > 0.1 ||
            Math.abs(currentPos.z - obj.position.z) > 0.1)
        ) {
          objectsMoved++;
        }
      }

      console.log(`Physics simulation ran for ${simulationTime}ms`);
      console.log(`${objectsMoved}/100 objects moved during simulation`);

      expect(objectsMoved).toBeGreaterThan(50); // Most objects should have moved due to gravity/forces
      expect(simulationTime).toBeGreaterThan(4500); // Should run for expected duration
    }, 15000);
  });

  describe('Spatial System Stress Tests', () => {
    it('should handle dense entity placement (500+ entities per coordinate)', async () => {
      const gameId =
        'dense-placement-test-' +
        Date.now() +
        '-' +
        Math.random().toString(36).substr(2, 9);

      // Clean up existing data first
      databaseService
        .prepare('DELETE FROM rooms WHERE game_id = ?')
        .run(gameId);
      databaseService
        .prepare('DELETE FROM objects WHERE game_id = ?')
        .run(gameId);
      databaseService.prepare('DELETE FROM npcs WHERE game_id = ?').run(gameId);
      databaseService.prepare('DELETE FROM games WHERE id = ?').run(gameId);

      // Create the game record first
      const insertGame = databaseService.prepare(`
        INSERT INTO games (id, name, description, version, created_at, updated_at, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const now = new Date().toISOString();
      insertGame.run(
        gameId,
        'Stress Test Game',
        'Test game description',
        1,
        now,
        now,
        1,
      );

      const room = roomService.createRoom({
        gameId,
        name: 'Crowded Room',
        description: 'A room with many entities at same coordinates',
        position: { x: 0, y: 0, z: 0 },
      });

      const targetCoord = { x: 10, y: 10, z: 0 };
      const entities = [];

      // Create many entities at the same coordinate
      const creationStart = Date.now();
      for (let i = 0; i < 500; i++) {
        if (i % 2 === 0) {
          // Create objects
          const obj = objectService.createObject({
            gameId,
            name: `Dense Object ${i}`,
            description: `Object ${i} in dense area`,
            position: targetCoord,
            material: 'wood',
            size: { width: 0.1, height: 0.1, depth: 0.1 }, // Very small
          });
          entities.push({ type: 'object', entity: obj });
          await roomService.placeObjectInRoom(room.id, obj.id);
        } else {
          // Create players
          const player = playerService.createPlayer({
            gameId,
            name: `Dense Player ${i}`,
            position: targetCoord,
            health: 100,
            level: 1,
          });
          entities.push({ type: 'player', entity: player });
          await roomService.placePlayerInRoom(room.id, player.id);
        }
      }
      const creationTime = Date.now() - creationStart;
      console.log(
        `Created 500 entities at same coordinate in ${creationTime}ms`,
      );

      // Test spatial queries
      const queryStart = Date.now();

      const entitiesAtCoord = await roomService.getEntitiesAtPosition(
        room.id,
        targetCoord,
        0.5, // Search radius
      );

      const nearbyEntities = await roomService.getEntitiesInRadius(
        room.id,
        targetCoord,
        1.0, // 1 unit radius
      );

      const queryTime = Date.now() - queryStart;
      console.log(`Spatial queries completed in ${queryTime}ms`);

      expect(entitiesAtCoord.length).toBe(500);
      expect(nearbyEntities.length).toBe(500);
      expect(creationTime).toBeLessThan(10000);
      expect(queryTime).toBeLessThan(1000);
    }, 20000);

    it('should handle large world coordinates efficiently', async () => {
      const gameId =
        'large-coords-test-' +
        Date.now() +
        '-' +
        Math.random().toString(36).substr(2, 9);

      // Clean up existing data first
      databaseService
        .prepare('DELETE FROM rooms WHERE game_id = ?')
        .run(gameId);
      databaseService
        .prepare('DELETE FROM objects WHERE game_id = ?')
        .run(gameId);
      databaseService.prepare('DELETE FROM npcs WHERE game_id = ?').run(gameId);
      databaseService.prepare('DELETE FROM games WHERE id = ?').run(gameId);

      // Create the game record first
      const insertGame = databaseService.prepare(`
        INSERT INTO games (id, name, description, version, created_at, updated_at, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const now = new Date().toISOString();
      insertGame.run(
        gameId,
        'Stress Test Game',
        'Test game description',
        1,
        now,
        now,
        1,
      );

      // Test with very large coordinate values
      const extremeCoords = [
        { x: 1000000, y: 0, z: 0 },
        { x: 0, y: 1000000, z: 0 },
        { x: 0, y: 0, z: 1000000 },
        { x: -1000000, y: -1000000, z: -1000000 },
        { x: 999999, y: 999999, z: 999999 },
      ];

      const entities = [];

      for (let i = 0; i < extremeCoords.length; i++) {
        const coord = extremeCoords[i];

        const room = roomService.createRoom({
          gameId,
          name: `Extreme Room ${i}`,
          description: `Room at extreme coordinates`,
          position: coord,
        });

        const obj = objectService.createObject({
          gameId,
          name: `Extreme Object ${i}`,
          description: `Object at extreme coordinates`,
          position: coord,
          material: 'crystal',
        });

        entities.push({ room, obj, coord });
      }

      // Test distance calculations with extreme coordinates
      const distanceStart = Date.now();

      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          const distance = await roomService.calculateDistance(
            entities[i].coord,
            entities[j].coord,
          );

          expect(distance).toBeGreaterThan(0);
          expect(isFinite(distance)).toBe(true);
        }
      }

      const distanceTime = Date.now() - distanceStart;
      console.log(
        `Distance calculations with extreme coords completed in ${distanceTime}ms`,
      );

      expect(distanceTime).toBeLessThan(1000);
    });

    it('should handle rapid teleportation efficiently', async () => {
      const gameId =
        'teleport-test-' +
        Date.now() +
        '-' +
        Math.random().toString(36).substr(2, 9);

      // Clean up existing data first
      databaseService
        .prepare('DELETE FROM rooms WHERE game_id = ?')
        .run(gameId);
      databaseService
        .prepare('DELETE FROM objects WHERE game_id = ?')
        .run(gameId);
      databaseService.prepare('DELETE FROM npcs WHERE game_id = ?').run(gameId);
      databaseService.prepare('DELETE FROM games WHERE id = ?').run(gameId);

      // Create the game record first
      const insertGame = databaseService.prepare(`
        INSERT INTO games (id, name, description, version, created_at, updated_at, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const now = new Date().toISOString();
      insertGame.run(
        gameId,
        'Stress Test Game',
        'Test game description',
        1,
        now,
        now,
        1,
      );

      // Create multiple rooms
      const rooms = [];
      for (let i = 0; i < 20; i++) {
        const room = roomService.createRoom({
          gameId,
          name: `Teleport Room ${i}`,
          description: `Room ${i} for teleportation testing`,
          position: { x: i * 100, y: i * 100, z: i * 10 },
        });
        rooms.push(room);
      }

      // Create entities to teleport
      const entities = [];
      for (let i = 0; i < 100; i++) {
        if (i % 2 === 0) {
          const obj = objectService.createObject({
            gameId,
            name: `Teleport Object ${i}`,
            description: `Object for teleportation testing`,
            position: { x: 0, y: 0, z: 0 },
            material: 'magic',
            properties: { canTeleport: true },
          });
          entities.push({ type: 'object', entity: obj });
          await roomService.placeObjectInRoom(rooms[0].id, obj.id);
        } else {
          const player = playerService.createPlayer({
            gameId,
            name: `Teleport Player ${i}`,
            position: { x: 0, y: 0, z: 0 },
            health: 100,
            level: 5,
          });
          entities.push({ type: 'player', entity: player });
          await roomService.placePlayerInRoom(rooms[0].id, player.id);
        }
      }

      // Perform rapid teleportation
      const teleportStart = Date.now();
      let successfulTeleports = 0;

      for (let round = 0; round < 10; round++) {
        const promises = entities.map(async ({ type, entity }, index) => {
          const targetRoom = rooms[index % rooms.length];
          const newPosition = {
            x: Math.random() * 50,
            y: Math.random() * 50,
            z: Math.random() * 10,
          };

          try {
            let result;
            if (type === 'object') {
              result = await objectService.teleportObject(
                entity.id,
                targetRoom.id,
                newPosition,
              );
            } else {
              result = await playerService.teleportPlayer(
                entity.id,
                targetRoom.id,
                newPosition,
              );
            }

            if (result.success) {
              return 1;
            }
          } catch (error) {
            console.log(`Teleport failed: ${error.message}`);
          }
          return 0;
        });

        const roundResults = await Promise.all(promises);
        successfulTeleports += roundResults.reduce(
          (sum, result) => sum + result,
          0,
        );
      }

      const teleportTime = Date.now() - teleportStart;
      console.log(
        `Completed ${successfulTeleports} teleportations in ${teleportTime}ms`,
      );

      expect(successfulTeleports).toBeGreaterThan(800); // Most should succeed
      expect(teleportTime).toBeLessThan(5000); // Should be fast
    }, 15000);
  });

  describe('State Management Stress Tests', () => {
    it('should handle complex object states (50+ properties)', async () => {
      const gameId =
        'complex-state-test-' +
        Date.now() +
        '-' +
        Math.random().toString(36).substr(2, 9);

      // Clean up existing data first
      databaseService
        .prepare('DELETE FROM rooms WHERE game_id = ?')
        .run(gameId);
      databaseService
        .prepare('DELETE FROM objects WHERE game_id = ?')
        .run(gameId);
      databaseService.prepare('DELETE FROM npcs WHERE game_id = ?').run(gameId);
      databaseService.prepare('DELETE FROM games WHERE id = ?').run(gameId);

      // Create the game record first
      const insertGame = databaseService.prepare(`
        INSERT INTO games (id, name, description, version, created_at, updated_at, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const now = new Date().toISOString();
      insertGame.run(
        gameId,
        'Stress Test Game',
        'Test game description',
        1,
        now,
        now,
        1,
      );

      // Create objects with many state properties
      const complexObjects = [];
      for (let i = 0; i < 50; i++) {
        const properties: any = {
          // Basic properties
          durability: Math.random() * 100,
          condition: ['pristine', 'good', 'worn', 'damaged', 'broken'][
            Math.floor(Math.random() * 5)
          ],
          temperature: Math.random() * 200 - 50,
          age: Math.random() * 1000,

          // State flags
          isOpen: Math.random() > 0.5,
          isLocked: Math.random() > 0.7,
          isActivated: Math.random() > 0.8,
          isVisible: Math.random() > 0.1,
          isMoveable: Math.random() > 0.3,

          // Complex nested state
          enchantments: {
            fire: Math.random() * 10,
            ice: Math.random() * 10,
            lightning: Math.random() * 10,
          },

          // Arrays of state data
          modifiers: Array.from({ length: 10 }, (_, j) => ({
            type: `modifier_${j}`,
            value: Math.random() * 100,
            duration: Math.random() * 3600,
          })),

          // Historical data
          interactions: Array.from({ length: 20 }, (_, j) => ({
            timestamp: Date.now() - Math.random() * 86400000,
            action: `action_${j}`,
            actor: `player_${Math.floor(Math.random() * 10)}`,
          })),
        };

        // Add 30 more random properties
        for (let j = 0; j < 30; j++) {
          properties[`property_${j}`] = {
            value: Math.random() * 1000,
            lastChanged: Date.now() - Math.random() * 86400000,
            metadata: `metadata_${j}`,
          };
        }

        const obj = objectService.createObject({
          gameId,
          name: `Complex Object ${i}`,
          description: `Object with ${Object.keys(properties).length} properties`,
          position: { x: 0, y: 0, z: 0 },
          material: 'complex',
          properties,
        });

        complexObjects.push(obj);
      }

      // Test rapid state changes
      const stateChangeStart = Date.now();
      let stateChanges = 0;

      for (let round = 0; round < 20; round++) {
        const promises = complexObjects.map(async (obj) => {
          // Update multiple properties
          const updates = {
            durability: Math.random() * 100,
            temperature: Math.random() * 200 - 50,
            isOpen: !obj.properties.isOpen,
            [`property_${round % 30}`]: {
              value: Math.random() * 1000,
              lastChanged: Date.now(),
              metadata: `updated_round_${round}`,
            },
          };

          const result = await objectService.updateObjectProperties(
            obj.id,
            updates,
          );
          return result.success ? 1 : 0;
        });

        const roundResults = await Promise.all(promises);
        stateChanges += roundResults.reduce((sum, result) => sum + result, 0);
      }

      const stateChangeTime = Date.now() - stateChangeStart;
      console.log(
        `Completed ${stateChanges} state changes in ${stateChangeTime}ms`,
      );

      expect(stateChanges).toBeGreaterThan(800); // Most updates should succeed
      expect(stateChangeTime).toBeLessThan(3000); // Should be reasonably fast
    }, 10000);

    it('should handle rapid state synchronization across systems', async () => {
      const gameId =
        'sync-test-' +
        Date.now() +
        '-' +
        Math.random().toString(36).substr(2, 9);

      // Clean up existing data first
      databaseService
        .prepare('DELETE FROM rooms WHERE game_id = ?')
        .run(gameId);
      databaseService
        .prepare('DELETE FROM objects WHERE game_id = ?')
        .run(gameId);
      databaseService.prepare('DELETE FROM npcs WHERE game_id = ?').run(gameId);
      databaseService.prepare('DELETE FROM games WHERE id = ?').run(gameId);

      // Create the game record first
      const insertGame = databaseService.prepare(`
        INSERT INTO games (id, name, description, version, created_at, updated_at, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const now = new Date().toISOString();
      insertGame.run(
        gameId,
        'Stress Test Game',
        'Test game description',
        1,
        now,
        now,
        1,
      );

      // Create entities that need synchronization
      const room = roomService.createRoom({
        gameId,
        name: 'Sync Test Room',
        description: 'Room for synchronization testing',
        position: { x: 0, y: 0, z: 0 },
      });

      const entities = [];
      for (let i = 0; i < 100; i++) {
        const obj = objectService.createObject({
          gameId,
          name: `Sync Object ${i}`,
          description: `Object for sync testing`,
          position: { x: i % 10, y: Math.floor(i / 10), z: 0 },
          material: 'sync',
          properties: { syncId: i, lastSync: Date.now() },
        });
        entities.push(obj);
        await roomService.placeObjectInRoom(room.id, obj.id);
      }

      // Test rapid synchronization
      const syncStart = Date.now();
      let syncOperations = 0;

      for (let round = 0; round < 10; round++) {
        // Update all entities simultaneously
        const updatePromises = entities.map(async (entity) => {
          const newState = {
            position: {
              x: entity.position.x + Math.random() * 2 - 1,
              y: entity.position.y + Math.random() * 2 - 1,
              z: entity.position.z,
            },
            properties: {
              ...entity.properties,
              lastSync: Date.now(),
              syncRound: round,
            },
          };

          // Update in multiple systems
          const entityResult = await entityService.updateEntity(
            entity.id,
            newState,
          );
          const objectResult = await objectService.updateObject(
            entity.id,
            newState,
          );

          // Save to database
          if (databaseService) {
            await entityService.saveEntityVersion(
              entity.id,
              `Sync round ${round}`,
            );
          }

          return entityResult && objectResult.success ? 1 : 0;
        });

        const roundResults = await Promise.all(updatePromises);
        syncOperations += roundResults.reduce((sum, result) => sum + result, 0);
      }

      const syncTime = Date.now() - syncStart;
      console.log(
        `Completed ${syncOperations} sync operations in ${syncTime}ms`,
      );

      // Verify consistency across systems
      let consistentEntities = 0;
      for (const entity of entities) {
        const entityServiceVersion = entityService.getEntity(entity.id);
        const objectServiceVersion = objectService.getObject(entity.id);

        if (
          entityServiceVersion &&
          objectServiceVersion &&
          entityServiceVersion.position.x === objectServiceVersion.position.x &&
          entityServiceVersion.position.y === objectServiceVersion.position.y
        ) {
          consistentEntities++;
        }
      }

      console.log(
        `${consistentEntities}/100 entities are consistent across systems`,
      );

      expect(syncOperations).toBeGreaterThan(900); // Most syncs should succeed
      expect(consistentEntities).toBeGreaterThan(95); // High consistency expected
      expect(syncTime).toBeLessThan(5000); // Should complete in reasonable time
    }, 15000);

    it('should handle undo/redo chains efficiently', async () => {
      const gameId =
        'undo-redo-test-' +
        Date.now() +
        '-' +
        Math.random().toString(36).substr(2, 9);

      // Clean up existing data first
      databaseService
        .prepare('DELETE FROM rooms WHERE game_id = ?')
        .run(gameId);
      databaseService
        .prepare('DELETE FROM objects WHERE game_id = ?')
        .run(gameId);
      databaseService.prepare('DELETE FROM npcs WHERE game_id = ?').run(gameId);
      databaseService.prepare('DELETE FROM games WHERE id = ?').run(gameId);

      // Create the game record first
      const insertGame = databaseService.prepare(`
        INSERT INTO games (id, name, description, version, created_at, updated_at, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const now = new Date().toISOString();
      insertGame.run(
        gameId,
        'Stress Test Game',
        'Test game description',
        1,
        now,
        now,
        1,
      );

      // Create test objects
      const objects = [];
      for (let i = 0; i < 20; i++) {
        const obj = objectService.createObject({
          gameId,
          name: `Undo Test Object ${i}`,
          description: `Object for undo/redo testing`,
          position: { x: i, y: 0, z: 0 },
          material: 'test',
          properties: { value: i },
        });
        objects.push(obj);
      }

      // Create a chain of 100 operations
      const operations = [];
      const operationStart = Date.now();

      for (let i = 0; i < 100; i++) {
        const obj = objects[i % objects.length];
        const operation = {
          type: 'update',
          objectId: obj.id,
          oldState: { ...obj },
          newState: {
            position: { x: obj.position.x + 1, y: obj.position.y + 1, z: 0 },
            properties: { ...obj.properties, value: i },
          },
        };

        operations.push(operation);

        // Apply operation
        await objectService.updateObject(obj.id, operation.newState);

        // Save version for undo capability
        if (databaseService) {
          await entityService.saveEntityVersion(obj.id, `Operation ${i}`);
        }
      }

      const operationTime = Date.now() - operationStart;
      console.log(`Applied 100 operations in ${operationTime}ms`);

      // Test undo chain
      const undoStart = Date.now();
      let successfulUndos = 0;

      // Undo 50 operations
      for (let i = 99; i >= 50; i--) {
        const operation = operations[i];
        try {
          const undoResult = await entityService.rollbackEntity(
            operation.objectId,
            Math.max(1, i - 1), // Rollback to previous version
          );

          if (undoResult) {
            successfulUndos++;
          }
        } catch (error) {
          console.log(`Undo failed for operation ${i}: ${error.message}`);
        }
      }

      const undoTime = Date.now() - undoStart;
      console.log(`Completed ${successfulUndos} undos in ${undoTime}ms`);

      // Test redo by reapplying operations
      const redoStart = Date.now();
      let successfulRedos = 0;

      for (let i = 50; i < 100; i++) {
        const operation = operations[i];
        try {
          const redoResult = await objectService.updateObject(
            operation.objectId,
            operation.newState,
          );

          if (redoResult.success) {
            successfulRedos++;
          }
        } catch (error) {
          console.log(`Redo failed for operation ${i}: ${error.message}`);
        }
      }

      const redoTime = Date.now() - redoStart;
      console.log(`Completed ${successfulRedos} redos in ${redoTime}ms`);

      expect(successfulUndos).toBeGreaterThan(40); // Most undos should work
      expect(successfulRedos).toBeGreaterThan(40); // Most redos should work
      expect(operationTime).toBeLessThan(3000);
      expect(undoTime).toBeLessThan(2000);
      expect(redoTime).toBeLessThan(2000);
    }, 15000);
  });
});
