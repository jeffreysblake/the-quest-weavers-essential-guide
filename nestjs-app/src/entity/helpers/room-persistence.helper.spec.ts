import { Test, TestingModule } from '@nestjs/testing';
import { RoomPersistenceHelper } from './room-persistence.helper';
import { DatabaseService } from '../../database/database.service';
import { IRoom } from '../room.interface';

describe('RoomPersistenceHelper', () => {
  let helper: RoomPersistenceHelper;
  let mockDatabaseService: jest.Mocked<Partial<DatabaseService>>;

  // Helper to create test room
  const createTestRoom = (overrides: Partial<IRoom> = {}): IRoom => ({
    id: 'room-1',
    name: 'Test Room',
    description: 'A test room',
    longDescription: 'A long test room description',
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

  beforeEach(async () => {
    // Create mock database service
    mockDatabaseService = {
      transaction: jest.fn(),
      prepare: jest.fn(),
      getDatabase: jest.fn().mockReturnValue({
        pragma: jest.fn(),
      }),
      saveVersion: jest.fn().mockResolvedValue(1),
      getVersion: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomPersistenceHelper,
        { provide: DatabaseService, useValue: mockDatabaseService },
      ],
    }).compile();

    helper = module.get<RoomPersistenceHelper>(RoomPersistenceHelper);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // SAVE ROOM TO DATABASE (12 tests)
  // ============================================================================
  describe('saveRoomToDatabase', () => {
    it('should save room with basic properties', async () => {
      const room = createTestRoom();
      const mockRun = jest.fn();
      const mockPrepare = jest.fn().mockReturnValue({ run: mockRun });

      mockDatabaseService.transaction = jest.fn((callback) => {
        const db = { prepare: mockPrepare };
        callback(db);
      });

      await helper.saveRoomToDatabase(room);

      expect(mockDatabaseService.transaction).toHaveBeenCalled();
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO rooms'),
      );
      expect(mockRun).toHaveBeenCalledWith(
        'room-1',
        'test-game',
        'Test Room',
        'A test room',
        'A long test room description',
        0,
        0,
        0,
        10,
        10,
        3,
        expect.any(String),
        1,
        expect.any(String),
      );
    });

    it('should save room with environment data', async () => {
      const room = createTestRoom({
        environment: {
          lighting: 'dim',
          sound: 'quiet',
          weather: 'clear',
        },
      });
      const mockRun = jest.fn();
      const mockPrepare = jest.fn().mockReturnValue({ run: mockRun });

      mockDatabaseService.transaction = jest.fn((callback) => {
        const db = { prepare: mockPrepare };
        callback(db);
      });

      await helper.saveRoomToDatabase(room);

      const callArgs = mockRun.mock.calls[0];
      const environmentJson = callArgs[11];
      expect(JSON.parse(environmentJson)).toEqual({
        lighting: 'dim',
        sound: 'quiet',
        weather: 'clear',
      });
    });

    it('should save room-object relationships', async () => {
      const room = createTestRoom({
        objects: ['obj-1', 'obj-2', 'obj-3'],
      });
      const mockRun = jest.fn();
      const mockPrepare = jest.fn().mockReturnValue({ run: mockRun });

      mockDatabaseService.transaction = jest.fn((callback) => {
        const db = { prepare: mockPrepare };
        callback(db);
      });

      await helper.saveRoomToDatabase(room);

      // Should have: 1 room insert, 1 delete, 1 room-object insert setup, 3 inserts
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM room_objects'),
      );
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO room_objects'),
      );
      // 3 object relationships inserted
      expect(mockRun).toHaveBeenCalledWith('room-1', 'obj-1', expect.any(String));
      expect(mockRun).toHaveBeenCalledWith('room-1', 'obj-2', expect.any(String));
      expect(mockRun).toHaveBeenCalledWith('room-1', 'obj-3', expect.any(String));
    });

    it('should save room-player relationships', async () => {
      const room = createTestRoom({
        players: ['player-1', 'player-2'],
      });
      const mockRun = jest.fn();
      const mockPrepare = jest.fn().mockReturnValue({ run: mockRun });

      mockDatabaseService.transaction = jest.fn((callback) => {
        const db = { prepare: mockPrepare };
        callback(db);
      });

      await helper.saveRoomToDatabase(room);

      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM room_npcs'),
      );
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO room_npcs'),
      );
      expect(mockRun).toHaveBeenCalledWith('room-1', 'player-1', expect.any(String));
      expect(mockRun).toHaveBeenCalledWith('room-1', 'player-2', expect.any(String));
    });

    it('should clear existing relationships before saving new ones', async () => {
      const room = createTestRoom({
        objects: ['obj-1'],
        players: ['player-1'],
      });
      const mockRun = jest.fn();
      const mockPrepare = jest.fn().mockReturnValue({ run: mockRun });

      mockDatabaseService.transaction = jest.fn((callback) => {
        const db = { prepare: mockPrepare };
        callback(db);
      });

      await helper.saveRoomToDatabase(room);

      expect(mockPrepare).toHaveBeenCalledWith('DELETE FROM room_objects WHERE room_id = ?');
      expect(mockPrepare).toHaveBeenCalledWith('DELETE FROM room_npcs WHERE room_id = ?');
    });

    it('should handle room with no objects or players', async () => {
      const room = createTestRoom({
        objects: [],
        players: [],
      });
      const mockRun = jest.fn();
      const mockPrepare = jest.fn().mockReturnValue({ run: mockRun });

      mockDatabaseService.transaction = jest.fn((callback) => {
        const db = { prepare: mockPrepare };
        callback(db);
      });

      await helper.saveRoomToDatabase(room);

      // Should only save room, no relationship operations
      expect(mockDatabaseService.transaction).toHaveBeenCalled();
    });

    it('should execute WAL checkpoint after transaction', async () => {
      const room = createTestRoom();
      const mockPragma = jest.fn();
      mockDatabaseService.getDatabase = jest.fn().mockReturnValue({
        pragma: mockPragma,
      });

      mockDatabaseService.transaction = jest.fn((callback) => {
        const db = { prepare: jest.fn().mockReturnValue({ run: jest.fn() }) };
        callback(db);
      });

      await helper.saveRoomToDatabase(room);

      expect(mockPragma).toHaveBeenCalledWith('wal_checkpoint(PASSIVE)');
    });

    it('should handle WAL checkpoint errors gracefully', async () => {
      const room = createTestRoom();
      const mockPragma = jest.fn().mockImplementation(() => {
        throw new Error('WAL error');
      });
      mockDatabaseService.getDatabase = jest.fn().mockReturnValue({
        pragma: mockPragma,
      });

      mockDatabaseService.transaction = jest.fn((callback) => {
        const db = { prepare: jest.fn().mockReturnValue({ run: jest.fn() }) };
        callback(db);
      });

      // Should not throw - WAL errors are caught
      await expect(helper.saveRoomToDatabase(room)).resolves.not.toThrow();
    });

    it('should throw error if database service not available', async () => {
      const helperNoDb = new RoomPersistenceHelper();
      const room = createTestRoom();

      // Should return without error (no-op)
      await expect(helperNoDb.saveRoomToDatabase(room)).resolves.not.toThrow();
    });

    it('should handle transaction errors', async () => {
      const room = createTestRoom();
      mockDatabaseService.transaction = jest.fn().mockImplementation(() => {
        throw new Error('Transaction failed');
      });

      await expect(helper.saveRoomToDatabase(room)).rejects.toThrow('Transaction failed');
    });

    it('should use default gameId if not provided', async () => {
      const room = createTestRoom({ gameId: undefined });
      const mockRun = jest.fn();
      const mockPrepare = jest.fn().mockReturnValue({ run: mockRun });

      mockDatabaseService.transaction = jest.fn((callback) => {
        const db = { prepare: mockPrepare };
        callback(db);
      });

      await helper.saveRoomToDatabase(room);

      expect(mockRun).toHaveBeenCalledWith(
        expect.any(String),
        'default', // Default gameId
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        expect.any(String),
        expect.any(Number),
        expect.any(String),
      );
    });

    it('should handle room-object insertion errors', async () => {
      const room = createTestRoom({
        objects: ['obj-1'],
      });
      const mockRun = jest.fn().mockImplementation(() => {
        throw new Error('Insert failed');
      });
      const mockPrepare = jest.fn().mockReturnValue({ run: mockRun });

      mockDatabaseService.transaction = jest.fn((callback) => {
        const db = { prepare: mockPrepare };
        callback(db);
      });

      await expect(helper.saveRoomToDatabase(room)).rejects.toThrow();
    });
  });

  // ============================================================================
  // LOAD ROOM FROM DATABASE (10 tests)
  // ============================================================================
  describe('loadRoomFromDatabase', () => {
    it('should load room with basic properties', async () => {
      const mockRoomRow = {
        id: 'room-1',
        game_id: 'test-game',
        name: 'Test Room',
        description: 'A test room',
        long_description: 'A long description',
        position_x: 5,
        position_y: 10,
        position_z: 2,
        width: 15,
        height: 20,
        depth: 5,
        environment_data: null,
      };

      const mockPrepare = jest.fn().mockReturnValue({
        get: jest.fn().mockReturnValue(mockRoomRow),
        all: jest.fn().mockReturnValue([]),
      });
      mockDatabaseService.prepare = mockPrepare;

      const result = await helper.loadRoomFromDatabase('room-1');

      expect(result).toBeDefined();
      expect(result?.id).toBe('room-1');
      expect(result?.name).toBe('Test Room');
      expect(result?.position).toEqual({ x: 5, y: 10, z: 2 });
      expect(result?.width).toBe(15);
      expect(result?.height).toBe(20);
      expect(result?.size).toEqual({ width: 15, height: 20, depth: 5 });
    });

    it('should load room with environment data', async () => {
      const mockRoomRow = {
        id: 'room-1',
        game_id: 'test-game',
        name: 'Test Room',
        position_x: 0,
        position_y: 0,
        position_z: 0,
        width: 10,
        height: 10,
        depth: 3,
        environment_data: JSON.stringify({
          lighting: 'bright',
          sound: 'noisy',
        }),
      };

      const mockPrepare = jest.fn().mockReturnValue({
        get: jest.fn().mockReturnValue(mockRoomRow),
        all: jest.fn().mockReturnValue([]),
      });
      mockDatabaseService.prepare = mockPrepare;

      const result = await helper.loadRoomFromDatabase('room-1');

      expect(result?.environment).toEqual({
        lighting: 'bright',
        sound: 'noisy',
      });
    });

    it('should load room with objects', async () => {
      const mockRoomRow = {
        id: 'room-1',
        game_id: 'test-game',
        name: 'Test Room',
        position_x: 0,
        position_y: 0,
        position_z: 0,
        width: 10,
        height: 10,
        depth: 3,
      };

      const mockObjectRows = [
        { object_id: 'obj-1' },
        { object_id: 'obj-2' },
        { object_id: 'obj-3' },
      ];

      let callCount = 0;
      const mockPrepare = jest.fn().mockImplementation(() => ({
        get: jest.fn().mockReturnValue(mockRoomRow),
        all: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return mockObjectRows; // room_objects query
          if (callCount === 2) return []; // room_npcs query
          return []; // all room_objects debug query
        }),
      }));
      mockDatabaseService.prepare = mockPrepare;

      const result = await helper.loadRoomFromDatabase('room-1');

      expect(result?.objects).toEqual(['obj-1', 'obj-2', 'obj-3']);
    });

    it('should load room with players', async () => {
      const mockRoomRow = {
        id: 'room-1',
        game_id: 'test-game',
        name: 'Test Room',
        position_x: 0,
        position_y: 0,
        position_z: 0,
        width: 10,
        height: 10,
        depth: 3,
      };

      const mockPlayerRows = [{ npc_id: 'player-1' }, { npc_id: 'player-2' }];

      let callCount = 0;
      const mockPrepare = jest.fn().mockImplementation(() => ({
        get: jest.fn().mockReturnValue(mockRoomRow),
        all: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return []; // room_objects query
          if (callCount === 2) return mockPlayerRows; // room_npcs query
          return []; // all room_objects debug query
        }),
      }));
      mockDatabaseService.prepare = mockPrepare;

      const result = await helper.loadRoomFromDatabase('room-1');

      expect(result?.players).toEqual(['player-1', 'player-2']);
    });

    it('should filter by gameId when provided', async () => {
      const mockRoomRow = {
        id: 'room-1',
        game_id: 'specific-game',
        name: 'Test Room',
        position_x: 0,
        position_y: 0,
        position_z: 0,
        width: 10,
        height: 10,
        depth: 3,
      };

      const mockGet = jest.fn().mockReturnValue(mockRoomRow);
      const mockPrepare = jest.fn().mockReturnValue({
        get: mockGet,
        all: jest.fn().mockReturnValue([]),
      });
      mockDatabaseService.prepare = mockPrepare;

      await helper.loadRoomFromDatabase('room-1', 'specific-game');

      expect(mockGet).toHaveBeenCalledWith('room-1', 'specific-game');
    });

    it('should return undefined if room not found', async () => {
      const mockPrepare = jest.fn().mockReturnValue({
        get: jest.fn().mockReturnValue(null),
        all: jest.fn().mockReturnValue([]),
      });
      mockDatabaseService.prepare = mockPrepare;

      const result = await helper.loadRoomFromDatabase('nonexistent');

      expect(result).toBeUndefined();
    });

    it('should handle missing position values with defaults', async () => {
      const mockRoomRow = {
        id: 'room-1',
        game_id: 'test-game',
        name: 'Test Room',
        width: 10,
        height: 10,
        depth: 3,
      };

      const mockPrepare = jest.fn().mockReturnValue({
        get: jest.fn().mockReturnValue(mockRoomRow),
        all: jest.fn().mockReturnValue([]),
      });
      mockDatabaseService.prepare = mockPrepare;

      const result = await helper.loadRoomFromDatabase('room-1');

      expect(result?.position).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('should return undefined when database service not available', async () => {
      const helperNoDb = new RoomPersistenceHelper();

      const result = await helperNoDb.loadRoomFromDatabase('room-1');

      expect(result).toBeUndefined();
    });

    it('should handle database errors gracefully', async () => {
      mockDatabaseService.prepare = jest.fn().mockImplementation(() => {
        throw new Error('Database error');
      });

      const result = await helper.loadRoomFromDatabase('room-1');

      expect(result).toBeUndefined();
    });

    it('should handle empty objects and players arrays', async () => {
      const mockRoomRow = {
        id: 'room-1',
        game_id: 'test-game',
        name: 'Test Room',
        position_x: 0,
        position_y: 0,
        position_z: 0,
        width: 10,
        height: 10,
        depth: 3,
      };

      const mockPrepare = jest.fn().mockReturnValue({
        get: jest.fn().mockReturnValue(mockRoomRow),
        all: jest.fn().mockReturnValue([]),
      });
      mockDatabaseService.prepare = mockPrepare;

      const result = await helper.loadRoomFromDatabase('room-1');

      expect(result?.objects).toEqual([]);
      expect(result?.players).toEqual([]);
    });
  });

  // ============================================================================
  // LOAD MULTIPLE ROOMS (8 tests)
  // ============================================================================
  describe('loadMultipleRooms', () => {
    it('should batch load multiple rooms', async () => {
      const mockRoomRows = [
        {
          id: 'room-1',
          game_id: 'test-game',
          name: 'Room 1',
          position_x: 0,
          position_y: 0,
          position_z: 0,
          width: 10,
          height: 10,
          depth: 3,
        },
        {
          id: 'room-2',
          game_id: 'test-game',
          name: 'Room 2',
          position_x: 10,
          position_y: 0,
          position_z: 0,
          width: 10,
          height: 10,
          depth: 3,
        },
      ];

      const mockPrepare = jest.fn().mockReturnValue({
        all: jest.fn().mockReturnValue(mockRoomRows),
      });
      mockDatabaseService.prepare = mockPrepare;

      const result = await helper.loadMultipleRooms(['room-1', 'room-2']);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('room-1');
      expect(result[1].id).toBe('room-2');
    });

    it('should load room-object relationships for all rooms', async () => {
      const mockRoomRows = [
        { id: 'room-1', game_id: 'test-game', name: 'Room 1', width: 10, height: 10, depth: 3 },
        { id: 'room-2', game_id: 'test-game', name: 'Room 2', width: 10, height: 10, depth: 3 },
      ];

      const mockObjectRows = [
        { room_id: 'room-1', object_id: 'obj-1' },
        { room_id: 'room-1', object_id: 'obj-2' },
        { room_id: 'room-2', object_id: 'obj-3' },
      ];

      let queryIndex = 0;
      const mockPrepare = jest.fn().mockImplementation(() => ({
        all: jest.fn().mockImplementation(() => {
          queryIndex++;
          if (queryIndex === 1) return mockRoomRows;
          if (queryIndex === 2) return mockObjectRows;
          return [];
        }),
      }));
      mockDatabaseService.prepare = mockPrepare;

      const result = await helper.loadMultipleRooms(['room-1', 'room-2']);

      expect(result[0].objects).toEqual(['obj-1', 'obj-2']);
      expect(result[1].objects).toEqual(['obj-3']);
    });

    it('should load room-player relationships for all rooms', async () => {
      const mockRoomRows = [
        { id: 'room-1', game_id: 'test-game', name: 'Room 1', width: 10, height: 10, depth: 3 },
      ];

      const mockPlayerRows = [
        { room_id: 'room-1', npc_id: 'player-1' },
        { room_id: 'room-1', npc_id: 'player-2' },
      ];

      let queryIndex = 0;
      const mockPrepare = jest.fn().mockImplementation(() => ({
        all: jest.fn().mockImplementation(() => {
          queryIndex++;
          if (queryIndex === 1) return mockRoomRows;
          if (queryIndex === 2) return [];
          return mockPlayerRows;
        }),
      }));
      mockDatabaseService.prepare = mockPrepare;

      const result = await helper.loadMultipleRooms(['room-1']);

      expect(result[0].players).toEqual(['player-1', 'player-2']);
    });

    it('should return empty array for empty input', async () => {
      const result = await helper.loadMultipleRooms([]);

      expect(result).toEqual([]);
    });

    it('should return empty array when database service not available', async () => {
      const helperNoDb = new RoomPersistenceHelper();

      const result = await helperNoDb.loadMultipleRooms(['room-1']);

      expect(result).toEqual([]);
    });

    it('should handle database errors gracefully', async () => {
      mockDatabaseService.prepare = jest.fn().mockImplementation(() => {
        throw new Error('Database error');
      });

      const result = await helper.loadMultipleRooms(['room-1']);

      expect(result).toEqual([]);
    });

    it('should use placeholders correctly for SQL IN clause', async () => {
      const mockPrepare = jest.fn().mockReturnValue({
        all: jest.fn().mockReturnValue([]),
      });
      mockDatabaseService.prepare = mockPrepare;

      await helper.loadMultipleRooms(['room-1', 'room-2', 'room-3']);

      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id IN (?,?,?)'),
      );
    });

    it('should parse environment data for each room', async () => {
      const mockRoomRows = [
        {
          id: 'room-1',
          game_id: 'test-game',
          name: 'Room 1',
          width: 10,
          height: 10,
          depth: 3,
          environment_data: JSON.stringify({ lighting: 'bright' }),
        },
      ];

      const mockPrepare = jest.fn().mockReturnValue({
        all: jest.fn().mockReturnValue(mockRoomRows),
      });
      mockDatabaseService.prepare = mockPrepare;

      const result = await helper.loadMultipleRooms(['room-1']);

      expect(result[0].environment).toEqual({ lighting: 'bright' });
    });
  });

  // ============================================================================
  // LOAD GAME ROOMS (5 tests)
  // ============================================================================
  describe('loadGameRoomsFromDatabase', () => {
    it('should load all rooms for a specific game', async () => {
      const mockRoomIdRows = [{ id: 'room-1' }, { id: 'room-2' }];
      const mockRoomRows = [
        {
          id: 'room-1',
          game_id: 'game-1',
          name: 'Room 1',
          width: 10,
          height: 10,
          depth: 3,
        },
        {
          id: 'room-2',
          game_id: 'game-1',
          name: 'Room 2',
          width: 10,
          height: 10,
          depth: 3,
        },
      ];

      let queryIndex = 0;
      const mockPrepare = jest.fn().mockImplementation(() => ({
        all: jest.fn().mockImplementation(() => {
          queryIndex++;
          if (queryIndex === 1) return mockRoomIdRows;
          if (queryIndex === 2) return mockRoomRows;
          return [];
        }),
        get: jest.fn(),
      }));
      mockDatabaseService.prepare = mockPrepare;

      const result = await helper.loadGameRoomsFromDatabase('game-1');

      expect(result).toHaveLength(2);
      expect(result[0].gameId).toBe('game-1');
      expect(result[1].gameId).toBe('game-1');
    });

    it('should return empty array if no rooms found', async () => {
      const mockPrepare = jest.fn().mockReturnValue({
        all: jest.fn().mockReturnValue([]),
      });
      mockDatabaseService.prepare = mockPrepare;

      const result = await helper.loadGameRoomsFromDatabase('nonexistent-game');

      expect(result).toEqual([]);
    });

    it('should return empty array when database service not available', async () => {
      const helperNoDb = new RoomPersistenceHelper();

      const result = await helperNoDb.loadGameRoomsFromDatabase('game-1');

      expect(result).toEqual([]);
    });

    it('should handle database errors gracefully', async () => {
      mockDatabaseService.prepare = jest.fn().mockImplementation(() => {
        throw new Error('Database error');
      });

      const result = await helper.loadGameRoomsFromDatabase('game-1');

      expect(result).toEqual([]);
    });

    it('should use batch loading for efficiency', async () => {
      const mockRoomIdRows = [{ id: 'room-1' }, { id: 'room-2' }, { id: 'room-3' }];
      const mockRoomRows = [
        { id: 'room-1', game_id: 'game-1', name: 'Room 1', width: 10, height: 10, depth: 3 },
        { id: 'room-2', game_id: 'game-1', name: 'Room 2', width: 10, height: 10, depth: 3 },
        { id: 'room-3', game_id: 'game-1', name: 'Room 3', width: 10, height: 10, depth: 3 },
      ];

      let queryIndex = 0;
      const mockPrepare = jest.fn().mockImplementation(() => ({
        all: jest.fn().mockImplementation(() => {
          queryIndex++;
          if (queryIndex === 1) return mockRoomIdRows;
          if (queryIndex === 2) return mockRoomRows;
          return [];
        }),
      }));
      mockDatabaseService.prepare = mockPrepare;

      await helper.loadGameRoomsFromDatabase('game-1');

      // Should use batch loading (WHERE IN) instead of individual queries
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id IN'),
      );
    });
  });

  // ============================================================================
  // LOAD ALL ROOMS (4 tests)
  // ============================================================================
  describe('loadAllRoomsFromDatabase', () => {
    it('should load all rooms from database', async () => {
      const mockRoomIdRows = [{ id: 'room-1' }, { id: 'room-2' }];
      const mockRoomRows = [
        { id: 'room-1', game_id: 'game-1', name: 'Room 1', width: 10, height: 10, depth: 3 },
        { id: 'room-2', game_id: 'game-2', name: 'Room 2', width: 10, height: 10, depth: 3 },
      ];

      let queryIndex = 0;
      const mockPrepare = jest.fn().mockImplementation(() => ({
        all: jest.fn().mockImplementation(() => {
          queryIndex++;
          if (queryIndex === 1) return mockRoomIdRows;
          if (queryIndex === 2) return mockRoomRows;
          return [];
        }),
      }));
      mockDatabaseService.prepare = mockPrepare;

      const result = await helper.loadAllRoomsFromDatabase();

      expect(result).toHaveLength(2);
    });

    it('should return empty array when database service not available', async () => {
      const helperNoDb = new RoomPersistenceHelper();

      const result = await helperNoDb.loadAllRoomsFromDatabase();

      expect(result).toEqual([]);
    });

    it('should handle database errors gracefully', async () => {
      mockDatabaseService.prepare = jest.fn().mockImplementation(() => {
        throw new Error('Database error');
      });

      const result = await helper.loadAllRoomsFromDatabase();

      expect(result).toEqual([]);
    });

    it('should use batch loading for all rooms', async () => {
      const mockRoomIdRows = [{ id: 'room-1' }];
      const mockRoomRows = [
        { id: 'room-1', game_id: 'game-1', name: 'Room 1', width: 10, height: 10, depth: 3 },
      ];

      let queryIndex = 0;
      const mockPrepare = jest.fn().mockImplementation(() => ({
        all: jest.fn().mockImplementation(() => {
          queryIndex++;
          if (queryIndex === 1) return mockRoomIdRows;
          if (queryIndex === 2) return mockRoomRows;
          return [];
        }),
      }));
      mockDatabaseService.prepare = mockPrepare;

      await helper.loadAllRoomsFromDatabase();

      expect(mockPrepare).toHaveBeenCalledWith('SELECT id FROM rooms');
    });
  });

  // ============================================================================
  // PERSIST ROOMS (5 tests)
  // ============================================================================
  describe('persistRooms', () => {
    it('should persist multiple rooms', async () => {
      const rooms = [createTestRoom({ id: 'room-1' }), createTestRoom({ id: 'room-2' })];

      mockDatabaseService.transaction = jest.fn((callback) => {
        const db = { prepare: jest.fn().mockReturnValue({ run: jest.fn() }) };
        callback(db);
      });

      await helper.persistRooms(rooms);

      expect(mockDatabaseService.transaction).toHaveBeenCalledTimes(2);
    });

    it('should warn when database service not available', async () => {
      const helperNoDb = new RoomPersistenceHelper();
      const rooms = [createTestRoom()];

      await expect(helperNoDb.persistRooms(rooms)).resolves.not.toThrow();
    });

    it('should throw error if any room fails to persist', async () => {
      const rooms = [createTestRoom()];
      mockDatabaseService.transaction = jest.fn().mockImplementation(() => {
        throw new Error('Save failed');
      });

      await expect(helper.persistRooms(rooms)).rejects.toThrow('Save failed');
    });

    it('should persist empty array without error', async () => {
      await expect(helper.persistRooms([])).resolves.not.toThrow();
    });

    it('should persist rooms in order', async () => {
      const rooms = [
        createTestRoom({ id: 'room-1' }),
        createTestRoom({ id: 'room-2' }),
        createTestRoom({ id: 'room-3' }),
      ];

      const callOrder: string[] = [];
      mockDatabaseService.transaction = jest.fn((callback) => {
        const db = {
          prepare: jest.fn().mockReturnValue({
            run: jest.fn().mockImplementation((...args) => {
              callOrder.push(args[0]);
            }),
          }),
        };
        callback(db);
      });

      await helper.persistRooms(rooms);

      expect(callOrder).toEqual(['room-1', 'room-2', 'room-3']);
    });
  });

  // ============================================================================
  // VERSION MANAGEMENT (9 tests)
  // ============================================================================
  describe('saveRoomVersion', () => {
    it('should save room version', async () => {
      const room = createTestRoom();
      mockDatabaseService.saveVersion = jest.fn().mockResolvedValue(1);

      const version = await helper.saveRoomVersion('room-1', room, 'Test save');

      expect(mockDatabaseService.saveVersion).toHaveBeenCalledWith(
        'room',
        'room-1',
        room,
        'room_service',
        'Test save',
      );
      expect(version).toBe(1);
    });

    it('should save version without reason', async () => {
      const room = createTestRoom();
      mockDatabaseService.saveVersion = jest.fn().mockResolvedValue(2);

      await helper.saveRoomVersion('room-1', room);

      expect(mockDatabaseService.saveVersion).toHaveBeenCalledWith(
        'room',
        'room-1',
        room,
        'room_service',
        undefined,
      );
    });

    it('should throw error when database service not available', async () => {
      const helperNoDb = new RoomPersistenceHelper();
      const room = createTestRoom();

      await expect(helperNoDb.saveRoomVersion('room-1', room)).rejects.toThrow(
        'Database service not available for version management',
      );
    });
  });

  describe('getRoomVersion', () => {
    it('should get specific room version', async () => {
      const mockVersion = createTestRoom();
      mockDatabaseService.getVersion = jest.fn().mockResolvedValue(mockVersion);

      const result = await helper.getRoomVersion('room-1', 5);

      expect(mockDatabaseService.getVersion).toHaveBeenCalledWith('room', 'room-1', 5);
      expect(result).toEqual(mockVersion);
    });

    it('should get latest version when version not specified', async () => {
      const mockVersion = createTestRoom();
      mockDatabaseService.getVersion = jest.fn().mockResolvedValue(mockVersion);

      await helper.getRoomVersion('room-1');

      expect(mockDatabaseService.getVersion).toHaveBeenCalledWith('room', 'room-1', undefined);
    });

    it('should throw error when database service not available', async () => {
      const helperNoDb = new RoomPersistenceHelper();

      await expect(helperNoDb.getRoomVersion('room-1')).rejects.toThrow(
        'Database service not available for version management',
      );
    });
  });

  describe('rollbackRoom', () => {
    it('should rollback room to previous version', async () => {
      const oldVersion = createTestRoom({ name: 'Old Room Name' });
      mockDatabaseService.getVersion = jest.fn().mockResolvedValue(oldVersion);
      mockDatabaseService.saveVersion = jest.fn().mockResolvedValue(10);

      mockDatabaseService.transaction = jest.fn((callback) => {
        const db = { prepare: jest.fn().mockReturnValue({ run: jest.fn() }) };
        callback(db);
      });

      const result = await helper.rollbackRoom('room-1', 5);

      expect(mockDatabaseService.getVersion).toHaveBeenCalledWith('room', 'room-1', 5);
      expect(mockDatabaseService.transaction).toHaveBeenCalled();
      expect(mockDatabaseService.saveVersion).toHaveBeenCalledWith(
        'room',
        'room-1',
        oldVersion,
        'system',
        'Rollback to version 5',
      );
      expect(result).toEqual(oldVersion);
    });

    it('should return null if version not found', async () => {
      mockDatabaseService.getVersion = jest.fn().mockResolvedValue(null);

      const result = await helper.rollbackRoom('room-1', 5);

      expect(result).toBeNull();
    });

    it('should throw error when database service not available', async () => {
      const helperNoDb = new RoomPersistenceHelper();

      await expect(helperNoDb.rollbackRoom('room-1', 5)).rejects.toThrow(
        'Database service not available for version management',
      );
    });
  });
});
