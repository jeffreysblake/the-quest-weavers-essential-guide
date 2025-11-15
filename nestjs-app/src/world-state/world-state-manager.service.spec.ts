import { Test, TestingModule } from '@nestjs/testing';
import { WorldStateManagerService } from './world-state-manager.service';
import { EventEmitterService } from '../events/event-emitter.service';
import { DatabaseService } from '../database/database.service';
import {
  IWorldState,
  IDoorState,
  IObjectState,
  INpcState,
  IEnvironmentState,
  IStateUpdateRequest,
  IStateQuery,
  StateChangeType,
} from './world-state.interfaces';
import { GameEventType } from '../events/event.interfaces';

describe('WorldStateManagerService', () => {
  let service: WorldStateManagerService;
  let mockEventEmitter: jest.Mocked<EventEmitterService>;
  let mockDatabaseService: jest.Mocked<Partial<DatabaseService>>;

  beforeEach(async () => {
    // Create mock event emitter
    mockEventEmitter = {
      emit: jest.fn().mockResolvedValue(undefined),
    } as any;

    // Create mock database service
    mockDatabaseService = {
      getDatabase: jest.fn().mockReturnValue({
        prepare: jest.fn().mockReturnValue({
          get: jest.fn().mockReturnValue(undefined),
          run: jest.fn(),
        }),
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorldStateManagerService,
        {
          provide: EventEmitterService,
          useValue: mockEventEmitter,
        },
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    service = module.get<WorldStateManagerService>(WorldStateManagerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    service.clearAllWorldStates();
  });

  describe('Service Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should start with no world states', () => {
      const worldState = service.getWorldState('non-existent');
      expect(worldState).toBeUndefined();
    });
  });

  describe('World State Initialization', () => {
    it('should initialize world state for a game', async () => {
      const gameId = 'game-1';

      const worldState = await service.initializeWorldState(gameId);

      expect(worldState).toBeDefined();
      expect(worldState.gameId).toBe(gameId);
      expect(worldState.doors.size).toBe(0);
      expect(worldState.objects.size).toBe(0);
      expect(worldState.npcs.size).toBe(0);
      expect(worldState.environments.size).toBe(0);
      expect(worldState.globalFlags).toEqual({});
      expect(worldState.globalVariables).toEqual({});
      expect(worldState.lastUpdated).toBeDefined();
    });

    it('should store initialized world state', async () => {
      const gameId = 'game-1';

      await service.initializeWorldState(gameId);
      const retrieved = service.getWorldState(gameId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.gameId).toBe(gameId);
    });

    it('should initialize change history', async () => {
      const gameId = 'game-1';

      await service.initializeWorldState(gameId);
      const changes = service.queryStateChanges(gameId);

      expect(changes).toEqual([]);
    });

    it('should support multiple game world states', async () => {
      const game1 = 'game-1';
      const game2 = 'game-2';

      await service.initializeWorldState(game1);
      await service.initializeWorldState(game2);

      const state1 = service.getWorldState(game1);
      const state2 = service.getWorldState(game2);

      expect(state1).toBeDefined();
      expect(state2).toBeDefined();
      expect(state1?.gameId).toBe(game1);
      expect(state2?.gameId).toBe(game2);
    });
  });

  describe('Door State Updates', () => {
    it('should update door state', async () => {
      const gameId = 'game-1';
      const request: IStateUpdateRequest = {
        gameId,
        entityId: 'door-1',
        entityType: 'door',
        changeType: StateChangeType.DOOR_OPENED,
        newState: { isOpen: true },
        changedBy: 'player-1',
      };

      const result = await service.updateState(request);

      expect(result.success).toBe(true);
      const doorState = service.getDoorState(gameId, 'door-1');
      expect(doorState?.isOpen).toBe(true);
      expect(doorState?.doorId).toBe('door-1');
    });

    it('should track who opened the door', async () => {
      const gameId = 'game-1';
      const request: IStateUpdateRequest = {
        gameId,
        entityId: 'door-1',
        entityType: 'door',
        changeType: StateChangeType.DOOR_OPENED,
        newState: { isOpen: true },
        changedBy: 'player-1',
      };

      await service.updateState(request);
      const doorState = service.getDoorState(gameId, 'door-1');

      expect(doorState?.openedBy).toBe('player-1');
      expect(doorState?.openedAt).toBeDefined();
    });

    it('should update door locked state', async () => {
      const gameId = 'game-1';
      const request: IStateUpdateRequest = {
        gameId,
        entityId: 'door-1',
        entityType: 'door',
        changeType: StateChangeType.DOOR_LOCKED,
        newState: { isLocked: true, requiredKeyId: 'key-1' },
      };

      await service.updateState(request);
      const doorState = service.getDoorState(gameId, 'door-1');

      expect(doorState?.isLocked).toBe(true);
      expect(doorState?.requiredKeyId).toBe('key-1');
    });

    it('should emit event when door state changes', async () => {
      const gameId = 'game-1';
      const request: IStateUpdateRequest = {
        gameId,
        entityId: 'door-1',
        entityType: 'door',
        changeType: StateChangeType.DOOR_OPENED,
        newState: { isOpen: true },
      };

      await service.updateState(request);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        GameEventType.CUSTOM_EVENT,
        expect.objectContaining({
          action: 'world_state_changed',
          changeType: StateChangeType.DOOR_OPENED,
          entityId: 'door-1',
          entityType: 'door',
        }),
        gameId,
      );
    });

    it('should preserve previous door state when updating', async () => {
      const gameId = 'game-1';

      await service.updateState({
        gameId,
        entityId: 'door-1',
        entityType: 'door',
        changeType: StateChangeType.DOOR_LOCKED,
        newState: { isLocked: true, isOpen: false },
      });

      await service.updateState({
        gameId,
        entityId: 'door-1',
        entityType: 'door',
        changeType: StateChangeType.DOOR_OPENED,
        newState: { isOpen: true },
      });

      const doorState = service.getDoorState(gameId, 'door-1');
      expect(doorState?.isOpen).toBe(true);
      expect(doorState?.isLocked).toBe(true);
    });

    it('should return undefined for non-existent door', () => {
      const doorState = service.getDoorState('game-1', 'non-existent');
      expect(doorState).toBeUndefined();
    });
  });

  describe('Object State Updates', () => {
    it('should update object state', async () => {
      const gameId = 'game-1';
      const request: IStateUpdateRequest = {
        gameId,
        entityId: 'object-1',
        entityType: 'object',
        changeType: StateChangeType.OBJECT_MOVED,
        newState: {
          position: { x: 10, y: 20, z: 30 },
          roomId: 'room-1',
        },
        changedBy: 'player-1',
      };

      const result = await service.updateState(request);

      expect(result.success).toBe(true);
      const objectState = service.getObjectState(gameId, 'object-1');
      expect(objectState?.position).toEqual({ x: 10, y: 20, z: 30 });
      expect(objectState?.roomId).toBe('room-1');
      expect(objectState?.exists).toBe(true);
    });

    it('should mark object as destroyed', async () => {
      const gameId = 'game-1';

      await service.updateState({
        gameId,
        entityId: 'object-1',
        entityType: 'object',
        changeType: StateChangeType.OBJECT_DESTROYED,
        newState: { exists: false },
      });

      const objectState = service.getObjectState(gameId, 'object-1');
      expect(objectState?.exists).toBe(false);
    });

    it('should update custom object state', async () => {
      const gameId = 'game-1';

      await service.updateState({
        gameId,
        entityId: 'object-1',
        entityType: 'object',
        changeType: StateChangeType.OBJECT_STATE_CHANGED,
        newState: {
          customState: {
            activated: true,
            color: 'red',
            durability: 75,
          },
        },
      });

      const objectState = service.getObjectState(gameId, 'object-1');
      expect(objectState?.customState.activated).toBe(true);
      expect(objectState?.customState.color).toBe('red');
      expect(objectState?.customState.durability).toBe(75);
    });

    it('should track who modified the object', async () => {
      const gameId = 'game-1';

      await service.updateState({
        gameId,
        entityId: 'object-1',
        entityType: 'object',
        changeType: StateChangeType.OBJECT_MOVED,
        newState: { position: { x: 0, y: 0, z: 0 } },
        changedBy: 'player-2',
      });

      const objectState = service.getObjectState(gameId, 'object-1');
      expect(objectState?.modifiedBy).toBe('player-2');
      expect(objectState?.lastModified).toBeDefined();
    });

    it('should merge custom state instead of replacing', async () => {
      const gameId = 'game-1';

      await service.updateState({
        gameId,
        entityId: 'object-1',
        entityType: 'object',
        changeType: StateChangeType.OBJECT_STATE_CHANGED,
        newState: {
          customState: { property1: 'value1', property2: 'value2' },
        },
      });

      await service.updateState({
        gameId,
        entityId: 'object-1',
        entityType: 'object',
        changeType: StateChangeType.OBJECT_STATE_CHANGED,
        newState: {
          customState: { property2: 'updated', property3: 'value3' },
        },
      });

      const objectState = service.getObjectState(gameId, 'object-1');
      expect(objectState?.customState.property1).toBe('value1');
      expect(objectState?.customState.property2).toBe('updated');
      expect(objectState?.customState.property3).toBe('value3');
    });

    it('should return undefined for non-existent object', () => {
      const objectState = service.getObjectState('game-1', 'non-existent');
      expect(objectState).toBeUndefined();
    });
  });

  describe('NPC State Updates', () => {
    it('should update NPC state', async () => {
      const gameId = 'game-1';
      const request: IStateUpdateRequest = {
        gameId,
        entityId: 'npc-1',
        entityType: 'npc',
        changeType: StateChangeType.NPC_MOVED,
        newState: {
          position: { x: 5, y: 10, z: 15 },
          roomId: 'room-2',
        },
        changedBy: 'system',
      };

      const result = await service.updateState(request);

      expect(result.success).toBe(true);
      const npcState = service.getNpcState(gameId, 'npc-1');
      expect(npcState?.position).toEqual({ x: 5, y: 10, z: 15 });
      expect(npcState?.roomId).toBe('room-2');
      expect(npcState?.alive).toBe(true);
    });

    it('should mark NPC as defeated', async () => {
      const gameId = 'game-1';

      await service.updateState({
        gameId,
        entityId: 'npc-1',
        entityType: 'npc',
        changeType: StateChangeType.NPC_DEFEATED,
        newState: { alive: false, health: 0 },
        changedBy: 'player-1',
      });

      const npcState = service.getNpcState(gameId, 'npc-1');
      expect(npcState?.alive).toBe(false);
      expect(npcState?.health).toBe(0);
    });

    it('should update NPC health and attitude', async () => {
      const gameId = 'game-1';

      await service.updateState({
        gameId,
        entityId: 'npc-1',
        entityType: 'npc',
        changeType: StateChangeType.NPC_STATE_CHANGED,
        newState: {
          health: 50,
          attitude: 'hostile',
        },
      });

      const npcState = service.getNpcState(gameId, 'npc-1');
      expect(npcState?.health).toBe(50);
      expect(npcState?.attitude).toBe('hostile');
    });

    it('should update NPC current activity', async () => {
      const gameId = 'game-1';

      await service.updateState({
        gameId,
        entityId: 'npc-1',
        entityType: 'npc',
        changeType: StateChangeType.NPC_STATE_CHANGED,
        newState: {
          currentActivity: 'patrolling',
        },
      });

      const npcState = service.getNpcState(gameId, 'npc-1');
      expect(npcState?.currentActivity).toBe('patrolling');
    });

    it('should update NPC custom state', async () => {
      const gameId = 'game-1';

      await service.updateState({
        gameId,
        entityId: 'npc-1',
        entityType: 'npc',
        changeType: StateChangeType.NPC_STATE_CHANGED,
        newState: {
          customState: {
            questGiver: true,
            questId: 'quest-1',
            dialogueState: 'friendly',
          },
        },
      });

      const npcState = service.getNpcState(gameId, 'npc-1');
      expect(npcState?.customState.questGiver).toBe(true);
      expect(npcState?.customState.questId).toBe('quest-1');
    });

    it('should return undefined for non-existent NPC', () => {
      const npcState = service.getNpcState('game-1', 'non-existent');
      expect(npcState).toBeUndefined();
    });
  });

  describe('Environment State Updates', () => {
    it('should update environment state', async () => {
      const gameId = 'game-1';
      const request: IStateUpdateRequest = {
        gameId,
        entityId: 'room-1',
        entityType: 'environment',
        changeType: StateChangeType.ENVIRONMENT_CHANGED,
        newState: {
          lighting: 75,
          temperature: 20,
        },
      };

      const result = await service.updateState(request);

      expect(result.success).toBe(true);
      const envState = service.getEnvironmentState(gameId, 'room-1');
      expect(envState?.lighting).toBe(75);
      expect(envState?.temperature).toBe(20);
    });

    it('should update weather state', async () => {
      const gameId = 'game-1';

      await service.updateState({
        gameId,
        entityId: 'room-1',
        entityType: 'environment',
        changeType: StateChangeType.WEATHER_CHANGED,
        newState: {
          weather: 'storm',
        },
      });

      const envState = service.getEnvironmentState(gameId, 'room-1');
      expect(envState?.weather).toBe('storm');
    });

    it('should update time of day', async () => {
      const gameId = 'game-1';

      await service.updateState({
        gameId,
        entityId: 'room-1',
        entityType: 'environment',
        changeType: StateChangeType.TIME_CHANGED,
        newState: {
          timeOfDay: 'midnight',
        },
      });

      const envState = service.getEnvironmentState(gameId, 'room-1');
      expect(envState?.timeOfDay).toBe('midnight');
    });

    it('should update environment custom state', async () => {
      const gameId = 'game-1';

      await service.updateState({
        gameId,
        entityId: 'room-1',
        entityType: 'environment',
        changeType: StateChangeType.ENVIRONMENT_CHANGED,
        newState: {
          customState: {
            fogDensity: 0.8,
            ambientSound: 'wind',
          },
        },
      });

      const envState = service.getEnvironmentState(gameId, 'room-1');
      expect(envState?.customState.fogDensity).toBe(0.8);
      expect(envState?.customState.ambientSound).toBe('wind');
    });

    it('should return undefined for non-existent environment', () => {
      const envState = service.getEnvironmentState('game-1', 'non-existent');
      expect(envState).toBeUndefined();
    });
  });

  describe('Global State Updates', () => {
    it('should update global flags', async () => {
      const gameId = 'game-1';

      await service.updateState({
        gameId,
        entityId: 'global',
        entityType: 'global',
        changeType: StateChangeType.CUSTOM,
        newState: {
          flags: {
            dragonDefeated: true,
            questCompleted: false,
          },
        },
      });

      const worldState = service.getWorldState(gameId);
      expect(worldState?.globalFlags.dragonDefeated).toBe(true);
      expect(worldState?.globalFlags.questCompleted).toBe(false);
    });

    it('should update global variables', async () => {
      const gameId = 'game-1';

      await service.updateState({
        gameId,
        entityId: 'global',
        entityType: 'global',
        changeType: StateChangeType.CUSTOM,
        newState: {
          variables: {
            playerScore: 1000,
            difficulty: 'hard',
            dayCount: 5,
          },
        },
      });

      const worldState = service.getWorldState(gameId);
      expect(worldState?.globalVariables.playerScore).toBe(1000);
      expect(worldState?.globalVariables.difficulty).toBe('hard');
      expect(worldState?.globalVariables.dayCount).toBe(5);
    });

    it('should merge global flags and variables', async () => {
      const gameId = 'game-1';

      await service.updateState({
        gameId,
        entityId: 'global',
        entityType: 'global',
        changeType: StateChangeType.CUSTOM,
        newState: {
          flags: { flag1: true },
          variables: { var1: 100 },
        },
      });

      await service.updateState({
        gameId,
        entityId: 'global',
        entityType: 'global',
        changeType: StateChangeType.CUSTOM,
        newState: {
          flags: { flag2: false },
          variables: { var2: 200 },
        },
      });

      const worldState = service.getWorldState(gameId);
      expect(worldState?.globalFlags.flag1).toBe(true);
      expect(worldState?.globalFlags.flag2).toBe(false);
      expect(worldState?.globalVariables.var1).toBe(100);
      expect(worldState?.globalVariables.var2).toBe(200);
    });
  });

  describe('Change History Tracking', () => {
    it('should record state changes in history', async () => {
      const gameId = 'game-1';

      await service.updateState({
        gameId,
        entityId: 'door-1',
        entityType: 'door',
        changeType: StateChangeType.DOOR_OPENED,
        newState: { isOpen: true },
        changedBy: 'player-1',
        reason: 'Player opened door',
      });

      const changes = service.queryStateChanges(gameId);
      expect(changes).toHaveLength(1);
      expect(changes[0].entityId).toBe('door-1');
      expect(changes[0].changeType).toBe(StateChangeType.DOOR_OPENED);
      expect(changes[0].changedBy).toBe('player-1');
      expect(changes[0].reason).toBe('Player opened door');
    });

    it('should track previous and new state in history', async () => {
      const gameId = 'game-1';

      await service.updateState({
        gameId,
        entityId: 'npc-1',
        entityType: 'npc',
        changeType: StateChangeType.NPC_STATE_CHANGED,
        newState: { health: 100 },
      });

      await service.updateState({
        gameId,
        entityId: 'npc-1',
        entityType: 'npc',
        changeType: StateChangeType.NPC_STATE_CHANGED,
        newState: { health: 50 },
      });

      const changes = service.queryStateChanges(gameId);
      expect(changes).toHaveLength(2);

      const secondChange = changes[1];
      expect(secondChange.previousState.health).toBe(100);
      expect(secondChange.newState.health).toBe(50);
    });

    it('should limit history to MAX_HISTORY entries', async () => {
      const gameId = 'game-1';
      const totalChanges = 1050;

      for (let i = 0; i < totalChanges; i++) {
        await service.updateState({
          gameId,
          entityId: `object-${i}`,
          entityType: 'object',
          changeType: StateChangeType.OBJECT_MOVED,
          newState: { position: { x: i, y: 0, z: 0 } },
        });
      }

      const changes = service.queryStateChanges(gameId);
      expect(changes.length).toBeLessThanOrEqual(1000);
    });

    it('should generate unique IDs for each change', async () => {
      const gameId = 'game-1';

      await service.updateState({
        gameId,
        entityId: 'door-1',
        entityType: 'door',
        changeType: StateChangeType.DOOR_OPENED,
        newState: { isOpen: true },
      });

      await service.updateState({
        gameId,
        entityId: 'door-2',
        entityType: 'door',
        changeType: StateChangeType.DOOR_OPENED,
        newState: { isOpen: true },
      });

      const changes = service.queryStateChanges(gameId);
      expect(changes[0].id).toBeDefined();
      expect(changes[1].id).toBeDefined();
      expect(changes[0].id).not.toBe(changes[1].id);
    });

    it('should track timestamp for each change', async () => {
      const gameId = 'game-1';
      const beforeTime = new Date().toISOString();

      await service.updateState({
        gameId,
        entityId: 'door-1',
        entityType: 'door',
        changeType: StateChangeType.DOOR_OPENED,
        newState: { isOpen: true },
      });

      const afterTime = new Date().toISOString();
      const changes = service.queryStateChanges(gameId);

      expect(changes[0].timestamp).toBeDefined();
      expect(changes[0].timestamp >= beforeTime).toBe(true);
      expect(changes[0].timestamp <= afterTime).toBe(true);
    });
  });

  describe('State Change Queries', () => {
    beforeEach(async () => {
      const gameId = 'game-1';

      // Create various state changes
      await service.updateState({
        gameId,
        entityId: 'door-1',
        entityType: 'door',
        changeType: StateChangeType.DOOR_OPENED,
        newState: { isOpen: true },
        changedBy: 'player-1',
      });

      await service.updateState({
        gameId,
        entityId: 'object-1',
        entityType: 'object',
        changeType: StateChangeType.OBJECT_MOVED,
        newState: { position: { x: 0, y: 0, z: 0 } },
        changedBy: 'player-1',
      });

      await service.updateState({
        gameId,
        entityId: 'npc-1',
        entityType: 'npc',
        changeType: StateChangeType.NPC_DEFEATED,
        newState: { alive: false },
        changedBy: 'player-2',
      });

      await service.updateState({
        gameId,
        entityId: 'door-2',
        entityType: 'door',
        changeType: StateChangeType.DOOR_LOCKED,
        newState: { isLocked: true },
        changedBy: 'system',
      });
    });

    it('should query all changes when no filter provided', () => {
      const changes = service.queryStateChanges('game-1');
      expect(changes).toHaveLength(4);
    });

    it('should query changes by entity type', () => {
      const query: IStateQuery = { entityType: 'door' };
      const changes = service.queryStateChanges('game-1', query);

      expect(changes).toHaveLength(2);
      expect(changes.every((c) => c.entityType === 'door')).toBe(true);
    });

    it('should query changes by entity ID', () => {
      const query: IStateQuery = { entityId: 'door-1' };
      const changes = service.queryStateChanges('game-1', query);

      expect(changes).toHaveLength(1);
      expect(changes[0].entityId).toBe('door-1');
    });

    it('should query changes by changedBy', () => {
      const query: IStateQuery = { changedBy: 'player-1' };
      const changes = service.queryStateChanges('game-1', query);

      expect(changes).toHaveLength(2);
      expect(changes.every((c) => c.changedBy === 'player-1')).toBe(true);
    });

    it('should query changes by change type', () => {
      const query: IStateQuery = { changeType: StateChangeType.DOOR_OPENED };
      const changes = service.queryStateChanges('game-1', query);

      expect(changes).toHaveLength(1);
      expect(changes[0].changeType).toBe(StateChangeType.DOOR_OPENED);
    });

    it('should query changes by time range', async () => {
      const gameId = 'game-1';
      const midTime = new Date().toISOString();

      await new Promise((resolve) => setTimeout(resolve, 10));

      await service.updateState({
        gameId,
        entityId: 'object-2',
        entityType: 'object',
        changeType: StateChangeType.OBJECT_CREATED,
        newState: { exists: true },
      });

      const query: IStateQuery = { fromTimestamp: midTime };
      const changes = service.queryStateChanges(gameId, query);

      expect(changes.length).toBeGreaterThan(0);
      expect(changes.every((c) => c.timestamp >= midTime)).toBe(true);
    });

    it('should query with multiple filters', () => {
      const query: IStateQuery = {
        entityType: 'door',
        changedBy: 'player-1',
      };
      const changes = service.queryStateChanges('game-1', query);

      expect(changes).toHaveLength(1);
      expect(changes[0].entityId).toBe('door-1');
    });

    it('should return empty array for non-matching query', () => {
      const query: IStateQuery = { entityType: 'environment' };
      const changes = service.queryStateChanges('game-1', query);

      expect(changes).toEqual([]);
    });

    it('should return empty array for non-existent game', () => {
      const changes = service.queryStateChanges('non-existent');
      expect(changes).toEqual([]);
    });
  });

  describe('State Reversion', () => {
    it('should revert a state change', async () => {
      const gameId = 'game-1';

      // First create initial state
      await service.updateState({
        gameId,
        entityId: 'door-1',
        entityType: 'door',
        changeType: StateChangeType.DOOR_CLOSED,
        newState: { isOpen: false },
      });

      // Then open the door
      await service.updateState({
        gameId,
        entityId: 'door-1',
        entityType: 'door',
        changeType: StateChangeType.DOOR_OPENED,
        newState: { isOpen: true },
      });

      const changes = service.queryStateChanges(gameId);
      const changeId = changes[1].id; // Get the second change (opening)

      const result = await service.revertStateChange(gameId, changeId);

      expect(result.success).toBe(true);
      const doorState = service.getDoorState(gameId, 'door-1');
      expect(doorState?.isOpen).toBe(false);
    });

    it('should fail to revert non-existent change', async () => {
      const result = await service.revertStateChange('game-1', 'non-existent');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should fail to revert change without previous state', async () => {
      const gameId = 'game-1';

      await service.updateState({
        gameId,
        entityId: 'door-1',
        entityType: 'door',
        changeType: StateChangeType.DOOR_OPENED,
        newState: { isOpen: true },
      });

      const changes = service.queryStateChanges(gameId);
      const changeId = changes[0].id;

      // Remove previous state
      changes[0].previousState = undefined;

      const result = await service.revertStateChange(gameId, changeId);

      expect(result.success).toBe(false);
      expect(result.message).toContain('no previous state');
    });

    it('should create revert change in history', async () => {
      const gameId = 'game-1';

      // First create initial state
      await service.updateState({
        gameId,
        entityId: 'npc-1',
        entityType: 'npc',
        changeType: StateChangeType.NPC_SPAWNED,
        newState: { health: 100 },
      });

      // Then change health
      await service.updateState({
        gameId,
        entityId: 'npc-1',
        entityType: 'npc',
        changeType: StateChangeType.NPC_STATE_CHANGED,
        newState: { health: 50 },
      });

      const changes = service.queryStateChanges(gameId);
      const changeId = changes[1].id; // Get the second change

      await service.revertStateChange(gameId, changeId);

      const updatedChanges = service.queryStateChanges(gameId);
      expect(updatedChanges.length).toBeGreaterThan(2);

      const revertChange = updatedChanges[updatedChanges.length - 1];
      expect(revertChange.reason).toContain('Reverted change');
    });
  });

  describe('World State Statistics', () => {
    it('should return undefined for non-existent game', () => {
      const stats = service.getWorldStateStats('non-existent');
      expect(stats).toBeUndefined();
    });

    it('should calculate door statistics', async () => {
      const gameId = 'game-1';

      await service.updateState({
        gameId,
        entityId: 'door-1',
        entityType: 'door',
        changeType: StateChangeType.DOOR_OPENED,
        newState: { isOpen: true, isLocked: false },
      });

      await service.updateState({
        gameId,
        entityId: 'door-2',
        entityType: 'door',
        changeType: StateChangeType.DOOR_LOCKED,
        newState: { isOpen: false, isLocked: true },
      });

      await service.updateState({
        gameId,
        entityId: 'door-3',
        entityType: 'door',
        changeType: StateChangeType.DOOR_OPENED,
        newState: { isOpen: true, isLocked: true },
      });

      const stats = service.getWorldStateStats(gameId);
      expect(stats?.totalDoors).toBe(3);
      expect(stats?.openDoors).toBe(2);
      expect(stats?.lockedDoors).toBe(2);
    });

    it('should calculate object statistics', async () => {
      const gameId = 'game-1';

      await service.updateState({
        gameId,
        entityId: 'object-1',
        entityType: 'object',
        changeType: StateChangeType.OBJECT_CREATED,
        newState: { exists: true },
      });

      await service.updateState({
        gameId,
        entityId: 'object-2',
        entityType: 'object',
        changeType: StateChangeType.OBJECT_DESTROYED,
        newState: { exists: false },
      });

      await service.updateState({
        gameId,
        entityId: 'object-3',
        entityType: 'object',
        changeType: StateChangeType.OBJECT_CREATED,
        newState: { exists: true },
      });

      const stats = service.getWorldStateStats(gameId);
      expect(stats?.totalObjects).toBe(3);
      expect(stats?.activeObjects).toBe(2);
      expect(stats?.destroyedObjects).toBe(1);
    });

    it('should calculate NPC statistics', async () => {
      const gameId = 'game-1';

      await service.updateState({
        gameId,
        entityId: 'npc-1',
        entityType: 'npc',
        changeType: StateChangeType.NPC_SPAWNED,
        newState: { alive: true },
      });

      await service.updateState({
        gameId,
        entityId: 'npc-2',
        entityType: 'npc',
        changeType: StateChangeType.NPC_DEFEATED,
        newState: { alive: false },
      });

      await service.updateState({
        gameId,
        entityId: 'npc-3',
        entityType: 'npc',
        changeType: StateChangeType.NPC_SPAWNED,
        newState: { alive: true },
      });

      const stats = service.getWorldStateStats(gameId);
      expect(stats?.totalNpcs).toBe(3);
      expect(stats?.aliveNpcs).toBe(2);
      expect(stats?.defeatedNpcs).toBe(1);
    });

    it('should count total changes', async () => {
      const gameId = 'game-1';

      await service.updateState({
        gameId,
        entityId: 'door-1',
        entityType: 'door',
        changeType: StateChangeType.DOOR_OPENED,
        newState: { isOpen: true },
      });

      await service.updateState({
        gameId,
        entityId: 'object-1',
        entityType: 'object',
        changeType: StateChangeType.OBJECT_MOVED,
        newState: { position: { x: 0, y: 0, z: 0 } },
      });

      const stats = service.getWorldStateStats(gameId);
      expect(stats?.totalChanges).toBe(2);
    });

    it('should count environments', async () => {
      const gameId = 'game-1';

      await service.updateState({
        gameId,
        entityId: 'room-1',
        entityType: 'environment',
        changeType: StateChangeType.ENVIRONMENT_CHANGED,
        newState: { lighting: 50 },
      });

      await service.updateState({
        gameId,
        entityId: 'room-2',
        entityType: 'environment',
        changeType: StateChangeType.WEATHER_CHANGED,
        newState: { weather: 'rain' },
      });

      const stats = service.getWorldStateStats(gameId);
      expect(stats?.totalEnvironments).toBe(2);
    });
  });

  describe('JSON Export/Import', () => {
    it('should export world state to JSON', async () => {
      const gameId = 'game-1';

      await service.updateState({
        gameId,
        entityId: 'door-1',
        entityType: 'door',
        changeType: StateChangeType.DOOR_OPENED,
        newState: { isOpen: true },
      });

      await service.updateState({
        gameId,
        entityId: 'object-1',
        entityType: 'object',
        changeType: StateChangeType.OBJECT_MOVED,
        newState: { position: { x: 10, y: 20, z: 30 } },
      });

      const json = service.exportWorldState(gameId);
      expect(json).toBeDefined();

      const data = JSON.parse(json!);
      expect(data.gameId).toBe(gameId);
      expect(data.doors).toBeDefined();
      expect(data.objects).toBeDefined();
    });

    it('should return undefined when exporting non-existent game', () => {
      const json = service.exportWorldState('non-existent');
      expect(json).toBeUndefined();
    });

    it('should import world state from JSON', async () => {
      const gameId = 'game-1';

      const worldStateData = {
        gameId,
        doors: [
          {
            doorId: 'door-1',
            isOpen: true,
            isLocked: false,
          },
        ],
        objects: [
          {
            objectId: 'object-1',
            exists: true,
            position: { x: 5, y: 10, z: 15 },
            customState: {},
            lastModified: new Date().toISOString(),
          },
        ],
        npcs: [],
        environments: [],
        globalFlags: { flag1: true },
        globalVariables: { var1: 100 },
        lastUpdated: new Date().toISOString(),
      };

      const json = JSON.stringify(worldStateData);
      const result = service.importWorldState(gameId, json);

      expect(result).toBe(true);

      const doorState = service.getDoorState(gameId, 'door-1');
      expect(doorState?.isOpen).toBe(true);

      const objectState = service.getObjectState(gameId, 'object-1');
      expect(objectState?.position).toEqual({ x: 5, y: 10, z: 15 });

      const worldState = service.getWorldState(gameId);
      expect(worldState?.globalFlags.flag1).toBe(true);
      expect(worldState?.globalVariables.var1).toBe(100);
    });

    it('should fail to import invalid JSON', () => {
      const result = service.importWorldState('game-1', 'invalid json');
      expect(result).toBe(false);
    });

    it('should export and import complete world state', async () => {
      const gameId = 'game-1';

      // Create complex world state
      await service.updateState({
        gameId,
        entityId: 'door-1',
        entityType: 'door',
        changeType: StateChangeType.DOOR_OPENED,
        newState: { isOpen: true, isLocked: false },
      });

      await service.updateState({
        gameId,
        entityId: 'npc-1',
        entityType: 'npc',
        changeType: StateChangeType.NPC_SPAWNED,
        newState: { alive: true, health: 100, attitude: 'friendly' },
      });

      await service.updateState({
        gameId,
        entityId: 'room-1',
        entityType: 'environment',
        changeType: StateChangeType.ENVIRONMENT_CHANGED,
        newState: { lighting: 75, weather: 'clear', timeOfDay: 'noon' },
      });

      await service.updateState({
        gameId,
        entityId: 'global',
        entityType: 'global',
        changeType: StateChangeType.CUSTOM,
        newState: {
          flags: { questComplete: true },
          variables: { score: 5000 },
        },
      });

      // Export
      const json = service.exportWorldState(gameId);

      // Clear
      service.clearWorldState(gameId);
      expect(service.getWorldState(gameId)).toBeUndefined();

      // Import
      service.importWorldState(gameId, json!);

      // Verify
      const doorState = service.getDoorState(gameId, 'door-1');
      expect(doorState?.isOpen).toBe(true);

      const npcState = service.getNpcState(gameId, 'npc-1');
      expect(npcState?.health).toBe(100);

      const envState = service.getEnvironmentState(gameId, 'room-1');
      expect(envState?.lighting).toBe(75);

      const worldState = service.getWorldState(gameId);
      expect(worldState?.globalFlags.questComplete).toBe(true);
      expect(worldState?.globalVariables.score).toBe(5000);
    });
  });

  describe('Clear and Reset', () => {
    it('should clear world state for a specific game', async () => {
      const gameId = 'game-1';

      await service.updateState({
        gameId,
        entityId: 'door-1',
        entityType: 'door',
        changeType: StateChangeType.DOOR_OPENED,
        newState: { isOpen: true },
      });

      service.clearWorldState(gameId);

      expect(service.getWorldState(gameId)).toBeUndefined();
      expect(service.queryStateChanges(gameId)).toEqual([]);
    });

    it('should clear all world states', async () => {
      const game1 = 'game-1';
      const game2 = 'game-2';

      await service.updateState({
        gameId: game1,
        entityId: 'door-1',
        entityType: 'door',
        changeType: StateChangeType.DOOR_OPENED,
        newState: { isOpen: true },
      });

      await service.updateState({
        gameId: game2,
        entityId: 'door-2',
        entityType: 'door',
        changeType: StateChangeType.DOOR_OPENED,
        newState: { isOpen: true },
      });

      service.clearAllWorldStates();

      expect(service.getWorldState(game1)).toBeUndefined();
      expect(service.getWorldState(game2)).toBeUndefined();
    });

    it('should preserve other games when clearing specific game', async () => {
      const game1 = 'game-1';
      const game2 = 'game-2';

      await service.updateState({
        gameId: game1,
        entityId: 'door-1',
        entityType: 'door',
        changeType: StateChangeType.DOOR_OPENED,
        newState: { isOpen: true },
      });

      await service.updateState({
        gameId: game2,
        entityId: 'door-2',
        entityType: 'door',
        changeType: StateChangeType.DOOR_OPENED,
        newState: { isOpen: true },
      });

      service.clearWorldState(game1);

      expect(service.getWorldState(game1)).toBeUndefined();
      expect(service.getWorldState(game2)).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle unknown entity type gracefully', async () => {
      const result = await service.updateState({
        gameId: 'game-1',
        entityId: 'entity-1',
        entityType: 'unknown' as any,
        changeType: StateChangeType.CUSTOM,
        newState: {},
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Unknown entity type');
    });

    it('should auto-initialize world state if not exists', async () => {
      const gameId = 'new-game';

      await service.updateState({
        gameId,
        entityId: 'door-1',
        entityType: 'door',
        changeType: StateChangeType.DOOR_OPENED,
        newState: { isOpen: true },
      });

      const worldState = service.getWorldState(gameId);
      expect(worldState).toBeDefined();
      expect(worldState?.gameId).toBe(gameId);
    });

    it('should handle concurrent state updates', async () => {
      const gameId = 'game-1';

      const updates = Array.from({ length: 10 }, (_, i) =>
        service.updateState({
          gameId,
          entityId: `door-${i}`,
          entityType: 'door',
          changeType: StateChangeType.DOOR_OPENED,
          newState: { isOpen: true },
        }),
      );

      await Promise.all(updates);

      const changes = service.queryStateChanges(gameId);
      expect(changes).toHaveLength(10);
    });

    it('should update lastUpdated timestamp on state changes', async () => {
      const gameId = 'game-1';
      await service.initializeWorldState(gameId);

      const initialState = service.getWorldState(gameId);
      const initialTimestamp = initialState?.lastUpdated;

      await new Promise((resolve) => setTimeout(resolve, 10));

      await service.updateState({
        gameId,
        entityId: 'door-1',
        entityType: 'door',
        changeType: StateChangeType.DOOR_OPENED,
        newState: { isOpen: true },
      });

      const updatedState = service.getWorldState(gameId);
      expect(updatedState?.lastUpdated).not.toBe(initialTimestamp);
    });

    it('should handle empty custom state objects', async () => {
      const gameId = 'game-1';

      await service.updateState({
        gameId,
        entityId: 'object-1',
        entityType: 'object',
        changeType: StateChangeType.OBJECT_CREATED,
        newState: { exists: true },
      });

      const objectState = service.getObjectState(gameId, 'object-1');
      expect(objectState?.customState).toEqual({});
    });

    it('should handle multiple games independently', async () => {
      const game1 = 'game-1';
      const game2 = 'game-2';

      await service.updateState({
        gameId: game1,
        entityId: 'door-1',
        entityType: 'door',
        changeType: StateChangeType.DOOR_OPENED,
        newState: { isOpen: true },
      });

      await service.updateState({
        gameId: game2,
        entityId: 'door-1',
        entityType: 'door',
        changeType: StateChangeType.DOOR_LOCKED,
        newState: { isLocked: true },
      });

      const door1 = service.getDoorState(game1, 'door-1');
      const door2 = service.getDoorState(game2, 'door-1');

      expect(door1?.isOpen).toBe(true);
      expect(door1?.isLocked).toBe(false);
      expect(door2?.isOpen).toBe(false);
      expect(door2?.isLocked).toBe(true);
    });
  });
});
