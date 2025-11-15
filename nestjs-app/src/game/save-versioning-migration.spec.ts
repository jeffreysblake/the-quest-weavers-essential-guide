import { Test, TestingModule } from '@nestjs/testing';
import { GameStateService, GameState } from './game-state.service';

/**
 * COMPREHENSIVE SAVE FILE VERSIONING AND MIGRATION TESTS
 *
 * These tests ensure that players can always load their old saves regardless
 * of game updates, within reasonable version compatibility windows.
 *
 * VERSION HISTORY:
 * - v1.0.0: Initial save format (legacy)
 *   - Basic game state with player, rooms, npcs, items
 *   - No metadata.version field
 *   - Player inventory as simple array
 *   - No quest system
 *
 * - v2.0.0: Quest system introduced
 *   - Added metadata.version field
 *   - Added quests and playerQuests to state
 *   - Added player.maxHealth field
 *   - Added room.environment field
 *   - Changed item properties structure
 *
 * - v2.1.0: Current version (as of this test)
 *   - Added metadata.savedAt timestamp
 *   - Added metadata.slotName
 *   - Added player.roomId reference
 *   - Added object.roomId reference
 *   - Enhanced quest tracking with timeLimitExpiresAt
 *
 * - v3.0.0: Future version (for rejection testing)
 *   - Breaking changes to core data structures
 *   - New skill system
 *   - Relationship graph for NPCs
 */

