import { Test, TestingModule } from '@nestjs/testing';
import { PlayerPersistenceHelper } from './player-persistence.helper';
import { DatabaseService } from '../../database/database.service';
import { IPlayer } from '../player.interface';

describe('PlayerPersistenceHelper', () => {
  let helper: PlayerPersistenceHelper;
  let mockDb: jest.Mocked<Partial<DatabaseService>>;

  const mockPlayer = (overrides: Partial<IPlayer> = {}): IPlayer => ({
    id: 'player-1',
    name: 'Test Player',
    type: 'player',
    position: { x: 0, y: 0, z: 0 },
    health: 100,
    level: 1,
    experience: 0,
    inventory: [],
    gameId: 'test-game',
    description: 'A test player',
    ...overrides,
  });

  const mockDbRow = (overrides: any = {}) => ({
    id: 'player-1',
    game_id: 'test-game',
    name: 'Test Player',
    description: 'A test player',
    npc_type: 'player',
    position_x: 0,
    position_y: 0,
    position_z: 0,
    health: 100,
    max_health: 100,
    level: 1,
    experience: 0,
    inventory_data: '[]',
    dialogue_tree_data: '{}',
    version: 1,
    created_at: '2025-01-01T00:00:00.000Z',
    ...overrides,
  });

  beforeEach(async () => {
    mockDb = {
      transaction: jest.fn(),
      prepare: jest.fn(),
      saveVersion: jest.fn(),
      getVersion: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayerPersistenceHelper,
        { provide: DatabaseService, useValue: mockDb },
      ],
    }).compile();

    helper = module.get<PlayerPersistenceHelper>(PlayerPersistenceHelper);
  });

  afterEach(() => jest.clearAllMocks());

  describe('Database Service Availability', () => {
    it('should handle missing database service gracefully', async () => {
      const helperWithoutDb = new PlayerPersistenceHelper();
      const player = mockPlayer();

      await expect(helperWithoutDb.savePlayerToDatabase(player)).resolves.toBeUndefined();
      expect(await helperWithoutDb.loadPlayerFromDatabase('p1')).toBeUndefined();
      expect(await helperWithoutDb.loadMultiplePlayers(['p1'])).toEqual([]);
      expect(await helperWithoutDb.loadGamePlayersFromDatabase('g1')).toEqual([]);
      expect(await helperWithoutDb.loadAllPlayersFromDatabase()).toEqual([]);
    });

    it('should throw errors for version operations without database', async () => {
      const helperWithoutDb = new PlayerPersistenceHelper();
      const player = mockPlayer();

      await expect(helperWithoutDb.savePlayerVersion('p1', player)).rejects.toThrow(
        'Database service not available for version management',
      );
      await expect(helperWithoutDb.getPlayerVersion('p1')).rejects.toThrow(
        'Database service not available for version management',
      );
      await expect(helperWithoutDb.rollbackPlayer('p1', 1)).rejects.toThrow(
        'Database service not available for version management',
      );
    });
  });

  describe('savePlayerToDatabase', () => {
    let mockRun: jest.Mock;
    let mockPrepare: jest.Mock;

    beforeEach(() => {
      mockRun = jest.fn();
      mockPrepare = jest.fn().mockReturnValue({ run: mockRun });
      mockDb.transaction.mockImplementation(async (cb) => cb({ prepare: mockPrepare }));
    });

    it('should save player with all fields', async () => {
      const player = mockPlayer({
        id: 'p123',
        name: 'Hero',
        description: 'Brave',
        position: { x: 10, y: 20, z: 5 },
        health: 85,
        level: 5,
        experience: 1500,
        inventory: ['sword', 'shield'],
        gameId: 'g456',
      });

      await helper.savePlayerToDatabase(player);

      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      expect(mockRun).toHaveBeenCalledWith(
        'p123',
        'g456',
        'Hero',
        'Brave',
        'player',
        10,
        20,
        5,
        85,
        85,
        5,
        1500,
        '["sword","shield"]',
        '{}',
        1,
        expect.any(String),
      );
    });

    it('should use default values for missing fields', async () => {
      const player: IPlayer = {
        id: 'p1',
        name: 'Minimal',
        type: 'player',
        position: { x: 0, y: 0, z: 0 },
      };

      await helper.savePlayerToDatabase(player);

      expect(mockRun).toHaveBeenCalledWith(
        'p1',
        'default',
        'Minimal',
        undefined,
        'player',
        0,
        0,
        0,
        100,
        100,
        1,
        0,
        '[]',
        '{}',
        1,
        expect.any(String),
      );
    });

    it('should handle transaction errors', async () => {
      mockDb.transaction.mockRejectedValue(new Error('Transaction failed'));

      await expect(helper.savePlayerToDatabase(mockPlayer())).rejects.toThrow('Transaction failed');
    });

    it('should serialize inventory correctly', async () => {
      await helper.savePlayerToDatabase(mockPlayer({ inventory: ['a', 'b', 'c'] }));

      const inventoryArg = mockRun.mock.calls[0][12];
      expect(inventoryArg).toBe('["a","b","c"]');
      expect(JSON.parse(inventoryArg)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('loadPlayerFromDatabase', () => {
    it('should load player by id', async () => {
      const mockRow = mockDbRow({ id: 'p123', name: 'Loaded', position_x: 15, position_y: 25 });
      const mockGet = jest.fn().mockReturnValue(mockRow);
      mockDb.prepare.mockReturnValue({ get: mockGet } as any);

      const result = await helper.loadPlayerFromDatabase('p123');

      expect(result).toBeDefined();
      expect(result?.id).toBe('p123');
      expect(result?.name).toBe('Loaded');
      expect(result?.position).toEqual({ x: 15, y: 25, z: 0 });
      expect(mockGet).toHaveBeenCalledWith('p123');
    });

    it('should load player by id and gameId', async () => {
      const mockGet = jest.fn().mockReturnValue(mockDbRow());
      mockDb.prepare.mockReturnValue({ get: mockGet } as any);

      await helper.loadPlayerFromDatabase('p1', 'g1');

      expect(mockGet).toHaveBeenCalledWith('p1', 'g1');
    });

    it('should return undefined for non-existent player', async () => {
      const mockGet = jest.fn().mockReturnValue(null);
      mockDb.prepare.mockReturnValue({ get: mockGet } as any);

      const result = await helper.loadPlayerFromDatabase('nonexistent');

      expect(result).toBeUndefined();
    });

    it('should parse inventory data correctly', async () => {
      const mockRow = mockDbRow({ inventory_data: '["sword","potion"]' });
      const mockGet = jest.fn().mockReturnValue(mockRow);
      mockDb.prepare.mockReturnValue({ get: mockGet } as any);

      const result = await helper.loadPlayerFromDatabase('p1');

      expect(result?.inventory).toEqual(['sword', 'potion']);
    });

    it('should handle invalid inventory JSON gracefully', async () => {
      const mockRow = mockDbRow({ inventory_data: 'invalid{]' });
      const mockGet = jest.fn().mockReturnValue(mockRow);
      mockDb.prepare.mockReturnValue({ get: mockGet } as any);

      const result = await helper.loadPlayerFromDatabase('p1');

      expect(result?.inventory).toEqual([]);
    });

    it('should handle non-array inventory data', async () => {
      const mockRow = mockDbRow({ inventory_data: '{"items":["sword"]}' });
      const mockGet = jest.fn().mockReturnValue(mockRow);
      mockDb.prepare.mockReturnValue({ get: mockGet } as any);

      const result = await helper.loadPlayerFromDatabase('p1');

      expect(result?.inventory).toEqual([]);
    });

    it('should handle null inventory data', async () => {
      const mockRow = mockDbRow({ inventory_data: null });
      const mockGet = jest.fn().mockReturnValue(mockRow);
      mockDb.prepare.mockReturnValue({ get: mockGet } as any);

      const result = await helper.loadPlayerFromDatabase('p1');

      expect(result?.inventory).toEqual([]);
    });

    it('should use defaults for missing position and stats', async () => {
      const mockRow = mockDbRow({
        position_x: null,
        position_y: null,
        position_z: null,
        health: null,
        level: null,
        experience: null,
      });
      const mockGet = jest.fn().mockReturnValue(mockRow);
      mockDb.prepare.mockReturnValue({ get: mockGet } as any);

      const result = await helper.loadPlayerFromDatabase('p1');

      expect(result?.position).toEqual({ x: 0, y: 0, z: 0 });
      expect(result?.health).toBe(100);
      expect(result?.level).toBe(1);
      expect(result?.experience).toBe(0);
    });

    it('should return undefined on database error', async () => {
      mockDb.prepare.mockImplementation(() => {
        throw new Error('Database error');
      });

      const result = await helper.loadPlayerFromDatabase('p1');

      expect(result).toBeUndefined();
    });

    it('should set player type correctly', async () => {
      const mockGet = jest.fn().mockReturnValue(mockDbRow());
      mockDb.prepare.mockReturnValue({ get: mockGet } as any);

      const result = await helper.loadPlayerFromDatabase('p1');

      expect(result?.type).toBe('player');
    });
  });

  describe('loadMultiplePlayers', () => {
    it('should return empty array for empty input', async () => {
      const result = await helper.loadMultiplePlayers([]);

      expect(result).toEqual([]);
      expect(mockDb.prepare).not.toHaveBeenCalled();
    });

    it('should load multiple players in batch', async () => {
      const mockRows = [
        mockDbRow({ id: 'p1', name: 'Player 1' }),
        mockDbRow({ id: 'p2', name: 'Player 2' }),
        mockDbRow({ id: 'p3', name: 'Player 3' }),
      ];
      const mockAll = jest.fn().mockReturnValue(mockRows);
      mockDb.prepare.mockReturnValue({ all: mockAll } as any);

      const result = await helper.loadMultiplePlayers(['p1', 'p2', 'p3']);

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('Player 1');
      expect(result[1].name).toBe('Player 2');
      expect(mockAll).toHaveBeenCalledWith('p1', 'p2', 'p3');
    });

    it('should use correct SQL placeholders', async () => {
      const mockAll = jest.fn().mockReturnValue([]);
      const mockPrepare = jest.fn().mockReturnValue({ all: mockAll });
      mockDb.prepare = mockPrepare;

      await helper.loadMultiplePlayers(['p1', 'p2', 'p3', 'p4']);

      const sql = mockPrepare.mock.calls[0][0];
      expect(sql).toContain('WHERE id IN (?,?,?,?)');
    });

    it('should handle database errors gracefully', async () => {
      mockDb.prepare.mockImplementation(() => {
        throw new Error('Database error');
      });

      const result = await helper.loadMultiplePlayers(['p1', 'p2']);

      expect(result).toEqual([]);
    });

    it('should parse inventory for each player', async () => {
      const mockRows = [
        mockDbRow({ id: 'p1', inventory_data: '["item-1"]' }),
        mockDbRow({ id: 'p2', inventory_data: '["item-2","item-3"]' }),
      ];
      const mockAll = jest.fn().mockReturnValue(mockRows);
      mockDb.prepare.mockReturnValue({ all: mockAll } as any);

      const result = await helper.loadMultiplePlayers(['p1', 'p2']);

      expect(result[0].inventory).toEqual(['item-1']);
      expect(result[1].inventory).toEqual(['item-2', 'item-3']);
    });
  });

  describe('loadGamePlayersFromDatabase', () => {
    it('should load all players for a game', async () => {
      const mockIdRows = [{ id: 'p1' }, { id: 'p2' }];
      const mockPlayerRows = [mockDbRow({ id: 'p1', game_id: 'g1' }), mockDbRow({ id: 'p2', game_id: 'g1' })];
      const mockAll = jest.fn().mockReturnValueOnce(mockIdRows).mockReturnValueOnce(mockPlayerRows);
      mockDb.prepare.mockReturnValue({ all: mockAll } as any);

      const result = await helper.loadGamePlayersFromDatabase('g1');
      expect(result).toHaveLength(2);
      expect(result[0].gameId).toBe('g1');
    });

    it('should return empty array and handle errors', async () => {
      const mockAll = jest.fn().mockReturnValue([]);
      mockDb.prepare.mockReturnValue({ all: mockAll } as any);
      expect(await helper.loadGamePlayersFromDatabase('empty-game')).toEqual([]);

      mockDb.prepare.mockImplementation(() => {
        throw new Error('Database error');
      });
      expect(await helper.loadGamePlayersFromDatabase('g1')).toEqual([]);
    });
  });

  describe('loadAllPlayersFromDatabase', () => {
    it('should load all players', async () => {
      const mockIdRows = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }];
      const mockPlayerRows = [mockDbRow({ id: 'p1' }), mockDbRow({ id: 'p2' }), mockDbRow({ id: 'p3' })];
      const mockAll = jest.fn().mockReturnValueOnce(mockIdRows).mockReturnValueOnce(mockPlayerRows);
      mockDb.prepare.mockReturnValue({ all: mockAll } as any);

      expect(await helper.loadAllPlayersFromDatabase()).toHaveLength(3);
    });

    it('should return empty array and handle errors', async () => {
      const mockAll = jest.fn().mockReturnValue([]);
      mockDb.prepare.mockReturnValue({ all: mockAll } as any);
      expect(await helper.loadAllPlayersFromDatabase()).toEqual([]);

      mockDb.prepare.mockImplementation(() => {
        throw new Error('Database error');
      });
      expect(await helper.loadAllPlayersFromDatabase()).toEqual([]);
    });
  });

  describe('persistPlayers', () => {
    it('should persist multiple players', async () => {
      const players = [mockPlayer({ id: 'p1' }), mockPlayer({ id: 'p2' }), mockPlayer({ id: 'p3' })];
      const mockRun = jest.fn();
      const mockPrepare = jest.fn().mockReturnValue({ run: mockRun });
      mockDb.transaction.mockImplementation(async (cb) => cb({ prepare: mockPrepare }));

      await helper.persistPlayers(players);

      expect(mockDb.transaction).toHaveBeenCalledTimes(3);
    });

    it('should handle empty player array', async () => {
      await helper.persistPlayers([]);

      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('should throw error on save failure', async () => {
      mockDb.transaction.mockRejectedValue(new Error('Save failed'));

      await expect(helper.persistPlayers([mockPlayer()])).rejects.toThrow('Save failed');
    });

    it('should warn when database unavailable', async () => {
      const helperWithoutDb = new PlayerPersistenceHelper();

      await expect(helperWithoutDb.persistPlayers([mockPlayer()])).resolves.toBeUndefined();
    });
  });

  describe('savePlayerVersion', () => {
    it('should save player version with reason', async () => {
      const player = mockPlayer();
      mockDb.saveVersion.mockResolvedValue(1);

      const version = await helper.savePlayerVersion('p1', player, 'level up');

      expect(version).toBe(1);
      expect(mockDb.saveVersion).toHaveBeenCalledWith('player', 'p1', player, 'player_service', 'level up');
    });

    it('should save player version without reason', async () => {
      const player = mockPlayer();
      mockDb.saveVersion.mockResolvedValue(2);

      const version = await helper.savePlayerVersion('p1', player);

      expect(version).toBe(2);
      expect(mockDb.saveVersion).toHaveBeenCalledWith('player', 'p1', player, 'player_service', undefined);
    });

    it('should propagate database errors', async () => {
      mockDb.saveVersion.mockRejectedValue(new Error('Version save failed'));

      await expect(helper.savePlayerVersion('p1', mockPlayer())).rejects.toThrow('Version save failed');
    });
  });

  describe('getPlayerVersion', () => {
    it('should get specific player version', async () => {
      const player = mockPlayer();
      mockDb.getVersion.mockResolvedValue(player);

      const result = await helper.getPlayerVersion('p1', 5);

      expect(result).toEqual(player);
      expect(mockDb.getVersion).toHaveBeenCalledWith('player', 'p1', 5);
    });

    it('should get latest version when not specified', async () => {
      const player = mockPlayer();
      mockDb.getVersion.mockResolvedValue(player);

      const result = await helper.getPlayerVersion('p1');

      expect(result).toEqual(player);
      expect(mockDb.getVersion).toHaveBeenCalledWith('player', 'p1', undefined);
    });

    it('should return null for non-existent version', async () => {
      mockDb.getVersion.mockResolvedValue(null);

      const result = await helper.getPlayerVersion('p1', 999);

      expect(result).toBeNull();
    });

    it('should propagate database errors', async () => {
      mockDb.getVersion.mockRejectedValue(new Error('Get version failed'));

      await expect(helper.getPlayerVersion('p1', 1)).rejects.toThrow('Get version failed');
    });
  });

  describe('rollbackPlayer', () => {
    it('should rollback player to previous version', async () => {
      const oldPlayer = mockPlayer({ level: 3, experience: 500 });
      mockDb.getVersion.mockResolvedValue(oldPlayer);

      const mockRun = jest.fn();
      const mockPrepare = jest.fn().mockReturnValue({ run: mockRun });
      mockDb.transaction.mockImplementation(async (cb) => cb({ prepare: mockPrepare }));
      mockDb.saveVersion.mockResolvedValue(10);

      const result = await helper.rollbackPlayer('p1', 5);

      expect(result).toEqual(oldPlayer);
      expect(mockDb.getVersion).toHaveBeenCalledWith('player', 'p1', 5);
      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockDb.saveVersion).toHaveBeenCalledWith('player', 'p1', oldPlayer, 'system', 'Rollback to version 5');
    });

    it('should return null when version does not exist', async () => {
      mockDb.getVersion.mockResolvedValue(null);

      const result = await helper.rollbackPlayer('p1', 999);

      expect(result).toBeNull();
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('should handle save errors during rollback', async () => {
      mockDb.getVersion.mockResolvedValue(mockPlayer());
      mockDb.transaction.mockRejectedValue(new Error('Save failed'));

      await expect(helper.rollbackPlayer('p1', 5)).rejects.toThrow('Save failed');
    });

    it('should handle version history errors during rollback', async () => {
      const oldPlayer = mockPlayer();
      mockDb.getVersion.mockResolvedValue(oldPlayer);

      const mockRun = jest.fn();
      const mockPrepare = jest.fn().mockReturnValue({ run: mockRun });
      mockDb.transaction.mockImplementation(async (cb) => cb({ prepare: mockPrepare }));
      mockDb.saveVersion.mockRejectedValue(new Error('Version save failed'));

      await expect(helper.rollbackPlayer('p1', 5)).rejects.toThrow('Version save failed');
    });
  });

  describe('Data Integrity', () => {
    it('should maintain gameId through save', async () => {
      const player = mockPlayer({ gameId: 'test-game-123' });
      const mockRun = jest.fn();
      const mockPrepare = jest.fn().mockReturnValue({ run: mockRun });
      mockDb.transaction.mockImplementation(async (cb) => cb({ prepare: mockPrepare }));

      await helper.savePlayerToDatabase(player);

      expect(mockRun.mock.calls[0][1]).toBe('test-game-123');
    });

    it('should maintain position precision', async () => {
      const mockRow = mockDbRow({ position_x: 123.456, position_y: 789.012, position_z: 345.678 });
      const mockGet = jest.fn().mockReturnValue(mockRow);
      mockDb.prepare.mockReturnValue({ get: mockGet } as any);

      const result = await helper.loadPlayerFromDatabase('p1');

      expect(result?.position).toEqual({ x: 123.456, y: 789.012, z: 345.678 });
    });

    it('should handle large inventory arrays', async () => {
      const largeInventory = Array.from({ length: 100 }, (_, i) => `item-${i}`);
      const player = mockPlayer({ inventory: largeInventory });
      const mockRun = jest.fn();
      const mockPrepare = jest.fn().mockReturnValue({ run: mockRun });
      mockDb.transaction.mockImplementation(async (cb) => cb({ prepare: mockPrepare }));

      await helper.savePlayerToDatabase(player);

      const inventoryArg = mockRun.mock.calls[0][12];
      expect(JSON.parse(inventoryArg)).toHaveLength(100);
    });

    it('should handle special characters in player data', async () => {
      const player = mockPlayer({
        name: "Player's \"Special\" Name",
        description: 'Contains\nnewlines\tand\ttabs',
      });
      const mockRun = jest.fn();
      const mockPrepare = jest.fn().mockReturnValue({ run: mockRun });
      mockDb.transaction.mockImplementation(async (cb) => cb({ prepare: mockPrepare }));

      await helper.savePlayerToDatabase(player);

      expect(mockRun.mock.calls[0][2]).toBe("Player's \"Special\" Name");
      expect(mockRun.mock.calls[0][3]).toBe('Contains\nnewlines\tand\ttabs');
    });
  });
});
