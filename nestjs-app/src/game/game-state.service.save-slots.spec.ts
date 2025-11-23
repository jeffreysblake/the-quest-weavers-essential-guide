import { Test, TestingModule } from '@nestjs/testing';
import { GameStateService, GameState } from './game-state.service';
import { PlayerService } from '../entity/player.service';
import { QuestManagerService } from '../quest/quest-manager.service';
import { InventoryManagerService } from '../inventory/inventory-manager.service';
import { EffectManagerService } from '../effects/effect-manager.service';
import { WorldStateManagerService } from '../world-state/world-state-manager.service';

describe('GameStateService - Save Slots & Import/Export', () => {
  let service: GameStateService;
  let module: TestingModule;
  let mockPlayerService: jest.Mocked<Partial<PlayerService>>;
  let mockQuestManager: jest.Mocked<Partial<QuestManagerService>>;
  let mockInventoryManager: jest.Mocked<Partial<InventoryManagerService>>;
  let mockEffectManager: jest.Mocked<Partial<EffectManagerService>>;
  let mockWorldStateManager: jest.Mocked<Partial<WorldStateManagerService>>;

  // Helper function to create a comprehensive game state
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
      startingRoomId: 'room-1',
    },
    startingRoomId: 'room-1',
    initialized: true,
  });

  beforeEach(async () => {
    // Create comprehensive mocks for all services
    mockPlayerService = {
      findAll: jest.fn().mockReturnValue([]),
      getPlayer: jest.fn(),
      updatePlayer: jest.fn(),
    };

    mockQuestManager = {
      getAllPlayerQuests: jest.fn(),
      restorePlayerQuests: jest.fn(),
    };

    mockInventoryManager = {
      exportState: jest.fn(),
      importState: jest.fn(),
    };

    mockEffectManager = {
      exportEffects: jest.fn(),
      importEffects: jest.fn(),
    };

    mockWorldStateManager = {
      getWorldState: jest.fn(),
      restoreWorldState: jest.fn(),
    };

    module = await Test.createTestingModule({
      providers: [
        GameStateService,
        { provide: PlayerService, useValue: mockPlayerService },
        { provide: QuestManagerService, useValue: mockQuestManager },
        { provide: InventoryManagerService, useValue: mockInventoryManager },
        { provide: EffectManagerService, useValue: mockEffectManager },
        { provide: WorldStateManagerService, useValue: mockWorldStateManager },
      ],
    }).compile();

    service = module.get<GameStateService>(GameStateService);
  });

  afterEach(async () => {
    await module.close();
  });

  // ============================================================================
  // SAVE SLOT MANAGEMENT (10 tests)
  // ============================================================================

  describe('Save Slot Management', () => {
    it('should list all save slots for a game', async () => {
      const validState = createValidGameState('slots-test');
      await service.updateGameState('slots-test', validState);

      await service.saveGameState('slots-test', 'slot-1');
      await service.saveGameState('slots-test', 'slot-2');
      await service.saveGameState('slots-test', 'slot-3');

      const slots = await service.getSaveSlots('slots-test');
      expect(slots).toContain('slot-1');
      expect(slots).toContain('slot-2');
      expect(slots).toContain('slot-3');
      expect(slots.length).toBe(3);
    });

    it('should return empty array for game with no saves', async () => {
      const slots = await service.getSaveSlots('no-saves-game');
      expect(slots).toEqual([]);
    });

    it('should delete save slot successfully', async () => {
      const validState = createValidGameState('delete-test');
      await service.updateGameState('delete-test', validState);
      await service.saveGameState('delete-test', 'slot-1');

      const deleted = await service.deleteSaveSlot('delete-test', 'slot-1');
      expect(deleted).toBe(true);

      const slots = await service.getSaveSlots('delete-test');
      expect(slots).not.toContain('slot-1');
    });

    it('should return false when deleting non-existent slot', async () => {
      const deleted = await service.deleteSaveSlot(
        'delete-test',
        'non-existent',
      );
      expect(deleted).toBe(false);
    });

    it('should return false when deleting from non-existent game', async () => {
      const deleted = await service.deleteSaveSlot(
        'non-existent-game',
        'slot-1',
      );
      expect(deleted).toBe(false);
    });

    it('should overwrite existing save slot', async () => {
      const validState = createValidGameState('overwrite-test');
      await service.updateGameState('overwrite-test', validState);
      await service.saveGameState('overwrite-test', 'slot-1');

      validState.player.health = 50;
      await service.updateGameState('overwrite-test', validState);
      await service.saveGameState('overwrite-test', 'slot-1');

      const loadedState = await service.loadGameState(
        'overwrite-test',
        'slot-1',
      );
      expect(loadedState.player.health).toBe(50);

      const slots = await service.getSaveSlots('overwrite-test');
      expect(slots.length).toBe(1);
    });

    it('should handle multiple saves to same slot', async () => {
      const validState = createValidGameState('multi-save-test');
      await service.updateGameState('multi-save-test', validState);

      for (let i = 0; i < 10; i++) {
        validState.player.health = 100 - i * 10;
        await service.updateGameState('multi-save-test', validState);
        await service.saveGameState('multi-save-test', 'auto-save');
      }

      const loadedState = await service.loadGameState(
        'multi-save-test',
        'auto-save',
      );
      expect(loadedState.player.health).toBe(10); // Last save

      const slots = await service.getSaveSlots('multi-save-test');
      expect(slots.length).toBe(1);
    });

    it('should maintain slot independence across games', async () => {
      const state1 = createValidGameState('game-1');
      const state2 = createValidGameState('game-2');

      await service.updateGameState('game-1', state1);
      await service.updateGameState('game-2', state2);

      await service.saveGameState('game-1', 'slot-1');
      await service.saveGameState('game-2', 'slot-1');

      const slots1 = await service.getSaveSlots('game-1');
      const slots2 = await service.getSaveSlots('game-2');

      expect(slots1).toContain('slot-1');
      expect(slots2).toContain('slot-1');
    });

    it('should delete specific slot without affecting others', async () => {
      const validState = createValidGameState('selective-delete');
      await service.updateGameState('selective-delete', validState);

      await service.saveGameState('selective-delete', 'slot-1');
      await service.saveGameState('selective-delete', 'slot-2');
      await service.saveGameState('selective-delete', 'slot-3');

      await service.deleteSaveSlot('selective-delete', 'slot-2');

      const slots = await service.getSaveSlots('selective-delete');
      expect(slots).toContain('slot-1');
      expect(slots).not.toContain('slot-2');
      expect(slots).toContain('slot-3');
    });

    it('should handle slot names with special characters', async () => {
      const validState = createValidGameState('special-chars-test');
      await service.updateGameState('special-chars-test', validState);

      const slotNames = [
        'slot-1',
        'auto-save',
        'checkpoint_boss',
        'save.backup',
        'save (1)',
      ];

      for (const slotName of slotNames) {
        await service.saveGameState('special-chars-test', slotName);
      }

      const slots = await service.getSaveSlots('special-chars-test');
      expect(slots.length).toBe(slotNames.length);
      slotNames.forEach((name) => {
        expect(slots).toContain(name);
      });
    });
  });

  // ============================================================================
  // JSON SERIALIZATION EDGE CASES (15 tests)
  // ============================================================================

  describe('Import/Export', () => {
    it('should export game state as JSON string', async () => {
      const validState = createValidGameState('export-test');
      await service.updateGameState('export-test', validState);

      const exported = await service.exportGameState('export-test');

      expect(typeof exported).toBe('string');
      const parsed = JSON.parse(exported);
      expect(parsed.gameId).toBe('export-test');
      expect(parsed.player.name).toBe('Hero');
    });

    it('should format exported JSON with indentation', async () => {
      const validState = createValidGameState('format-test');
      await service.updateGameState('format-test', validState);

      const exported = await service.exportGameState('format-test');

      // JSON.stringify with null, 2 creates indented output
      expect(exported).toContain('\n');
      expect(exported).toContain('  ');
    });

    it('should import game state from JSON string', async () => {
      const validState = createValidGameState('import-test');
      const jsonString = JSON.stringify(validState);

      await service.importGameState('import-test', jsonString);

      const state = await service.getGameState('import-test');
      expect(state.player.name).toBe('Hero');
      expect(state.player.health).toBe(100);
    });

    it('should override gameId during import', async () => {
      const validState = createValidGameState('wrong-id');
      const jsonString = JSON.stringify(validState);

      await service.importGameState('correct-id', jsonString);

      const state = await service.getGameState('correct-id');
      expect(state.gameId).toBe('correct-id');
    });

    it('should add importedAt timestamp during import', async () => {
      const validState = createValidGameState('timestamp-test');
      const jsonString = JSON.stringify(validState);

      await service.importGameState('timestamp-test', jsonString);

      const state = await service.getGameState('timestamp-test');
      expect(state.metadata.importedAt).toBeDefined();
      expect(state.metadata.importedAt).toBeInstanceOf(Date);
    });

    it('should throw error on invalid JSON during import', async () => {
      const invalidJson = '{ invalid json }';

      await expect(
        service.importGameState('invalid-test', invalidJson),
      ).rejects.toThrow('Failed to import game state');
    });

    it('should preserve metadata during import', async () => {
      const validState = createValidGameState('metadata-import-test');
      validState.metadata.customField = 'custom-value';
      const jsonString = JSON.stringify(validState);

      await service.importGameState('metadata-import-test', jsonString);

      const state = await service.getGameState('metadata-import-test');
      expect(state.metadata.customField).toBe('custom-value');
      expect(state.metadata.importedAt).toBeDefined();
    });

    it('should handle export/import round trip', async () => {
      const originalState = createValidGameState('roundtrip-test');
      await service.updateGameState('roundtrip-test', originalState);

      const exported = await service.exportGameState('roundtrip-test');
      await service.importGameState('roundtrip-copy', exported);

      const copyState = await service.getGameState('roundtrip-copy');
      expect(copyState.player.name).toBe(originalState.player.name);
      expect(copyState.player.health).toBe(originalState.player.health);
      expect(Object.keys(copyState.rooms).length).toBe(
        Object.keys(originalState.rooms).length,
      );
    });
  });

});