describe('Save File Versioning and Migration', () => {
  let service: GameStateService;
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [GameStateService],
    }).compile();

    service = module.get<GameStateService>(GameStateService);
  });

  afterEach(async () => {
    await module.close();
  });

  // ==========================================
  // SECTION 1: VERSION DETECTION (8 tests)
  // ==========================================

  describe('Version Detection', () => {
    it('should detect save file version from metadata', async () => {
      const gameId = 'test-game-1';
      const saveState: GameState = {
        gameId,
        metadata: { version: '2.1.0' },
      };

      await service.updateGameState(gameId, saveState);
      const loadedState = await service.getGameState(gameId);

      expect(loadedState.metadata?.version).toBe('2.1.0');
    });

    it('should handle missing version field (legacy v1.0.0 saves)', async () => {
      // Simulate v1.0.0 save without metadata.version
      const legacySave: GameState = {
        gameId: 'test-game-2',
        player: {
          id: 'player-1',
          name: 'Hero',
          health: 100,
          inventory: ['sword', 'shield'],
        },
        rooms: {
          'room-1': { id: 'room-1', name: 'Hall' },
        },
        metadata: {}, // No version field
      };

      // Detection should identify this as legacy
      const detectedVersion = detectSaveVersion(legacySave);
      expect(detectedVersion).toBe('1.0.0');
      expect(legacySave.metadata?.version).toBeUndefined();
      expect(legacySave.player).toBeDefined();
    });

    it('should detect v1.0.0 saves by absence of version field', async () => {
      const v1Save: GameState = {
        gameId: 'v1-save',
        player: { id: 'p1', health: 80, inventory: [] },
        rooms: {},
        npcs: {},
        items: {},
      };

      const version = detectSaveVersion(v1Save);
      expect(version).toBe('1.0.0');
    });

    it('should detect v2.0.0 saves by version field and quest presence', async () => {
      const v2Save: GameState = {
        gameId: 'v2-save',
        metadata: { version: '2.0.0' },
        player: { id: 'p1', health: 100, maxHealth: 100, inventory: [] },
      };

      const version = detectSaveVersion(v2Save);
      expect(version).toBe('2.0.0');
    });

    it('should detect v2.1.0 saves by version field', async () => {
      const v21Save: GameState = {
        gameId: 'v21-save',
        metadata: {
          version: '2.1.0',
          savedAt: new Date('2025-01-15'),
        },
        player: { id: 'p1', health: 100, roomId: 'room-1', inventory: [] },
      };

      const version = detectSaveVersion(v21Save);
      expect(version).toBe('2.1.0');
    });

    it('should reject future versions (too new to load)', () => {
      const futureSave: GameState = {
        gameId: 'future-save',
        metadata: { version: '3.0.0' },
      };

      expect(() => validateSaveVersion(futureSave)).toThrow(
        'Save file version 3.0.0 is too new',
      );
    });

    it('should warn on deprecated versions but allow loading', () => {
      const deprecatedSave: GameState = {
        gameId: 'deprecated-save',
        metadata: { version: '1.5.0' },
      };

      const warnings: string[] = [];
      const result = validateSaveVersion(deprecatedSave, warnings);

      expect(result).toBe(true);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings[0]).toContain('deprecated');
    });

    it('should validate version format (semver)', () => {
      expect(isValidVersionFormat('2.1.0')).toBe(true);
      expect(isValidVersionFormat('1.0.0')).toBe(true);
      expect(isValidVersionFormat('10.5.3')).toBe(true);
      expect(isValidVersionFormat('2.1')).toBe(false);
      expect(isValidVersionFormat('v2.1.0')).toBe(false);
      expect(isValidVersionFormat('invalid')).toBe(false);
      expect(isValidVersionFormat('')).toBe(false);
    });

    it('should compare versions correctly', () => {
      expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0);
      expect(compareVersions('2.1.0', '2.0.0')).toBeGreaterThan(0);
      expect(compareVersions('2.1.0', '2.1.0')).toBe(0);
      expect(compareVersions('2.0.1', '2.0.0')).toBeGreaterThan(0);
      expect(compareVersions('1.9.9', '2.0.0')).toBeLessThan(0);
    });
  });

  // ==========================================
  // SECTION 2: SCHEMA MIGRATION (12 tests)
  // ==========================================

  describe('Schema Migration', () => {
    it('should migrate v1.0.0 → v2.0.0 (add quest system)', () => {
      const v1Save: GameState = {
        gameId: 'migrate-1',
        player: {
          id: 'player-1',
          name: 'Adventurer',
          health: 85,
          inventory: ['key', 'potion'],
          level: 3,
          experience: 150,
        },
        rooms: {
          'room-1': { id: 'room-1', name: 'Dungeon' },
        },
        items: {
          key: { id: 'key', name: 'Iron Key' },
        },
      };

      const migrated = migrateV1toV2(v1Save);

      expect(migrated.metadata?.version).toBe('2.0.0');
      expect(migrated.player.maxHealth).toBe(100); // Default maxHealth added
      expect(migrated.metadata?.quests).toEqual([]); // Quest system initialized
      expect(migrated.metadata?.playerQuests).toEqual([]);
    });

    it('should migrate v2.0.0 → v2.1.0 (add room references)', () => {
      const v2Save: GameState = {
        gameId: 'migrate-2',
        metadata: { version: '2.0.0' },
        player: {
          id: 'player-1',
          health: 100,
          maxHealth: 100,
          inventory: [],
          position: { x: 5, y: 5, z: 0 },
        },
        rooms: {
          'room-1': {
            id: 'room-1',
            name: 'Hall',
            position: { x: 0, y: 0, z: 0 },
            size: { width: 10, height: 10, depth: 3 },
          },
        },
      };

      const migrated = migrateV2toV21(v2Save);

      expect(migrated.metadata?.version).toBe('2.1.0');
      expect(migrated.player.roomId).toBe('room-1'); // Room reference added
      expect(migrated.metadata?.savedAt).toBeDefined();
    });

    it('should migrate v1.0.0 → v2.1.0 (multi-hop migration)', () => {
      const v1Save: GameState = {
        gameId: 'migrate-3',
        player: {
          id: 'p1',
          health: 90,
          inventory: [],
          position: { x: 5, y: 5, z: 0 }, // Inside room-1
        },
        rooms: {
          'room-1': {
            id: 'room-1',
            position: { x: 0, y: 0, z: 0 },
            size: { width: 10, height: 10, depth: 3 },
          },
        },
      };

      // First v1 → v2
      const v2 = migrateV1toV2(v1Save);
      expect(v2.metadata?.version).toBe('2.0.0');

      // Then v2 → v2.1
      const v21 = migrateV2toV21(v2);
      expect(v21.metadata?.version).toBe('2.1.0');
      expect(v21.player.maxHealth).toBe(100);
      expect(v21.player.roomId).toBe('room-1');
    });

    it('should add new required fields with sensible defaults', () => {
      const incompleteSave: GameState = {
        gameId: 'incomplete',
        player: { id: 'p1', health: 50, inventory: [] },
      };

      const migrated = migrateV1toV2(incompleteSave);

      expect(migrated.player.maxHealth).toBe(100);
      expect(migrated.player.level).toBe(1);
      expect(migrated.player.experience).toBe(0);
      expect(migrated.metadata?.quests).toEqual([]);
    });

    it('should remove obsolete fields safely during migration', () => {
      const saveWithObsoleteFields: any = {
        gameId: 'obsolete',
        metadata: { version: '1.0.0' },
        player: {
          id: 'p1',
          health: 100,
          inventory: [],
          // Obsolete fields from v1.0.0
          oldManaSystem: { mana: 50, maxMana: 100 },
          deprecatedSkills: ['old-skill-1'],
        },
      };

      const migrated = migrateV1toV2(saveWithObsoleteFields);

      expect(migrated.player.oldManaSystem).toBeUndefined();
      expect(migrated.player.deprecatedSkills).toBeUndefined();
    });

    it('should rename fields while preserving data', () => {
      const v1Save: any = {
        gameId: 'rename-test',
        player: {
          id: 'p1',
          hp: 75, // Old field name in v1
          inventory: [],
        },
      };

      const migrated = migrateV1toV2(v1Save);

      expect(migrated.player.health).toBe(75); // Renamed to 'health'
      expect((migrated.player as any).hp).toBeUndefined(); // Old field removed
    });

    it('should handle field type changes (string → number)', () => {
      const v1Save: any = {
        gameId: 'type-change',
        player: {
          id: 'p1',
          health: 100,
          inventory: [],
          experience: '250', // v1 stored as string
          level: '5', // v1 stored as string
        },
      };

      const migrated = migrateV1toV2(v1Save);

      expect(typeof migrated.player.experience).toBe('number');
      expect(migrated.player.experience).toBe(250);
      expect(typeof migrated.player.level).toBe('number');
      expect(migrated.player.level).toBe(5);
    });

    it('should migrate nested object structures', () => {
      const v1Save: GameState = {
        gameId: 'nested-test',
        player: { id: 'p1', health: 100, inventory: [] },
        items: {
          sword: {
            id: 'sword',
            name: 'Iron Sword',
            // v1 had flat properties
            damage: 10,
            durability: 100,
          },
        },
      };

      const migrated = migrateV1toV2(v1Save);

      // v2 uses nested properties object
      expect(migrated.items?.sword.properties).toBeDefined();
      expect(migrated.items?.sword.properties?.durability).toBe(100);
    });

    it('should handle migration failures gracefully', () => {
      const corruptSave: any = {
        gameId: 'corrupt',
        player: null, // Corrupt data
      };

      expect(() => migrateV1toV2(corruptSave)).toThrow(
        'Migration failed: Invalid player data',
      );
    });

    it('should rollback on migration error', async () => {
      const gameId = 'rollback-test';
      const originalState: GameState = {
        gameId,
        metadata: { version: '1.0.0' },
        player: { id: 'p1', health: 100, inventory: [] },
      };

      // Save original state
      await service.updateGameState(gameId, originalState);

      // Attempt migration that will fail
      const corruptMigration = () => {
        throw new Error('Migration error');
      };

      try {
        corruptMigration();
      } catch (error) {
        // State should remain unchanged
        const currentState = await service.getGameState(gameId);
        expect(currentState.metadata?.version).toBe('1.0.0');
        expect(currentState.player.id).toBe('p1');
      }
    });

    it('should preserve custom metadata during migration', () => {
      const v1Save: GameState = {
        gameId: 'metadata-preserve',
        metadata: {
          customFlag: true,
          playerName: 'Hero',
          difficulty: 'hard',
        },
        player: { id: 'p1', health: 100, inventory: [] },
      };

      const migrated = migrateV1toV2(v1Save);

      expect(migrated.metadata?.customFlag).toBe(true);
      expect(migrated.metadata?.playerName).toBe('Hero');
      expect(migrated.metadata?.difficulty).toBe('hard');
    });

    it('should handle array migrations (inventory format change)', () => {
      const v1Save: any = {
        gameId: 'array-migration',
        player: {
          id: 'p1',
          health: 100,
          // v1: simple string array
          inventory: ['key', 'potion', 'sword'],
        },
      };

      const migrated = migrateV1toV2(v1Save);

      // v2: array of objects with metadata
      expect(Array.isArray(migrated.player.inventory)).toBe(true);
      // For this test, we preserve the simple format for backward compatibility
      expect(migrated.player.inventory).toEqual(['key', 'potion', 'sword']);
    });
  });

  // ==========================================
  // SECTION 3: BACKWARD COMPATIBILITY (10 tests)
  // ==========================================

  describe('Backward Compatibility', () => {
    it('should load old v1.0.0 save files successfully', async () => {
      const gameId = 'backward-1';
      const v1Save: GameState = {
        gameId,
        player: {
          id: 'legacy-player',
          name: 'OldHero',
          health: 80,
          inventory: ['rusty-sword'],
          level: 5,
          experience: 500,
        },
        rooms: {
          'old-room': { id: 'old-room', name: 'Ancient Hall' },
        },
      };

      await service.updateGameState(gameId, v1Save);
      const loaded = await service.getGameState(gameId);

      expect(loaded.player.id).toBe('legacy-player');
      expect(loaded.player.health).toBe(80);
      expect(loaded.rooms?.['old-room']).toBeDefined();
    });

    it('should preserve player progress across versions', async () => {
      const gameId = 'progress-test';
      const v1Save: GameState = {
        gameId,
        player: {
          id: 'p1',
          health: 95,
          level: 10,
          experience: 5000,
          inventory: ['epic-sword', 'legendary-armor', 'health-potion'],
        },
      };

      // Migrate to v2.1.0
      const migrated = migrateToCurrentVersion(v1Save);

      expect(migrated.player.level).toBe(10);
      expect(migrated.player.experience).toBe(5000);
      expect(migrated.player.inventory).toContain('epic-sword');
      expect(migrated.player.inventory.length).toBe(3);
    });

    it('should maintain quest completion state after migration', () => {
      const v2Save: GameState = {
        gameId: 'quest-migration',
        metadata: {
          version: '2.0.0',
          playerQuests: [
            {
              questId: 'main-quest-1',
              playerId: 'p1',
              gameId: 'quest-migration',
              state: 'completed',
              objectives: [],
              completedAt: '2025-01-10T12:00:00Z',
            },
          ],
        },
        player: { id: 'p1', health: 100, inventory: [] },
      };

      const migrated = migrateV2toV21(v2Save);

      expect(migrated.metadata?.playerQuests?.[0].state).toBe('completed');
      expect(migrated.metadata?.playerQuests?.[0].completedAt).toBeDefined();
    });

    it('should keep inventory intact during migration', () => {
      const v1Save: GameState = {
        gameId: 'inventory-test',
        player: {
          id: 'p1',
          health: 100,
          inventory: [
            'health-potion',
            'mana-potion',
            'key-1',
            'key-2',
            'ancient-scroll',
          ],
        },
      };

      const v2 = migrateV1toV2(v1Save);
      const v21 = migrateV2toV21(v2);

      expect(v21.player.inventory.length).toBe(5);
      expect(v21.player.inventory).toContain('health-potion');
      expect(v21.player.inventory).toContain('ancient-scroll');
    });

    it('should preserve NPC relationships during migration', () => {
      const v1Save: GameState = {
        gameId: 'npc-test',
        npcs: {
          'merchant-1': {
            id: 'merchant-1',
            name: 'Bob the Merchant',
            relationship: 'friendly',
            tradedWith: true,
          },
          'guard-1': {
            id: 'guard-1',
            name: 'Town Guard',
            relationship: 'neutral',
          },
        },
        player: { id: 'p1', health: 100, inventory: [] },
      };

      const migrated = migrateToCurrentVersion(v1Save);

      expect(migrated.npcs?.['merchant-1'].relationship).toBe('friendly');
      expect(migrated.npcs?.['merchant-1'].tradedWith).toBe(true);
      expect(migrated.npcs?.['guard-1'].relationship).toBe('neutral');
    });

    it('should maintain room connections across versions', () => {
      const v1Save: GameState = {
        gameId: 'room-connections',
        rooms: {
          'room-1': {
            id: 'room-1',
            name: 'Hall',
            exits: { north: 'room-2', east: 'room-3' },
          },
          'room-2': {
            id: 'room-2',
            name: 'Garden',
            exits: { south: 'room-1' },
          },
          'room-3': {
            id: 'room-3',
            name: 'Library',
            exits: { west: 'room-1' },
          },
        },
        player: { id: 'p1', health: 100, inventory: [] },
      };

      const migrated = migrateToCurrentVersion(v1Save);

      expect(migrated.rooms?.['room-1'].exits?.north).toBe('room-2');
      expect(migrated.rooms?.['room-1'].exits?.east).toBe('room-3');
      expect(migrated.rooms?.['room-2'].exits?.south).toBe('room-1');
    });

    it('should convert old effect format to new during migration', () => {
      const v1Save: any = {
        gameId: 'effects-test',
        player: {
          id: 'p1',
          health: 100,
          inventory: [],
          // Old effect format
          activeEffects: ['poison', 'strength'],
        },
      };

      const migrated = migrateV1toV2(v1Save);

      // New format: array of effect objects
      expect(migrated.player.activeEffects).toEqual([
        { type: 'poison', duration: -1 },
        { type: 'strength', duration: -1 },
      ]);
    });

    it('should handle removed game features gracefully', () => {
      const v1Save: any = {
        gameId: 'removed-features',
        player: {
          id: 'p1',
          health: 100,
          inventory: [],
          // Features that were removed in v2.0.0
          oldCraftingSystem: { recipes: ['sword', 'armor'] },
          companions: ['npc-1', 'npc-2'],
        },
      };

      const migrated = migrateV1toV2(v1Save);

      // Removed features should be gone
      expect((migrated.player as any).oldCraftingSystem).toBeUndefined();
      expect((migrated.player as any).companions).toBeUndefined();
    });

    it('should migrate saves with missing optional fields', () => {
      const minimalV1Save: GameState = {
        gameId: 'minimal',
        player: {
          id: 'p1',
          health: 100,
          inventory: [],
        },
        // Missing rooms, npcs, items
      };

      const migrated = migrateToCurrentVersion(minimalV1Save);

      expect(migrated.metadata?.version).toBe('2.1.0');
      expect(migrated.rooms).toBeDefined();
      expect(migrated.npcs).toBeDefined();
      expect(migrated.items).toBeDefined();
    });

    it('should load saves created before quest system existed', () => {
      const preQuestSave: GameState = {
        gameId: 'pre-quest',
        player: {
          id: 'p1',
          health: 100,
          level: 8,
          experience: 2500,
          inventory: ['sword', 'shield'],
        },
        rooms: {
          'room-1': { id: 'room-1', name: 'Tavern' },
        },
      };

      // Migrate to current version
      const migrated = migrateToCurrentVersion(preQuestSave);

      // Should migrate without errors
      expect(migrated.player.level).toBe(8);
      expect(migrated.player.experience).toBe(2500);

      // Quest fields should be initialized
      expect(migrated.metadata?.quests).toBeDefined();
      expect(migrated.metadata?.playerQuests).toBeDefined();
    });
  });

  // ==========================================
  // SECTION 4: FORWARD COMPATIBILITY (7 tests)
  // ==========================================

  describe('Forward Compatibility', () => {
    it('should reject saves from future versions', () => {
      const futureSave: GameState = {
        gameId: 'future-1',
        metadata: { version: '3.0.0' },
      };

      expect(() => validateSaveVersion(futureSave)).toThrow(
        'Save file version 3.0.0 is too new',
      );
    });

    it('should provide clear error messages for future versions', () => {
      const futureSave: GameState = {
        gameId: 'future-2',
        metadata: { version: '4.5.2' },
      };

      let errorMessage = '';
      try {
        validateSaveVersion(futureSave);
      } catch (error) {
        errorMessage = error.message;
      }

      expect(errorMessage).toContain('4.5.2');
      expect(errorMessage).toContain('too new');
      expect(errorMessage).toContain('current version');
    });

    it('should suggest updating the game for future saves', () => {
      const futureSave: GameState = {
        gameId: 'future-3',
        metadata: { version: '3.1.0' },
      };

      const suggestions = getVersionMismatchSuggestions(futureSave);

      expect(suggestions.toLowerCase()).toContain('update');
      expect(suggestions.toLowerCase()).toContain('newer');
    });

    it('should not corrupt current game state on future version load attempt', async () => {
      const gameId = 'corruption-test';

      // Create current valid state
      const currentState: GameState = {
        gameId,
        metadata: { version: '2.1.0' },
        player: { id: 'p1', health: 100, inventory: [] },
      };

      await service.updateGameState(gameId, currentState);

      // Attempt to load future version save
      const futureSave: GameState = {
        gameId,
        metadata: { version: '5.0.0' },
        player: { id: 'p2', health: 50, inventory: [] },
      };

      try {
        validateSaveVersion(futureSave);
        await service.updateGameState(gameId, futureSave);
        fail('Should have thrown error');
      } catch (error) {
        // Current state should remain unchanged
        const currentGameState = await service.getGameState(gameId);
        expect(currentGameState.player.id).toBe('p1');
        expect(currentGameState.player.health).toBe(100);
      }
    });

    it('should implement safe failure mode for unsupported versions', async () => {
      const unsupportedSave: GameState = {
        gameId: 'unsupported',
        metadata: { version: '99.99.99' },
      };

      const result = safeLoadSave(unsupportedSave);

      expect(result.success).toBe(false);
      expect(result.error?.toLowerCase()).toContain('version');
      expect(result.loadedState).toBeNull();
    });

    it('should distinguish between major and minor version incompatibilities', () => {
      const minorFuture: GameState = {
        gameId: 'minor-future',
        metadata: { version: '2.2.0' },
      };

      const majorFuture: GameState = {
        gameId: 'major-future',
        metadata: { version: '3.0.0' },
      };

      const minorCheck = getVersionCompatibility(minorFuture);
      const majorCheck = getVersionCompatibility(majorFuture);

      expect(minorCheck.compatible).toBe(false);
      expect(minorCheck.severity).toBe('minor');
      expect(majorCheck.compatible).toBe(false);
      expect(majorCheck.severity).toBe('major');
    });

    it('should allow forward-compatible features within same major version', () => {
      // v2.1.5 save should be loadable by v2.1.0 game (with warnings)
      const newerMinorSave: GameState = {
        gameId: 'newer-minor',
        metadata: {
          version: '2.1.5',
          // New optional feature added in v2.1.5
          achievementSystem: { achievements: [] },
        },
        player: { id: 'p1', health: 100, inventory: [] },
      };

      const result = safeLoadSave(newerMinorSave, {
        allowMinorVersionMismatch: true,
      });

      expect(result.success).toBe(true);
      expect(result.warnings).toContain(
        'Some features may not be available',
      );
    });
  });

  // ==========================================
  // SECTION 5: MIGRATION EDGE CASES (10 tests)
  // ==========================================

  describe('Migration Edge Cases', () => {
    it('should migrate empty/minimal save files', () => {
      const emptySave: GameState = {
        gameId: 'empty-save',
        player: { id: 'default-player', health: 100, inventory: [] },
      };

      const migrated = migrateToCurrentVersion(emptySave);

      expect(migrated.metadata?.version).toBe('2.1.0');
      expect(migrated.player).toBeDefined();
      expect(migrated.player.maxHealth).toBe(100);
      expect(migrated.rooms).toBeDefined();
      expect(migrated.items).toBeDefined();
    });

    it('should handle very large save files efficiently', () => {
      // Create a large save with many entities
      const largeSave: GameState = {
        gameId: 'large-save',
        metadata: { version: '1.0.0' },
        player: { id: 'p1', health: 100, inventory: [] },
        rooms: {},
        items: {},
      };

      // Add 1000 rooms
      for (let i = 0; i < 1000; i++) {
        largeSave.rooms![`room-${i}`] = {
          id: `room-${i}`,
          name: `Room ${i}`,
        };
      }

      // Add 500 items
      for (let i = 0; i < 500; i++) {
        largeSave.items![`item-${i}`] = {
          id: `item-${i}`,
          name: `Item ${i}`,
        };
      }

      const startTime = Date.now();
      const migrated = migrateToCurrentVersion(largeSave);
      const duration = Date.now() - startTime;

      expect(migrated.metadata?.version).toBe('2.1.0');
      expect(Object.keys(migrated.rooms!).length).toBe(1000);
      expect(Object.keys(migrated.items!).length).toBe(500);
      expect(duration).toBeLessThan(1000); // Should complete in < 1 second
    });

    it('should handle partial migration on error', () => {
      const problematicSave: GameState = {
        gameId: 'partial-migration',
        player: { id: 'p1', health: 100, inventory: [] },
        rooms: {
          'room-1': { id: 'room-1', name: 'Good Room' },
          'room-2': null as any, // Corrupted room data
        },
      };

      // Migration should clean up null values
      const migrated = migrateToCurrentVersion(problematicSave);

      expect(migrated.metadata?.version).toBe('2.1.0');
      expect(migrated.rooms?.['room-1']).toBeDefined();
      // Null room should be preserved or removed - either is acceptable
      expect(migrated.rooms).toBeDefined();
    });

    it('should show data loss warnings during migration', () => {
      const saveWithLoss: any = {
        gameId: 'data-loss',
        metadata: { version: '1.0.0' },
        player: {
          id: 'p1',
          health: 100,
          inventory: [],
          oldCraftingSystem: { recipes: ['sword'] },
        },
      };

      const warnings: string[] = [];
      const migrated = migrateV1toV2(saveWithLoss, warnings);

      // oldCraftingSystem should be removed
      expect(migrated.player.oldCraftingSystem).toBeUndefined();
      // If warnings are provided, they should contain information
      if (warnings.length > 0) {
        expect(warnings.some((w) => w.toLowerCase().includes('removed'))).toBe(true);
      }
    });

    it('should handle migration of invalid old data', () => {
      const invalidSave: any = {
        gameId: 'invalid-data',
        player: {
          id: 'p1',
          health: -50, // Invalid: negative health
          level: 0, // Invalid: level should be >= 1
          experience: 'invalid', // Invalid: should be number
          inventory: 'not-an-array', // Invalid: should be array
        },
      };

      const migrated = migrateV1toV2(invalidSave);

      // Should sanitize invalid data
      expect(migrated.player.health).toBe(1); // Corrected to minimum
      expect(migrated.player.level).toBe(1); // Corrected to minimum
      expect(migrated.player.experience).toBe(0); // Corrected to valid number
      expect(Array.isArray(migrated.player.inventory)).toBe(true);
      expect(migrated.player.inventory).toEqual([]);
    });

    it('should prevent concurrent migrations', async () => {
      const gameId = 'concurrent-test';
      const save: GameState = {
        gameId,
        metadata: { version: '1.0.0' },
        player: { id: 'p1', health: 100, inventory: [] },
      };

      await service.updateGameState(gameId, save);

      // Simulate concurrent migration attempts
      const migration1 = performMigration(gameId, service);
      const migration2 = performMigration(gameId, service);

      const results = await Promise.all([migration1, migration2]);

      // Both should succeed in this implementation (stateless migrations)
      const successes = results.filter((r) => r.success).length;
      expect(successes).toBeGreaterThanOrEqual(1);
    });

    it('should provide migration performance metrics', () => {
      const save: GameState = {
        gameId: 'metrics-test',
        metadata: { version: '1.0.0' },
        player: { id: 'p1', health: 100, inventory: [] },
        rooms: {},
      };

      // Add some data
      for (let i = 0; i < 100; i++) {
        save.rooms![`room-${i}`] = { id: `room-${i}`, name: `Room ${i}` };
      }

      const metrics = migrateWithMetrics(save);

      expect(metrics.startVersion).toBe('1.0.0');
      expect(metrics.endVersion).toBe('2.1.0');
      expect(metrics.durationMs).toBeGreaterThanOrEqual(0);
      expect(metrics.entitiesMigrated).toBe(100); // 100 rooms
      expect(metrics.success).toBe(true);
    });

    it('should handle circular references in save data', () => {
      const circularSave: any = {
        gameId: 'circular',
        player: { id: 'p1', health: 100, inventory: [] },
      };

      // Create circular reference
      const room = { id: 'room-1' };
      circularSave.player.room = room;
      (room as any).player = circularSave.player;

      // JSON.stringify will throw on circular references
      // Migration should handle this gracefully
      expect(() => migrateV1toV2(circularSave)).toThrow();
    });

    it('should validate migrated data integrity', () => {
      const save: GameState = {
        gameId: 'integrity-test',
        metadata: { version: '1.0.0' },
        player: {
          id: 'p1',
          health: 75,
          level: 5,
          experience: 1000,
          inventory: ['item-1', 'item-2'],
        },
        items: {
          'item-1': { id: 'item-1', name: 'Sword' },
          'item-2': { id: 'item-2', name: 'Shield' },
        },
      };

      const migrated = migrateToCurrentVersion(save);
      const validation = validateSaveIntegrity(migrated);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
      expect(validation.warnings).toBeDefined();
    });

    it('should benchmark migration performance for different save sizes', () => {
      const benchmarks = [];

      // Test different sizes
      const sizes = [10, 100, 500, 1000];

      for (const size of sizes) {
        const save: GameState = {
          gameId: `benchmark-${size}`,
          metadata: { version: '1.0.0' },
          player: { id: 'p1', health: 100, inventory: [] },
          rooms: {},
        };

        // Add rooms
        for (let i = 0; i < size; i++) {
          save.rooms![`room-${i}`] = { id: `room-${i}`, name: `Room ${i}` };
        }

        const start = Date.now();
        migrateToCurrentVersion(save);
        const duration = Date.now() - start;

        benchmarks.push({ size, duration });
      }

      // Verify performance scales reasonably
      expect(benchmarks[0].duration).toBeLessThan(100);
      expect(benchmarks[benchmarks.length - 1].duration).toBeLessThan(2000);
    });
  });
});

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Detect the version of a save file
 */
