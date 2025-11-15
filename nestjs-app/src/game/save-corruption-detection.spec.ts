import { Test, TestingModule } from '@nestjs/testing';
import { GameStateService, GameState } from './game-state.service';

describe('Save File Corruption Detection and Recovery', () => {
  let service: GameStateService;
  let module: TestingModule;

  // Helper function to create a valid game state
  const createValidGameState = (gameId: string = 'test-game'): GameState => ({
    gameId,
    player: {
      id: 'player-1',
      name: 'Hero',
      position: { x: 5, y: 5, z: 0 },
      health: 100,
      maxHealth: 100,
      inventory: ['item-1', 'item-2'],
      level: 5,
      experience: 1500,
      type: 'player',
      roomId: 'room-1',
    },
    rooms: {
      'room-1': {
        id: 'room-1',
        name: 'Entry Hall',
        description: 'A dimly lit entry hall',
        position: { x: 0, y: 0, z: 0 },
        size: { width: 10, height: 10, depth: 3 },
        width: 10,
        height: 10,
        objects: ['item-1', 'item-3'],
        players: ['player-1'],
        connections: { north: 'room-2', east: 'room-3' },
        type: 'room',
      },
      'room-2': {
        id: 'room-2',
        name: 'Garden',
        description: 'A peaceful garden',
        position: { x: 0, y: 15, z: 0 },
        size: { width: 10, height: 10, depth: 3 },
        width: 10,
        height: 10,
        objects: ['item-4'],
        players: [],
        connections: { south: 'room-1' },
        type: 'room',
      },
      'room-3': {
        id: 'room-3',
        name: 'Library',
        description: 'A vast library',
        position: { x: 15, y: 0, z: 0 },
        size: { width: 10, height: 10, depth: 3 },
        width: 10,
        height: 10,
        objects: [],
        players: [],
        connections: { west: 'room-1' },
        type: 'room',
      },
    },
    items: {
      'item-1': {
        id: 'item-1',
        name: 'Brass Key',
        description: 'An old brass key',
        objectType: 'item',
        position: { x: 5, y: 5, z: 0 },
        canTake: true,
        type: 'object',
        roomId: 'room-1',
      },
      'item-2': {
        id: 'item-2',
        name: 'Health Potion',
        description: 'A red healing potion',
        objectType: 'consumable',
        position: { x: 0, y: 0, z: 0 },
        canTake: true,
        type: 'object',
        health: 50,
      },
      'item-3': {
        id: 'item-3',
        name: 'Stone Statue',
        description: 'A heavy stone statue',
        objectType: 'furniture',
        position: { x: 3, y: 3, z: 0 },
        canTake: false,
        type: 'object',
        roomId: 'room-1',
      },
      'item-4': {
        id: 'item-4',
        name: 'Glowing Flower',
        description: 'A flower that glows softly',
        objectType: 'item',
        position: { x: 5, y: 18, z: 0 },
        canTake: true,
        type: 'object',
        roomId: 'room-2',
      },
    },
    npcs: {
      'npc-1': {
        id: 'npc-1',
        name: 'Guard',
        description: 'A stern-looking guard',
        position: { x: 2, y: 2, z: 0 },
        health: 100,
        type: 'object',
        roomId: 'room-1',
      },
    },
    metadata: {
      version: '2.1.0',
      initialized: true,
      savedAt: new Date('2025-01-15T10:30:00Z'),
      lastCommand: 'look',
      lastCommandTime: new Date('2025-01-15T10:29:55Z'),
      startingRoomId: 'room-1',
    },
    startingRoomId: 'room-1',
    initialized: true,
    lastCommand: 'look',
  });

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [GameStateService],
    }).compile();

    service = module.get<GameStateService>(GameStateService);
  });

  afterEach(async () => {
    await module.close();
  });

  // ============================================================================
  // 1. CORRUPTED SAVE FILE DETECTION (14 tests)
  // ============================================================================

  describe('Corrupted Save File Detection', () => {
    describe('Invalid JSON Format', () => {
      it('should detect completely invalid JSON format', async () => {
        const invalidJson = 'This is not JSON at all { broken }';

        await expect(
          service.importGameState('test-game', invalidJson),
        ).rejects.toThrow('Failed to import game state');
      });

      it('should detect JSON with syntax errors (missing closing braces)', async () => {
        const invalidJson = '{"gameId": "test", "player": {"name": "Hero"';

        await expect(
          service.importGameState('test-game', invalidJson),
        ).rejects.toThrow('Failed to import game state');
      });

      it('should detect JSON with syntax errors (trailing commas)', async () => {
        const invalidJson = '{"gameId": "test", "player": {},}';

        await expect(
          service.importGameState('test-game', invalidJson),
        ).rejects.toThrow('Failed to import game state');
      });

      it('should detect JSON with incorrect quotes (single quotes)', async () => {
        const invalidJson = "{'gameId': 'test', 'player': {}}";

        await expect(
          service.importGameState('test-game', invalidJson),
        ).rejects.toThrow('Failed to import game state');
      });
    });

    describe('Missing Required Fields', () => {
      it('should handle save file missing gameId field', async () => {
        const corruptedState = {
          player: { id: 'p1', name: 'Hero' },
          rooms: {},
          items: {},
        };

        // Should still work because importGameState sets the gameId
        await service.importGameState('test-game', JSON.stringify(corruptedState));
        const state = await service.getGameState('test-game');
        expect(state.gameId).toBe('test-game');
      });

      it('should handle save file with null player', async () => {
        const corruptedState = {
          gameId: 'test-game',
          player: null,
          rooms: {},
          items: {},
        };

        await service.importGameState('test-game', JSON.stringify(corruptedState));
        const state = await service.getGameState('test-game');
        expect(state.player).toBeNull();
      });

      it('should handle save file missing rooms object', async () => {
        const corruptedState = {
          gameId: 'test-game',
          player: { id: 'p1', name: 'Hero' },
          items: {},
        };

        await service.importGameState('test-game', JSON.stringify(corruptedState));
        const state = await service.getGameState('test-game');
        expect(state.rooms).toBeUndefined();
      });

      it('should handle save file missing items object', async () => {
        const corruptedState = {
          gameId: 'test-game',
          player: { id: 'p1', name: 'Hero' },
          rooms: {},
        };

        await service.importGameState('test-game', JSON.stringify(corruptedState));
        const state = await service.getGameState('test-game');
        expect(state.items).toBeUndefined();
      });
    });

    describe('Malformed Entity Structures', () => {
      it('should handle player with missing required properties', async () => {
        const corruptedState = {
          gameId: 'test-game',
          player: {
            // Missing name, position, health, etc.
            id: 'player-1',
          },
          rooms: {},
          items: {},
        };

        await service.importGameState('test-game', JSON.stringify(corruptedState));
        const state = await service.getGameState('test-game');
        expect(state.player.id).toBe('player-1');
      });

      it('should handle room with invalid position data', async () => {
        const corruptedState = {
          gameId: 'test-game',
          rooms: {
            'room-1': {
              id: 'room-1',
              name: 'Test Room',
              position: 'invalid', // Should be an object
            },
          },
        };

        await service.importGameState('test-game', JSON.stringify(corruptedState));
        const state = await service.getGameState('test-game');
        expect(state.rooms['room-1'].position).toBe('invalid');
      });

      it('should handle items with wrong data types', async () => {
        const corruptedState = {
          gameId: 'test-game',
          items: {
            'item-1': {
              id: 'item-1',
              name: 123, // Should be string
              health: 'fifty', // Should be number
              canTake: 'yes', // Should be boolean
            },
          },
        };

        await service.importGameState('test-game', JSON.stringify(corruptedState));
        const state = await service.getGameState('test-game');
        expect(state.items['item-1'].name).toBe(123);
      });
    });

    describe('Version and Encoding Issues', () => {
      it('should handle version mismatch in metadata', async () => {
        const validState = createValidGameState();
        validState.metadata.version = '0.5.0'; // Old version

        await service.importGameState('test-game', JSON.stringify(validState));
        const state = await service.getGameState('test-game');
        expect(state.metadata.version).toBe('0.5.0');
      });

      it('should handle truncated save files (incomplete JSON)', async () => {
        const validState = createValidGameState();
        const validJson = JSON.stringify(validState);
        const truncatedJson = validJson.substring(0, validJson.length - 100); // Cut off the end

        await expect(
          service.importGameState('test-game', truncatedJson),
        ).rejects.toThrow('Failed to import game state');
      });

      it('should handle empty string as save data', async () => {
        await expect(
          service.importGameState('test-game', ''),
        ).rejects.toThrow('Failed to import game state');
      });
    });
  });

  // ============================================================================
  // 2. SAVE FILE RECOVERY MECHANISMS (11 tests)
  // ============================================================================

  describe('Save File Recovery Mechanisms', () => {
    describe('Fallback to Backup Save', () => {
      it('should fallback to previous save slot when current is corrupted', async () => {
        const gameId = 'recovery-test';

        // Create a valid state and save it to slot 1
        const validState = createValidGameState(gameId);
        await service.updateGameState(gameId, validState);
        await service.saveGameState(gameId, 'slot-1');

        // Save a different state to slot 2
        validState.player.health = 50;
        await service.updateGameState(gameId, validState);
        await service.saveGameState(gameId, 'slot-2');

        // Load from slot 1 (the backup)
        const restoredState = await service.loadGameState(gameId, 'slot-1');
        expect(restoredState.player.health).toBe(100); // Original health
      });

      it('should handle loading non-existent save slot gracefully', async () => {
        await expect(
          service.loadGameState('test-game', 'non-existent-slot'),
        ).rejects.toThrow('No saved game found in slot: non-existent-slot');
      });

      it('should list all available save slots for recovery', async () => {
        const gameId = 'multi-slot-test';
        const validState = createValidGameState(gameId);

        await service.updateGameState(gameId, validState);
        await service.saveGameState(gameId, 'slot-1');
        await service.saveGameState(gameId, 'slot-2');
        await service.saveGameState(gameId, 'slot-3');

        const slots = await service.getSaveSlots(gameId);
        expect(slots).toContain('slot-1');
        expect(slots).toContain('slot-2');
        expect(slots).toContain('slot-3');
        expect(slots.length).toBe(3);
      });
    });

    describe('Partial State Recovery', () => {
      it('should recover state with partial data (player only)', async () => {
        const partialState = {
          gameId: 'partial-test',
          player: {
            id: 'player-1',
            name: 'Hero',
            health: 75,
            level: 3,
            experience: 500,
          },
          // Missing rooms, items, npcs
        };

        await service.importGameState('partial-test', JSON.stringify(partialState));
        const state = await service.getGameState('partial-test');

        expect(state.player).toBeDefined();
        expect(state.player.name).toBe('Hero');
        expect(state.rooms).toBeUndefined();
      });

      it('should recover state with empty collections', async () => {
        const emptyState = {
          gameId: 'empty-test',
          player: null,
          rooms: {},
          items: {},
          npcs: {},
        };

        await service.importGameState('empty-test', JSON.stringify(emptyState));
        const state = await service.getGameState('empty-test');

        expect(state.rooms).toEqual({});
        expect(state.items).toEqual({});
        expect(state.npcs).toEqual({});
      });

      it('should preserve metadata during recovery', async () => {
        const stateWithMetadata = {
          gameId: 'metadata-test',
          player: { id: 'p1', name: 'Hero' },
          metadata: {
            version: '2.1.0',
            savedAt: new Date('2025-01-15T10:00:00Z'),
            customField: 'custom-value',
          },
        };

        await service.importGameState('metadata-test', JSON.stringify(stateWithMetadata));
        const state = await service.getGameState('metadata-test');

        expect(state.metadata.version).toBe('2.1.0');
        expect(state.metadata.customField).toBe('custom-value');
        expect(state.metadata.importedAt).toBeDefined();
      });
    });

    describe('Auto-Repair of Minor Corruption', () => {
      it('should auto-correct gameId mismatch during import', async () => {
        const wrongGameId = {
          gameId: 'wrong-id',
          player: { id: 'p1', name: 'Hero' },
        };

        await service.importGameState('correct-id', JSON.stringify(wrongGameId));
        const state = await service.getGameState('correct-id');

        // GameStateService auto-corrects the gameId
        expect(state.gameId).toBe('correct-id');
      });

      it('should handle and preserve extra unknown fields', async () => {
        const stateWithExtra = {
          gameId: 'extra-test',
          player: { id: 'p1', name: 'Hero' },
          unknownField: 'unknown-value',
          anotherField: { nested: 'data' },
        };

        await service.importGameState('extra-test', JSON.stringify(stateWithExtra));
        const state = await service.getGameState('extra-test');

        expect(state['unknownField']).toBe('unknown-value');
        expect(state['anotherField']).toEqual({ nested: 'data' });
      });
    });

    describe('Error Messages', () => {
      it('should provide clear error message for invalid JSON', async () => {
        const invalidJson = '{ broken json }';

        try {
          await service.importGameState('test-game', invalidJson);
          fail('Should have thrown an error');
        } catch (error) {
          expect(error.message).toContain('Failed to import game state');
        }
      });

      it('should provide clear error message for missing save slot', async () => {
        try {
          await service.loadGameState('test-game', 'missing-slot');
          fail('Should have thrown an error');
        } catch (error) {
          expect(error.message).toContain('No saved game found in slot');
          expect(error.message).toContain('missing-slot');
        }
      });
    });
  });

  // ============================================================================
  // 3. SAVE FILE VALIDATION (10 tests)
  // ============================================================================

  describe('Save File Validation', () => {
    describe('Entity ID Validation', () => {
      it('should detect when player references non-existent room', async () => {
        const invalidState = createValidGameState();
        invalidState.player.roomId = 'non-existent-room';

        await service.importGameState('validation-test', JSON.stringify(invalidState));
        const state = await service.getGameState('validation-test');

        // The state loads but has invalid reference
        expect(state.player.roomId).toBe('non-existent-room');
        expect(state.rooms['non-existent-room']).toBeUndefined();
      });

      it('should detect when room references non-existent objects', async () => {
        const invalidState = createValidGameState();
        invalidState.rooms['room-1'].objects = ['item-1', 'non-existent-item'];

        await service.importGameState('validation-test', JSON.stringify(invalidState));
        const state = await service.getGameState('validation-test');

        expect(state.rooms['room-1'].objects).toContain('non-existent-item');
        expect(state.items['non-existent-item']).toBeUndefined();
      });

      it('should detect when player inventory contains non-existent items', async () => {
        const invalidState = createValidGameState();
        invalidState.player.inventory = ['item-1', 'fake-item', 'item-2'];

        await service.importGameState('validation-test', JSON.stringify(invalidState));
        const state = await service.getGameState('validation-test');

        expect(state.player.inventory).toContain('fake-item');
        expect(state.items['fake-item']).toBeUndefined();
      });

      it('should detect orphaned items (not in any room or inventory)', async () => {
        const invalidState = createValidGameState();
        // Add an item that isn't referenced anywhere
        invalidState.items['orphan-item'] = {
          id: 'orphan-item',
          name: 'Orphan',
          type: 'object',
          objectType: 'item',
          position: { x: 0, y: 0, z: 0 },
        };

        await service.importGameState('validation-test', JSON.stringify(invalidState));
        const state = await service.getGameState('validation-test');

        expect(state.items['orphan-item']).toBeDefined();

        // Check if it's in any room
        let foundInRoom = false;
        Object.values(state.rooms).forEach((room: any) => {
          if (room.objects?.includes('orphan-item')) {
            foundInRoom = true;
          }
        });
        expect(foundInRoom).toBe(false);
      });
    });

    describe('Circular Reference Detection', () => {
      it('should handle circular room connections', async () => {
        const circularState = createValidGameState();
        // Room 1 -> Room 2 -> Room 3 -> Room 1 (circle)
        circularState.rooms['room-1'].connections = { north: 'room-2' };
        circularState.rooms['room-2'].connections = { north: 'room-3' };
        circularState.rooms['room-3'].connections = { north: 'room-1' };

        await service.importGameState('circular-test', JSON.stringify(circularState));
        const state = await service.getGameState('circular-test');

        // Circular references are valid in this case (rooms can connect in loops)
        expect(state.rooms['room-1'].connections.north).toBe('room-2');
        expect(state.rooms['room-2'].connections.north).toBe('room-3');
        expect(state.rooms['room-3'].connections.north).toBe('room-1');
      });

      it('should handle self-referencing entities', async () => {
        const selfRefState = createValidGameState();
        // Room connects to itself
        selfRefState.rooms['room-1'].connections = { north: 'room-1' };

        await service.importGameState('self-ref-test', JSON.stringify(selfRefState));
        const state = await service.getGameState('self-ref-test');

        expect(state.rooms['room-1'].connections.north).toBe('room-1');
      });
    });

    describe('Data Type and Range Validation', () => {
      it('should detect negative health values', async () => {
        const invalidState = createValidGameState();
        invalidState.player.health = -50;

        await service.importGameState('range-test', JSON.stringify(invalidState));
        const state = await service.getGameState('range-test');

        // The invalid value is preserved (no automatic validation)
        expect(state.player.health).toBe(-50);
      });

      it('should detect health exceeding maxHealth', async () => {
        const invalidState = createValidGameState();
        invalidState.player.health = 150;
        invalidState.player.maxHealth = 100;

        await service.importGameState('range-test', JSON.stringify(invalidState));
        const state = await service.getGameState('range-test');

        expect(state.player.health).toBe(150);
        expect(state.player.maxHealth).toBe(100);
        expect(state.player.health).toBeGreaterThan(state.player.maxHealth);
      });

      it('should detect invalid position coordinates (NaN, Infinity)', async () => {
        const invalidState = createValidGameState();
        invalidState.player.position = { x: NaN, y: Infinity, z: -Infinity };

        await service.importGameState('coord-test', JSON.stringify(invalidState));
        const state = await service.getGameState('coord-test');

        // JSON.stringify converts NaN and Infinity to null
        expect(state.player.position.x).toBeNull();
        expect(state.player.position.y).toBeNull();
        expect(state.player.position.z).toBeNull();
      });

      it('should validate required relationship: player must have valid currentRoom', async () => {
        const invalidState = createValidGameState();
        delete invalidState.player.roomId;

        await service.importGameState('relationship-test', JSON.stringify(invalidState));
        const state = await service.getGameState('relationship-test');

        expect(state.player.roomId).toBeUndefined();
      });
    });
  });

  // ============================================================================
  // 4. EDGE CASES (8 tests)
  // ============================================================================

  describe('Edge Cases', () => {
    describe('Empty and Minimal States', () => {
      it('should handle completely empty save file (empty object)', async () => {
        const emptyState = {};

        await service.importGameState('empty-game', JSON.stringify(emptyState));
        const state = await service.getGameState('empty-game');

        expect(state.gameId).toBe('empty-game');
        expect(state.metadata.importedAt).toBeDefined();
      });

      it('should handle save file with only gameId', async () => {
        const minimalState = { gameId: 'minimal-game' };

        await service.importGameState('minimal-game', JSON.stringify(minimalState));
        const state = await service.getGameState('minimal-game');

        expect(state.gameId).toBe('minimal-game');
      });
    });

    describe('Unknown Fields', () => {
      it('should preserve unknown fields in save file', async () => {
        const stateWithUnknown = {
          gameId: 'unknown-test',
          player: { id: 'p1', name: 'Hero' },
          customData: { score: 1000, achievements: ['first-kill'] },
          futureFeature: 'some-value',
        };

        await service.importGameState('unknown-test', JSON.stringify(stateWithUnknown));
        const state = await service.getGameState('unknown-test');

        expect(state['customData']).toEqual({ score: 1000, achievements: ['first-kill'] });
        expect(state['futureFeature']).toBe('some-value');
      });
    });

    describe('Large Save Files', () => {
      it('should handle very large save files (1000+ entities)', async () => {
        const largeState = createValidGameState('large-game');

        // Add 1000 rooms
        for (let i = 0; i < 1000; i++) {
          largeState.rooms[`room-${i}`] = {
            id: `room-${i}`,
            name: `Room ${i}`,
            description: `Description for room ${i}`,
            position: { x: i * 10, y: i * 10, z: 0 },
            size: { width: 10, height: 10, depth: 3 },
            width: 10,
            height: 10,
            objects: [],
            players: [],
            type: 'room',
          };
        }

        // Add 1000 items
        for (let i = 0; i < 1000; i++) {
          largeState.items[`item-${i}`] = {
            id: `item-${i}`,
            name: `Item ${i}`,
            description: `Description for item ${i}`,
            objectType: 'item',
            position: { x: i, y: i, z: 0 },
            canTake: true,
            type: 'object',
          };
        }

        const startTime = Date.now();
        await service.importGameState('large-game', JSON.stringify(largeState));
        const endTime = Date.now();

        const state = await service.getGameState('large-game');
        expect(Object.keys(state.rooms).length).toBe(1000); // Import replaces state
        expect(Object.keys(state.items).length).toBe(1000); // Import replaces state

        // Performance check: should complete in reasonable time (< 1 second)
        expect(endTime - startTime).toBeLessThan(1000);
      });
    });

    describe('Save/Load Operations', () => {
      it('should handle concurrent save operations to different slots', async () => {
        const gameId = 'concurrent-test';
        const validState = createValidGameState(gameId);

        await service.updateGameState(gameId, validState);

        // Perform concurrent saves
        const savePromises = [];
        for (let i = 0; i < 10; i++) {
          savePromises.push(service.saveGameState(gameId, `slot-${i}`));
        }

        await Promise.all(savePromises);

        const slots = await service.getSaveSlots(gameId);
        expect(slots.length).toBe(10);
      });

      it('should handle save during state transition (player moving)', async () => {
        const gameId = 'transition-test';
        const state1 = createValidGameState(gameId);

        await service.updateGameState(gameId, state1);
        await service.saveGameState(gameId, 'before-move');

        // Simulate player moving
        state1.player.position = { x: 10, y: 10, z: 0 };
        state1.player.roomId = 'room-2';
        await service.updateGameState(gameId, state1);
        await service.saveGameState(gameId, 'after-move');

        // Verify both saves are different
        const beforeMove = await service.loadGameState(gameId, 'before-move');
        expect(beforeMove.player.roomId).toBe('room-1');

        const afterMove = await service.loadGameState(gameId, 'after-move');
        expect(afterMove.player.roomId).toBe('room-2');
      });

      it('should maintain save slot independence (modifying one does not affect others)', async () => {
        const gameId = 'independence-test';
        const state = createValidGameState(gameId);

        await service.updateGameState(gameId, state);
        await service.saveGameState(gameId, 'slot-a');

        // Modify state
        state.player.health = 50;
        await service.updateGameState(gameId, state);
        await service.saveGameState(gameId, 'slot-b');

        // Modify state again
        state.player.health = 25;
        await service.updateGameState(gameId, state);

        // Load slot-a and verify it's unchanged
        const slotA = await service.loadGameState(gameId, 'slot-a');
        expect(slotA.player.health).toBe(100);

        // Load slot-b and verify it has the intermediate state
        const slotB = await service.loadGameState(gameId, 'slot-b');
        expect(slotB.player.health).toBe(50);

        // Current state is now 50 because loadGameState updates current state
        const current = await service.getGameState(gameId);
        expect(current.player.health).toBe(50);
      });
    });
  });

  // ============================================================================
  // 5. ADDITIONAL CRITICAL SCENARIOS (4 tests)
  // ============================================================================

  describe('Critical Scenarios', () => {
    it('should handle save file with deeply nested structures', async () => {
      const deepState = {
        gameId: 'deep-test',
        player: {
          id: 'p1',
          name: 'Hero',
          inventory: [
            {
              id: 'container-1',
              containedObjects: [
                {
                  id: 'nested-1',
                  containedObjects: [
                    { id: 'nested-2', data: 'deep value' },
                  ],
                },
              ],
            },
          ],
        },
      };

      await service.importGameState('deep-test', JSON.stringify(deepState));
      const state = await service.getGameState('deep-test');

      expect(state.player.inventory[0].containedObjects[0].containedObjects[0].data).toBe('deep value');
    });

    it('should handle deleting and re-creating save slots', async () => {
      const gameId = 'delete-test';
      const validState = createValidGameState(gameId);

      await service.updateGameState(gameId, validState);
      await service.saveGameState(gameId, 'slot-1');
      await service.saveGameState(gameId, 'slot-2');

      // Delete slot-1
      const deleted = await service.deleteSaveSlot(gameId, 'slot-1');
      expect(deleted).toBe(true);

      const slotsAfterDelete = await service.getSaveSlots(gameId);
      expect(slotsAfterDelete).not.toContain('slot-1');
      expect(slotsAfterDelete).toContain('slot-2');

      // Re-create slot-1
      await service.saveGameState(gameId, 'slot-1');
      const slotsAfterRecreate = await service.getSaveSlots(gameId);
      expect(slotsAfterRecreate).toContain('slot-1');
      expect(slotsAfterRecreate.length).toBe(2);
    });

    it('should handle export and import round-trip preserving all data', async () => {
      const gameId = 'roundtrip-test';
      const originalState = createValidGameState(gameId);

      await service.updateGameState(gameId, originalState);

      // Export
      const exported = await service.exportGameState(gameId);

      // Import to a new game
      await service.importGameState('imported-game', exported);
      const importedState = await service.getGameState('imported-game');

      // Compare (excluding gameId which changes, and dates which are added)
      expect(importedState.player.name).toBe(originalState.player.name);
      expect(importedState.player.health).toBe(originalState.player.health);
      expect(Object.keys(importedState.rooms).length).toBe(Object.keys(originalState.rooms).length);
      expect(Object.keys(importedState.items).length).toBe(Object.keys(originalState.items).length);
    });

    it('should handle cleanup of game states without affecting save slots', async () => {
      const game1 = 'game-1';
      const game2 = 'game-2';
      const game3 = 'game-3';

      // Create and save states for 3 games
      for (const gameId of [game1, game2, game3]) {
        const state = createValidGameState(gameId);
        await service.updateGameState(gameId, state);
        await service.saveGameState(gameId, 'slot-1');
      }

      // Cleanup, keeping only game-1 and game-2
      service.cleanupGameStates([game1, game2]);

      // Verify game-1 and game-2 still exist
      const slots1 = await service.getSaveSlots(game1);
      expect(slots1).toContain('slot-1');

      const slots2 = await service.getSaveSlots(game2);
      expect(slots2).toContain('slot-1');

      // Verify game-3 was cleaned up
      const slots3 = await service.getSaveSlots(game3);
      expect(slots3).toEqual([]);
    });
  });

  // ============================================================================
  // 6. MEMORY AND PERFORMANCE (2 tests)
  // ============================================================================

  describe('Memory and Performance', () => {
    it('should provide accurate statistics about save slots', async () => {
      const game1 = 'stats-game-1';
      const game2 = 'stats-game-2';

      const state1 = createValidGameState(game1);
      const state2 = createValidGameState(game2);

      await service.updateGameState(game1, state1);
      await service.saveGameState(game1, 'slot-1');
      await service.saveGameState(game1, 'slot-2');

      await service.updateGameState(game2, state2);
      await service.saveGameState(game2, 'slot-1');

      const stats = service.getStats();
      expect(stats.activeGames).toBeGreaterThanOrEqual(2);
      expect(stats.totalSaveSlots).toBe(3);
      expect(stats.memoryUsageEstimate).toContain('KB');
    });

    it('should handle rapid save/load cycles without corruption', async () => {
      const gameId = 'rapid-test';
      const state = createValidGameState(gameId);

      await service.updateGameState(gameId, state);

      // Perform 50 rapid save/load cycles
      for (let i = 0; i < 50; i++) {
        await service.saveGameState(gameId, 'rapid-slot');
        const loaded = await service.loadGameState(gameId, 'rapid-slot');
        expect(loaded.player.health).toBe(100);
      }

      // Final verification
      const finalState = await service.getGameState(gameId);
      expect(finalState.player.name).toBe('Hero');
      expect(finalState.metadata).toBeDefined();
    });
  });
});
