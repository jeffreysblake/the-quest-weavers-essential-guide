import { Test, TestingModule } from '@nestjs/testing';
import { PlayerService } from './player.service';
import { EntityService } from './entity.service';
import { ObjectService } from './object.service';
import { PhysicsService } from './physics.service';
import { DatabaseService } from '../database/database.service';
import { IPlayer } from './player.interface';

describe('PlayerService with Persistence', () => {
  let service: PlayerService;
  let entityService: EntityService;
  let objectService: ObjectService;
  let physicsService: PhysicsService;
  let databaseService: DatabaseService;

  const mockEntityService = {
    createEntity: jest.fn(),
    getEntity: jest.fn(),
    updateEntity: jest.fn(),
    clearCache: jest.fn(),
    getCacheStats: jest.fn().mockReturnValue({ size: 0, entities: [] }),
  };

  const mockObjectService = {
    getObject: jest.fn(),
    removeObjectFromContainer: jest.fn(),
  };

  const mockPhysicsService = {
    applyEffect: jest.fn(),
    applyAreaEffect: jest.fn(),
  };

  const mockDatabaseService = {
    transaction: jest.fn(),
    prepare: jest.fn(),
    saveVersion: jest.fn(),
    getVersion: jest.fn(),
    listVersions: jest.fn(),
    rollbackToVersion: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayerService,
        { provide: EntityService, useValue: mockEntityService },
        { provide: ObjectService, useValue: mockObjectService },
        { provide: PhysicsService, useValue: mockPhysicsService },
        { provide: DatabaseService, useValue: mockDatabaseService },
      ],
    }).compile();

    service = module.get<PlayerService>(PlayerService);
    entityService = module.get<EntityService>(EntityService);
    objectService = module.get<ObjectService>(ObjectService);
    physicsService = module.get<PhysicsService>(PhysicsService);
    databaseService = module.get<DatabaseService>(DatabaseService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Player Creation with Persistence', () => {
    it('should create player and save to database', async () => {
      const playerData = {
        name: 'Test Player',
        description: 'A test player',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        level: 1,
        experience: 0,
        inventory: [],
        gameId: 'test-game',
      };

      const mockRun = jest.fn();
      const mockPrepare = jest.fn().mockReturnValue({ run: mockRun });
      mockDatabaseService.transaction.mockImplementation(async (callback) => {
        await callback({ prepare: mockPrepare });
      });
      mockEntityService.createEntity.mockReturnValue({
        id: 'player-1',
        ...playerData,
      });

      const result = service.createPlayer(playerData);

      expect(result).toBeDefined();
      expect(result.name).toBe('Test Player');
      expect(result.type).toBe('player');
      expect(mockEntityService.createEntity).toHaveBeenCalled();
    });

    it('should handle database save failure gracefully', async () => {
      const playerData = {
        name: 'Test Player',
        position: { x: 0, y: 0, z: 0 },
      };

      mockDatabaseService.transaction.mockRejectedValue(
        new Error('Database error'),
      );
      mockEntityService.createEntity.mockReturnValue({
        id: 'player-1',
        ...playerData,
        type: 'player',
        health: 100,
        level: 1,
        experience: 0,
        inventory: [],
      });

      // Should still create player even if database fails
      const result = service.createPlayer(playerData);

      expect(result).toBeDefined();
      expect(result.name).toBe('Test Player');
    });
  });

  describe('Player Retrieval with Fallback', () => {
    it('should get player from cache first', async () => {
      const mockPlayer: IPlayer = {
        id: 'player-1',
        name: 'Cached Player',
        type: 'player',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        level: 1,
        experience: 0,
        inventory: [],
        gameId: 'test-game',
      };

      // Setup cache
      service['players'].set('player-1', mockPlayer);

      const result = await service.getPlayerWithFallback(
        'player-1',
        'test-game',
      );

      expect(result).toEqual(mockPlayer);
      expect(mockDatabaseService.prepare).not.toHaveBeenCalled();
    });

    it('should fallback to EntityService if not in cache', async () => {
      const mockPlayer = {
        id: 'player-1',
        name: 'Entity Player',
        type: 'player',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        level: 1,
        experience: 0,
        inventory: [],
      };

      mockEntityService.getEntity.mockReturnValue(mockPlayer);

      const result = await service.getPlayerWithFallback(
        'player-1',
        'test-game',
      );

      expect(result).toEqual(mockPlayer);
      expect(mockEntityService.getEntity).toHaveBeenCalledWith('player-1');
      expect(service['players'].has('player-1')).toBeTruthy();
    });

    it('should load from database if not found elsewhere', async () => {
      const mockPlayerRow = {
        id: 'player-1',
        name: 'DB Player',
        position_x: 5,
        position_y: 10,
        position_z: 0,
        health: 80,
        level: 3,
        experience: 150,
        inventory_data: '["item1", "item2"]',
        game_id: 'test-game',
      };

      mockEntityService.getEntity.mockReturnValue(null);

      const mockGet = jest.fn().mockReturnValue(mockPlayerRow);
      const mockPrepare = jest.fn().mockReturnValue({ get: mockGet });
      mockDatabaseService.prepare.mockImplementation(mockPrepare);

      const result = await service.getPlayerWithFallback(
        'player-1',
        'test-game',
      );

      expect(result).toBeDefined();
      expect(result?.name).toBe('DB Player');
      expect(result?.position).toEqual({ x: 5, y: 10, z: 0 });
      expect(result?.inventory).toEqual(['item1', 'item2']);
      expect(mockEntityService.createEntity).toHaveBeenCalled();
    });

    it('should return undefined if player not found anywhere', async () => {
      mockEntityService.getEntity.mockReturnValue(null);

      const mockGet = jest.fn().mockReturnValue(null);
      mockDatabaseService.prepare.mockReturnValue({ get: mockGet });

      const result = await service.getPlayerWithFallback(
        'nonexistent',
        'test-game',
      );

      expect(result).toBeUndefined();
    });
  });

  describe('Player Interactions', () => {
    beforeEach(() => {
      const mockPlayer: IPlayer = {
        id: 'player-1',
        name: 'Test Player',
        type: 'player',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        level: 1,
        experience: 0,
        inventory: [],
      };
      service['players'].set('player-1', mockPlayer);
    });

    it('should interact with objects - examine', () => {
      const mockObject = {
        id: 'obj-1',
        name: 'Test Object',
        type: 'object',
        position: { x: 0, y: 0, z: 0 },
      };

      mockObjectService.getObject.mockReturnValue(mockObject);

      const result = service.interactWithObject('player-1', 'obj-1', 'examine');

      expect(result.success).toBeTruthy();
      expect(result.message).toContain('You examine the Test Object');
    });

    it('should take portable objects', () => {
      const mockObject = {
        id: 'obj-1',
        name: 'Portable Item',
        type: 'object',
        isPortable: true,
        spatialRelationship: {
          relationshipType: 'inside',
          targetId: 'container-1',
        },
      };

      mockObjectService.getObject.mockReturnValue(mockObject);
      mockObjectService.removeObjectFromContainer.mockReturnValue(true);
      mockEntityService.updateEntity.mockReturnValue(true);

      const result = service.interactWithObject('player-1', 'obj-1', 'take');

      expect(result.success).toBeTruthy();
      expect(result.message).toBe('You take the Portable Item.');
      expect(mockObjectService.removeObjectFromContainer).toHaveBeenCalled();
    });

    it('should not take non-portable objects', () => {
      const mockObject = {
        id: 'obj-1',
        name: 'Heavy Object',
        type: 'object',
        isPortable: false,
      };

      mockObjectService.getObject.mockReturnValue(mockObject);

      const result = service.interactWithObject('player-1', 'obj-1', 'take');

      expect(result.success).toBeFalsy();
      expect(result.message).toBe('You cannot take the Heavy Object.');
    });
  });

  describe('Magic System', () => {
    beforeEach(() => {
      const mockPlayer: IPlayer = {
        id: 'player-1',
        name: 'Wizard',
        type: 'player',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        level: 5,
        experience: 500,
        inventory: [],
      };
      service['players'].set('player-1', mockPlayer);
    });

    it('should cast targeted spells', () => {
      const mockPhysicsResult = {
        success: true,
        message: 'Target takes fire damage!',
        damage: 25,
      };

      mockPhysicsService.applyEffect.mockReturnValue(mockPhysicsResult);

      const result = service.castSpell('player-1', 'fire', 'target-1', 8);

      expect(result.success).toBeTruthy();
      expect(result.message).toContain('Wizard casts Fireball!');
      expect(result.message).toContain('Target takes fire damage!');
      expect(mockPhysicsService.applyEffect).toHaveBeenCalledWith('target-1', {
        type: 'fire',
        intensity: 8,
        sourceId: 'player-1',
        description: 'powerful fireball',
      });
    });

    it('should cast area spells', () => {
      const mockPhysicsResult = {
        success: true,
        message: 'Lightning strikes the room!',
        affectedEntities: ['obj-1', 'obj-2'],
      };

      mockPhysicsService.applyAreaEffect.mockReturnValue(mockPhysicsResult);

      const result = service.castAreaSpell(
        'player-1',
        'lightning',
        'room-1',
        6,
      );

      expect(result.success).toBeTruthy();
      expect(result.message).toContain(
        'Wizard casts Lightning Bolt across the room!',
      );
      expect(mockPhysicsService.applyAreaEffect).toHaveBeenCalledWith(
        'room-1',
        {
          type: 'lightning',
          intensity: 6,
          sourceId: 'player-1',
          description: 'area lightning bolt',
        },
      );
    });

    it('should handle spell casting for non-existent player', () => {
      const result = service.castSpell('nonexistent', 'fire', 'target-1');

      expect(result.success).toBeFalsy();
      expect(result.message).toBe('Player not found');
    });
  });

  describe('Persistence Operations', () => {
    it('should persist all players', async () => {
      const mockPlayer: IPlayer = {
        id: 'player-1',
        name: 'Test Player',
        type: 'player',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        level: 1,
        experience: 0,
        inventory: [],
        gameId: 'test-game',
      };

      service['players'].set('player-1', mockPlayer);

      const mockRun = jest.fn();
      const mockPrepare = jest.fn().mockReturnValue({ run: mockRun });
      mockDatabaseService.transaction.mockImplementation(async (callback) => {
        await callback({ prepare: mockPrepare });
      });
      mockDatabaseService.saveVersion.mockResolvedValue(1);

      await service.persistPlayers();

      expect(mockDatabaseService.transaction).toHaveBeenCalled();
      expect(mockDatabaseService.saveVersion).toHaveBeenCalled();
    });

    it('should load players from database', async () => {
      const mockPlayerRows = [
        {
          id: 'player-1',
          name: 'Player 1',
          position_x: 0,
          position_y: 0,
          position_z: 0,
          health: 100,
          level: 1,
          experience: 0,
          inventory_data: '[]',
          game_id: 'test-game',
        },
      ];

      const mockAll = jest.fn().mockReturnValue(mockPlayerRows);
      const mockGet = jest.fn().mockReturnValue(mockPlayerRows[0]);
      const mockPrepare = jest
        .fn()
        .mockReturnValueOnce({ all: mockAll })
        .mockReturnValueOnce({ get: mockGet });
      mockDatabaseService.prepare.mockImplementation(mockPrepare);

      await service.loadPlayers('test-game');

      expect(service['players'].size).toBe(1);
      expect(service['players'].has('player-1')).toBeTruthy();
    });
  });

  describe('Version Management', () => {
    it('should save player version', async () => {
      const mockPlayer: IPlayer = {
        id: 'player-1',
        name: 'Test Player',
        type: 'player',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        level: 1,
        experience: 0,
        inventory: [],
      };

      service['players'].set('player-1', mockPlayer);
      mockDatabaseService.saveVersion.mockResolvedValue(2);

      const version = await service.savePlayerVersion('player-1', 'Test save');

      expect(version).toBe(2);
      expect(mockDatabaseService.saveVersion).toHaveBeenCalledWith(
        'player',
        'player-1',
        mockPlayer,
        'player_service',
        'Test save',
      );
    });

    it('should rollback player to specific version', async () => {
      const mockPlayer: IPlayer = {
        id: 'player-1',
        name: 'Restored Player',
        type: 'player',
        position: { x: 5, y: 5, z: 0 },
        health: 80,
        level: 2,
        experience: 100,
        inventory: ['item1'],
      };

      mockDatabaseService.rollbackToVersion.mockResolvedValue(true);

      const mockGet = jest.fn().mockReturnValue({
        id: 'player-1',
        name: 'Restored Player',
        position_x: 5,
        position_y: 5,
        position_z: 0,
        health: 80,
        level: 2,
        experience: 100,
        inventory_data: '["item1"]',
        game_id: 'test-game',
      });
      mockDatabaseService.prepare.mockReturnValue({ get: mockGet });

      const success = await service.rollbackPlayer('player-1', 1);

      expect(success).toBeTruthy();
      expect(mockDatabaseService.rollbackToVersion).toHaveBeenCalledWith(
        'player',
        'player-1',
        1,
      );
      expect(service['players'].get('player-1')?.name).toBe('Restored Player');
    });
  });

  describe('Cache Management', () => {
    it('should clear cache', () => {
      service['players'].set('player-1', {} as IPlayer);
      service['players'].set('player-2', {} as IPlayer);

      expect(service['players'].size).toBe(2);

      service.clearCache();

      expect(service['players'].size).toBe(0);
    });

    it('should get cache statistics', () => {
      service['players'].set('player-1', {} as IPlayer);
      service['players'].set('player-2', {} as IPlayer);

      const stats = service.getCacheStats();

      expect(stats.size).toBe(2);
      expect(stats.players).toEqual(['player-1', 'player-2']);
    });
  });

  describe('Inventory Management', () => {
    beforeEach(() => {
      const mockPlayer: IPlayer = {
        id: 'player-1',
        name: 'Test Player',
        type: 'player',
        position: { x: 0, y: 0, z: 0 },
        health: 100,
        level: 1,
        experience: 0,
        inventory: ['existing-item'],
      };
      service['players'].set('player-1', mockPlayer);
    });

    it('should add items to inventory', () => {
      mockEntityService.updateEntity.mockReturnValue(true);

      const result = service.addToInventory('player-1', 'new-item');

      expect(result).toBeTruthy();
      expect(service['players'].get('player-1')?.inventory).toContain(
        'new-item',
      );
    });

    it('should not add duplicate items', () => {
      const result = service.addToInventory('player-1', 'existing-item');

      expect(result).toBeTruthy();
      expect(
        service['players']
          .get('player-1')
          ?.inventory.filter((item) => item === 'existing-item'),
      ).toHaveLength(1);
    });

    it('should remove items from inventory', () => {
      mockEntityService.updateEntity.mockReturnValue(true);

      const result = service.removeFromInventory('player-1', 'existing-item');

      expect(result).toBeTruthy();
      expect(service['players'].get('player-1')?.inventory).not.toContain(
        'existing-item',
      );
    });

    it('should get inventory with object details', () => {
      const mockObject = { id: 'existing-item', name: 'Test Item' };
      mockObjectService.getObject.mockReturnValue(mockObject);

      const inventory = service.getInventory('player-1');

      expect(inventory).toHaveLength(1);
      expect(inventory[0]).toEqual(mockObject);
    });
  });
});
