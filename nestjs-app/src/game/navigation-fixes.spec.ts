import { Test, TestingModule } from '@nestjs/testing';
import { CommandProcessorService } from './command-processor.service';
import { PlayerService } from '../entity/player.service';
import { RoomService } from '../entity/room.service';
import { ObjectService } from '../entity/object.service';
import { EntityService } from '../entity/entity.service';

describe('CommandProcessorService - Navigation Fixes', () => {
  let service: CommandProcessorService;
  let playerService: PlayerService;
  let roomService: RoomService;
  let objectService: ObjectService;
  let module: TestingModule;

  const mockPlayer = {
    id: 'player-1',
    name: 'Test Player',
    position: { x: 0, y: 0, z: 0 },
    health: 100,
    inventory: [],
  };

  const mockRooms = [
    {
      id: 'entry-hall',
      name: 'Entry Hall',
      description: 'A dimly lit entry hall',
      position: { x: 0, y: 0, z: 0 },
      size: { width: 10, height: 10, depth: 3 },
      objects: ['torch-1', 'key-1'],
      players: [],
    },
    {
      id: 'garden',
      name: 'Garden',
      description: 'A peaceful garden',
      position: { x: 0, y: 15, z: 0 }, // Fixed: was y: 10, causing overlap
      size: { width: 10, height: 10, depth: 3 },
      objects: ['flower-1'],
      players: [],
    },
    {
      id: 'library',
      name: 'Library',
      description: 'A vast library',
      position: { x: 15, y: 0, z: 0 }, // Fixed: was x: 10, causing potential issues
      size: { width: 10, height: 10, depth: 3 },
      objects: ['book-1'],
      players: [],
    },
  ];

  const mockObjects = [
    { id: 'torch-1', name: 'Flickering Torch', canTake: false },
    { id: 'key-1', name: 'Brass Key', canTake: true },
    { id: 'flower-1', name: 'Glowing Flower', canTake: true },
    { id: 'book-1', name: 'Ancient Tome', canTake: true },
  ];

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        CommandProcessorService,
        {
          provide: PlayerService,
          useValue: {
            getPlayer: jest.fn().mockReturnValue(mockPlayer),
            movePlayer: jest.fn(),
            addToInventory: jest.fn(),
            removeFromInventory: jest.fn(),
            getInventory: jest.fn().mockReturnValue([]),
          },
        },
        {
          provide: RoomService,
          useValue: {
            getAllRooms: jest.fn().mockReturnValue(mockRooms),
            getObjectsInRoom: jest.fn(),
            addObjectToRoom: jest.fn(),
            removeObjectFromRoom: jest.fn(),
          },
        },
        {
          provide: ObjectService,
          useValue: {
            updateObjectPosition: jest.fn(),
          },
        },
        {
          provide: EntityService,
          useValue: {
            getEntity: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CommandProcessorService>(CommandProcessorService);
    playerService = module.get<PlayerService>(PlayerService);
    roomService = module.get<RoomService>(RoomService);
    objectService = module.get<ObjectService>(ObjectService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('Room Boundary Detection', () => {
    it('should correctly detect player in Entry Hall', async () => {
      const result = await service.processCommand('look', 'player-1', 'game-1');

      expect(result.success).toBe(true);
      expect(result.type).toBe('room_description');
      expect(result.playerStatus?.location).toBe('Entry Hall');
    });

    it('should handle room boundaries without overlap', async () => {
      // Test that Garden at (0,15,0) doesn't overlap with Entry Hall at (0,0,0)
      const player = { ...mockPlayer, position: { x: 0, y: 10, z: 0 } };
      jest.spyOn(playerService, 'getPlayer').mockReturnValue(player);

      const result = await service.processCommand('look', 'player-1', 'game-1');

      // Player at (0,10,0) should not be in any room due to fixed boundaries
      expect(result.success).toBe(false);
      expect(result.message).toBe('Current location not found');
    });

    it('should correctly detect player in Garden after movement', async () => {
      const playerInGarden = { ...mockPlayer, position: { x: 5, y: 17, z: 0 } };
      jest.spyOn(playerService, 'getPlayer').mockReturnValue(playerInGarden);

      const result = await service.processCommand('look', 'player-1', 'game-1');

      expect(result.success).toBe(true);
      expect(result.playerStatus?.location).toBe('Garden');
    });
  });

  describe('Movement System', () => {
    beforeEach(() => {
      jest.spyOn(roomService, 'getObjectsInRoom').mockReturnValue([]);
    });

    it('should move north from Entry Hall to Garden with correct distance', async () => {
      const result = await service.processCommand(
        'go north',
        'player-1',
        'game-1',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('movement_success');
      expect(result.message).toBe('You move north.');
      expect(result.playerStatus?.location).toBe('Garden');

      // Verify correct movement distance (15 units, not 10)
      expect(playerService.movePlayer).toHaveBeenCalledWith('player-1', {
        x: 0,
        y: 15,
        z: 0,
      });
    });

    it('should move east from Entry Hall to Library with correct distance', async () => {
      const result = await service.processCommand(
        'go east',
        'player-1',
        'game-1',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('movement_success');
      expect(result.message).toBe('You move east.');
      expect(result.playerStatus?.location).toBe('Library');

      // Verify correct movement distance (15 units, not 10)
      expect(playerService.movePlayer).toHaveBeenCalledWith('player-1', {
        x: 15,
        y: 0,
        z: 0,
      });
    });

    it('should prevent invalid movement', async () => {
      const playerInGarden = { ...mockPlayer, position: { x: 5, y: 17, z: 0 } };
      jest.spyOn(playerService, 'getPlayer').mockReturnValue(playerInGarden);

      const result = await service.processCommand(
        'go east',
        'player-1',
        'game-1',
      );

      expect(result.success).toBe(false);
      expect(result.type).toBe('movement_blocked');
      expect(result.message).toBe('You cannot go east from here.');
    });

    it('should handle vertical movement', async () => {
      const result = await service.processCommand(
        'go up',
        'player-1',
        'game-1',
      );

      // Should attempt to move up by 1 unit
      expect(playerService.movePlayer).toHaveBeenCalledWith('player-1', {
        x: 0,
        y: 0,
        z: 1,
      });
    });
  });

  describe('Look Command Fixes', () => {
    it('should return room description with items and exits', async () => {
      jest.spyOn(roomService, 'getObjectsInRoom').mockReturnValue([
        mockObjects[0], // Flickering Torch
        mockObjects[1], // Brass Key
      ]);

      const result = await service.processCommand('look', 'player-1', 'game-1');

      expect(result.success).toBe(true);
      expect(result.type).toBe('room_description');
      expect(result.roomDescription).toBe('A dimly lit entry hall');
      expect(result.items).toEqual(['Flickering Torch', 'Brass Key']);
      expect(result.exits).toEqual(['north', 'east']);
      expect(result.playerStatus?.location).toBe('Entry Hall');
    });

    it('should handle look at specific objects', async () => {
      jest
        .spyOn(roomService, 'getObjectsInRoom')
        .mockReturnValue([mockObjects[1]]);

      const result = await service.processCommand(
        'look key',
        'player-1',
        'game-1',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('examination');
    });
  });

  describe('Object Interaction', () => {
    it('should handle taking objects with proper inventory management', async () => {
      jest
        .spyOn(roomService, 'getObjectsInRoom')
        .mockReturnValue([mockObjects[1]]);

      const result = await service.processCommand(
        'take key',
        'player-1',
        'game-1',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('action_success');
      expect(result.message).toBe('You take the Brass Key.');

      expect(playerService.addToInventory).toHaveBeenCalledWith(
        'player-1',
        'key-1',
      );
      expect(roomService.removeObjectFromRoom).toHaveBeenCalledWith(
        'entry-hall',
        'key-1',
      );
    });

    it('should prevent taking non-portable objects', async () => {
      jest
        .spyOn(roomService, 'getObjectsInRoom')
        .mockReturnValue([mockObjects[0]]);

      const result = await service.processCommand(
        'take torch',
        'player-1',
        'game-1',
      );

      expect(result.success).toBe(false);
      expect(result.type).toBe('action_failure');
      expect(result.message).toBe('You cannot take the Flickering Torch.');
    });

    it('should handle dropping objects', async () => {
      jest
        .spyOn(playerService, 'getInventory')
        .mockReturnValue([mockObjects[1]]);

      const result = await service.processCommand(
        'drop key',
        'player-1',
        'game-1',
      );

      expect(result.success).toBe(true);
      expect(result.type).toBe('action_success');
      expect(result.message).toBe('You drop the Brass Key.');

      expect(playerService.removeFromInventory).toHaveBeenCalledWith(
        'player-1',
        'key-1',
      );
      expect(objectService.updateObjectPosition).toHaveBeenCalledWith('key-1', {
        x: 0,
        y: 0,
        z: 0,
      });
      expect(roomService.addObjectToRoom).toHaveBeenCalledWith(
        'entry-hall',
        'key-1',
      );
    });
  });

  describe('Command Parsing', () => {
    it('should handle various movement aliases', async () => {
      jest.spyOn(roomService, 'getObjectsInRoom').mockReturnValue([]);

      // Test direct direction commands
      await service.processCommand('north', 'player-1', 'game-1');
      expect(playerService.movePlayer).toHaveBeenLastCalledWith('player-1', {
        x: 0,
        y: 15,
        z: 0,
      });

      // Reset mock
      jest.clearAllMocks();

      await service.processCommand('east', 'player-1', 'game-1');
      expect(playerService.movePlayer).toHaveBeenLastCalledWith('player-1', {
        x: 15,
        y: 0,
        z: 0,
      });
    });

    it('should handle command variations', async () => {
      jest
        .spyOn(roomService, 'getObjectsInRoom')
        .mockReturnValue([mockObjects[1]]);

      // Test 'get' alias for 'take'
      const result = await service.processCommand(
        'get key',
        'player-1',
        'game-1',
      );
      expect(result.success).toBe(true);
      expect(result.message).toBe('You take the Brass Key.');
    });
  });
});