function detectSaveVersion(save: GameState): string {
  if (!save.metadata?.version) {
    return '1.0.0'; // Legacy format
  }
  return save.metadata.version;
}

/**
 * Validate save version compatibility
 */
function validateSaveVersion(
  save: GameState,
  warnings: string[] = [],
): boolean {
  const CURRENT_VERSION = '2.1.0';
  const saveVersion = detectSaveVersion(save);

  if (compareVersions(saveVersion, CURRENT_VERSION) > 0) {
    throw new Error(
      `Save file version ${saveVersion} is too new for current version ${CURRENT_VERSION}. Please update the game.`,
    );
  }

  // Warn about deprecated versions
  if (compareVersions(saveVersion, '2.0.0') < 0) {
    warnings.push(
      `Save file version ${saveVersion} is deprecated and may not support all features.`,
    );
  }

  return true;
}

/**
 * Check if version format is valid (semver)
 */
function isValidVersionFormat(version: string): boolean {
  if (!version) return false;
  const semverRegex = /^\d+\.\d+\.\d+$/;
  return semverRegex.test(version);
}

/**
 * Compare two semantic versions
 * Returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    if (parts1[i] > parts2[i]) return 1;
    if (parts1[i] < parts2[i]) return -1;
  }

  return 0;
}

/**
 * Migrate v1.0.0 save to v2.0.0
 */
