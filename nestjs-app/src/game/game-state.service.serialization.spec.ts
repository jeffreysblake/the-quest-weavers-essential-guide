import { Test, TestingModule } from '@nestjs/testing';
import { GameStateService, GameState } from './game-state.service';
import { PlayerService } from '../entity/player.service';
import { QuestManagerService } from '../quest/quest-manager.service';
import { InventoryManagerService } from '../inventory/inventory-manager.service';
import { EffectManagerService } from '../effects/effect-manager.service';
import { WorldStateManagerService } from '../world-state/world-state-manager.service';

describe('GameStateService - JSON Serialization', () => {
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
  describe('JSON Serialization Edge Cases', () => {
    describe('Special Values', () => {
      it('should handle undefined values in state', async () => {
        const stateWithUndefined = createValidGameState('undefined-test');
        stateWithUndefined.player.optionalField = undefined;

        await service.updateGameState('undefined-test', stateWithUndefined);
        await service.saveGameState('undefined-test', 'slot-1');

        const loadedState = await service.loadGameState(
          'undefined-test',
          'slot-1',
        );
        // undefined is not preserved in JSON
        expect(loadedState.player.optionalField).toBeUndefined();
      });

      it('should handle null values in state', async () => {
        const stateWithNull = createValidGameState('null-test');
        stateWithNull.player.customData = null;

        await service.updateGameState('null-test', stateWithNull);
        await service.saveGameState('null-test', 'slot-1');

        const loadedState = await service.loadGameState('null-test', 'slot-1');
        expect(loadedState.player.customData).toBeNull();
      });

      it('should handle NaN values (converted to null)', async () => {
        const stateWithNaN = createValidGameState('nan-test');
        stateWithNaN.player.invalidNumber = NaN;

        await service.updateGameState('nan-test', stateWithNaN);
        await service.saveGameState('nan-test', 'slot-1');

        const loadedState = await service.loadGameState('nan-test', 'slot-1');
        expect(loadedState.player.invalidNumber).toBeNull();
      });

      it('should handle Infinity values (converted to null)', async () => {
        const stateWithInfinity = createValidGameState('infinity-test');
        stateWithInfinity.player.position.x = Infinity;
        stateWithInfinity.player.position.y = -Infinity;

        await service.updateGameState('infinity-test', stateWithInfinity);
        await service.saveGameState('infinity-test', 'slot-1');

        const loadedState = await service.loadGameState(
          'infinity-test',
          'slot-1',
        );
        expect(loadedState.player.position.x).toBeNull();
        expect(loadedState.player.position.y).toBeNull();
      });

      it('should handle Date objects', async () => {
        const stateWithDate = createValidGameState('date-test');
        const now = new Date();
        stateWithDate.metadata.customDate = now;

        await service.updateGameState('date-test', stateWithDate);
        await service.saveGameState('date-test', 'slot-1');

        const loadedState = await service.loadGameState('date-test', 'slot-1');
        // Date becomes ISO string after JSON round-trip
        expect(typeof loadedState.metadata.customDate).toBe('string');
      });

      it('should handle empty arrays', async () => {
        const stateWithEmptyArray = createValidGameState('empty-array-test');
        stateWithEmptyArray.player.inventory = [];

        await service.updateGameState('empty-array-test', stateWithEmptyArray);
        await service.saveGameState('empty-array-test', 'slot-1');

        const loadedState = await service.loadGameState(
          'empty-array-test',
          'slot-1',
        );
        expect(loadedState.player.inventory).toEqual([]);
      });

      it('should handle empty objects', async () => {
        const stateWithEmptyObject = createValidGameState('empty-object-test');
        stateWithEmptyObject.rooms = {};

        await service.updateGameState(
          'empty-object-test',
          stateWithEmptyObject,
        );
        await service.saveGameState('empty-object-test', 'slot-1');

        const loadedState = await service.loadGameState(
          'empty-object-test',
          'slot-1',
        );
        expect(loadedState.rooms).toEqual({});
      });
    });

    describe('Map Serialization', () => {
      it('should serialize Maps to arrays in world state', async () => {
        const worldState = {
          gameId: 'map-test',
          doors: new Map([
            ['door-1', { id: 'door-1', isOpen: true }],
            ['door-2', { id: 'door-2', isOpen: false }],
          ]),
          npcs: new Map([['npc-1', { id: 'npc-1', name: 'Guard' }]]),
          objects: new Map([['obj-1', { id: 'obj-1', type: 'chest' }]]),
          variables: { score: 100 },
          flags: { complete: true },
        };
        mockWorldStateManager.getWorldState.mockReturnValue(worldState);

        const validState = createValidGameState('map-test');
        await service.updateGameState('map-test', validState);
        await service.saveGameState('map-test', 'slot-1');

        const loadedState = await service.loadGameState('map-test', 'slot-1');

        expect(Array.isArray(loadedState.worldStates['map-test'].doors)).toBe(
          true,
        );
        expect(loadedState.worldStates['map-test'].doors).toEqual([
          ['door-1', { id: 'door-1', isOpen: true }],
          ['door-2', { id: 'door-2', isOpen: false }],
        ]);
      });

      it('should handle empty Maps in world state', async () => {
        const worldState = {
          gameId: 'empty-map-test',
          doors: new Map(),
          npcs: new Map(),
          objects: new Map(),
          variables: {},
          flags: {},
        };
        mockWorldStateManager.getWorldState.mockReturnValue(worldState);

        const validState = createValidGameState('empty-map-test');
        await service.updateGameState('empty-map-test', validState);
        await service.saveGameState('empty-map-test', 'slot-1');

        const loadedState = await service.loadGameState(
          'empty-map-test',
          'slot-1',
        );

        expect(loadedState.worldStates['empty-map-test'].doors).toEqual([]);
        expect(loadedState.worldStates['empty-map-test'].npcs).toEqual([]);
      });

      it('should handle Maps with complex nested objects', async () => {
        const worldState = {
          gameId: 'complex-map-test',
          doors: new Map([
            [
              'door-1',
              {
                id: 'door-1',
                state: { locked: true, key: 'key-1' },
                metadata: { created: new Date(), health: 100 },
              },
            ],
          ]),
          npcs: new Map(),
          objects: new Map(),
          variables: {},
          flags: {},
        };
        mockWorldStateManager.getWorldState.mockReturnValue(worldState);

        const validState = createValidGameState('complex-map-test');
        await service.updateGameState('complex-map-test', validState);
        await service.saveGameState('complex-map-test', 'slot-1');

        const loadedState = await service.loadGameState(
          'complex-map-test',
          'slot-1',
        );

        const doorEntry = loadedState.worldStates['complex-map-test'].doors[0];
        expect(doorEntry[0]).toBe('door-1');
        expect(doorEntry[1].state.locked).toBe(true);
      });
    });

    describe('Deep Cloning', () => {
      it('should deep clone state on save', async () => {
        const validState = createValidGameState('clone-test');
        await service.updateGameState('clone-test', validState);
        await service.saveGameState('clone-test', 'slot-1');

        // Modify original state
        validState.player.health = 50;
        await service.updateGameState('clone-test', validState);

        // Load should have original health
        const loadedState = await service.loadGameState('clone-test', 'slot-1');
        expect(loadedState.player.health).toBe(100);
      });

      it('should deep clone nested objects', async () => {
        const validState = createValidGameState('deep-clone-test');
        validState.player.equipment = { weapon: { name: 'Sword', damage: 10 } };

        await service.updateGameState('deep-clone-test', validState);
        await service.saveGameState('deep-clone-test', 'slot-1');

        // Modify nested object
        validState.player.equipment.weapon.damage = 20;
        await service.updateGameState('deep-clone-test', validState);

        const loadedState = await service.loadGameState(
          'deep-clone-test',
          'slot-1',
        );
        expect(loadedState.player.equipment.weapon.damage).toBe(10);
      });

      it('should deep clone arrays', async () => {
        const validState = createValidGameState('array-clone-test');
        await service.updateGameState('array-clone-test', validState);
        await service.saveGameState('array-clone-test', 'slot-1');

        // Modify array
        validState.player.inventory.push('item-3');
        await service.updateGameState('array-clone-test', validState);

        const loadedState = await service.loadGameState(
          'array-clone-test',
          'slot-1',
        );
        expect(loadedState.player.inventory).toEqual(['item-1', 'item-2']);
      });

      it('should handle circular references (prevented by JSON)', async () => {
        const validState = createValidGameState('circular-test');

        // Create circular reference
        const circular: any = { name: 'Circular' };
        circular.self = circular;

        // This should throw when trying to save
        validState.player.circular = circular;
        await service.updateGameState('circular-test', validState);

        await expect(
          service.saveGameState('circular-test', 'slot-1'),
        ).rejects.toThrow();
      });

      it('should preserve object types through serialization', async () => {
        const validState = createValidGameState('types-test');
        validState.player.stats = {
          strength: 10,
          dexterity: 15,
          intelligence: 12,
        };

        await service.updateGameState('types-test', validState);
        await service.saveGameState('types-test', 'slot-1');

        const loadedState = await service.loadGameState('types-test', 'slot-1');
        expect(typeof loadedState.player.stats.strength).toBe('number');
        expect(loadedState.player.stats).toEqual({
          strength: 10,
          dexterity: 15,
          intelligence: 12,
        });
      });
    });
  });

  // ============================================================================
  // IMPORT/EXPORT (8 tests)
  // ============================================================================

});
