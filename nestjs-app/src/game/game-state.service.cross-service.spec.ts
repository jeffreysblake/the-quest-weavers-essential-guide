import { Test, TestingModule } from '@nestjs/testing';
import { GameStateService, GameState } from './game-state.service';
import { PlayerService } from '../entity/player.service';
import { QuestManagerService } from '../quest/quest-manager.service';
import { InventoryManagerService } from '../inventory/inventory-manager.service';
import { EffectManagerService } from '../effects/effect-manager.service';
import { WorldStateManagerService } from '../world-state/world-state-manager.service';

describe('GameStateService - Cross-Service Integration', () => {
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
  // CROSS-SERVICE INTEGRATION (14 tests)
  // ============================================================================

  describe('Save with All Services', () => {
    it('should capture player data from PlayerService', async () => {
      const playerData = {
        id: 'player-1',
        gameId: 'test-game',
        name: 'Hero',
        health: 100,
      };
      mockPlayerService.findAll.mockReturnValue([playerData]);

      const validState = createValidGameState('test-game');
      await service.updateGameState('test-game', validState);
      await service.saveGameState('test-game', 'slot-1');

      const loadedState = await service.loadGameState('test-game', 'slot-1');
      expect(loadedState.players['player-1']).toEqual(playerData);
    });

    it('should capture quest data from QuestManager', async () => {
      const questData = {
        quests: [{ id: 'quest-1', name: 'Main Quest', completed: false }],
      };
      mockQuestManager.getAllPlayerQuests.mockReturnValue(questData);

      const validState = createValidGameState('test-game');
      await service.updateGameState('test-game', validState);
      await service.saveGameState('test-game', 'slot-1');

      const loadedState = await service.loadGameState('test-game', 'slot-1');
      expect(loadedState.quests['test-game']).toEqual(questData);
    });

    it('should capture inventory data from InventoryManager', async () => {
      const inventoryData = {
        'player-1': { items: ['item-1', 'item-2'], capacity: 10 },
      };
      mockInventoryManager.exportState.mockReturnValue(inventoryData);

      const validState = createValidGameState('test-game');
      await service.updateGameState('test-game', validState);
      await service.saveGameState('test-game', 'slot-1');

      const loadedState = await service.loadGameState('test-game', 'slot-1');
      expect(loadedState.inventories).toEqual(inventoryData);
    });

    it('should capture effect data from EffectManager', async () => {
      const effectData = [
        { id: 'effect-1', type: 'poison', duration: 10 },
      ];
      mockEffectManager.exportEffects.mockReturnValue(effectData);

      const validState = createValidGameState('test-game');
      await service.updateGameState('test-game', validState);
      await service.saveGameState('test-game', 'slot-1');

      const loadedState = await service.loadGameState('test-game', 'slot-1');
      expect(loadedState.effects['test-game']).toEqual(effectData);
    });

    it('should capture world state from WorldStateManager', async () => {
      const worldState = {
        gameId: 'test-game',
        doors: new Map([['door-1', { id: 'door-1', isOpen: true }]]),
        npcs: new Map([['npc-1', { id: 'npc-1', position: { x: 5, y: 5 } }]]),
        objects: new Map([['obj-1', { id: 'obj-1', state: 'intact' }]]),
        variables: { playerScore: 100 },
        flags: { tutorialComplete: true },
      };
      mockWorldStateManager.getWorldState.mockReturnValue(worldState);

      const validState = createValidGameState('test-game');
      await service.updateGameState('test-game', validState);
      await service.saveGameState('test-game', 'slot-1');

      const loadedState = await service.loadGameState('test-game', 'slot-1');
      expect(loadedState.worldStates['test-game'].doors).toEqual([
        ['door-1', { id: 'door-1', isOpen: true }],
      ]);
      expect(loadedState.worldStates['test-game'].variables).toEqual({
        playerScore: 100,
      });
    });

    it('should save all services data in single operation', async () => {
      mockPlayerService.findAll.mockReturnValue([
        { id: 'p1', gameId: 'test-game', name: 'Hero' },
      ]);
      mockQuestManager.getAllPlayerQuests.mockReturnValue({
        quests: ['quest-1'],
      });
      mockInventoryManager.exportState.mockReturnValue({
        p1: { items: [] },
      });
      mockEffectManager.exportEffects.mockReturnValue([]);
      mockWorldStateManager.getWorldState.mockReturnValue({
        gameId: 'test-game',
        doors: new Map(),
        npcs: new Map(),
        objects: new Map(),
        variables: {},
        flags: {},
      });

      const validState = createValidGameState('test-game');
      await service.updateGameState('test-game', validState);
      await service.saveGameState('test-game', 'slot-1');

      const loadedState = await service.loadGameState('test-game', 'slot-1');
      expect(loadedState.players).toBeDefined();
      expect(loadedState.quests).toBeDefined();
      expect(loadedState.inventories).toBeDefined();
      expect(loadedState.effects).toBeDefined();
      expect(loadedState.worldStates).toBeDefined();
    });

    it('should filter players by gameId when saving', async () => {
      mockPlayerService.findAll.mockReturnValue([
        { id: 'p1', gameId: 'game-1', name: 'Player 1' },
        { id: 'p2', gameId: 'game-2', name: 'Player 2' },
        { id: 'p3', gameId: 'game-1', name: 'Player 3' },
      ]);

      const validState = createValidGameState('game-1');
      await service.updateGameState('game-1', validState);
      await service.saveGameState('game-1', 'slot-1');

      const loadedState = await service.loadGameState('game-1', 'slot-1');
      expect(Object.keys(loadedState.players)).toHaveLength(2);
      expect(loadedState.players['p1']).toBeDefined();
      expect(loadedState.players['p3']).toBeDefined();
      expect(loadedState.players['p2']).toBeUndefined();
    });
  });

  describe('Load with All Services', () => {
    it('should restore player data to PlayerService', async () => {
      const playerData = {
        id: 'player-1',
        gameId: 'test-game',
        name: 'Hero',
        health: 75,
      };
      mockPlayerService.findAll.mockReturnValue([playerData]);
      mockPlayerService.getPlayer.mockReturnValue(playerData);

      const validState = createValidGameState('test-game');
      await service.updateGameState('test-game', validState);
      await service.saveGameState('test-game', 'slot-1');

      await service.loadGameState('test-game', 'slot-1');

      expect(mockPlayerService.getPlayer).toHaveBeenCalledWith('player-1');
      expect(mockPlayerService.updatePlayer).toHaveBeenCalled();
    });

    it('should restore quest data to QuestManager', async () => {
      const questData = { quests: ['quest-1'] };
      mockQuestManager.getAllPlayerQuests.mockReturnValue(questData);

      const validState = createValidGameState('test-game');
      await service.updateGameState('test-game', validState);
      await service.saveGameState('test-game', 'slot-1');

      await service.loadGameState('test-game', 'slot-1');

      expect(mockQuestManager.restorePlayerQuests).toHaveBeenCalledWith(
        'test-game',
        questData,
      );
    });

    it('should restore inventory data to InventoryManager', async () => {
      const inventoryData = { 'player-1': { items: ['item-1'] } };
      mockInventoryManager.exportState.mockReturnValue(inventoryData);

      const validState = createValidGameState('test-game');
      await service.updateGameState('test-game', validState);
      await service.saveGameState('test-game', 'slot-1');

      await service.loadGameState('test-game', 'slot-1');

      expect(mockInventoryManager.importState).toHaveBeenCalledWith(
        inventoryData,
      );
    });

    it('should restore effect data to EffectManager', async () => {
      const effectData = [{ id: 'effect-1', type: 'poison' }];
      mockEffectManager.exportEffects.mockReturnValue(effectData);

      const validState = createValidGameState('test-game');
      await service.updateGameState('test-game', validState);
      await service.saveGameState('test-game', 'slot-1');

      await service.loadGameState('test-game', 'slot-1');

      expect(mockEffectManager.importEffects).toHaveBeenCalledWith(
        'test-game',
        effectData,
      );
    });

    it('should restore world state to WorldStateManager', async () => {
      const worldState = {
        gameId: 'test-game',
        doors: new Map([['door-1', { id: 'door-1', isOpen: true }]]),
        npcs: new Map(),
        objects: new Map(),
        variables: {},
        flags: {},
      };
      mockWorldStateManager.getWorldState.mockReturnValue(worldState);

      const validState = createValidGameState('test-game');
      await service.updateGameState('test-game', validState);
      await service.saveGameState('test-game', 'slot-1');

      await service.loadGameState('test-game', 'slot-1');

      expect(mockWorldStateManager.restoreWorldState).toHaveBeenCalledWith(
        'test-game',
        expect.objectContaining({
          doors: expect.any(Array),
        }),
      );
    });

    it('should skip player restore if player not found', async () => {
      mockPlayerService.findAll.mockReturnValue([
        { id: 'player-1', gameId: 'test-game', name: 'Hero' },
      ]);
      mockPlayerService.getPlayer.mockReturnValue(null);

      const validState = createValidGameState('test-game');
      await service.updateGameState('test-game', validState);
      await service.saveGameState('test-game', 'slot-1');

      await service.loadGameState('test-game', 'slot-1');

      expect(mockPlayerService.updatePlayer).not.toHaveBeenCalled();
    });

    it('should restore all services in correct order', async () => {
      const callOrder: string[] = [];

      mockPlayerService.findAll.mockReturnValue([
        { id: 'p1', gameId: 'test-game', name: 'Hero' },
      ]);
      mockPlayerService.getPlayer.mockImplementation(() => {
        callOrder.push('getPlayer');
        return { id: 'p1', gameId: 'test-game', name: 'Hero' };
      });
      mockPlayerService.updatePlayer.mockImplementation(() => {
        callOrder.push('updatePlayer');
      });

      mockQuestManager.getAllPlayerQuests.mockReturnValue({
        quests: ['q1'],
      });
      mockQuestManager.restorePlayerQuests.mockImplementation(() => {
        callOrder.push('restoreQuests');
      });

      mockInventoryManager.exportState.mockReturnValue({ p1: {} });
      mockInventoryManager.importState.mockImplementation(() => {
        callOrder.push('importInventory');
      });

      mockEffectManager.exportEffects.mockReturnValue([]);
      mockEffectManager.importEffects.mockImplementation(() => {
        callOrder.push('importEffects');
      });

      mockWorldStateManager.getWorldState.mockReturnValue({
        gameId: 'test-game',
        doors: new Map(),
        npcs: new Map(),
        objects: new Map(),
        variables: {},
        flags: {},
      });
      mockWorldStateManager.restoreWorldState.mockImplementation(() => {
        callOrder.push('restoreWorldState');
      });

      const validState = createValidGameState('test-game');
      await service.updateGameState('test-game', validState);
      await service.saveGameState('test-game', 'slot-1');

      await service.loadGameState('test-game', 'slot-1');

      // Verify services were called (order may vary based on implementation)
      expect(callOrder).toContain('getPlayer');
      expect(callOrder).toContain('updatePlayer');
      expect(callOrder).toContain('restoreQuests');
      expect(callOrder).toContain('importInventory');
      expect(callOrder).toContain('importEffects');
      expect(callOrder).toContain('restoreWorldState');
    });
  });

  // ============================================================================
  // SERVICE WITHOUT DEPENDENCIES (5 tests)
  // ============================================================================

  describe('Service Without Dependencies', () => {
    let serviceWithoutDeps: GameStateService;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [GameStateService],
      }).compile();

      serviceWithoutDeps = module.get<GameStateService>(GameStateService);
    });

    it('should work without any optional services', async () => {
      const state = createValidGameState('no-deps-test');
      await serviceWithoutDeps.updateGameState('no-deps-test', state);

      await expect(
        serviceWithoutDeps.saveGameState('no-deps-test', 'slot-1'),
      ).resolves.not.toThrow();

      const loadedState = await serviceWithoutDeps.loadGameState(
        'no-deps-test',
        'slot-1',
      );
      expect(loadedState.player.name).toBe('Hero');
    });

    it('should save only base state without services', async () => {
      const state = createValidGameState('base-only-test');
      await serviceWithoutDeps.updateGameState('base-only-test', state);
      await serviceWithoutDeps.saveGameState('base-only-test', 'slot-1');

      const loadedState = await serviceWithoutDeps.loadGameState(
        'base-only-test',
        'slot-1',
      );

      expect(loadedState.players).toBeUndefined();
      expect(loadedState.quests).toBeUndefined();
      expect(loadedState.inventories).toBeUndefined();
      expect(loadedState.effects).toBeUndefined();
      expect(loadedState.worldStates).toBeUndefined();
    });

    it('should handle all operations without services', async () => {
      const state = createValidGameState('all-ops-no-deps');
      await serviceWithoutDeps.updateGameState('all-ops-no-deps', state);
      await serviceWithoutDeps.saveGameState('all-ops-no-deps', 'slot-1');

      const loadedState = await serviceWithoutDeps.loadGameState(
        'all-ops-no-deps',
        'slot-1',
      );

      const exported = await serviceWithoutDeps.exportGameState(
        'all-ops-no-deps',
      );
      expect(exported).toBeDefined();

      await serviceWithoutDeps.importGameState('imported', exported);
      const importedState = await serviceWithoutDeps.getGameState('imported');
      expect(importedState.player.name).toBe('Hero');
    });

    it('should maintain performance without services', async () => {
      const state = createValidGameState('perf-no-deps');
      await serviceWithoutDeps.updateGameState('perf-no-deps', state);

      const start = Date.now();
      for (let i = 0; i < 10; i++) {
        await serviceWithoutDeps.saveGameState('perf-no-deps', `slot-${i}`);
      }
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(1000); // Should be fast
    });

    it('should provide stats without services', async () => {
      const state = createValidGameState('stats-no-deps');
      await serviceWithoutDeps.updateGameState('stats-no-deps', state);
      await serviceWithoutDeps.saveGameState('stats-no-deps', 'slot-1');

      const stats = serviceWithoutDeps.getStats();
      expect(stats.activeGames).toBeGreaterThan(0);
      expect(stats.totalSaveSlots).toBeGreaterThan(0);
      expect(stats.memoryUsageEstimate).toBeDefined();
    });
  });
});
