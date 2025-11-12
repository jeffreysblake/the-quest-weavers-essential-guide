import { Test, TestingModule } from '@nestjs/testing';
import { EntityService } from './entity.service';
import { RoomService } from './room.service';
import { ObjectService } from './object.service';
import { PlayerService } from './player.service';
import { DatabaseService } from '../database/database.service';
import { PhysicsService } from './physics.service';
import * as fs from 'fs';
import * as path from 'path';

describe('Entity Relationship Edge Cases Stress Tests', () => {
  let entityService: EntityService;
  let roomService: RoomService;
  let objectService: ObjectService;
  let playerService: PlayerService;
  let databaseService: DatabaseService;
  let testDbPath: string;

  beforeEach(async () => {
    const testId = Math.random().toString(36).substring(7);
    testDbPath = path.join(__dirname, `../../entity-stress-test-${testId}.db`);
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
  });

  afterEach(async () => {
    await databaseService.disconnect();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Circular Dependencies Detection', () => {
    it('should detect and prevent room → object → room cycles', async () => {
      const gameId = 'circular-test-game';

      // Clean up any existing data first
      databaseService
        .prepare('DELETE FROM rooms WHERE game_id = ?')
        .run(gameId);
      databaseService
        .prepare('DELETE FROM objects WHERE game_id = ?')
        .run(gameId);
      databaseService.prepare('DELETE FROM npcs WHERE game_id = ?').run(gameId);
      databaseService.prepare('DELETE FROM games WHERE id = ?').run(gameId);

      // Create game record first to satisfy foreign key constraints
      const insertGame = databaseService.prepare(`
        INSERT INTO games (id, name, description, version, created_at, updated_at, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const now = new Date().toISOString();
      insertGame.run(
        gameId,
        'Circular Test Game',
        'Test game for circular dependencies',
        1,
        now,
        now,
        1,
      );

      // Create two rooms
      const room1 = roomService.createRoom({
        gameId,
        name: 'Room 1',
        description: 'First room',
        position: { x: 0, y: 0, z: 0 },
      });

      const room2 = roomService.createRoom({
        gameId,
        name: 'Room 2',
        description: 'Second room',
        position: { x: 10, y: 0, z: 0 },
      });

      // Create container object that could theoretically contain a room
      const container = objectService.createObject({
        gameId,
        name: 'Magic Portal Container',
        description: 'A container that might hold rooms',
        position: { x: 5, y: 5, z: 0 },
        material: 'magic',
        isContainer: true,
        canContain: true,
        containerCapacity: 100,
      });

      // Place container in room1
      const placeResult1 = roomService.addObjectToRoom(room1.id, container.id);
      expect(placeResult1).toBe(true);

      // Try to create a circular dependency by having the container "contain" room2
      // This should be prevented by the system
      try {
        const circularResult = objectService.placeObject(room2.id, {
          targetId: container.id,
          relationshipType: 'inside',
        });

        // The placement should fail (return false) because it's invalid to put a room inside an object
        expect(circularResult).toBe(false);
      } catch (error) {
        // It's acceptable for this to throw an error preventing the circular dependency
        expect(error.message).toMatch(/(circular|invalid|forbidden)/i);
      }

      // Verify room2 is not actually contained in the container
      const updatedContainer = objectService.getObject(container.id);
      expect(updatedContainer?.containedObjects.includes(room2.id)).toBe(false);
    });

    it('should handle deep container nesting without infinite loops', async () => {
      const gameId = 'deep-nesting-test';
      const containers: any[] = [];
      const maxDepth = 20;

      // Create nested containers
      for (let i = 0; i < maxDepth; i++) {
        const container = objectService.createObject({
          gameId,
          name: `Container Level ${i}`,
          description: `Container at nesting level ${i}`,
          position: { x: 0, y: 0, z: 0 },
          material: 'wood',
          isContainer: true,
          canContain: true,
          containerCapacity: 10,
        });
        containers.push(container);
      }

      // Nest them: container[0] contains container[1], etc.
      for (let i = 0; i < maxDepth - 1; i++) {
        const result = objectService.placeObject(containers[i + 1].id, {
          targetId: containers[i].id,
          relationshipType: 'inside',
        });
        expect(result).toBe(true);
      }

      // Try to create a circular dependency by putting container[0] inside the last container
      const circularAttempt = objectService.placeObject(containers[0].id, {
        targetId: containers[maxDepth - 1].id,
        relationshipType: 'inside',
      });

      // Should fail to detect the circular dependency
      expect(circularAttempt).toBe(false);

      // Verify no circular dependency was actually created
      const lastContainer = objectService.getObject(
        containers[maxDepth - 1].id,
      );
      expect(lastContainer?.containedObjects.includes(containers[0].id)).toBe(
        false,
      );
    });

    it('should detect circular spatial relationships', async () => {
      const gameId = 'spatial-circular-test';

      // Create three objects
      const obj1 = objectService.createObject({
        gameId,
        name: 'Object 1',
        description: 'First object',
        position: { x: 0, y: 0, z: 0 },
        material: 'wood',
      });

      const obj2 = objectService.createObject({
        gameId,
        name: 'Object 2',
        description: 'Second object',
        position: { x: 1, y: 0, z: 0 },
        material: 'metal',
      });

      const obj3 = objectService.createObject({
        gameId,
        name: 'Object 3',
        description: 'Third object',
        position: { x: 2, y: 0, z: 0 },
        material: 'stone',
      });

      // Create spatial relationships: obj1 on_top_of obj2, obj2 on_top_of obj3
      const rel1 = objectService.placeObject(obj1.id, {
        targetId: obj2.id,
        relationshipType: 'on_top_of',
      });
      expect(rel1).toBe(true);

      const rel2 = objectService.placeObject(obj2.id, {
        targetId: obj3.id,
        relationshipType: 'on_top_of',
      });
      expect(rel2).toBe(true);

      // Try to create circular relationship: obj3 on_top_of obj1
      const circularRel = objectService.placeObject(obj3.id, {
        targetId: obj1.id,
        relationshipType: 'on_top_of',
      });

      // Should detect and prevent the circular dependency
      expect(circularRel).toBe(false);
    });

    it('should handle player-object-room relationship cycles', async () => {
      const gameId = 'player-cycle-test';

      // Create a room
      const room = roomService.createRoom({
        gameId,
        name: 'Test Room',
        description: 'A test room',
        position: { x: 0, y: 0, z: 0 },
      });

      // Create a player
      const player = playerService.createPlayer({
        gameId,
        name: 'Test Player',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        level: 1,
      });

      // Create a portable room object (like a tent or magical dwelling)
      const portableRoom = objectService.createObject({
        gameId,
        name: 'Portable Tent',
        description: 'A magical tent that creates a room inside',
        position: { x: 0, y: 0, z: 0 },
        material: 'fabric',
        isPortable: true,
        isContainer: true,
        canContain: true,
        containerCapacity: 50,
      });

      // Place player in room
      const playerInRoom = await roomService.placePlayerInRoom(
        room.id,
        player.id,
      );
      expect(playerInRoom.success).toBe(true);

      // Give portable room to player
      const giveResult = await playerService.giveObjectToPlayer(
        player.id,
        portableRoom.id,
      );
      expect(giveResult.success).toBe(true);

      // Try to create a cycle where the portable room "contains" the original room
      // This should be detected and prevented
      try {
        const cycleAttempt = objectService.placeObject(room.id, {
          targetId: portableRoom.id,
          relationshipType: 'inside',
        });

        expect(cycleAttempt).toBe(false);
      } catch (error) {
        expect(error.message).toMatch(/(invalid|circular|forbidden)/i);
      }
    });
  });

  describe('Invalid Data Handling', () => {
    it('should handle dangling entity references gracefully', async () => {
      const gameId = 'dangling-ref-test';

      // Create a room
      const room = roomService.createRoom({
        gameId,
        name: 'Test Room',
        description: 'A room with dangling references',
        position: { x: 0, y: 0, z: 0 },
        objects: ['nonexistent-object-1', 'nonexistent-object-2'],
        players: ['nonexistent-player-1'],
      });

      // Try to get objects and players that don't exist
      const roomObjects = await roomService.getObjectsInRoom(room.id);
      const roomPlayers = await roomService.getPlayersInRoom(room.id);

      // Should handle missing references gracefully
      expect(roomObjects.validObjects).toHaveLength(0);
      expect(roomObjects.invalidReferences).toHaveLength(2);
      expect(roomPlayers.validPlayers).toHaveLength(0);
      expect(roomPlayers.invalidReferences).toHaveLength(1);

      // System should provide cleanup suggestions
      expect(roomObjects.message).toMatch(/(cleanup|orphaned|invalid)/i);
    });

    it('should detect and handle type mismatches in collections', async () => {
      const gameId = 'type-mismatch-test';

      // Create objects of different types
      const room = roomService.createRoom({
        gameId,
        name: 'Test Room',
        description: 'A test room',
        position: { x: 0, y: 0, z: 0 },
      });

      const player = playerService.createPlayer({
        gameId,
        name: 'Test Player',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        level: 1,
      });

      const obj = objectService.createObject({
        gameId,
        name: 'Test Object',
        description: 'A test object',
        position: { x: 0, y: 0, z: 0 },
        material: 'wood',
      });

      // Try to add player ID to objects list (type mismatch)
      try {
        const invalidAdd = await roomService.addObjectToRoom(
          room.id,
          player.id,
        );
        if (invalidAdd.success) {
          expect(invalidAdd.message).toMatch(/(warning|type|mismatch)/i);
        } else {
          expect(invalidAdd.message).toMatch(/(invalid|type|object)/i);
        }
      } catch (error) {
        expect(error.message).toMatch(/(type|invalid|object)/i);
      }

      // Try to add object ID to players list (type mismatch)
      try {
        const invalidAdd = await roomService.placePlayerInRoom(room.id, obj.id);
        if (invalidAdd.success) {
          expect(invalidAdd.message).toMatch(/(warning|type|mismatch)/i);
        } else {
          expect(invalidAdd.message).toMatch(/(invalid|type|player)/i);
        }
      } catch (error) {
        expect(error.message).toMatch(/(type|invalid|player)/i);
      }
    });

    it('should handle constraint violations gracefully', async () => {
      const gameId = 'constraint-test';

      // Create a small container
      const smallBox = objectService.createObject({
        gameId,
        name: 'Small Box',
        description: 'A box with limited capacity',
        position: { x: 0, y: 0, z: 0 },
        material: 'wood',
        isContainer: true,
        canContain: true,
        containerCapacity: 2, // Very small capacity
      });

      // Create multiple objects to overfill the container
      const items = [];
      for (let i = 0; i < 5; i++) {
        const item = objectService.createObject({
          gameId,
          name: `Item ${i}`,
          description: `Test item ${i}`,
          position: { x: 0, y: 0, z: 0 },
          material: 'metal',
          weight: 1,
        });
        items.push(item);
      }

      // Try to place all items in the small container
      let successCount = 0;
      let capacityExceeded = false;

      for (const item of items) {
        const result = objectService.placeObject(item.id, {
          targetId: smallBox.id,
          relationshipType: 'inside',
        });

        if (result) {
          successCount++;
        } else {
          capacityExceeded = true;
        }
      }

      // Should respect capacity constraints
      expect(successCount).toBeLessThanOrEqual(2);
      expect(capacityExceeded).toBe(true);

      // Container should not be overfilled
      const updatedContainer = objectService.getObject(smallBox.id);
      expect(updatedContainer?.containedObjects.length).toBeLessThanOrEqual(2);
    });

    it('should handle malformed position data', async () => {
      const gameId = 'malformed-position-test';

      // Try to create entities with invalid position data
      const invalidPositions = [
        { x: NaN, y: 0, z: 0 },
        { x: Infinity, y: 0, z: 0 },
        { x: 0, y: -Infinity, z: 0 },
        { x: 'invalid', y: 0, z: 0 } as any,
        null as any,
        undefined as any,
      ];

      for (const invalidPos of invalidPositions) {
        try {
          const obj = objectService.createObject({
            gameId,
            name: 'Test Object',
            description: 'Object with invalid position',
            position: invalidPos,
            material: 'wood',
          });

          // If creation succeeds, position should be normalized
          expect(obj.position.x).toBeTypeOf('number');
          expect(obj.position.y).toBeTypeOf('number');
          expect(obj.position.z).toBeTypeOf('number');
          expect(isFinite(obj.position.x)).toBe(true);
          expect(isFinite(obj.position.y)).toBe(true);
          expect(isFinite(obj.position.z)).toBe(true);
        } catch (error) {
          // It's acceptable to reject invalid position data
          expect(error.message).toMatch(/(position|invalid|coordinate)/i);
        }
      }
    });
  });

  describe('Complex Scenarios Stress Tests', () => {
    it('should handle 1000+ objects in a single room efficiently', async () => {
      const gameId = 'mass-objects-test';
      const numObjects = 1000;

      // Create a large room
      const room = roomService.createRoom({
        gameId,
        name: 'Massive Warehouse',
        description: 'A room with thousands of objects',
        position: { x: 0, y: 0, z: 0 },
      });

      // Create many objects
      const objects = [];
      const startTime = Date.now();

      for (let i = 0; i < numObjects; i++) {
        const obj = objectService.createObject({
          gameId,
          name: `Object ${i}`,
          description: `Test object number ${i}`,
          position: {
            x: (i % 100) * 0.1,
            y: Math.floor(i / 100) * 0.1,
            z: 0,
          },
          material: i % 2 === 0 ? 'wood' : 'metal',
        });
        objects.push(obj);
      }

      const creationTime = Date.now() - startTime;
      console.log(`Created ${numObjects} objects in ${creationTime}ms`);

      // Place all objects in the room
      const placementStart = Date.now();
      let successfulPlacements = 0;

      for (const obj of objects) {
        const result = await roomService.addObjectToRoom(room.id, obj.id);
        if (result.success) {
          successfulPlacements++;
        }
      }

      const placementTime = Date.now() - placementStart;
      console.log(
        `Placed ${successfulPlacements}/${numObjects} objects in ${placementTime}ms`,
      );

      // Test retrieval performance
      const retrievalStart = Date.now();
      const roomObjects = await roomService.getObjectsInRoom(room.id);
      const retrievalTime = Date.now() - retrievalStart;

      console.log(
        `Retrieved ${roomObjects.validObjects.length} objects in ${retrievalTime}ms`,
      );

      expect(successfulPlacements).toBe(numObjects);
      expect(roomObjects.validObjects.length).toBe(numObjects);
      expect(creationTime).toBeLessThan(5000); // Creation should be fast
      expect(placementTime).toBeLessThan(10000); // Placement should be reasonable
      expect(retrievalTime).toBeLessThan(2000); // Retrieval should be fast
    }, 30000);

    it('should handle deep container hierarchies efficiently', async () => {
      const gameId = 'deep-containers-test';
      const depth = 25;

      const containers = [];

      // Create deep hierarchy of containers
      for (let i = 0; i < depth; i++) {
        const container = objectService.createObject({
          gameId,
          name: `Container Level ${i}`,
          description: `Container at depth ${i}`,
          position: { x: 0, y: 0, z: 0 },
          material: 'wood',
          isContainer: true,
          canContain: true,
          containerCapacity: 10,
        });
        containers.push(container);
      }

      // Nest them deeply
      for (let i = 0; i < depth - 1; i++) {
        const result = objectService.placeObject(containers[i + 1].id, {
          targetId: containers[i].id,
          relationshipType: 'inside',
        });
        expect(result).toBe(true);
      }

      // Test traversal performance
      const traversalStart = Date.now();

      // Find all nested objects starting from the top container
      const allNestedObjects = await objectService.getAllNestedObjects(
        containers[0].id,
      );

      const traversalTime = Date.now() - traversalStart;
      console.log(`Traversed ${depth} levels in ${traversalTime}ms`);

      expect(allNestedObjects.length).toBe(depth - 1); // All containers except the root
      expect(traversalTime).toBeLessThan(1000); // Should be reasonably fast
    });

    it('should handle mass entity movement efficiently', async () => {
      const gameId = 'mass-movement-test';
      const numEntities = 500;

      // Create two rooms
      const room1 = roomService.createRoom({
        gameId,
        name: 'Source Room',
        description: 'Starting room',
        position: { x: 0, y: 0, z: 0 },
      });

      const room2 = roomService.createRoom({
        gameId,
        name: 'Target Room',
        description: 'Destination room',
        position: { x: 100, y: 0, z: 0 },
      });

      // Create many entities
      const entities = [];
      for (let i = 0; i < numEntities; i++) {
        if (i % 2 === 0) {
          // Create objects
          const obj = objectService.createObject({
            gameId,
            name: `Object ${i}`,
            description: `Moveable object ${i}`,
            position: { x: 0, y: 0, z: 0 },
            material: 'wood',
            isPortable: true,
          });
          entities.push({ type: 'object', entity: obj });
        } else {
          // Create players
          const player = playerService.createPlayer({
            gameId,
            name: `Player ${i}`,
            position: { x: 0, y: 0, z: 0 },
            health: 100,
            level: 1,
          });
          entities.push({ type: 'player', entity: player });
        }
      }

      // Place all entities in room1
      for (const { type, entity } of entities) {
        if (type === 'object') {
          await roomService.addObjectToRoom(room1.id, entity.id);
        } else {
          await roomService.placePlayerInRoom(room1.id, entity.id);
        }
      }

      // Mass movement: move all entities to room2
      const moveStart = Date.now();
      let successfulMoves = 0;

      for (const { type, entity } of entities) {
        try {
          if (type === 'object') {
            const result = await roomService.moveObjectBetweenRooms(
              entity.id,
              room1.id,
              room2.id,
            );
            if (result.success) successfulMoves++;
          } else {
            const result = await roomService.movePlayerBetweenRooms(
              entity.id,
              room1.id,
              room2.id,
            );
            if (result.success) successfulMoves++;
          }
        } catch (error) {
          // Some moves might fail, that's acceptable
          console.log(`Move failed for ${entity.id}: ${error.message}`);
        }
      }

      const moveTime = Date.now() - moveStart;
      console.log(
        `Moved ${successfulMoves}/${numEntities} entities in ${moveTime}ms`,
      );

      // Verify final state
      const room1Contents = await roomService.getObjectsInRoom(room1.id);
      const room1Players = await roomService.getPlayersInRoom(room1.id);
      const room2Contents = await roomService.getObjectsInRoom(room2.id);
      const room2Players = await roomService.getPlayersInRoom(room2.id);

      const totalInRoom2 =
        room2Contents.validObjects.length + room2Players.validPlayers.length;

      expect(totalInRoom2).toBeGreaterThan(numEntities * 0.8); // At least 80% should move successfully
      expect(moveTime).toBeLessThan(15000); // Should complete within 15 seconds
    }, 20000);

    it('should handle relationship cascade updates efficiently', async () => {
      const gameId = 'cascade-test';

      // Create a complex web of relationships
      const centralObject = objectService.createObject({
        gameId,
        name: 'Central Hub',
        description: 'Object with many relationships',
        position: { x: 0, y: 0, z: 0 },
        material: 'metal',
        isContainer: true,
        canContain: true,
        containerCapacity: 50,
      });

      // Create many related objects
      const relatedObjects = [];
      for (let i = 0; i < 100; i++) {
        const obj = objectService.createObject({
          gameId,
          name: `Related Object ${i}`,
          description: `Object with relationship to central hub`,
          position: { x: i % 10, y: Math.floor(i / 10), z: 0 },
          material: 'wood',
        });
        relatedObjects.push(obj);

        // Create various relationships
        const relationshipType = ['on_top_of', 'next_to', 'attached_to'][i % 3];
        objectService.placeObject(obj.id, {
          targetId: centralObject.id,
          relationshipType: relationshipType as any,
        });
      }

      // Update the central object and measure cascade performance
      const cascadeStart = Date.now();

      const updateResult = await objectService.updateObject(centralObject.id, {
        position: { x: 50, y: 50, z: 0 },
        description: 'Updated central hub with new position',
      });

      const cascadeTime = Date.now() - cascadeStart;
      console.log(`Cascade update completed in ${cascadeTime}ms`);

      expect(updateResult.success).toBe(true);
      expect(cascadeTime).toBeLessThan(5000); // Cascade updates should be reasonably fast

      // Verify relationships are maintained after update
      const updatedRelationships = await objectService.getSpatialRelationships(
        centralObject.id,
      );
      expect(updatedRelationships.length).toBe(100);
    });
  });

  describe('Memory and Performance Under Load', () => {
    it('should maintain performance with large entity graphs', async () => {
      const gameId = 'large-graph-test';
      const numNodes = 500;
      const connectionsPerNode = 5;

      // Create a large connected graph of entities
      const entities = [];

      // Create nodes
      for (let i = 0; i < numNodes; i++) {
        const entity = objectService.createObject({
          gameId,
          name: `Node ${i}`,
          description: `Graph node ${i}`,
          position: {
            x: Math.cos((i * 2 * Math.PI) / numNodes) * 50,
            y: Math.sin((i * 2 * Math.PI) / numNodes) * 50,
            z: 0,
          },
          material: 'crystal',
        });
        entities.push(entity);
      }

      // Create connections
      const connectionStart = Date.now();
      for (let i = 0; i < numNodes; i++) {
        for (let j = 1; j <= connectionsPerNode; j++) {
          const targetIndex = (i + j) % numNodes;
          objectService.placeObject(entities[i].id, {
            targetId: entities[targetIndex].id,
            relationshipType: 'next_to',
          });
        }
      }
      const connectionTime = Date.now() - connectionStart;
      console.log(
        `Created ${numNodes * connectionsPerNode} connections in ${connectionTime}ms`,
      );

      // Test graph traversal performance
      const traversalStart = Date.now();
      const connectedNodes = await objectService.findConnectedEntities(
        entities[0].id,
        3, // 3 degrees of separation
      );
      const traversalTime = Date.now() - traversalStart;
      console.log(
        `Graph traversal (3 degrees) completed in ${traversalTime}ms`,
      );

      expect(connectedNodes.length).toBeGreaterThan(10);
      expect(connectionTime).toBeLessThan(10000);
      expect(traversalTime).toBeLessThan(2000);
    }, 25000);

    it('should handle memory efficiently with large datasets', async () => {
      const gameId = 'memory-test';

      // Get initial memory usage
      const initialMemory = process.memoryUsage().heapUsed;

      // Create a large number of entities
      const entities = [];
      for (let i = 0; i < 2000; i++) {
        const entity = objectService.createObject({
          gameId,
          name: `Memory Test Object ${i}`,
          description: `Object for memory testing with index ${i}`.repeat(10), // Larger description
          position: { x: i % 100, y: Math.floor(i / 100), z: 0 },
          material: 'wood',
          properties: {
            testData: new Array(100).fill(`data-${i}`), // Some bulk data
            timestamp: Date.now(),
            metadata: { created: true, index: i },
          },
        });
        entities.push(entity);
      }

      const afterCreationMemory = process.memoryUsage().heapUsed;
      const creationMemoryDelta = afterCreationMemory - initialMemory;
      console.log(
        `Memory used for 2000 entities: ${(creationMemoryDelta / 1024 / 1024).toFixed(2)} MB`,
      );

      // Clear entities and force garbage collection
      entities.length = 0;
      entityService.clearCache();
      objectService.clearCache();

      // Give GC some time to run
      await new Promise((resolve) => setTimeout(resolve, 100));

      const afterCleanupMemory = process.memoryUsage().heapUsed;
      const memoryRecovered = afterCreationMemory - afterCleanupMemory;
      console.log(
        `Memory recovered after cleanup: ${(memoryRecovered / 1024 / 1024).toFixed(2)} MB`,
      );

      // Memory usage should be reasonable
      expect(creationMemoryDelta).toBeLessThan(100 * 1024 * 1024); // Less than 100MB for 2000 entities
      expect(memoryRecovered).toBeGreaterThan(creationMemoryDelta * 0.5); // At least 50% memory recovery
    }, 15000);
  });
});