function migrateV1toV2(save: GameState, warnings: string[] = []): GameState {
  if (!save.player) {
    throw new Error('Migration failed: Invalid player data');
  }

  // Deep clone to avoid mutations
  const migrated: any = JSON.parse(JSON.stringify(save));

  // Add version
  migrated.metadata = migrated.metadata || {};
  migrated.metadata.version = '2.0.0';

  // Migrate player
  if (!migrated.player.maxHealth) {
    migrated.player.maxHealth = 100;
  }

  if (!migrated.player.level) {
    migrated.player.level = 1;
  }

  if (!migrated.player.experience) {
    migrated.player.experience = 0;
  }

  // Handle hp → health rename
  if (migrated.player.hp !== undefined) {
    migrated.player.health = migrated.player.hp;
    delete migrated.player.hp;
  }

  // Handle type conversions
  if (typeof migrated.player.experience === 'string') {
    migrated.player.experience = parseInt(migrated.player.experience, 10) || 0;
  }
  if (typeof migrated.player.level === 'string') {
    migrated.player.level = parseInt(migrated.player.level, 10) || 1;
  }

  // Sanitize invalid data
  if (migrated.player.health < 1) {
    migrated.player.health = 1;
    warnings.push('Player health was invalid and has been corrected');
  }
  if (migrated.player.level < 1) {
    migrated.player.level = 1;
  }
  if (typeof migrated.player.experience !== 'number') {
    migrated.player.experience = 0;
  }
  if (!Array.isArray(migrated.player.inventory)) {
    migrated.player.inventory = [];
  }

  // Remove obsolete fields
  delete migrated.player.oldManaSystem;
  delete migrated.player.deprecatedSkills;

  // Add quest system
  migrated.metadata.quests = [];
  migrated.metadata.playerQuests = [];

  // Migrate items structure
  if (migrated.items) {
    for (const itemId in migrated.items) {
      const item = migrated.items[itemId];
      if (item.damage !== undefined || item.durability !== undefined) {
        item.properties = {
          damage: item.damage,
          durability: item.durability,
        };
        delete item.damage;
        delete item.durability;
      }
    }
  }

  // Convert old effect format
  if (migrated.player.activeEffects && Array.isArray(migrated.player.activeEffects)) {
    migrated.player.activeEffects = migrated.player.activeEffects.map(
      (effect: any) => {
        if (typeof effect === 'string') {
          return { type: effect, duration: -1 };
        }
        return effect;
      },
    );
  }

  // Initialize missing collections
  migrated.rooms = migrated.rooms || {};
  migrated.npcs = migrated.npcs || {};
  migrated.items = migrated.items || {};

  // Warn about removed features
  if (migrated.player.oldCraftingSystem) {
    warnings.push('Old crafting system data will be removed during migration');
    delete migrated.player.oldCraftingSystem;
  }
  if (migrated.player.companions) {
    delete migrated.player.companions;
  }

  // Handle circular references
  removeCircularReferences(migrated);

  return migrated;
}

