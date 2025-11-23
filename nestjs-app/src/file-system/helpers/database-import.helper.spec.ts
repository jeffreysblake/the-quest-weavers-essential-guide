import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseImportHelper } from './database-import.helper';
import { DatabaseService } from '../../database/database.service';
import { GameData, RoomData, ObjectData, NPCData, RoomConnection } from '../../database/database.interfaces';

describe('DatabaseImportHelper', () => {
  let helper: DatabaseImportHelper;
  let mockDb: jest.Mocked<Partial<DatabaseService>>;
  let mockRun: jest.Mock;
  let mockPrepare: jest.Mock;

  const game = (o: Partial<GameData> = {}): GameData => ({
    id: 'g1', name: 'Test', description: 'Test game', version: 1,
    createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z', isActive: true, ...o,
  });

  const room = (o: Partial<RoomData> = {}): RoomData => ({
    id: 'r1', gameId: 'g1', name: 'Room', description: 'Test', longDescription: 'Long test',
    position: { x: 0, y: 0, z: 0 }, width: 10, height: 10, depth: 3,
    environmentData: { lighting: 'bright' }, version: 1, createdAt: '2025-01-01T00:00:00Z', ...o,
  });

  const object = (o: Partial<ObjectData> = {}): ObjectData => ({
    id: 'o1', gameId: 'g1', name: 'Object', description: 'Test', objectType: 'item',
    position: { x: 0, y: 0, z: 0 }, material: 'wood',
    materialProperties: { material: 'wood', density: 0.6, conductivity: 0.1, flammability: 0.8, brittleness: 0.3 },
    weight: 5, health: 100, maxHealth: 100, isPortable: true, isContainer: false, canContain: false,
    containerCapacity: 0, stateData: { isOpen: false }, properties: { color: 'brown' },
    version: 1, createdAt: '2025-01-01T00:00:00Z', ...o,
  });

  const npc = (o: Partial<NPCData> = {}): NPCData => ({
    id: 'n1', gameId: 'g1', name: 'NPC', description: 'Test', npcType: 'npc',
    position: { x: 0, y: 0, z: 0 }, health: 100, maxHealth: 100, level: 5, experience: 500,
    inventoryData: ['i1'], dialogueTreeData: { n1: { text: 'Hi' } },
    behaviorConfig: { movementPattern: 'stationary' }, attributes: { strength: 10 },
    version: 1, createdAt: '2025-01-01T00:00:00Z', ...o,
  });

  const conn = (o: Partial<RoomConnection> = {}): RoomConnection => ({
    id: 1, roomId: 'r1', connectedRoomId: 'r2', direction: 'north',
    description: 'Door', isLocked: false, requiredKeyId: undefined,
    createdAt: '2025-01-01T00:00:00Z', ...o,
  });

  beforeEach(async () => {
    mockRun = jest.fn();
    mockPrepare = jest.fn().mockReturnValue({ run: mockRun });
    mockDb = {
      transaction: jest.fn((cb) => cb({ prepare: mockPrepare })),
      prepare: mockPrepare,
      saveVersion: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DatabaseImportHelper, { provide: DatabaseService, useValue: mockDb }],
    }).compile();

    helper = module.get<DatabaseImportHelper>(DatabaseImportHelper);
  });

  afterEach(() => jest.clearAllMocks());

  describe('saveGameConfig', () => {
    it('should save game with all fields and version', () => {
      const g = game({ id: 'g123', name: 'Epic', version: 2, isActive: true });
      helper.saveGameConfig(g);

      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('INSERT OR REPLACE INTO games'));
      expect(mockRun).toHaveBeenCalledWith('g123', 'Epic', expect.any(String), 2, g.createdAt, g.updatedAt, 1);
      expect(mockDb.saveVersion).toHaveBeenCalledWith('game', 'g123', g, 'file_loader', 'Loaded from files');
    });

    it('should convert isActive boolean to integer', () => {
      helper.saveGameConfig(game({ isActive: false }));
      expect(mockRun.mock.calls[0][6]).toBe(0);

      mockRun.mockClear();
      helper.saveGameConfig(game({ isActive: true }));
      expect(mockRun.mock.calls[0][6]).toBe(1);
    });

    it('should handle missing description', () => {
      helper.saveGameConfig(game({ description: undefined }));
      expect(mockRun).toHaveBeenCalledWith(expect.any(String), expect.any(String), undefined,
        expect.any(Number), expect.any(String), expect.any(String), expect.any(Number));
    });

    it('should handle transaction error', () => {
      mockDb.transaction = jest.fn(() => { throw new Error('Failed'); });
      expect(() => helper.saveGameConfig(game())).toThrow('Failed');
    });
  });

  describe('saveRooms', () => {
    it('should return early for empty array', () => {
      helper.saveRooms([]);
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('should save room with all fields and version', () => {
      const r = room({ id: 'r123', position: { x: 10, y: 20, z: 5 }, width: 15 });
      helper.saveRooms([r]);

      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      expect(mockRun).toHaveBeenCalledWith('r123', 'g1', expect.any(String), expect.any(String),
        expect.any(String), 10, 20, 5, 15, expect.any(Number), expect.any(Number),
        expect.any(String), 1, expect.any(String));
      expect(mockDb.saveVersion).toHaveBeenCalledWith('room', 'r123', r, 'file_loader', 'Loaded from files');
    });

    it('should serialize environment data as JSON', () => {
      const env = { lighting: 'dim', sound: 'echo' };
      helper.saveRooms([room({ environmentData: env })]);

      const envArg = mockRun.mock.calls[0][11];
      expect(JSON.parse(envArg)).toEqual(env);
    });

    it('should process small batches in one transaction', () => {
      const rooms = Array.from({ length: 10 }, (_, i) => room({ id: `r${i}` }));
      helper.saveRooms(rooms);

      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      expect(mockRun).toHaveBeenCalledTimes(10);
      expect(mockDb.saveVersion).toHaveBeenCalledTimes(10);
    });

    it('should process large datasets in multiple batches', () => {
      const rooms = Array.from({ length: 2500 }, (_, i) => room({ id: `r${i}` }));
      helper.saveRooms(rooms);

      expect(mockDb.transaction).toHaveBeenCalledTimes(3); // 1000, 1000, 500
      expect(mockRun).toHaveBeenCalledTimes(2500);
    });

    it('should handle missing optional fields', () => {
      helper.saveRooms([room({ description: undefined, longDescription: undefined })]);
      expect(mockRun.mock.calls[0][3]).toBeUndefined();
      expect(mockRun.mock.calls[0][4]).toBeUndefined();
    });

    it('should handle transaction error', () => {
      mockDb.transaction = jest.fn(() => { throw new Error('Failed'); });
      expect(() => helper.saveRooms([room()])).toThrow('Failed');
    });
  });

  describe('saveObjects', () => {
    it('should return early for empty array', () => {
      helper.saveObjects([]);
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('should save object with all fields and version', () => {
      const o = object({ id: 'o123', objectType: 'weapon', weight: 10 });
      helper.saveObjects([o]);

      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      const args = mockRun.mock.calls[0];
      expect(args[0]).toBe('o123');
      expect(args[4]).toBe('weapon');
      expect(args[10]).toBe(10);
      expect(mockDb.saveVersion).toHaveBeenCalledWith('object', 'o123', o, 'file_loader', 'Loaded from files');
    });

    it('should serialize JSON fields correctly', () => {
      const props = { material: 'steel', density: 7.8, conductivity: 0.5, flammability: 0, brittleness: 0.2 };
      const state = { isOpen: true, broken: false };
      const custom = { color: 'red', enchanted: true };
      helper.saveObjects([object({ materialProperties: props, stateData: state, properties: custom })]);

      expect(JSON.parse(mockRun.mock.calls[0][9])).toEqual(props);
      expect(JSON.parse(mockRun.mock.calls[0][17])).toEqual(state);
      expect(JSON.parse(mockRun.mock.calls[0][18])).toEqual(custom);
    });

    it('should convert boolean fields to integers', () => {
      helper.saveObjects([object({ isPortable: false, isContainer: true, canContain: true })]);
      const args = mockRun.mock.calls[0];
      expect(args[13]).toBe(0); // isPortable
      expect(args[14]).toBe(1); // isContainer
      expect(args[15]).toBe(1); // canContain
    });

    it('should process multiple batches for large datasets', () => {
      const objects = Array.from({ length: 1500 }, (_, i) => object({ id: `o${i}` }));
      helper.saveObjects(objects);

      expect(mockDb.transaction).toHaveBeenCalledTimes(2);
      expect(mockRun).toHaveBeenCalledTimes(1500);
    });

    it('should handle transaction error', () => {
      mockDb.transaction = jest.fn(() => { throw new Error('Failed'); });
      expect(() => helper.saveObjects([object()])).toThrow('Failed');
    });
  });

  describe('saveNPCs', () => {
    it('should return early for empty array', () => {
      helper.saveNPCs([]);
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('should save NPC with all fields and version', () => {
      const n = npc({ id: 'n123', npcType: 'quest_giver', level: 10 });
      helper.saveNPCs([n]);

      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      const args = mockRun.mock.calls[0];
      expect(args[0]).toBe('n123');
      expect(args[4]).toBe('quest_giver');
      expect(args[10]).toBe(10);
      expect(mockDb.saveVersion).toHaveBeenCalledWith('npc', 'n123', n, 'file_loader', 'Loaded from files');
    });

    it('should serialize all JSON fields correctly', () => {
      const inv = ['sword', 'potion'];
      const dialogue = { start: { text: 'Hello!' } };
      const behavior = { movementPattern: 'patrol' as const, aggressionLevel: 'aggressive' as const };
      const attrs = { strength: 15, agility: 12 };
      helper.saveNPCs([npc({ inventoryData: inv, dialogueTreeData: dialogue, behaviorConfig: behavior, attributes: attrs })]);

      expect(JSON.parse(mockRun.mock.calls[0][12])).toEqual(inv);
      expect(JSON.parse(mockRun.mock.calls[0][13])).toEqual(dialogue);
      expect(JSON.parse(mockRun.mock.calls[0][14])).toEqual(behavior);
      expect(JSON.parse(mockRun.mock.calls[0][15])).toEqual(attrs);
    });

    it('should process multiple batches for large datasets', () => {
      const npcs = Array.from({ length: 2200 }, (_, i) => npc({ id: `n${i}` }));
      helper.saveNPCs(npcs);

      expect(mockDb.transaction).toHaveBeenCalledTimes(3);
      expect(mockRun).toHaveBeenCalledTimes(2200);
    });

    it('should handle transaction error', () => {
      mockDb.transaction = jest.fn(() => { throw new Error('Failed'); });
      expect(() => helper.saveNPCs([npc()])).toThrow('Failed');
    });
  });

  describe('saveConnections', () => {
    it('should return early for empty array', () => {
      helper.saveConnections([]);
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('should save connection with all fields', () => {
      const c = conn({ roomId: 'r1', connectedRoomId: 'r2', direction: 'east', isLocked: true, requiredKeyId: 'k1' });
      helper.saveConnections([c]);

      expect(mockRun).toHaveBeenCalledWith('r1', 'r2', 'east', expect.any(String), 1, 'k1', expect.any(String));
    });

    it('should delete existing connections when gameId provided', () => {
      helper.saveConnections([conn()], 'g1');

      expect(mockPrepare).toHaveBeenCalledWith(
        'DELETE FROM room_connections WHERE room_id IN (SELECT id FROM rooms WHERE game_id = ?)'
      );
      expect(mockRun).toHaveBeenCalledWith('g1');
    });

    it('should NOT delete when gameId is undefined', () => {
      helper.saveConnections([conn()], undefined);

      const deleteCalls = mockPrepare.mock.calls.filter(c => c[0].includes('DELETE'));
      expect(deleteCalls).toHaveLength(0);
    });

    it('should convert isLocked boolean to integer', () => {
      helper.saveConnections([conn({ isLocked: true })]);
      expect(mockRun.mock.calls[0][4]).toBe(1);

      mockRun.mockClear();
      helper.saveConnections([conn({ isLocked: false })]);
      expect(mockRun.mock.calls[0][4]).toBe(0);
    });

    it('should process multiple batches for large datasets', () => {
      const conns = Array.from({ length: 1800 }, (_, i) => conn({ id: i, roomId: `r${i}` }));
      helper.saveConnections(conns);

      expect(mockDb.transaction).toHaveBeenCalledTimes(2);
      expect(mockRun).toHaveBeenCalledTimes(1800);
    });

    it('should handle transaction error', () => {
      mockDb.transaction = jest.fn(() => { throw new Error('Failed'); });
      expect(() => helper.saveConnections([conn()], 'g1')).toThrow('Failed');
    });
  });

  describe('saveGameToDatabase', () => {
    it('should save all data types with gameId', () => {
      const g = game({ id: 'g123' });
      const rooms = [room()];
      const objects = [object()];
      const npcs = [npc()];
      const conns = [conn()];

      const spies = {
        game: jest.spyOn(helper, 'saveGameConfig'),
        rooms: jest.spyOn(helper, 'saveRooms'),
        objects: jest.spyOn(helper, 'saveObjects'),
        npcs: jest.spyOn(helper, 'saveNPCs'),
        conns: jest.spyOn(helper, 'saveConnections'),
      };

      helper.saveGameToDatabase(g, rooms, objects, npcs, conns);

      expect(spies.game).toHaveBeenCalledWith(g);
      expect(spies.rooms).toHaveBeenCalledWith(rooms);
      expect(spies.objects).toHaveBeenCalledWith(objects);
      expect(spies.npcs).toHaveBeenCalledWith(npcs);
      expect(spies.conns).toHaveBeenCalledWith(conns, 'g123');
    });

    it('should skip game config when undefined', () => {
      const spy = jest.spyOn(helper, 'saveGameConfig');
      helper.saveGameToDatabase(undefined, [], [], [], []);

      expect(spy).not.toHaveBeenCalled();
    });

    it('should pass undefined gameId when gameData undefined', () => {
      const spy = jest.spyOn(helper, 'saveConnections');
      helper.saveGameToDatabase(undefined, [], [], [], [conn()]);

      expect(spy).toHaveBeenCalledWith(expect.any(Array), undefined);
    });

    it('should handle empty arrays without error', () => {
      expect(() => helper.saveGameToDatabase(game(), [], [], [], [])).not.toThrow();
    });

    it('should propagate errors from save methods', () => {
      jest.spyOn(helper, 'saveRooms').mockImplementation(() => { throw new Error('Failed'); });
      expect(() => helper.saveGameToDatabase(game(), [room()], [], [], [])).toThrow('Failed');
    });
  });
});
