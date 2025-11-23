import { Test, TestingModule } from '@nestjs/testing';
import { RoomEntityManagerHelper } from './room-entity-manager.helper';
import { EntityService } from '../entity.service';
import { IRoom } from '../room.interface';

describe('RoomEntityManagerHelper', () => {
  let helper: RoomEntityManagerHelper;
  let mockEntityService: jest.Mocked<Partial<EntityService>>;

  // Helper to create test room
  const createTestRoom = (overrides: Partial<IRoom> = {}): IRoom => ({
    id: 'room-1',
    name: 'Test Room',
    description: 'A test room',
    type: 'room',
    position: { x: 0, y: 0, z: 0 },
    width: 10,
    height: 10,
    size: { width: 10, height: 10, depth: 3 },
    objects: [],
    players: [],
    gameId: 'test-game',
    ...overrides,
  });

  // Helper to create test entity
  const createTestEntity = (id: string, type: string = 'object') => ({
    id,
    name: `Test ${type}`,
    type,
    position: { x: 0, y: 0, z: 0 },
  });

  beforeEach(async () => {
    // Create mock entity service
    mockEntityService = {
      getEntity: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomEntityManagerHelper,
        { provide: EntityService, useValue: mockEntityService },
      ],
    }).compile();

    helper = module.get<RoomEntityManagerHelper>(RoomEntityManagerHelper);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // ADD PLAYER TO ROOM (9 tests)
  // ============================================================================
  describe('addPlayerToRoom', () => {
    it('should add player to empty room', async () => {
      const room = createTestRoom();
      const player = createTestEntity('player-1', 'player');
      mockEntityService.getEntity.mockReturnValue(player);

      const result = await helper.addPlayerToRoom(room, 'player-1');

      expect(result).toBe(true);
      expect(room.players).toContain('player-1');
      expect(room.players).toHaveLength(1);
      expect(mockEntityService.getEntity).toHaveBeenCalledWith('player-1');
    });

    it('should add player to room with existing players', async () => {
      const room = createTestRoom({ players: ['player-1', 'player-2'] });
      const player = createTestEntity('player-3', 'player');
      mockEntityService.getEntity.mockReturnValue(player);

      const result = await helper.addPlayerToRoom(room, 'player-3');

      expect(result).toBe(true);
      expect(room.players).toContain('player-3');
      expect(room.players).toHaveLength(3);
    });

    it('should initialize players array if null or undefined', async () => {
      const room = createTestRoom({ players: null as any });
      const player = createTestEntity('player-1', 'player');
      mockEntityService.getEntity.mockReturnValue(player);

      const result = await helper.addPlayerToRoom(room, 'player-1');

      expect(result).toBe(true);
      expect(Array.isArray(room.players)).toBe(true);
      expect(room.players).toContain('player-1');
    });

    it('should not add duplicate player', async () => {
      const room = createTestRoom({ players: ['player-1'] });
      const player = createTestEntity('player-1', 'player');
      mockEntityService.getEntity.mockReturnValue(player);

      const result = await helper.addPlayerToRoom(room, 'player-1');

      expect(result).toBe(false);
      expect(room.players).toHaveLength(1);
    });

    it('should return false when player not found', async () => {
      const room = createTestRoom();
      mockEntityService.getEntity.mockReturnValue(null);

      const result = await helper.addPlayerToRoom(room, 'nonexistent-player');

      expect(result).toBe(false);
      expect(room.players).toHaveLength(0);
    });

    it('should enforce max players per room limit (100)', async () => {
      // Create room with 100 players
      const players = Array.from({ length: 100 }, (_, i) => `player-${i}`);
      const room = createTestRoom({ players });
      const player = createTestEntity('player-101', 'player');
      mockEntityService.getEntity.mockReturnValue(player);

      const result = await helper.addPlayerToRoom(room, 'player-101');

      expect(result).toBe(false);
      expect(room.players).toHaveLength(100);
      expect(room.players).not.toContain('player-101');
    });

    it('should allow adding player at exactly 99 (one under limit)', async () => {
      const players = Array.from({ length: 99 }, (_, i) => `player-${i}`);
      const room = createTestRoom({ players });
      const player = createTestEntity('player-99', 'player');
      mockEntityService.getEntity.mockReturnValue(player);

      const result = await helper.addPlayerToRoom(room, 'player-99');

      expect(result).toBe(true);
      expect(room.players).toHaveLength(100);
    });

    it('should handle concurrent additions with mutex', async () => {
      const room = createTestRoom();
      const player1 = createTestEntity('player-1', 'player');
      const player2 = createTestEntity('player-2', 'player');
      mockEntityService.getEntity.mockImplementation((id) => {
        if (id === 'player-1') return player1;
        if (id === 'player-2') return player2;
        return null;
      });

      // Simulate concurrent additions
      const results = await Promise.all([
        helper.addPlayerToRoom(room, 'player-1'),
        helper.addPlayerToRoom(room, 'player-2'),
      ]);

      expect(results).toEqual([true, true]);
      expect(room.players).toHaveLength(2);
      expect(room.players).toContain('player-1');
      expect(room.players).toContain('player-2');
    });

    it('should prevent duplicate addition in concurrent scenario', async () => {
      const room = createTestRoom();
      const player = createTestEntity('player-1', 'player');
      mockEntityService.getEntity.mockReturnValue(player);

      // Try to add same player concurrently
      const results = await Promise.all([
        helper.addPlayerToRoom(room, 'player-1'),
        helper.addPlayerToRoom(room, 'player-1'),
        helper.addPlayerToRoom(room, 'player-1'),
      ]);

      // Only one should succeed
      const successCount = results.filter((r) => r === true).length;
      expect(successCount).toBe(1);
      expect(room.players).toHaveLength(1);
    });
  });

  // ============================================================================
  // ADD OBJECT TO ROOM (9 tests)
  // ============================================================================
  describe('addObjectToRoom', () => {
    it('should add object to empty room', async () => {
      const room = createTestRoom();
      const object = createTestEntity('obj-1', 'object');
      mockEntityService.getEntity.mockReturnValue(object);

      const result = await helper.addObjectToRoom(room, 'obj-1');

      expect(result).toBe(true);
      expect(room.objects).toContain('obj-1');
      expect(room.objects).toHaveLength(1);
      expect(mockEntityService.getEntity).toHaveBeenCalledWith('obj-1');
    });

    it('should add object to room with existing objects', async () => {
      const room = createTestRoom({ objects: ['obj-1', 'obj-2'] });
      const object = createTestEntity('obj-3', 'object');
      mockEntityService.getEntity.mockReturnValue(object);

      const result = await helper.addObjectToRoom(room, 'obj-3');

      expect(result).toBe(true);
      expect(room.objects).toContain('obj-3');
      expect(room.objects).toHaveLength(3);
    });

    it('should initialize objects array if null or undefined', async () => {
      const room = createTestRoom({ objects: null as any });
      const object = createTestEntity('obj-1', 'object');
      mockEntityService.getEntity.mockReturnValue(object);

      const result = await helper.addObjectToRoom(room, 'obj-1');

      expect(result).toBe(true);
      expect(Array.isArray(room.objects)).toBe(true);
      expect(room.objects).toContain('obj-1');
    });

    it('should not add duplicate object', async () => {
      const room = createTestRoom({ objects: ['obj-1'] });
      const object = createTestEntity('obj-1', 'object');
      mockEntityService.getEntity.mockReturnValue(object);

      const result = await helper.addObjectToRoom(room, 'obj-1');

      expect(result).toBe(false);
      expect(room.objects).toHaveLength(1);
    });

    it('should return false when object not found', async () => {
      const room = createTestRoom();
      mockEntityService.getEntity.mockReturnValue(null);

      const result = await helper.addObjectToRoom(room, 'nonexistent-obj');

      expect(result).toBe(false);
      expect(room.objects).toHaveLength(0);
    });

    it('should enforce max objects per room limit (1000)', async () => {
      // Create room with 1000 objects
      const objects = Array.from({ length: 1000 }, (_, i) => `obj-${i}`);
      const room = createTestRoom({ objects });
      const object = createTestEntity('obj-1001', 'object');
      mockEntityService.getEntity.mockReturnValue(object);

      const result = await helper.addObjectToRoom(room, 'obj-1001');

      expect(result).toBe(false);
      expect(room.objects).toHaveLength(1000);
      expect(room.objects).not.toContain('obj-1001');
    });

    it('should allow adding object at exactly 999 (one under limit)', async () => {
      const objects = Array.from({ length: 999 }, (_, i) => `obj-${i}`);
      const room = createTestRoom({ objects });
      const object = createTestEntity('obj-999', 'object');
      mockEntityService.getEntity.mockReturnValue(object);

      const result = await helper.addObjectToRoom(room, 'obj-999');

      expect(result).toBe(true);
      expect(room.objects).toHaveLength(1000);
    });

    it('should handle concurrent additions with mutex', async () => {
      const room = createTestRoom();
      const obj1 = createTestEntity('obj-1', 'object');
      const obj2 = createTestEntity('obj-2', 'object');
      mockEntityService.getEntity.mockImplementation((id) => {
        if (id === 'obj-1') return obj1;
        if (id === 'obj-2') return obj2;
        return null;
      });

      // Simulate concurrent additions
      const results = await Promise.all([
        helper.addObjectToRoom(room, 'obj-1'),
        helper.addObjectToRoom(room, 'obj-2'),
      ]);

      expect(results).toEqual([true, true]);
      expect(room.objects).toHaveLength(2);
      expect(room.objects).toContain('obj-1');
      expect(room.objects).toContain('obj-2');
    });

    it('should prevent duplicate addition in concurrent scenario', async () => {
      const room = createTestRoom();
      const object = createTestEntity('obj-1', 'object');
      mockEntityService.getEntity.mockReturnValue(object);

      // Try to add same object concurrently
      const results = await Promise.all([
        helper.addObjectToRoom(room, 'obj-1'),
        helper.addObjectToRoom(room, 'obj-1'),
        helper.addObjectToRoom(room, 'obj-1'),
      ]);

      // Only one should succeed
      const successCount = results.filter((r) => r === true).length;
      expect(successCount).toBe(1);
      expect(room.objects).toHaveLength(1);
    });
  });

  // ============================================================================
  // REMOVE PLAYER FROM ROOM (5 tests)
  // ============================================================================
  describe('removePlayerFromRoom', () => {
    it('should remove player from room', async () => {
      const room = createTestRoom({ players: ['player-1', 'player-2'] });

      const result = await helper.removePlayerFromRoom(room, 'player-1');

      expect(result).toBe(true);
      expect(room.players).not.toContain('player-1');
      expect(room.players).toHaveLength(1);
      expect(room.players).toContain('player-2');
    });

    it('should return false when player not in room', async () => {
      const room = createTestRoom({ players: ['player-1'] });

      const result = await helper.removePlayerFromRoom(room, 'player-2');

      expect(result).toBe(false);
      expect(room.players).toHaveLength(1);
    });

    it('should return false when players array is null or undefined', async () => {
      const room = createTestRoom({ players: null as any });

      const result = await helper.removePlayerFromRoom(room, 'player-1');

      expect(result).toBe(false);
    });

    it('should handle concurrent removals with mutex', async () => {
      const room = createTestRoom({ players: ['player-1', 'player-2', 'player-3'] });

      const results = await Promise.all([
        helper.removePlayerFromRoom(room, 'player-1'),
        helper.removePlayerFromRoom(room, 'player-2'),
      ]);

      expect(results).toEqual([true, true]);
      expect(room.players).toHaveLength(1);
      expect(room.players).toContain('player-3');
    });

    it('should handle duplicate removal attempts', async () => {
      const room = createTestRoom({ players: ['player-1'] });

      const results = await Promise.all([
        helper.removePlayerFromRoom(room, 'player-1'),
        helper.removePlayerFromRoom(room, 'player-1'),
      ]);

      // Only one should succeed
      const successCount = results.filter((r) => r === true).length;
      expect(successCount).toBe(1);
      expect(room.players).toHaveLength(0);
    });
  });

  // ============================================================================
  // REMOVE OBJECT FROM ROOM (5 tests)
  // ============================================================================
  describe('removeObjectFromRoom', () => {
    it('should remove object from room', async () => {
      const room = createTestRoom({ objects: ['obj-1', 'obj-2'] });

      const result = await helper.removeObjectFromRoom(room, 'obj-1');

      expect(result).toBe(true);
      expect(room.objects).not.toContain('obj-1');
      expect(room.objects).toHaveLength(1);
      expect(room.objects).toContain('obj-2');
    });

    it('should return false when object not in room', async () => {
      const room = createTestRoom({ objects: ['obj-1'] });

      const result = await helper.removeObjectFromRoom(room, 'obj-2');

      expect(result).toBe(false);
      expect(room.objects).toHaveLength(1);
    });

    it('should return false when objects array is null or undefined', async () => {
      const room = createTestRoom({ objects: null as any });

      const result = await helper.removeObjectFromRoom(room, 'obj-1');

      expect(result).toBe(false);
    });

    it('should handle concurrent removals with mutex', async () => {
      const room = createTestRoom({ objects: ['obj-1', 'obj-2', 'obj-3'] });

      const results = await Promise.all([
        helper.removeObjectFromRoom(room, 'obj-1'),
        helper.removeObjectFromRoom(room, 'obj-2'),
      ]);

      expect(results).toEqual([true, true]);
      expect(room.objects).toHaveLength(1);
      expect(room.objects).toContain('obj-3');
    });

    it('should handle duplicate removal attempts', async () => {
      const room = createTestRoom({ objects: ['obj-1'] });

      const results = await Promise.all([
        helper.removeObjectFromRoom(room, 'obj-1'),
        helper.removeObjectFromRoom(room, 'obj-1'),
      ]);

      // Only one should succeed
      const successCount = results.filter((r) => r === true).length;
      expect(successCount).toBe(1);
      expect(room.objects).toHaveLength(0);
    });
  });

  // ============================================================================
  // GET OBJECTS IN ROOM (4 tests)
  // ============================================================================
  describe('getObjectsInRoom', () => {
    it('should return all objects in room', () => {
      const obj1 = createTestEntity('obj-1', 'object');
      const obj2 = createTestEntity('obj-2', 'object');
      const room = createTestRoom({ objects: ['obj-1', 'obj-2'] });

      mockEntityService.getEntity.mockImplementation((id) => {
        if (id === 'obj-1') return obj1;
        if (id === 'obj-2') return obj2;
        return null;
      });

      const result = helper.getObjectsInRoom(room);

      expect(result).toHaveLength(2);
      expect(result).toContain(obj1);
      expect(result).toContain(obj2);
    });

    it('should filter out non-existent objects', () => {
      const obj1 = createTestEntity('obj-1', 'object');
      const room = createTestRoom({ objects: ['obj-1', 'obj-2', 'obj-3'] });

      mockEntityService.getEntity.mockImplementation((id) => {
        if (id === 'obj-1') return obj1;
        return null;
      });

      const result = helper.getObjectsInRoom(room);

      expect(result).toHaveLength(1);
      expect(result).toContain(obj1);
    });

    it('should return empty array when objects is null or undefined', () => {
      const room = createTestRoom({ objects: null as any });

      const result = helper.getObjectsInRoom(room);

      expect(result).toEqual([]);
    });

    it('should return empty array when objects is not an array', () => {
      const room = createTestRoom({ objects: 'invalid' as any });

      const result = helper.getObjectsInRoom(room);

      expect(result).toEqual([]);
    });
  });

  // ============================================================================
  // GET PLAYERS IN ROOM (4 tests)
  // ============================================================================
  describe('getPlayersInRoom', () => {
    it('should return all players in room', () => {
      const player1 = createTestEntity('player-1', 'player');
      const player2 = createTestEntity('player-2', 'player');
      const room = createTestRoom({ players: ['player-1', 'player-2'] });

      mockEntityService.getEntity.mockImplementation((id) => {
        if (id === 'player-1') return player1;
        if (id === 'player-2') return player2;
        return null;
      });

      const result = helper.getPlayersInRoom(room);

      expect(result).toHaveLength(2);
      expect(result).toContain(player1);
      expect(result).toContain(player2);
    });

    it('should filter out non-existent players', () => {
      const player1 = createTestEntity('player-1', 'player');
      const room = createTestRoom({ players: ['player-1', 'player-2', 'player-3'] });

      mockEntityService.getEntity.mockImplementation((id) => {
        if (id === 'player-1') return player1;
        return null;
      });

      const result = helper.getPlayersInRoom(room);

      expect(result).toHaveLength(1);
      expect(result).toContain(player1);
    });

    it('should return empty array when players is null or undefined', () => {
      const room = createTestRoom({ players: null as any });

      const result = helper.getPlayersInRoom(room);

      expect(result).toEqual([]);
    });

    it('should return empty array when players is not an array', () => {
      const room = createTestRoom({ players: 'invalid' as any });

      const result = helper.getPlayersInRoom(room);

      expect(result).toEqual([]);
    });
  });

  // ============================================================================
  // GET ROOM ENTITIES (3 tests)
  // ============================================================================
  describe('getRoomEntities', () => {
    it('should return both players and objects', () => {
      const room = createTestRoom({
        players: ['player-1', 'player-2'],
        objects: ['obj-1', 'obj-2', 'obj-3'],
      });

      const result = helper.getRoomEntities(room);

      expect(result.players).toEqual(['player-1', 'player-2']);
      expect(result.objects).toEqual(['obj-1', 'obj-2', 'obj-3']);
    });

    it('should return empty arrays when players/objects are null or undefined', () => {
      const room = createTestRoom({
        players: null as any,
        objects: null as any,
      });

      const result = helper.getRoomEntities(room);

      expect(result.players).toEqual([]);
      expect(result.objects).toEqual([]);
    });

    it('should handle mixed null/valid arrays', () => {
      const room = createTestRoom({
        players: ['player-1'],
        objects: null as any,
      });

      const result = helper.getRoomEntities(room);

      expect(result.players).toEqual(['player-1']);
      expect(result.objects).toEqual([]);
    });
  });
});