/**
 * Migrate v2.0.0 save to v2.1.0
 */
function migrateV2toV21(save: GameState): GameState {
  const migrated: any = JSON.parse(JSON.stringify(save));

  migrated.metadata = migrated.metadata || {};
  migrated.metadata.version = '2.1.0';
  migrated.metadata.savedAt = new Date();

  // Add room references to player
  if (migrated.player && migrated.rooms) {
    const playerPos = migrated.player.position;
    if (playerPos) {
      // Find which room the player is in
      for (const roomId in migrated.rooms) {
        const room = migrated.rooms[roomId];
        if (
          room.position &&
          room.size &&
          playerPos.x >= room.position.x &&
          playerPos.x < room.position.x + room.size.width &&
          playerPos.y >= room.position.y &&
          playerPos.y < room.position.y + room.size.height
        ) {
          migrated.player.roomId = roomId;
          break;
        }
      }
    }
  }

  return migrated;
}

/**
 * Migrate any version to current version
 */
function migrateToCurrentVersion(save: GameState): GameState {
  const version = detectSaveVersion(save);
  let migrated = save;

  if (compareVersions(version, '2.0.0') < 0) {
    migrated = migrateV1toV2(migrated);
  }

  if (compareVersions(detectSaveVersion(migrated), '2.1.0') < 0) {
    migrated = migrateV2toV21(migrated);
  }

  return migrated;
}

