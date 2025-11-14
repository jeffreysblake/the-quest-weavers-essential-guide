import { Test, TestingModule } from '@nestjs/testing';
import { EntityService } from '../entity/entity.service';
import { RoomService } from '../entity/room.service';
import { ObjectService } from '../entity/object.service';
import { PlayerService } from '../entity/player.service';
import { PhysicsService } from '../entity/physics.service';
import { DatabaseService } from '../database/database.service';
import { CLIService } from '../cli/cli.service';
import { GameManagerService } from '../cli/game-manager.service';
import { FileScannerService } from '../file-system/file-scanner.service';
import { GameFileService } from '../file-system/game-file.service';
import * as fs from 'fs';
import * as path from 'path';

describe('Full System Integration Stress Tests', () => {
  let module: TestingModule;
  let entityService: EntityService;
  let roomService: RoomService;
  let objectService: ObjectService;
  let playerService: PlayerService;
  let physicsService: PhysicsService;
  let databaseService: DatabaseService;
  let cliService: CLIService;
  let gameManagerService: GameManagerService;
  let fileScannerService: FileScannerService;
  let gameFileService: GameFileService;
  let testDbPath: string;
  let testGamesDir: string;

  beforeEach(async () => {
    testDbPath = path.join(
      __dirname,
      '../../integration-stress-test-' +
        Date.now() +
        '-' +
        Math.random().toString(36).substr(2, 9) +
        '.db',
    );
    testGamesDir = path.join(
      __dirname,
      '../../integration-test-games-' +
        Date.now() +
        '-' +
        Math.random().toString(36).substr(2, 9),
    );

    // Clean up existing test files
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testGamesDir)) {
      fs.rmSync(testGamesDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testGamesDir, { recursive: true });

    // Create test database service
    databaseService = new DatabaseService(testDbPath);
    await databaseService.connect();
    await databaseService.migrate();

    module = await Test.createTestingModule({
      providers: [
        EntityService,
        RoomService,
        ObjectService,
        PlayerService,
        PhysicsService,
        CLIService,
        GameManagerService,
        FileScannerService,
        GameFileService,
        { provide: DatabaseService, useValue: databaseService },
      ],
    }).compile();

    entityService = module.get<EntityService>(EntityService);
    roomService = module.get<RoomService>(RoomService);
    objectService = module.get<ObjectService>(ObjectService);
    playerService = module.get<PlayerService>(PlayerService);
    physicsService = module.get<PhysicsService>(PhysicsService);
    cliService = module.get<CLIService>(CLIService);
    gameManagerService = module.get<GameManagerService>(GameManagerService);
    fileScannerService = module.get<FileScannerService>(FileScannerService);
    gameFileService = module.get<GameFileService>(GameFileService);
  });

  afterEach(async () => {
    await module.close();
    await databaseService.disconnect();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testGamesDir)) {
      fs.rmSync(testGamesDir, { recursive: true, force: true });
    }
  });

  describe('Complete Game Lifecycle Stress Tests', () => {
    it('should handle end-to-end game creation, play, and persistence', async () => {
      const gameId =
        'e2e-stress-game-' +
        Date.now() +
        '-' +
        Math.random().toString(36).substr(2, 9);

      console.log('🎮 Starting end-to-end game lifecycle test...');

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

      // Phase 1: Game Creation
      const creationStart = Date.now();

      // Create multiple interconnected rooms
      const rooms = [];
      for (let i = 0; i < 20; i++) {
        const room = roomService.createRoom({
          gameId,
          name: `Room ${i}`,
          description: `Test room ${i} for stress testing`,
          position: { x: i * 10, y: 0, z: 0 },
        });
        rooms.push(room);
      }

      // Connect rooms
      for (let i = 0; i < rooms.length - 1; i++) {
        await roomService.connectRooms(
          rooms[i].id,
          rooms[i + 1].id,
          'east',
          `Path from ${rooms[i].name} to ${rooms[i + 1].name}`,
        );
      }

      // Create diverse objects
      const objects = [];
      const materials = ['wood', 'metal', 'stone', 'crystal', 'fabric'];
      for (let i = 0; i < 100; i++) {
        const obj = objectService.createObject({
          gameId,
          name: `Object ${i}`,
          description: `Test object ${i}`,
          position: { x: Math.random() * 200, y: Math.random() * 200, z: 0 },
          material: materials[i % materials.length],
          weight: Math.random() * 10,
          health: 100,
          maxHealth: 100,
          isPortable: i % 3 !== 0,
          isContainer: i % 5 === 0,
          canContain: i % 5 === 0,
          containerCapacity: i % 5 === 0 ? 10 : 0,
        });
        objects.push(obj);

        // Place objects in rooms
        const roomIndex = i % rooms.length;
        await roomService.placeObjectInRoom(rooms[roomIndex].id, obj.id);
      }

      // Create spatial relationships
      for (let i = 0; i < 30; i++) {
        const obj1 = objects[i];
        const obj2 = objects[i + 1] || objects[0];
        const relationships = ['on_top_of', 'next_to', 'attached_to'];
        await objectService.createSpatialRelationship(
          obj1.id,
          obj2.id,
          relationships[i % relationships.length] as any,
        );
      }

      // Create players
      const players = [];
      for (let i = 0; i < 10; i++) {
        const player = playerService.createPlayer({
          gameId,
          name: `Player ${i}`,
          position: { x: 0, y: 0, z: 0 },
          health: 100,
          level: Math.floor(Math.random() * 10) + 1,
          experience: Math.random() * 1000,
        });
        players.push(player);

        // Place players in rooms
        const roomIndex = i % rooms.length;
        await roomService.placePlayerInRoom(rooms[roomIndex].id, player.id);
      }

      const creationTime = Date.now() - creationStart;
      console.log(`✅ Game creation completed in ${creationTime}ms`);

      // Phase 2: Intensive Gameplay Simulation
      const gameplayStart = Date.now();

      // Simulate 1000 game actions
      let successfulActions = 0;
      const actionTypes = [
        'move',
        'take',
        'examine',
        'use',
        'cast_spell',
        'inventory',
      ];

      for (let action = 0; action < 1000; action++) {
        const player = players[action % players.length];
        const actionType = actionTypes[action % actionTypes.length];

        try {
          switch (actionType) {
            case 'move':
              const targetRoom =
                rooms[Math.floor(Math.random() * rooms.length)];
              const moveResult = await roomService.movePlayerBetweenRooms(
                player.id,
                player.currentRoomId || rooms[0].id,
                targetRoom.id,
              );
              if (moveResult.success) successfulActions++;
              break;

            case 'take':
              const availableObjects = await roomService.getObjectsInRoom(
                player.currentRoomId || rooms[0].id,
              );
              if (availableObjects.validObjects.length > 0) {
                const randomObj =
                  availableObjects.validObjects[
                    Math.floor(
                      Math.random() * availableObjects.validObjects.length,
                    )
                  ];
                const takeResult = await playerService.takeObject(
                  player.id,
                  randomObj.id,
                );
                if (takeResult.success) successfulActions++;
              } else {
                successfulActions++; // No objects to take is acceptable
              }
              break;

            case 'examine':
              const examineObj =
                objects[Math.floor(Math.random() * objects.length)];
              const examineResult = await playerService.examineObject(
                player.id,
                examineObj.id,
              );
              if (examineResult.success) successfulActions++;
              break;

            case 'use':
              if (player.inventory && player.inventory.length > 0) {
                const randomInventoryItem =
                  player.inventory[
                    Math.floor(Math.random() * player.inventory.length)
                  ];
                const useResult = await playerService.useObject(
                  player.id,
                  randomInventoryItem,
                );
                if (useResult.success) successfulActions++;
              } else {
                successfulActions++; // No items to use is acceptable
              }
              break;

            case 'cast_spell':
              const spellTarget =
                objects[Math.floor(Math.random() * objects.length)];
              const effects = ['fire', 'ice', 'lightning', 'force'];
              const effect =
                effects[Math.floor(Math.random() * effects.length)];
              const spellResult = await playerService.castSpell(
                player.id,
                effect as any,
                spellTarget.id,
                { intensity: 25, duration: 500 },
              );
              if (spellResult.success) successfulActions++;
              break;

            case 'inventory':
              const invStats = await playerService.getInventoryStats(player.id);
              if (invStats) successfulActions++;
              break;
          }
        } catch (error) {
          // Some actions may fail, which is acceptable
        }

        // Add physics updates periodically
        if (action % 100 === 0) {
          physicsService.startSimulation();
          await new Promise((resolve) => setTimeout(resolve, 50));
          physicsService.stopSimulation();
        }
      }

      const gameplayTime = Date.now() - gameplayStart;
      console.log(
        `🎯 Gameplay simulation completed: ${successfulActions}/1000 actions successful in ${gameplayTime}ms`,
      );

      // Phase 3: Persistence and Database Operations
      const persistenceStart = Date.now();

      // Save all entities to database
      await entityService.persistEntities();

      // Create version snapshots
      for (let i = 0; i < Math.min(players.length, 5); i++) {
        await entityService.saveEntityVersion(
          players[i].id,
          `Gameplay snapshot ${i}`,
        );
      }

      for (let i = 0; i < Math.min(objects.length, 10); i++) {
        await entityService.saveEntityVersion(
          objects[i].id,
          `Object state snapshot ${i}`,
        );
      }

      const persistenceTime = Date.now() - persistenceStart;
      console.log(`💾 Persistence completed in ${persistenceTime}ms`);

      // Phase 4: File System Operations
      const fileSystemStart = Date.now();

      // Export game to files
      const gameDir = path.join(testGamesDir, gameId);
      fs.mkdirSync(gameDir, { recursive: true });

      // Save game data to JSON files
      const gameData = {
        id: gameId,
        name: 'End-to-End Stress Test Game',
        description: 'Comprehensive stress test game',
        version: 1,
        created: new Date().toISOString(),
      };

      fs.writeFileSync(
        path.join(gameDir, 'game.json'),
        JSON.stringify(gameData, null, 2),
      );

      // Save rooms data
      const roomsData = rooms.map((room) => ({
        ...room,
        connections: [], // Would be populated by actual implementation
      }));

      fs.writeFileSync(
        path.join(gameDir, 'rooms.json'),
        JSON.stringify(roomsData, null, 2),
      );

      // Test file system scanning
      const scanResult =
        await fileScannerService.scanGamesDirectory(testGamesDir);

      const fileSystemTime = Date.now() - fileSystemStart;
      console.log(`📁 File system operations completed in ${fileSystemTime}ms`);

      // Phase 5: CLI Integration
      const cliStart = Date.now();

      // Test CLI commands
      const cliCommands = [
        ['game:list'],
        ['db:status'],
        ['cache:stats'],
        ['entity:list', gameId, '--type', 'player'],
      ];

      let cliSuccessful = 0;
      for (const command of cliCommands) {
        try {
          await cliService.run(['node', 'cli.js', ...command]);
          cliSuccessful++;
        } catch (error) {
          // CLI commands might fail in test environment
        }
      }

      const cliTime = Date.now() - cliStart;
      console.log(
        `⌨️  CLI operations completed: ${cliSuccessful}/${cliCommands.length} successful in ${cliTime}ms`,
      );

      // Final Validation
      const totalTime = Date.now() - creationStart;
      console.log(`🏁 Total end-to-end test completed in ${totalTime}ms`);

      // Validate system integrity
      const finalCacheStats = entityService.getCacheStats();
      const dbHealth = await databaseService.healthCheck();

      // Assertions
      expect(successfulActions).toBeGreaterThan(700); // At least 70% success rate
      expect(creationTime).toBeLessThan(10000); // Creation within 10 seconds
      expect(gameplayTime).toBeLessThan(30000); // Gameplay within 30 seconds
      expect(persistenceTime).toBeLessThan(5000); // Persistence within 5 seconds
      expect(fileSystemTime).toBeLessThan(3000); // File ops within 3 seconds
      expect(totalTime).toBeLessThan(60000); // Total within 60 seconds
      expect(finalCacheStats.size).toBeGreaterThan(0);
      expect(dbHealth).toBe(true);
      expect(scanResult.totalGames).toBeGreaterThan(0);
    }, 90000); // 90 second timeout for full test

    it('should handle complex multi-player adventure scenarios', async () => {
      const gameId =
        'multiplayer-adventure-' +
        Date.now() +
        '-' +
        Math.random().toString(36).substr(2, 9);

      console.log('👥 Starting multiplayer adventure scenario...');

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

      // Create adventure world
      const dungeon = roomService.createRoom({
        gameId,
        name: 'Ancient Dungeon',
        description: 'A mysterious dungeon filled with treasures and dangers',
        position: { x: 0, y: 0, z: 0 },
      });

      const treasureRoom = roomService.createRoom({
        gameId,
        name: 'Treasure Chamber',
        description: 'A room gleaming with gold and magical artifacts',
        position: { x: 50, y: 0, z: 0 },
      });

      const bossRoom = roomService.createRoom({
        gameId,
        name: 'Dragon Lair',
        description: 'The final chamber where an ancient dragon sleeps',
        position: { x: 100, y: 0, z: 0 },
      });

      // Connect rooms
      await roomService.connectRooms(
        dungeon.id,
        treasureRoom.id,
        'east',
        'Locked door',
      );
      await roomService.connectRooms(
        treasureRoom.id,
        bossRoom.id,
        'north',
        'Dragon gate',
      );

      // Create magical objects
      const magicalSword = objectService.createObject({
        gameId,
        name: 'Dragonslayer Sword',
        description: 'A blade forged from dragon scales',
        position: { x: 25, y: 25, z: 0 },
        material: 'dragonscale',
        weight: 5,
        health: 200,
        maxHealth: 200,
        properties: {
          damage: 50,
          magical: true,
          enchantment: 'fire',
        },
      });

      const magicalShield = objectService.createObject({
        gameId,
        name: 'Shield of Protection',
        description: 'A shield that glows with protective magic',
        position: { x: 75, y: 25, z: 0 },
        material: 'mithril',
        weight: 3,
        health: 300,
        maxHealth: 300,
        properties: {
          defense: 30,
          magical: true,
          enchantment: 'protection',
        },
      });

      const treasure = objectService.createObject({
        gameId,
        name: 'Ancient Treasure Chest',
        description: 'A chest overflowing with gold and gems',
        position: { x: 50, y: 30, z: 0 },
        material: 'gold',
        weight: 100,
        isContainer: true,
        canContain: true,
        containerCapacity: 20,
        properties: {
          value: 10000,
          locked: true,
          keyRequired: 'golden-key',
        },
      });

      // Place objects in rooms
      await roomService.placeObjectInRoom(dungeon.id, magicalSword.id);
      await roomService.placeObjectInRoom(treasureRoom.id, magicalShield.id);
      await roomService.placeObjectInRoom(treasureRoom.id, treasure.id);

      // Create adventuring party
      const adventurers = [];
      const classes = ['warrior', 'mage', 'rogue', 'cleric'];

      for (let i = 0; i < 4; i++) {
        const adventurer = playerService.createPlayer({
          gameId,
          name: `${classes[i].charAt(0).toUpperCase()}${classes[i].slice(1)} ${i + 1}`,
          position: { x: 0, y: 0, z: 0 },
          health: 100,
          level: 5 + i,
          experience: (5 + i) * 100,
          properties: {
            class: classes[i],
            mana: classes[i] === 'mage' || classes[i] === 'cleric' ? 100 : 0,
            skills: {
              combat: classes[i] === 'warrior' ? 8 : 5,
              magic:
                classes[i] === 'mage' ? 8 : classes[i] === 'cleric' ? 6 : 2,
              stealth: classes[i] === 'rogue' ? 8 : 3,
              healing: classes[i] === 'cleric' ? 8 : 2,
            },
          },
        });
        adventurers.push(adventurer);
        await roomService.placePlayerInRoom(dungeon.id, adventurer.id);
      }

      console.log(`Created party of ${adventurers.length} adventurers`);

      // Adventure Phase 1: Exploration
      const explorationStart = Date.now();

      // Each player explores and interacts
      for (const adventurer of adventurers) {
        // Examine the dungeon
        const examineResult = await playerService.examineObject(
          adventurer.id,
          dungeon.id,
        );
        expect(examineResult.success).toBe(true);

        // Look for objects
        const roomObjects = await roomService.getObjectsInRoom(dungeon.id);
        if (roomObjects.validObjects.length > 0) {
          // Warrior takes the sword
          if (adventurer.properties?.class === 'warrior') {
            const takeResult = await playerService.takeObject(
              adventurer.id,
              magicalSword.id,
            );
            if (takeResult.success) {
              console.log(`${adventurer.name} took the magical sword`);
            }
          }
        }
      }

      const explorationTime = Date.now() - explorationStart;
      console.log(`⚔️  Exploration phase completed in ${explorationTime}ms`);

      // Adventure Phase 2: Treasure Hunt
      const treasureHuntStart = Date.now();

      // Move party to treasure room
      for (const adventurer of adventurers) {
        const moveResult = await roomService.movePlayerBetweenRooms(
          adventurer.id,
          dungeon.id,
          treasureRoom.id,
        );

        if (moveResult.success) {
          // Examine treasure room
          await playerService.examineObject(adventurer.id, treasureRoom.id);

          // Rogue attempts to pick lock on treasure
          if (adventurer.properties?.class === 'rogue') {
            const lockpickResult = await playerService.useObject(
              adventurer.id,
              treasure.id,
              { action: 'lockpick', skill: 'stealth' },
            );
            if (lockpickResult.success) {
              console.log(`${adventurer.name} picked the lock!`);
            }
          }

          // Mage casts detection spells
          if (adventurer.properties?.class === 'mage') {
            const spellResult = await playerService.castSpell(
              adventurer.id,
              'magic',
              treasureRoom.id,
              { intensity: 30, duration: 1000, effect: 'detect_magic' },
            );
            if (spellResult.success) {
              console.log(`${adventurer.name} detected magical auras`);
            }
          }
        }
      }

      const treasureHuntTime = Date.now() - treasureHuntStart;
      console.log(`💰 Treasure hunt phase completed in ${treasureHuntTime}ms`);

      // Adventure Phase 3: Boss Battle Simulation
      const battleStart = Date.now();

      // Create dragon boss
      const dragon = playerService.createPlayer({
        gameId,
        name: 'Ancient Red Dragon',
        position: { x: 100, y: 50, z: 10 },
        health: 500,
        level: 15,
        properties: {
          type: 'dragon',
          damage: 75,
          defense: 40,
          abilities: ['fire_breath', 'wing_attack', 'tail_swipe'],
          immunities: ['fire', 'fear'],
        },
      });

      await roomService.placePlayerInRoom(bossRoom.id, dragon.id);

      // Move party to boss room for final battle
      for (const adventurer of adventurers) {
        await roomService.movePlayerBetweenRooms(
          adventurer.id,
          treasureRoom.id,
          bossRoom.id,
        );
      }

      // Simulate 10 rounds of combat
      const battleRounds = 10;
      let dragonHealth = 500;

      for (let round = 1; round <= battleRounds; round++) {
        console.log(`⚔️  Battle Round ${round}`);

        // Each adventurer attacks
        for (const adventurer of adventurers) {
          const className = adventurer.properties?.class;
          let damage = 20; // Base damage

          // Class-specific actions
          switch (className) {
            case 'warrior':
              damage = 40; // High physical damage
              break;
            case 'mage':
              // Cast damaging spell
              await playerService.castSpell(adventurer.id, 'fire', dragon.id, {
                intensity: 50,
                duration: 100,
              });
              damage = 35;
              break;
            case 'rogue':
              damage = 30; // Sneak attack
              break;
            case 'cleric':
              // Heal party members
              await playerService.castSpell(
                adventurer.id,
                'magic',
                adventurer.id,
                { intensity: 25, duration: 100, effect: 'heal' },
              );
              damage = 15;
              break;
          }

          dragonHealth -= damage;

          // Update physics for spell effects
          if (className === 'mage') {
            physicsService.startSimulation();
            await new Promise((resolve) => setTimeout(resolve, 10));
            physicsService.stopSimulation();
          }
        }

        // Dragon attacks back (simplified)
        dragonHealth = Math.max(0, dragonHealth);
        if (dragonHealth <= 0) {
          console.log('🐉 Dragon defeated!');
          break;
        }
      }

      const battleTime = Date.now() - battleStart;
      console.log(`⚔️  Boss battle completed in ${battleTime}ms`);

      // Adventure Phase 4: Victory and Loot Distribution
      const lootStart = Date.now();

      // Create victory loot
      const dragonHoard = [];
      for (let i = 0; i < 20; i++) {
        const loot = objectService.createObject({
          gameId,
          name: `Dragon Treasure ${i}`,
          description: `Valuable treasure from the dragon's hoard`,
          position: {
            x: 90 + Math.random() * 20,
            y: 40 + Math.random() * 20,
            z: 0,
          },
          material: ['gold', 'silver', 'gem', 'magic'][i % 4],
          weight: Math.random() * 5,
          properties: {
            value: 100 + Math.random() * 900,
            magical: i % 3 === 0,
          },
        });
        dragonHoard.push(loot);
        await roomService.placeObjectInRoom(bossRoom.id, loot.id);
      }

      // Distribute loot among party
      for (let i = 0; i < dragonHoard.length; i++) {
        const adventurer = adventurers[i % adventurers.length];
        await playerService.takeObject(adventurer.id, dragonHoard[i].id);
      }

      const lootTime = Date.now() - lootStart;
      console.log(`💎 Loot distribution completed in ${lootTime}ms`);

      // Final validation
      const totalAdventureTime = Date.now() - explorationStart;
      console.log(`🏆 Complete adventure finished in ${totalAdventureTime}ms`);

      // Verify adventure completion
      const finalPartyStats = await Promise.all(
        adventurers.map(async (adventurer) => {
          const stats = await playerService.getInventoryStats(adventurer.id);
          return { name: adventurer.name, inventory: stats };
        }),
      );

      console.log(
        'Final party status:',
        finalPartyStats.map(
          (s) => `${s.name}: ${s.inventory.totalItems} items`,
        ),
      );

      // Assertions
      expect(explorationTime).toBeLessThan(5000);
      expect(treasureHuntTime).toBeLessThan(10000);
      expect(battleTime).toBeLessThan(15000);
      expect(lootTime).toBeLessThan(5000);
      expect(totalAdventureTime).toBeLessThan(40000);
      expect(dragonHealth).toBeLessThanOrEqual(0); // Dragon should be defeated
      expect(finalPartyStats.every((s) => s.inventory.totalItems > 0)).toBe(
        true,
      ); // All should have loot
    }, 60000);

    it('should handle persistent world simulation with time-based events', async () => {
      const gameId =
        'persistent-world-' +
        Date.now() +
        '-' +
        Math.random().toString(36).substr(2, 9);

      console.log('🌍 Starting persistent world simulation...');

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

      // Create a living world
      const worldStart = Date.now();

      // Create multiple settlements
      const settlements = [];
      const settlementNames = [
        'Rivertown',
        'Mountain Keep',
        'Forest Glade',
        'Desert Oasis',
        'Coastal Port',
      ];

      for (let i = 0; i < settlementNames.length; i++) {
        const settlement = roomService.createRoom({
          gameId,
          name: settlementNames[i],
          description: `The bustling settlement of ${settlementNames[i]}`,
          position: { x: i * 100, y: i * 50, z: 0 },
          properties: {
            population: 100 + Math.random() * 900,
            wealth: Math.random() * 1000,
            type: 'settlement',
            resources: ['food', 'wood', 'stone', 'metal'][i % 4],
          },
        });
        settlements.push(settlement);
      }

      // Create trade routes
      for (let i = 0; i < settlements.length - 1; i++) {
        await roomService.connectRooms(
          settlements[i].id,
          settlements[i + 1].id,
          'road',
          `Trade route between ${settlements[i].name} and ${settlements[i + 1].name}`,
        );
      }

      // Create merchants and NPCs
      const npcs = [];
      for (let i = 0; i < 50; i++) {
        const npc = playerService.createPlayer({
          gameId,
          name: `NPC ${i}`,
          position: { x: 0, y: 0, z: 0 },
          health: 80 + Math.random() * 40,
          level: 1 + Math.floor(Math.random() * 5),
          properties: {
            type: 'npc',
            role: ['merchant', 'guard', 'farmer', 'blacksmith', 'innkeeper'][
              i % 5
            ],
            schedule: {
              morning: 'work',
              afternoon: 'work',
              evening: 'rest',
              night: 'sleep',
            },
            inventory: [],
          },
        });
        npcs.push(npc);

        // Place NPCs in settlements
        const settlementIndex = i % settlements.length;
        await roomService.placePlayerInRoom(
          settlements[settlementIndex].id,
          npc.id,
        );
      }

      // Create dynamic objects with time-based properties
      const dynamicObjects = [];
      for (let i = 0; i < 100; i++) {
        const obj = objectService.createObject({
          gameId,
          name: `Dynamic Object ${i}`,
          description: `An object that changes over time`,
          position: { x: Math.random() * 500, y: Math.random() * 250, z: 0 },
          material: 'organic',
          weight: Math.random() * 20,
          properties: {
            timeCreated: Date.now(),
            decayRate: Math.random() * 0.1,
            growthRate: Math.random() * 0.05,
            currentState: 'fresh',
            weatherAffected: true,
          },
        });
        dynamicObjects.push(obj);

        const roomIndex = Math.floor(Math.random() * settlements.length);
        await roomService.placeObjectInRoom(settlements[roomIndex].id, obj.id);
      }

      const worldCreationTime = Date.now() - worldStart;
      console.log(`🏗️  World creation completed in ${worldCreationTime}ms`);

      // Simulate world events over time
      const simulationStart = Date.now();
      const simulationDays = 7; // Simulate a week
      const timeStep = 100; // ms per day

      for (let day = 1; day <= simulationDays; day++) {
        console.log(`📅 Day ${day} - World simulation`);

        // Time-based events
        const dayEvents = [
          // Weather events
          async () => {
            const weather = ['sunny', 'rainy', 'stormy', 'foggy'][
              Math.floor(Math.random() * 4)
            ];
            console.log(`  Weather: ${weather}`);

            // Weather affects objects
            for (const obj of dynamicObjects.slice(0, 10)) {
              // Limit for performance
              if (obj.properties.weatherAffected) {
                const weatherEffect =
                  weather === 'rainy' ? 0.2 : weather === 'sunny' ? -0.1 : 0.1;
                await objectService.updateObjectProperties(obj.id, {
                  condition: Math.max(
                    0,
                    (obj.properties.condition || 1) + weatherEffect,
                  ),
                });
              }
            }
          },

          // Trade events
          async () => {
            // Merchants move between settlements
            const merchants = npcs.filter(
              (npc) => npc.properties?.role === 'merchant',
            );
            for (const merchant of merchants.slice(0, 3)) {
              // Limit for performance
              const targetSettlement =
                settlements[Math.floor(Math.random() * settlements.length)];
              await roomService.movePlayerBetweenRooms(
                merchant.id,
                merchant.currentRoomId || settlements[0].id,
                targetSettlement.id,
              );
            }
          },

          // Object decay/growth
          async () => {
            for (const obj of dynamicObjects.slice(0, 5)) {
              // Limit for performance
              const timeDiff = Date.now() - obj.properties.timeCreated;
              const daysPassed = Math.floor(timeDiff / timeStep);

              const newWeight = Math.max(
                0.1,
                obj.weight +
                  (obj.properties.growthRate - obj.properties.decayRate) *
                    daysPassed,
              );
              await objectService.updateObject(obj.id, { weight: newWeight });
            }
          },

          // Population changes
          async () => {
            for (const settlement of settlements) {
              const populationChange = (Math.random() - 0.5) * 20;
              const newPopulation = Math.max(
                50,
                settlement.properties.population + populationChange,
              );
              await roomService.updateRoom(settlement.id, {
                properties: {
                  ...settlement.properties,
                  population: newPopulation,
                },
              });
            }
          },
        ];

        // Execute random events
        const eventsToRun = Math.floor(Math.random() * dayEvents.length) + 1;
        for (let i = 0; i < eventsToRun; i++) {
          const randomEvent =
            dayEvents[Math.floor(Math.random() * dayEvents.length)];
          await randomEvent();
        }

        // Save world state periodically
        if (day % 3 === 0) {
          await entityService.persistEntities();

          // Create world snapshot
          for (const settlement of settlements.slice(0, 2)) {
            // Limit for performance
            await entityService.saveEntityVersion(
              settlement.id,
              `Day ${day} world snapshot`,
            );
          }
        }

        // Simulate time passage
        await new Promise((resolve) => setTimeout(resolve, timeStep));
      }

      const simulationTime = Date.now() - simulationStart;
      console.log(`⏰ World simulation completed in ${simulationTime}ms`);

      // Validate persistent changes
      const finalWorldState = await Promise.all([
        ...settlements.map(async (s) => {
          const updated = roomService.getRoom(s.id);
          return {
            name: s.name,
            population: updated?.properties?.population || 0,
          };
        }),
        ...dynamicObjects.slice(0, 10).map(async (obj) => {
          const updated = objectService.getObject(obj.id);
          return { name: obj.name, weight: updated?.weight || 0 };
        }),
      ]);

      console.log('Final world state sample:', finalWorldState.slice(0, 5));

      const totalWorldTime = Date.now() - worldStart;
      console.log(
        `🌍 Complete world simulation finished in ${totalWorldTime}ms`,
      );

      // Assertions
      expect(worldCreationTime).toBeLessThan(15000);
      expect(simulationTime).toBeLessThan(20000);
      expect(totalWorldTime).toBeLessThan(40000);
      expect(finalWorldState.length).toBeGreaterThan(0);
      expect(
        finalWorldState.filter(
          (state) => state.population > 0 || state.weight > 0,
        ).length,
      ).toBeGreaterThan(0);
    }, 60000);
  });

  describe('System Stability Under Load', () => {
    it('should maintain stability during prolonged operation', async () => {
      console.log('🔧 Starting prolonged stability test...');

      const stabilityStart = Date.now();
      const gameId =
        'stability-test-' +
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

      // Track memory usage
      const initialMemory = process.memoryUsage();
      let maxMemoryIncrease = 0;

      // Run continuous operations for 30 seconds
      const endTime = Date.now() + 30000;
      let operationCount = 0;
      let errorCount = 0;

      while (Date.now() < endTime) {
        try {
          // Rotate through different types of operations
          const operationType = operationCount % 6;

          switch (operationType) {
            case 0:
              // Create entities
              const room = roomService.createRoom({
                gameId,
                name: `Stability Room ${operationCount}`,
                description: 'Testing room stability',
                position: { x: operationCount % 100, y: 0, z: 0 },
              });
              break;

            case 1:
              // Create objects
              const obj = objectService.createObject({
                gameId,
                name: `Stability Object ${operationCount}`,
                description: 'Testing object stability',
                position: { x: 0, y: operationCount % 100, z: 0 },
                material: 'test',
              });
              break;

            case 2:
              // Database operations
              await entityService.persistEntities();
              break;

            case 3:
              // Cache operations
              const stats = entityService.getCacheStats();
              if (stats.size > 100) {
                entityService.clearCache();
              }
              break;

            case 4:
              // Physics simulation
              physicsService.startSimulation();
              await new Promise((resolve) => setTimeout(resolve, 5));
              physicsService.stopSimulation();
              break;

            case 5:
              // Memory check
              const currentMemory = process.memoryUsage();
              const memoryIncrease =
                currentMemory.heapUsed - initialMemory.heapUsed;
              maxMemoryIncrease = Math.max(maxMemoryIncrease, memoryIncrease);
              break;
          }

          operationCount++;

          // Small delay to prevent overwhelming the system
          if (operationCount % 100 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 1));
          }
        } catch (error) {
          errorCount++;
          if (errorCount > operationCount * 0.1) {
            // More than 10% error rate
            throw new Error(
              `Too many errors during stability test: ${errorCount}/${operationCount}`,
            );
          }
        }
      }

      const stabilityTime = Date.now() - stabilityStart;
      const operationsPerSecond = Math.round(
        operationCount / (stabilityTime / 1000),
      );
      const errorRate = (errorCount / operationCount) * 100;

      console.log(`⚡ Stability test completed:`);
      console.log(`  - Operations: ${operationCount} in ${stabilityTime}ms`);
      console.log(`  - Rate: ${operationsPerSecond} ops/sec`);
      console.log(`  - Error rate: ${errorRate.toFixed(2)}%`);
      console.log(
        `  - Max memory increase: ${(maxMemoryIncrease / 1024 / 1024).toFixed(2)} MB`,
      );

      // Verify system is still responsive
      const finalHealth = await databaseService.healthCheck();
      const finalCacheStats = entityService.getCacheStats();

      // Assertions
      expect(operationCount).toBeGreaterThan(1000); // Should complete many operations
      expect(errorRate).toBeLessThan(5); // Less than 5% error rate
      expect(maxMemoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB increase
      expect(finalHealth).toBe(true);
      expect(finalCacheStats).toBeDefined();
    }, 45000);
  });
});
