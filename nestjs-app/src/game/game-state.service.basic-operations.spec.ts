import { Test, TestingModule } from '@nestjs/testing';
import { GameStateService, GameState } from './game-state.service';
import { PlayerService } from '../entity/player.service';
import { QuestManagerService } from '../quest/quest-manager.service';
import { InventoryManagerService } from '../inventory/inventory-manager.service';
import { EffectManagerService } from '../effects/effect-manager.service';
import { WorldStateManagerService } from '../world-state/world-state-manager.service';

describe('GameStateService - Basic Operations', () => {
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
  // BASIC OPERATIONS (15 tests)
  // ============================================================================

  describe('getGameState', () => {
    it('should create new game state if not exists', async () => {
      const state = await service.getGameState('new-game');

      expect(state).toBeDefined();
      expect(state.gameId).toBe('new-game');
      expect(state.rooms).toEqual({});
      expect(state.npcs).toEqual({});
      expect(state.items).toEqual({});
      expect(state.metadata.version).toBe('2.1.0');
      expect(state.metadata.initialized).toBe(false);
    });

    it('should return existing game state', async () => {
      const state1 = await service.getGameState('test-game');
      await service.updateGameState('test-game', { initialized: true });
      const state2 = await service.getGameState('test-game');

      expect(state2.gameId).toBe('test-game');
      expect(state2.initialized).toBe(true);
    });

    it('should create separate states for different games', async () => {
      const state1 = await service.getGameState('game-1');
      const state2 = await service.getGameState('game-2');

      expect(state1.gameId).toBe('game-1');
      expect(state2.gameId).toBe('game-2');
    });

    it('should initialize metadata correctly', async () => {
      const state = await service.getGameState('metadata-test');

      expect(state.metadata).toBeDefined();
      expect(state.metadata.version).toBe('2.1.0');
      expect(state.metadata.initialized).toBe(false);
    });
  });

  describe('updateGameState', () => {
    it('should update game state with partial data', async () => {
      await service.updateGameState('test-game', {
        gameId: 'test-game',
        initialized: true,
        startingRoomId: 'room-1',
      });

      const state = await service.getGameState('test-game');
      expect(state.initialized).toBe(true);
      expect(state.startingRoomId).toBe('room-1');
    });

    it('should merge metadata correctly', async () => {
      await service.updateGameState('test-game', {
        gameId: 'test-game',
        metadata: { version: '2.1.0', initialized: true },
      });
      await service.updateGameState('test-game', {
        gameId: 'test-game',
        metadata: { startingRoomId: 'room-1' },
      });

      const state = await service.getGameState('test-game');
      expect(state.metadata.version).toBe('2.1.0');
      expect(state.metadata.initialized).toBe(true);
      expect(state.metadata.startingRoomId).toBe('room-1');
    });

    it('should update player data', async () => {
      await service.updateGameState('test-game', {
        gameId: 'test-game',
        player: { id: 'p1', name: 'Hero', health: 75 },
      });

      const state = await service.getGameState('test-game');
      expect(state.player.name).toBe('Hero');
      expect(state.player.health).toBe(75);
    });

    it('should update rooms data', async () => {
      await service.updateGameState('test-game', {
        gameId: 'test-game',
        rooms: { 'room-1': { id: 'room-1', name: 'Test Room' } },
      });

      const state = await service.getGameState('test-game');
      expect(state.rooms['room-1'].name).toBe('Test Room');
    });

    it('should update items and npcs', async () => {
      await service.updateGameState('test-game', {
        gameId: 'test-game',
        items: { 'item-1': { id: 'item-1', name: 'Key' } },
        npcs: { 'npc-1': { id: 'npc-1', name: 'Guard' } },
      });

      const state = await service.getGameState('test-game');
      expect(state.items['item-1'].name).toBe('Key');
      expect(state.npcs['npc-1'].name).toBe('Guard');
    });
  });

  describe('Basic Save/Load', () => {
    it('should save game state to a slot', async () => {
      const validState = createValidGameState('save-test');
      await service.updateGameState('save-test', validState);

      await service.saveGameState('save-test', 'slot-1');

      const slots = await service.getSaveSlots('save-test');
      expect(slots).toContain('slot-1');
    });

    it('should load game state from a slot', async () => {
      const validState = createValidGameState('load-test');
      await service.updateGameState('load-test', validState);
      await service.saveGameState('load-test', 'slot-1');

      const loadedState = await service.loadGameState('load-test', 'slot-1');

      expect(loadedState.player.name).toBe('Hero');
      expect(loadedState.player.health).toBe(100);
      expect(loadedState.metadata.loadedAt).toBeDefined();
    });

    it('should throw error when loading non-existent slot', async () => {
      await expect(
        service.loadGameState('test-game', 'non-existent'),
      ).rejects.toThrow('No saved game found in slot: non-existent');
    });

    it('should save metadata with timestamp and slot name', async () => {
      const validState = createValidGameState('metadata-save-test');
      await service.updateGameState('metadata-save-test', validState);
      await service.saveGameState('metadata-save-test', 'slot-1');

      const loadedState = await service.loadGameState(
        'metadata-save-test',
        'slot-1',
      );

      expect(loadedState.metadata.savedAt).toBeDefined();
      expect(loadedState.metadata.slotName).toBe('slot-1');
      expect(loadedState.metadata.loadedAt).toBeDefined();
    });

    it('should maintain multiple save slots independently', async () => {
      const state = createValidGameState('multi-slot');
      await service.updateGameState('multi-slot', state);
      await service.saveGameState('multi-slot', 'slot-1');

      state.player.health = 50;
      await service.updateGameState('multi-slot', state);
      await service.saveGameState('multi-slot', 'slot-2');

      const slot1State = await service.loadGameState('multi-slot', 'slot-1');
      expect(slot1State.player.health).toBe(100);

      const slot2State = await service.loadGameState('multi-slot', 'slot-2');
      expect(slot2State.player.health).toBe(50);
    });
  });
});