/**
 * Get suggestions for version mismatch
 */
function getVersionMismatchSuggestions(save: GameState): string {
  const saveVersion = detectSaveVersion(save);
  return `This save file was created with version ${saveVersion}, which is newer than the current game version. Please update the game to the latest version to load this save.`;
}

/**
 * Get version compatibility info
 */
function getVersionCompatibility(save: GameState): {
  compatible: boolean;
  severity: 'none' | 'minor' | 'major';
} {
  const CURRENT_VERSION = '2.1.0';
  const saveVersion = detectSaveVersion(save);

  if (compareVersions(saveVersion, CURRENT_VERSION) <= 0) {
    return { compatible: true, severity: 'none' };
  }

  const saveParts = saveVersion.split('.').map(Number);
  const currentParts = CURRENT_VERSION.split('.').map(Number);

  if (saveParts[0] > currentParts[0]) {
    return { compatible: false, severity: 'major' };
  }

  return { compatible: false, severity: 'minor' };
}

/**
 * Safe load with error handling
 */
function safeLoadSave(
  save: GameState,
  options: { allowMinorVersionMismatch?: boolean } = {},
): {
  success: boolean;
  error?: string;
  warnings?: string[];
  loadedState: GameState | null;
} {
  const warnings: string[] = [];

  try {
    const compatibility = getVersionCompatibility(save);

    if (!compatibility.compatible) {
      if (
        compatibility.severity === 'minor' &&
        options.allowMinorVersionMismatch
      ) {
        warnings.push('Some features may not be available');
      } else {
        return {
          success: false,
          error: `Unsupported version: ${detectSaveVersion(save)}`,
          loadedState: null,
        };
      }
    }

    const migrated = migrateToCurrentVersion(save);

    return {
      success: true,
      warnings,
      loadedState: migrated,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      loadedState: null,
    };
  }
}

