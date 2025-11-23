import { Test, TestingModule } from '@nestjs/testing';
import { RoomNavigationHelperService } from './room-navigation-helper.service';
import { RoomService } from '../entity/room.service';

describe('RoomNavigationHelperService', () => {
  let service: RoomNavigationHelperService;
  let roomService: jest.Mocked<RoomService>;

  // Test data
  const mockRoom1 = {
    id: 'room-1',
    gameId: 'game-1',
    name: 'Main Hall',
    position: { x: 0, y: 0, z: 0 },
    size: { width: 10, height: 10, depth: 10 },
    connections: { north: 'room-2', east: 'room-3' },
  };

  const mockRoom2 = {
    id: 'room-2',
    gameId: 'game-1',
    name: 'Northern Chamber',
    position: { x: 0, y: 10, z: 0 },
    size: { width: 10, height: 10, depth: 10 },
    connections: { south: 'room-1' },
  };

  const mockRoom3 = {
    id: 'room-3',
    gameId: 'game-1',
    name: 'Eastern Wing',
    position: { x: 10, y: 0, z: 0 },
    size: { width: 10, height: 10, depth: 10 },
    connections: { west: 'room-1' },
  };

  const mockRoom4 = {
    id: 'room-4',
    gameId: 'game-1',
    name: 'Upper Level',
    position: { x: 0, y: 0, z: 1 },
    size: { width: 10, height: 10, depth: 10 },
    connections: {},
  };

  const mockRoom5 = {
    id: 'room-5',
    gameId: 'game-2',
    name: 'Different Game Room',
    position: { x: 0, y: 0, z: 0 },
    size: { width: 10, height: 10, depth: 10 },
    connections: {},
  };

  // Smaller room overlapping with room-1
  const mockSmallRoom = {
    id: 'room-small',
    gameId: 'game-1',
    name: 'Small Alcove',
    position: { x: 2, y: 2, z: 0 },
    size: { width: 3, height: 3, depth: 3 },
    connections: {},
  };

  const mockPlayer = {
    id: 'player-1',
    gameId: 'game-1',
    name: 'Test Player',
    position: { x: 5, y: 5, z: 0 },
  };

  beforeEach(async () => {
    const mockRoomService = {
      getAllRooms: jest.fn(),
      getRoom: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomNavigationHelperService,
        { provide: RoomService, useValue: mockRoomService },
      ],
    }).compile();

    service = module.get<RoomNavigationHelperService>(
      RoomNavigationHelperService,
    );
    roomService = module.get(RoomService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getCurrentRoom', () => {
    it('should return room when player is at valid position', () => {
      roomService.getAllRooms.mockReturnValue([mockRoom1, mockRoom2]);
      const result = service.getCurrentRoom(mockPlayer);
      expect(result).toBeDefined();
      expect(result.id).toBe('room-1');
    });

    it('should return undefined when player is null or undefined', () => {
      expect(service.getCurrentRoom(null)).toBeUndefined();
      expect(service.getCurrentRoom(undefined)).toBeUndefined();
    });

    it('should return undefined when player has no position', () => {
      const result = service.getCurrentRoom({ id: 'player-1', name: 'Test' });
      expect(result).toBeUndefined();
    });

    it('should return undefined when position has invalid coordinates', () => {
      expect(service.getCurrentRoom({ ...mockPlayer, position: { x: 'invalid', y: 5, z: 0 } })).toBeUndefined();
      expect(service.getCurrentRoom({ ...mockPlayer, position: { x: 5, y: null, z: 0 } })).toBeUndefined();
      expect(service.getCurrentRoom({ ...mockPlayer, position: { x: 5, y: 5, z: undefined } })).toBeUndefined();
    });

    it('should return smallest room when multiple rooms contain player', () => {
      roomService.getAllRooms.mockReturnValue([mockRoom1, mockSmallRoom]);
      const result = service.getCurrentRoom({ ...mockPlayer, position: { x: 3, y: 3, z: 0 } });
      expect(result.id).toBe('room-small');
    });

    it('should filter rooms by gameId when player has gameId', () => {
      roomService.getAllRooms.mockReturnValue([mockRoom1, mockRoom5]);
      const result = service.getCurrentRoom(mockPlayer);
      expect(result.id).toBe('room-1');
    });

    it('should use all rooms when player has no gameId', () => {
      roomService.getAllRooms.mockReturnValue([mockRoom5]);
      const result = service.getCurrentRoom({ ...mockPlayer, gameId: undefined, position: { x: 5, y: 5, z: 0 } });
      expect(result?.id).toBe('room-5');
    });

    it('should return undefined when no rooms contain player', () => {
      roomService.getAllRooms.mockReturnValue([mockRoom2, mockRoom3]);
      const result = service.getCurrentRoom({ ...mockPlayer, position: { x: 100, y: 100, z: 0 } });
      expect(result).toBeUndefined();
    });
  });

  describe('isPositionInRoom', () => {
    it('should return true when position is inside room', () => {
      expect(service.isPositionInRoom({ x: 5, y: 5, z: 5 }, mockRoom1)).toBe(true);
      expect(service.isPositionInRoom({ x: 0, y: 0, z: 0 }, mockRoom1)).toBe(true);
    });

    it('should return false when position is outside room boundaries', () => {
      expect(service.isPositionInRoom({ x: 10, y: 5, z: 5 }, mockRoom1)).toBe(false);
      expect(service.isPositionInRoom({ x: -1, y: 5, z: 5 }, mockRoom1)).toBe(false);
      expect(service.isPositionInRoom({ x: 5, y: 15, z: 5 }, mockRoom1)).toBe(false);
      expect(service.isPositionInRoom({ x: 5, y: 5, z: 20 }, mockRoom1)).toBe(false);
    });

    it('should return false when position is null or undefined', () => {
      expect(service.isPositionInRoom(null, mockRoom1)).toBe(false);
      expect(service.isPositionInRoom(undefined, mockRoom1)).toBe(false);
    });

    it('should return false when position has invalid coordinates', () => {
      expect(service.isPositionInRoom({ x: 'invalid', y: 5, z: 5 }, mockRoom1)).toBe(false);
      expect(service.isPositionInRoom({ x: 5, y: null, z: 5 }, mockRoom1)).toBe(false);
      expect(service.isPositionInRoom({ x: 5, y: 5, z: undefined }, mockRoom1)).toBe(false);
    });

    it('should return false when room is null or invalid', () => {
      const position = { x: 5, y: 5, z: 5 };
      expect(service.isPositionInRoom(position, null)).toBe(false);
      expect(service.isPositionInRoom(position, { id: 'room-1', size: { width: 10, height: 10, depth: 10 } })).toBe(false);
      expect(service.isPositionInRoom(position, { id: 'room-1', position: { x: 0, y: 0, z: 0 } })).toBe(false);
    });

    it('should return false when room has invalid properties', () => {
      const position = { x: 5, y: 5, z: 5 };
      expect(service.isPositionInRoom(position, {
        position: { x: 'bad', y: 0, z: 0 },
        size: { width: 10, height: 10, depth: 10 },
      })).toBe(false);
      expect(service.isPositionInRoom(position, {
        position: { x: 0, y: 0, z: 0 },
        size: { width: null, height: 10, depth: 10 },
      })).toBe(false);
    });
  });

  describe('getAvailableExits', () => {
    it('should return exits from room connections when available', () => {
      expect(service.getAvailableExits(mockRoom1)).toEqual(['north', 'east']);
      expect(service.getAvailableExits(mockRoom4)).toEqual([]);
    });

    it('should detect all cardinal directions via position-based fallback', () => {
      roomService.getAllRooms.mockReturnValue([mockRoom1, mockRoom2]);
      expect(service.getAvailableExits({ ...mockRoom1, connections: undefined })).toContain('north');
      expect(service.getAvailableExits({ ...mockRoom2, connections: undefined })).toContain('south');

      roomService.getAllRooms.mockReturnValue([mockRoom1, mockRoom3]);
      expect(service.getAvailableExits({ ...mockRoom1, connections: undefined })).toContain('east');
      expect(service.getAvailableExits({ ...mockRoom3, connections: undefined })).toContain('west');
    });

    it('should filter rooms by gameId in position-based detection', () => {
      roomService.getAllRooms.mockReturnValue([mockRoom1, mockRoom5]);
      expect(service.getAvailableExits({ ...mockRoom1, connections: undefined })).not.toContain('north');
    });

    it('should return empty array when no exits found', () => {
      roomService.getAllRooms.mockReturnValue([mockRoom4]);
      expect(service.getAvailableExits({ ...mockRoom4, connections: undefined })).toEqual([]);
    });
  });

  describe('findAdjacentRoom', () => {
    describe('using connections', () => {
      beforeEach(() => {
        roomService.getRoom.mockImplementation((id: string) => {
          const rooms = { 'room-2': mockRoom2, 'room-3': mockRoom3 };
          return rooms[id];
        });
      });

      it('should find rooms via connections', () => {
        expect(service.findAdjacentRoom(mockRoom1, 'north')?.id).toBe('room-2');
        expect(service.findAdjacentRoom(mockRoom1, 'east')?.id).toBe('room-3');
        expect(roomService.getRoom).toHaveBeenCalledWith('room-2');
      });

      it('should return undefined when connection exists but target room not found', () => {
        roomService.getRoom.mockReturnValue(undefined);
        expect(service.findAdjacentRoom(mockRoom1, 'north')).toBeUndefined();
      });
    });

    describe('position-based fallback', () => {
      beforeEach(() => {
        roomService.getAllRooms.mockReturnValue([mockRoom1, mockRoom2, mockRoom3, mockRoom4]);
      });

      it('should find all six directions via position', () => {
        expect(service.findAdjacentRoom({ ...mockRoom1, connections: {} }, 'north')?.id).toBe('room-2');
        expect(service.findAdjacentRoom({ ...mockRoom2, connections: {} }, 'south')?.id).toBe('room-1');
        expect(service.findAdjacentRoom({ ...mockRoom1, connections: {} }, 'east')?.id).toBe('room-3');
        expect(service.findAdjacentRoom({ ...mockRoom3, connections: {} }, 'west')?.id).toBe('room-1');
        expect(service.findAdjacentRoom({ ...mockRoom1, connections: {} }, 'up')?.id).toBe('room-4');
        expect(service.findAdjacentRoom({ ...mockRoom4, connections: {} }, 'down')?.id).toBe('room-1');
      });

      it('should filter by gameId in position-based search', () => {
        roomService.getAllRooms.mockReturnValue([mockRoom1, mockRoom5]);
        expect(service.findAdjacentRoom({ ...mockRoom1, connections: {} }, 'north')).toBeUndefined();
      });

      it('should return null for invalid direction', () => {
        expect(service.findAdjacentRoom({ ...mockRoom1, connections: {} }, 'invalid')).toBeNull();
        expect(service.findAdjacentRoom(mockRoom1, '')).toBeNull();
        expect(service.findAdjacentRoom({ ...mockRoom1, connections: {} }, 'NORTH')).toBeNull();
      });

      it('should return undefined when no adjacent room exists', () => {
        roomService.getAllRooms.mockReturnValue([mockRoom1]);
        expect(service.findAdjacentRoom({ ...mockRoom1, connections: {} }, 'north')).toBeUndefined();
      });
    });

    describe('edge cases', () => {
      it('should handle room without gameId', () => {
        roomService.getAllRooms.mockReturnValue([{ ...mockRoom1, gameId: undefined }, mockRoom2]);
        expect(service.findAdjacentRoom({ ...mockRoom1, gameId: undefined, connections: {} }, 'north')).toBeDefined();
      });

      it('should prioritize connections over position-based detection', () => {
        roomService.getRoom.mockReturnValue(mockRoom2);
        const result = service.findAdjacentRoom(mockRoom1, 'north');
        expect(result.id).toBe('room-2');
        expect(roomService.getRoom).toHaveBeenCalled();
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete navigation workflow', () => {
      roomService.getAllRooms.mockReturnValue([mockRoom1, mockRoom2, mockRoom3]);
      roomService.getRoom.mockImplementation((id: string) => {
        const rooms = { 'room-2': mockRoom2, 'room-3': mockRoom3 };
        return rooms[id];
      });

      const currentRoom = service.getCurrentRoom(mockPlayer);
      expect(currentRoom.id).toBe('room-1');

      const exits = service.getAvailableExits(currentRoom);
      expect(exits).toContain('north');
      expect(exits).toContain('east');

      const northRoom = service.findAdjacentRoom(currentRoom, 'north');
      expect(northRoom.id).toBe('room-2');

      const eastRoom = service.findAdjacentRoom(currentRoom, 'east');
      expect(eastRoom.id).toBe('room-3');
    });

    it('should handle player in small overlapping room', () => {
      roomService.getAllRooms.mockReturnValue([mockRoom1, mockSmallRoom]);
      const currentRoom = service.getCurrentRoom({ ...mockPlayer, position: { x: 3, y: 3, z: 1 } });
      expect(currentRoom.id).toBe('room-small');
    });

    it('should handle multi-game scenario', () => {
      roomService.getAllRooms.mockReturnValue([mockRoom1, mockRoom5]);

      const room1 = service.getCurrentRoom({ ...mockPlayer, gameId: 'game-1' });
      expect(room1.id).toBe('room-1');

      const room2 = service.getCurrentRoom({ ...mockPlayer, gameId: 'game-2', position: { x: 5, y: 5, z: 0 } });
      expect(room2.id).toBe('room-5');
    });

    it('should handle navigation between vertical levels', () => {
      roomService.getAllRooms.mockReturnValue([mockRoom1, mockRoom4]);
      roomService.getRoom.mockReturnValue(undefined);

      const ground = service.getCurrentRoom(mockPlayer);
      expect(ground.id).toBe('room-1');

      const upper = service.findAdjacentRoom({ ...ground, connections: {} }, 'up');
      expect(upper?.id).toBe('room-4');

      const playerOnUpper = { ...mockPlayer, position: { x: 5, y: 5, z: 1 } };
      const currentUpper = service.getCurrentRoom(playerOnUpper);
      expect(currentUpper.id).toBe('room-4');

      const backDown = service.findAdjacentRoom({ ...currentUpper, connections: {} }, 'down');
      expect(backDown?.id).toBe('room-1');
    });

    it('should handle position at exact room boundaries', () => {
      roomService.getAllRooms.mockReturnValue([mockRoom1]);

      // Bottom-left corner (inclusive)
      expect(service.isPositionInRoom({ x: 0, y: 0, z: 0 }, mockRoom1)).toBe(true);

      // Top-right corner (exclusive)
      expect(service.isPositionInRoom({ x: 9, y: 9, z: 9 }, mockRoom1)).toBe(true);
      expect(service.isPositionInRoom({ x: 10, y: 10, z: 10 }, mockRoom1)).toBe(false);
    });

    it('should handle rooms with no connections or neighbors', () => {
      const isolatedRoom = { ...mockRoom1, connections: {} };
      roomService.getAllRooms.mockReturnValue([isolatedRoom]);

      const exits = service.getAvailableExits(isolatedRoom);
      expect(exits).toEqual([]);

      expect(service.findAdjacentRoom(isolatedRoom, 'north')).toBeUndefined();
      expect(service.findAdjacentRoom(isolatedRoom, 'south')).toBeUndefined();
      expect(service.findAdjacentRoom(isolatedRoom, 'east')).toBeUndefined();
      expect(service.findAdjacentRoom(isolatedRoom, 'west')).toBeUndefined();
    });

    it('should handle complex room networks with multiple connections', () => {
      const centralRoom = {
        id: 'central',
        gameId: 'game-1',
        position: { x: 10, y: 10, z: 0 },
        size: { width: 10, height: 10, depth: 10 },
        connections: { north: 'n', south: 's', east: 'e', west: 'w' },
      };

      roomService.getRoom.mockImplementation((id: string) => ({
        id,
        gameId: 'game-1',
        position: { x: 0, y: 0, z: 0 },
        size: { width: 5, height: 5, depth: 5 },
        connections: {},
      }));

      const exits = service.getAvailableExits(centralRoom);
      expect(exits).toHaveLength(4);
      expect(exits).toContain('north');
      expect(exits).toContain('south');
      expect(exits).toContain('east');
      expect(exits).toContain('west');
    });

    it('should correctly calculate room volumes for overlap resolution', () => {
      const largeRoom = {
        id: 'large',
        gameId: 'game-1',
        position: { x: 0, y: 0, z: 0 },
        size: { width: 20, height: 20, depth: 20 },
        connections: {},
      };

      const mediumRoom = {
        id: 'medium',
        gameId: 'game-1',
        position: { x: 5, y: 5, z: 5 },
        size: { width: 10, height: 10, depth: 10 },
        connections: {},
      };

      const tinyRoom = {
        id: 'tiny',
        gameId: 'game-1',
        position: { x: 7, y: 7, z: 7 },
        size: { width: 2, height: 2, depth: 2 },
        connections: {},
      };

      roomService.getAllRooms.mockReturnValue([largeRoom, mediumRoom, tinyRoom]);

      const playerInAll = { ...mockPlayer, position: { x: 8, y: 8, z: 8 } };
      const result = service.getCurrentRoom(playerInAll);

      expect(result.id).toBe('tiny'); // Smallest volume: 2*2*2 = 8
    });
  });
});
