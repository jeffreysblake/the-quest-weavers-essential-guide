import { Test, TestingModule } from '@nestjs/testing';
import { RoomConnectionHelper } from './room-connection.helper';
import { IRoom } from '../room.interface';

describe('RoomConnectionHelper', () => {
  let helper: RoomConnectionHelper;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RoomConnectionHelper],
    }).compile();

    helper = module.get<RoomConnectionHelper>(RoomConnectionHelper);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Initialization', () => {
    it('should be defined', () => {
      expect(helper).toBeDefined();
    });
  });

  describe('connectRooms', () => {
    let room1: IRoom;
    let room2: IRoom;

    beforeEach(() => {
      room1 = {
        id: 'room-1',
        name: 'Main Hall',
        type: 'room',
        width: 10,
        height: 10,
        size: { width: 10, height: 10, depth: 10 },
        position: { x: 0, y: 0, z: 0 },
        objects: [],
        players: [],
      };

      room2 = {
        id: 'room-2',
        name: 'Northern Chamber',
        type: 'room',
        width: 10,
        height: 10,
        size: { width: 10, height: 10, depth: 10 },
        position: { x: 0, y: 10, z: 0 },
        objects: [],
        players: [],
      };
    });

    it('should connect two rooms bidirectionally with north/south', () => {
      const result = helper.connectRooms(room1, room2, 'north');

      expect(result).toBe(true);
      expect(room1.connections).toBeDefined();
      expect(room1.connections.north).toBe('room-2');
      expect(room2.connections).toBeDefined();
      expect(room2.connections.south).toBe('room-1');
    });

    it('should connect two rooms bidirectionally with east/west', () => {
      const result = helper.connectRooms(room1, room2, 'east');

      expect(result).toBe(true);
      expect(room1.connections.east).toBe('room-2');
      expect(room2.connections.west).toBe('room-1');
    });

    it('should connect two rooms bidirectionally with up/down', () => {
      const result = helper.connectRooms(room1, room2, 'up');

      expect(result).toBe(true);
      expect(room1.connections.up).toBe('room-2');
      expect(room2.connections.down).toBe('room-1');
    });

    it('should initialize connections object if undefined on room1', () => {
      delete room1.connections;
      delete room2.connections;

      helper.connectRooms(room1, room2, 'north');

      expect(room1.connections).toBeDefined();
      expect(room1.connections).toEqual({ north: 'room-2' });
    });

    it('should initialize connections object if undefined on room2', () => {
      delete room1.connections;
      delete room2.connections;

      helper.connectRooms(room1, room2, 'north');

      expect(room2.connections).toBeDefined();
      expect(room2.connections).toEqual({ south: 'room-1' });
    });

    it('should preserve existing connections when adding new ones', () => {
      room1.connections = { south: 'room-3' };
      room2.connections = { east: 'room-4' };

      helper.connectRooms(room1, room2, 'north');

      expect(room1.connections).toEqual({
        south: 'room-3',
        north: 'room-2',
      });
      expect(room2.connections).toEqual({
        east: 'room-4',
        south: 'room-1',
      });
    });

    it('should handle connection with unknown direction (no reverse)', () => {
      const result = helper.connectRooms(room1, room2, 'portal');

      expect(result).toBe(true);
      expect(room1.connections.portal).toBe('room-2');
      expect(room2.connections.portal).toBeUndefined();
    });

    it('should handle multiple connections to same room', () => {
      helper.connectRooms(room1, room2, 'north');
      helper.connectRooms(room1, room2, 'up');

      expect(room1.connections.north).toBe('room-2');
      expect(room1.connections.up).toBe('room-2');
      expect(room2.connections.south).toBe('room-1');
      expect(room2.connections.down).toBe('room-1');
    });

    it('should overwrite existing connection in same direction', () => {
      const room3: IRoom = {
        id: 'room-3',
        name: 'Another Room',
        type: 'room',
        width: 10,
        height: 10,
        size: { width: 10, height: 10, depth: 10 },
        position: { x: 0, y: 20, z: 0 },
        objects: [],
        players: [],
      };

      helper.connectRooms(room1, room2, 'north');
      helper.connectRooms(room1, room3, 'north');

      expect(room1.connections.north).toBe('room-3');
    });
  });

  describe('calculateDistance', () => {
    it('should calculate distance between two different positions', () => {
      const pos1 = { x: 0, y: 0, z: 0 };
      const pos2 = { x: 3, y: 4, z: 0 };

      const distance = helper.calculateDistance(pos1, pos2);

      expect(distance).toBe(5); // 3-4-5 triangle
    });

    it('should calculate distance for same position (zero distance)', () => {
      const pos = { x: 5, y: 10, z: 3 };

      const distance = helper.calculateDistance(pos, pos);

      expect(distance).toBe(0);
    });

    it('should calculate distance along x-axis only', () => {
      const pos1 = { x: 0, y: 5, z: 3 };
      const pos2 = { x: 10, y: 5, z: 3 };

      const distance = helper.calculateDistance(pos1, pos2);

      expect(distance).toBe(10);
    });

    it('should calculate distance along y-axis only', () => {
      const pos1 = { x: 5, y: 0, z: 3 };
      const pos2 = { x: 5, y: 8, z: 3 };

      const distance = helper.calculateDistance(pos1, pos2);

      expect(distance).toBe(8);
    });

    it('should calculate distance along z-axis only', () => {
      const pos1 = { x: 5, y: 10, z: 0 };
      const pos2 = { x: 5, y: 10, z: 6 };

      const distance = helper.calculateDistance(pos1, pos2);

      expect(distance).toBe(6);
    });

    it('should calculate 3D distance across all axes', () => {
      const pos1 = { x: 0, y: 0, z: 0 };
      const pos2 = { x: 1, y: 2, z: 2 };

      const distance = helper.calculateDistance(pos1, pos2);

      expect(distance).toBe(3); // sqrt(1 + 4 + 4) = 3
    });

    it('should handle negative coordinates', () => {
      const pos1 = { x: -5, y: -3, z: -2 };
      const pos2 = { x: 5, y: 3, z: 2 };

      const distance = helper.calculateDistance(pos1, pos2);

      expect(distance).toBeCloseTo(12.328, 2); // sqrt(100 + 36 + 16)
    });

    it('should handle very large distances', () => {
      const pos1 = { x: 0, y: 0, z: 0 };
      const pos2 = { x: 1000, y: 1000, z: 1000 };

      const distance = helper.calculateDistance(pos1, pos2);

      expect(distance).toBeCloseTo(1732.05, 2); // sqrt(3000000)
    });

    it('should handle fractional coordinates', () => {
      const pos1 = { x: 0.5, y: 1.5, z: 2.5 };
      const pos2 = { x: 3.5, y: 4.5, z: 5.5 };

      const distance = helper.calculateDistance(pos1, pos2);

      expect(distance).toBeCloseTo(5.196, 2); // sqrt(9 + 9 + 9)
    });

    it('should return 0 for null position (pos1)', () => {
      const pos2 = { x: 5, y: 5, z: 5 };

      const distance = helper.calculateDistance(null, pos2);

      expect(distance).toBe(0);
    });

    it('should return 0 for null position (pos2)', () => {
      const pos1 = { x: 5, y: 5, z: 5 };

      const distance = helper.calculateDistance(pos1, null);

      expect(distance).toBe(0);
    });

    it('should return 0 for undefined position (pos1)', () => {
      const pos2 = { x: 5, y: 5, z: 5 };

      const distance = helper.calculateDistance(undefined, pos2);

      expect(distance).toBe(0);
    });

    it('should return 0 for undefined position (pos2)', () => {
      const pos1 = { x: 5, y: 5, z: 5 };

      const distance = helper.calculateDistance(pos1, undefined);

      expect(distance).toBe(0);
    });

    it('should handle position with missing x coordinate', () => {
      const pos1 = { x: undefined, y: 3, z: 4 } as any;
      const pos2 = { x: 5, y: 3, z: 4 };

      const distance = helper.calculateDistance(pos1, pos2);

      expect(distance).toBe(5); // Treats undefined x as 0
    });

    it('should handle position with missing y coordinate', () => {
      const pos1 = { x: 3, y: undefined, z: 4 } as any;
      const pos2 = { x: 3, y: 5, z: 4 };

      const distance = helper.calculateDistance(pos1, pos2);

      expect(distance).toBe(5);
    });

    it('should handle position with missing z coordinate', () => {
      const pos1 = { x: 3, y: 4, z: undefined } as any;
      const pos2 = { x: 3, y: 4, z: 5 };

      const distance = helper.calculateDistance(pos1, pos2);

      expect(distance).toBe(5);
    });

    it('should handle position with non-numeric coordinates', () => {
      const pos1 = { x: 'invalid', y: 'bad', z: 'wrong' } as any;
      const pos2 = { x: 3, y: 4, z: 0 };

      const distance = helper.calculateDistance(pos1, pos2);

      expect(distance).toBe(5); // Treats non-numeric as 0
    });

    it('should handle both positions with non-numeric coordinates', () => {
      const pos1 = { x: 'invalid', y: 3, z: 4 } as any;
      const pos2 = { x: 'bad', y: 3, z: 4 };

      const distance = helper.calculateDistance(pos1, pos2);

      expect(distance).toBe(0); // Both x coords treated as 0
    });

    it('should calculate distance with zero values explicitly set', () => {
      const pos1 = { x: 0, y: 0, z: 0 };
      const pos2 = { x: 0, y: 0, z: 0 };

      const distance = helper.calculateDistance(pos1, pos2);

      expect(distance).toBe(0);
    });
  });

  describe('getReverseDirection', () => {
    it('should return "south" for "north"', () => {
      expect(helper.getReverseDirection('north')).toBe('south');
    });

    it('should return "north" for "south"', () => {
      expect(helper.getReverseDirection('south')).toBe('north');
    });

    it('should return "west" for "east"', () => {
      expect(helper.getReverseDirection('east')).toBe('west');
    });

    it('should return "east" for "west"', () => {
      expect(helper.getReverseDirection('west')).toBe('east');
    });

    it('should return "down" for "up"', () => {
      expect(helper.getReverseDirection('up')).toBe('down');
    });

    it('should return "up" for "down"', () => {
      expect(helper.getReverseDirection('down')).toBe('up');
    });

    it('should return undefined for unknown direction', () => {
      expect(helper.getReverseDirection('portal')).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      expect(helper.getReverseDirection('')).toBeUndefined();
    });

    it('should return undefined for case-sensitive mismatch (uppercase)', () => {
      expect(helper.getReverseDirection('NORTH')).toBeUndefined();
    });

    it('should return undefined for case-sensitive mismatch (mixed case)', () => {
      expect(helper.getReverseDirection('North')).toBeUndefined();
    });
  });
});