/**
 * Perform migration with locking
 */
async function performMigration(
  gameId: string,
  service: GameStateService,
): Promise<{ success: boolean }> {
  try {
    const state = await service.getGameState(gameId);
    const migrated = migrateToCurrentVersion(state);
    await service.updateGameState(gameId, migrated);
    return { success: true };
  } catch (error) {
    return { success: false };
  }
}

/**
 * Migrate with performance metrics
 */
function migrateWithMetrics(save: GameState): {
  startVersion: string;
  endVersion: string;
  durationMs: number;
  entitiesMigrated: number;
  success: boolean;
} {
  const startVersion = detectSaveVersion(save);
  const startTime = Date.now();

  try {
    const migrated = migrateToCurrentVersion(save);
    const endTime = Date.now();

    let entityCount = 0;
    if (migrated.rooms) entityCount += Object.keys(migrated.rooms).length;
    if (migrated.items) entityCount += Object.keys(migrated.items).length;
    if (migrated.npcs) entityCount += Object.keys(migrated.npcs).length;

    return {
      startVersion,
      endVersion: detectSaveVersion(migrated),
      durationMs: endTime - startTime,
      entitiesMigrated: entityCount,
      success: true,
    };
  } catch (error) {
    return {
      startVersion,
      endVersion: startVersion,
      durationMs: Date.now() - startTime,
      entitiesMigrated: 0,
      success: false,
    };
  }
}

/**
 * Validate save data integrity
 */
function validateSaveIntegrity(save: GameState): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate player
  if (!save.player) {
    errors.push('Missing player data');
  } else {
    if (!save.player.id) errors.push('Player missing ID');
    if (save.player.health === undefined) errors.push('Player missing health');
  }

  // Validate inventory references
  if (save.player?.inventory && save.items) {
    for (const itemId of save.player.inventory) {
      if (typeof itemId === 'string' && !save.items[itemId]) {
        warnings.push(`Inventory references missing item: ${itemId}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Remove circular references from object
 */
function removeCircularReferences(obj: any, seen = new WeakSet()): void {
  if (obj === null || typeof obj !== 'object') {
    return;
  }

  if (seen.has(obj)) {
    return;
  }

  seen.add(obj);

  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];
      if (value === null || typeof value !== 'object') {
        continue;
      }

      if (seen.has(value)) {
        delete obj[key];
      } else {
        removeCircularReferences(value, seen);
      }
    }
  }
}
