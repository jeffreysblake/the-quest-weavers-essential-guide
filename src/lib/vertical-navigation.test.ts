/**
 * Comprehensive test suite for Vertical Navigation System
 * Tests all connection types, requirements, difficulty, consequences, and edge cases
 */

import { VerticalNavigationSystem, VerticalConnectionType, VerticalConnection, MovementResult } from './vertical-navigation';
import { RoomSystem } from './room-system';
import { ItemSystem } from './item-system';
import { GameStateManager } from './game-state-manager';

// Mock dependencies
jest.mock('./room-system');
jest.mock('./item-system');
jest.mock('./game-state-manager');

describe('VerticalNavigationSystem', () => {
  let verticalNav: VerticalNavigationSystem;
  let mockRoomSystem: jest.Mocked<RoomSystem>;
  let mockItemSystem: jest.Mocked<ItemSystem>;
  let mockGameStateManager: jest.Mocked<GameStateManager>;

  beforeEach(() => {
    // Reset mocks
    mockRoomSystem = new RoomSystem(null as any, null as any) as jest.Mocked<RoomSystem>;
    mockItemSystem = new ItemSystem() as jest.Mocked<ItemSystem>;
    mockGameStateManager = new GameStateManager(null as any) as jest.Mocked<GameStateManager>;

    // Setup mock implementations
    mockGameStateManager.getPlayerState = jest.fn().mockReturnValue({
      currentRoomId: 'room1',
      playerId: 'player1'
    });
    mockGameStateManager.movePlayerToRoom = jest.fn();
    mockGameStateManager.recordEvent = jest.fn();

    verticalNav = new VerticalNavigationSystem(
      mockRoomSystem,
      mockItemSystem,
      mockGameStateManager
    );
  });

  describe('Connection Creation', () => {
    it('should create a basic stairs_up connection', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'stairs_up',
        'Wooden Staircase',
        'A creaky wooden staircase'
      );

      expect(connectionId).toBeTruthy();
      expect(connectionId).toMatch(/^vertical_/);

      const connection = verticalNav.getConnection(connectionId);
      expect(connection).toBeDefined();
      expect(connection?.fromRoomId).toBe('room1');
      expect(connection?.toRoomId).toBe('room2');
      expect(connection?.connectionType).toBe('stairs_up');
      expect(connection?.name).toBe('Wooden Staircase');
      expect(connection?.description).toBe('A creaky wooden staircase');
      expect(connection?.difficulty).toBe(1.0);
      expect(connection?.movementTime).toBe(5);
      expect(connection?.isReversible).toBe(true);
    });

    it('should create a rope_up connection with requirements', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'rope_up',
        'Climbing Rope',
        'A thick rope hanging down',
        {
          requirements: {
            items: ['rope'],
            skills: { strength: 5 },
            health: 50
          },
          difficulty: 0.8,
          movementTime: 15
        }
      );

      const connection = verticalNav.getConnection(connectionId);
      expect(connection?.requirements?.items).toContain('rope');
      expect(connection?.requirements?.skills?.strength).toBe(5);
      expect(connection?.requirements?.health).toBe(50);
      expect(connection?.difficulty).toBe(0.8);
      expect(connection?.movementTime).toBe(15);
    });

    it('should create a non-reversible slide connection', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'slide',
        'Metal Slide',
        'A slippery metal slide',
        {
          isReversible: false,
          difficulty: 1.0
        }
      );

      const connection = verticalNav.getConnection(connectionId);
      expect(connection?.isReversible).toBe(false);
    });

    it('should create a connection with failure consequences', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'vine',
        'Jungle Vine',
        'A thick jungle vine',
        {
          difficulty: 0.7,
          consequences: {
            failureMessage: 'The vine snaps!',
            damageonFailure: 15,
            fallbackRoomId: 'room3'
          }
        }
      );

      const connection = verticalNav.getConnection(connectionId);
      expect(connection?.consequences?.failureMessage).toBe('The vine snaps!');
      expect(connection?.consequences?.damageonFailure).toBe(15);
      expect(connection?.consequences?.fallbackRoomId).toBe('room3');
    });

    it('should create a magic_portal with sound effect', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'magic_portal',
        'Arcane Portal',
        'A shimmering portal',
        {
          soundEffect: 'portal_whoosh',
          difficulty: 0.9
        }
      );

      const connection = verticalNav.getConnection(connectionId);
      expect(connection?.soundEffect).toBe('portal_whoosh');
      expect(connection?.connectionType).toBe('magic_portal');
    });

    it('should create an elevator connection', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'elevator',
        'Old Elevator',
        'A rusty elevator',
        {
          movementTime: 20,
          difficulty: 0.95
        }
      );

      const connection = verticalNav.getConnection(connectionId);
      expect(connection?.connectionType).toBe('elevator');
      expect(connection?.movementTime).toBe(20);
    });

    it('should create a teleporter connection', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'teleporter',
        'Sci-Fi Teleporter',
        'A high-tech teleporter'
      );

      const connection = verticalNav.getConnection(connectionId);
      expect(connection?.connectionType).toBe('teleporter');
    });

    it('should create a ladder connection', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'ladder',
        'Metal Ladder',
        'A sturdy metal ladder'
      );

      const connection = verticalNav.getConnection(connectionId);
      expect(connection?.connectionType).toBe('ladder');
    });
  });

  describe('Getting Available Connections', () => {
    it('should return all connections from a room', () => {
      verticalNav.createConnection('room1', 'room2', 'stairs_up', 'Stairs 1', 'desc1');
      verticalNav.createConnection('room1', 'room3', 'rope_up', 'Rope 1', 'desc2');

      const connections = verticalNav.getAvailableConnections('room1');
      expect(connections).toHaveLength(2);
      expect(connections[0].name).toBe('Stairs 1');
      expect(connections[1].name).toBe('Rope 1');
    });

    it('should return reversible connections when in destination room', () => {
      verticalNav.createConnection('room1', 'room2', 'stairs_up', 'Stairs', 'desc', {
        isReversible: true
      });

      const connectionsFromRoom2 = verticalNav.getAvailableConnections('room2');
      expect(connectionsFromRoom2).toHaveLength(1);
      expect(connectionsFromRoom2[0].name).toBe('Stairs');
    });

    it('should not return non-reversible connections when in destination room', () => {
      verticalNav.createConnection('room1', 'room2', 'slide', 'Slide', 'desc', {
        isReversible: false
      });

      const connectionsFromRoom2 = verticalNav.getAvailableConnections('room2');
      expect(connectionsFromRoom2).toHaveLength(0);
    });

    it('should return empty array for room with no connections', () => {
      const connections = verticalNav.getAvailableConnections('room999');
      expect(connections).toHaveLength(0);
    });

    it('should handle multiple reversible connections', () => {
      verticalNav.createConnection('room1', 'room2', 'stairs_up', 'Stairs', 'desc');
      verticalNav.createConnection('room2', 'room3', 'ladder', 'Ladder', 'desc');

      const room2Connections = verticalNav.getAvailableConnections('room2');
      expect(room2Connections).toHaveLength(2);
    });
  });

  describe('Attempting Movement - Success Cases', () => {
    it('should successfully move player with 100% difficulty', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'stairs_up',
        'Stairs',
        'desc',
        { difficulty: 1.0 }
      );

      const result = verticalNav.attemptMovement('player1', connectionId);

      expect(result.success).toBe(true);
      expect(result.newRoomId).toBe('room2');
      expect(result.message).toContain('climb up');
      expect(result.timeElapsed).toBe(5);
      expect(mockGameStateManager.movePlayerToRoom).toHaveBeenCalledWith('player1', 'room2');
      expect(mockGameStateManager.recordEvent).toHaveBeenCalled();
    });

    it('should include sound effect in successful movement', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'stairs_up',
        'Stairs',
        'desc',
        {
          difficulty: 1.0,
          soundEffect: 'footsteps'
        }
      );

      const result = verticalNav.attemptMovement('player1', connectionId);

      expect(result.soundEffect).toBe('footsteps');
    });

    it('should handle reverse movement on reversible connection', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'stairs_up',
        'Stairs',
        'desc',
        { difficulty: 1.0, isReversible: true }
      );

      mockGameStateManager.getPlayerState = jest.fn().mockReturnValue({
        currentRoomId: 'room2',
        playerId: 'player1'
      });

      const result = verticalNav.attemptMovement('player1', connectionId);

      expect(result.success).toBe(true);
      expect(result.newRoomId).toBe('room1');
      expect(mockGameStateManager.movePlayerToRoom).toHaveBeenCalledWith('player1', 'room1');
    });

    it('should return custom movement time', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'elevator',
        'Elevator',
        'desc',
        {
          difficulty: 1.0,
          movementTime: 30
        }
      );

      const result = verticalNav.attemptMovement('player1', connectionId);

      expect(result.timeElapsed).toBe(30);
    });
  });

  describe('Attempting Movement - Failure Cases', () => {
    it('should fail for non-existent connection', () => {
      const result = verticalNav.attemptMovement('player1', 'invalid_id');

      expect(result.success).toBe(false);
      expect(result.message).toBe("That path doesn't exist.");
    });

    it('should fail when player is not found', () => {
      const connectionId = verticalNav.createConnection('room1', 'room2', 'stairs_up', 'Stairs', 'desc');

      mockGameStateManager.getPlayerState = jest.fn().mockReturnValue(null);

      const result = verticalNav.attemptMovement('player1', connectionId);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Player not found.');
    });

    it('should fail when player is in wrong room', () => {
      const connectionId = verticalNav.createConnection('room1', 'room2', 'stairs_up', 'Stairs', 'desc');

      mockGameStateManager.getPlayerState = jest.fn().mockReturnValue({
        currentRoomId: 'room3',
        playerId: 'player1'
      });

      const result = verticalNav.attemptMovement('player1', connectionId);

      expect(result.success).toBe(false);
      expect(result.message).toBe("You can't use that from here.");
    });

    it('should fail when trying to reverse non-reversible connection', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'slide',
        'Slide',
        'desc',
        { isReversible: false }
      );

      mockGameStateManager.getPlayerState = jest.fn().mockReturnValue({
        currentRoomId: 'room2',
        playerId: 'player1'
      });

      const result = verticalNav.attemptMovement('player1', connectionId);

      expect(result.success).toBe(false);
      expect(result.message).toBe("You can't use that from here.");
    });
  });

  describe('Requirement Checking - Health', () => {
    it('should fail when player health is too low', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'rope_up',
        'Rope',
        'desc',
        {
          requirements: {
            health: 50
          }
        }
      );

      const result = verticalNav.attemptMovement('player1', connectionId, [], {}, 30);

      expect(result.success).toBe(false);
      expect(result.message).toContain('too injured');
      expect(result.message).toContain('50 health');
    });

    it('should succeed when player has enough health', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'rope_up',
        'Rope',
        'desc',
        {
          difficulty: 1.0,
          requirements: {
            health: 50
          }
        }
      );

      const result = verticalNav.attemptMovement('player1', connectionId, [], {}, 50);

      expect(result.success).toBe(true);
    });

    it('should succeed when player health exceeds requirement', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'rope_up',
        'Rope',
        'desc',
        {
          difficulty: 1.0,
          requirements: {
            health: 50
          }
        }
      );

      const result = verticalNav.attemptMovement('player1', connectionId, [], {}, 100);

      expect(result.success).toBe(true);
    });
  });

  describe('Requirement Checking - Items', () => {
    it('should fail when player lacks required item by name', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'rope_up',
        'Rope',
        'desc',
        {
          requirements: {
            items: ['rope']
          }
        }
      );

      const result = verticalNav.attemptMovement('player1', connectionId, [], {}, 100);

      expect(result.success).toBe(false);
      expect(result.message).toContain('need a rope');
    });

    it('should succeed when player has required item by name', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'rope_up',
        'Rope',
        'desc',
        {
          difficulty: 1.0,
          requirements: {
            items: ['rope']
          }
        }
      );

      const inventory = [{ name: 'rope', id: 'rope_1' }];
      const result = verticalNav.attemptMovement('player1', connectionId, inventory, {}, 100);

      expect(result.success).toBe(true);
    });

    it('should succeed when player has required item by id', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'rope_up',
        'Rope',
        'desc',
        {
          difficulty: 1.0,
          requirements: {
            items: ['rope_1']
          }
        }
      );

      const inventory = [{ name: 'climbing rope', id: 'rope_1' }];
      const result = verticalNav.attemptMovement('player1', connectionId, inventory, {}, 100);

      expect(result.success).toBe(true);
    });

    it('should fail when player lacks multiple required items', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'magic_portal',
        'Portal',
        'desc',
        {
          requirements: {
            items: ['magic_key', 'crystal']
          }
        }
      );

      const inventory = [{ name: 'magic_key', id: 'key_1' }];
      const result = verticalNav.attemptMovement('player1', connectionId, inventory, {}, 100);

      expect(result.success).toBe(false);
      expect(result.message).toContain('need a crystal');
    });

    it('should succeed when player has all required items', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'magic_portal',
        'Portal',
        'desc',
        {
          difficulty: 1.0,
          requirements: {
            items: ['magic_key', 'crystal']
          }
        }
      );

      const inventory = [
        { name: 'magic_key', id: 'key_1' },
        { name: 'crystal', id: 'crystal_1' }
      ];
      const result = verticalNav.attemptMovement('player1', connectionId, inventory, {}, 100);

      expect(result.success).toBe(true);
    });
  });

  describe('Requirement Checking - Skills', () => {
    it('should fail when player lacks required skill', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'rope_up',
        'Rope',
        'desc',
        {
          requirements: {
            skills: { strength: 5 }
          }
        }
      );

      const result = verticalNav.attemptMovement('player1', connectionId, [], {}, 100);

      expect(result.success).toBe(false);
      expect(result.message).toContain('strength level 5');
      expect(result.message).toContain('you have 0');
    });

    it('should succeed when player meets skill requirement', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'rope_up',
        'Rope',
        'desc',
        {
          difficulty: 1.0,
          requirements: {
            skills: { strength: 5 }
          }
        }
      );

      const stats = { strength: 5 };
      const result = verticalNav.attemptMovement('player1', connectionId, [], stats, 100);

      expect(result.success).toBe(true);
    });

    it('should succeed when player exceeds skill requirement', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'rope_up',
        'Rope',
        'desc',
        {
          difficulty: 1.0,
          requirements: {
            skills: { strength: 5 }
          }
        }
      );

      const stats = { strength: 10 };
      const result = verticalNav.attemptMovement('player1', connectionId, [], stats, 100);

      expect(result.success).toBe(true);
    });

    it('should handle multiple skill requirements', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'vine',
        'Vine',
        'desc',
        {
          difficulty: 1.0,
          requirements: {
            skills: { strength: 5, dexterity: 8 }
          }
        }
      );

      const stats = { strength: 6, dexterity: 9 };
      const result = verticalNav.attemptMovement('player1', connectionId, [], stats, 100);

      expect(result.success).toBe(true);
    });

    it('should fail when one of multiple skills is insufficient', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'vine',
        'Vine',
        'desc',
        {
          requirements: {
            skills: { strength: 5, dexterity: 8 }
          }
        }
      );

      const stats = { strength: 6, dexterity: 5 };
      const result = verticalNav.attemptMovement('player1', connectionId, [], stats, 100);

      expect(result.success).toBe(false);
      expect(result.message).toContain('dexterity level 8');
    });
  });

  describe('Requirement Checking - Combined Requirements', () => {
    it('should check all requirements (items, skills, health)', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'rope_up',
        'Rope',
        'desc',
        {
          difficulty: 1.0,
          requirements: {
            items: ['rope'],
            skills: { strength: 5 },
            health: 50
          }
        }
      );

      const inventory = [{ name: 'rope', id: 'rope_1' }];
      const stats = { strength: 5 };
      const result = verticalNav.attemptMovement('player1', connectionId, inventory, stats, 50);

      expect(result.success).toBe(true);
    });

    it('should fail if health requirement not met even with items and skills', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'rope_up',
        'Rope',
        'desc',
        {
          requirements: {
            items: ['rope'],
            skills: { strength: 5 },
            health: 50
          }
        }
      );

      const inventory = [{ name: 'rope', id: 'rope_1' }];
      const stats = { strength: 5 };
      const result = verticalNav.attemptMovement('player1', connectionId, inventory, stats, 30);

      expect(result.success).toBe(false);
      expect(result.message).toContain('too injured');
    });
  });

  describe('Difficulty and Random Success', () => {
    it('should always succeed with difficulty 1.0', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'stairs_up',
        'Stairs',
        'desc',
        { difficulty: 1.0 }
      );

      // Test multiple times to ensure consistency
      for (let i = 0; i < 10; i++) {
        const result = verticalNav.attemptMovement('player1', connectionId);
        expect(result.success).toBe(true);
      }
    });

    it('should handle difficulty 0.0 (always fail)', () => {
      // Mock Math.random to ensure deterministic behavior
      const originalRandom = Math.random;
      Math.random = jest.fn(() => 0.5);

      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'vine',
        'Vine',
        'desc',
        { difficulty: 0.0 }
      );

      const result = verticalNav.attemptMovement('player1', connectionId);
      expect(result.success).toBe(false);

      Math.random = originalRandom;
    });

    it('should succeed when random value is below difficulty', () => {
      const originalRandom = Math.random;
      Math.random = jest.fn(() => 0.5);

      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'rope_up',
        'Rope',
        'desc',
        { difficulty: 0.8 }
      );

      const result = verticalNav.attemptMovement('player1', connectionId);
      expect(result.success).toBe(true);

      Math.random = originalRandom;
    });

    it('should fail when random value is above difficulty', () => {
      const originalRandom = Math.random;
      Math.random = jest.fn(() => 0.9);

      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'rope_up',
        'Rope',
        'desc',
        { difficulty: 0.8 }
      );

      const result = verticalNav.attemptMovement('player1', connectionId);
      expect(result.success).toBe(false);

      Math.random = originalRandom;
    });
  });

  describe('Movement Consequences', () => {
    it('should apply damage on failure', () => {
      const originalRandom = Math.random;
      Math.random = jest.fn(() => 0.9);

      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'rope_up',
        'Rope',
        'desc',
        {
          difficulty: 0.5,
          consequences: {
            damageonFailure: 15
          }
        }
      );

      const result = verticalNav.attemptMovement('player1', connectionId);

      expect(result.success).toBe(false);
      expect(result.damage).toBe(15);

      Math.random = originalRandom;
    });

    it('should use custom failure message', () => {
      const originalRandom = Math.random;
      Math.random = jest.fn(() => 0.9);

      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'vine',
        'Vine',
        'desc',
        {
          difficulty: 0.5,
          consequences: {
            failureMessage: 'The vine breaks under your weight!'
          }
        }
      );

      const result = verticalNav.attemptMovement('player1', connectionId);

      expect(result.success).toBe(false);
      expect(result.message).toBe('The vine breaks under your weight!');

      Math.random = originalRandom;
    });

    it('should move player to fallback room on failure', () => {
      const originalRandom = Math.random;
      Math.random = jest.fn(() => 0.9);

      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'rope_up',
        'Rope',
        'desc',
        {
          difficulty: 0.5,
          consequences: {
            fallbackRoomId: 'room_pit',
            damageonFailure: 20
          }
        }
      );

      const result = verticalNav.attemptMovement('player1', connectionId);

      expect(result.success).toBe(false);
      expect(result.newRoomId).toBe('room_pit');
      expect(result.damage).toBe(20);
      expect(mockGameStateManager.movePlayerToRoom).toHaveBeenCalledWith('player1', 'room_pit');

      Math.random = originalRandom;
    });

    it('should not move player if no fallback room specified', () => {
      const originalRandom = Math.random;
      Math.random = jest.fn(() => 0.9);

      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'rope_up',
        'Rope',
        'desc',
        {
          difficulty: 0.5,
          consequences: {
            damageonFailure: 10
          }
        }
      );

      const result = verticalNav.attemptMovement('player1', connectionId);

      expect(result.success).toBe(false);
      expect(result.newRoomId).toBeUndefined();
      expect(mockGameStateManager.movePlayerToRoom).not.toHaveBeenCalled();

      Math.random = originalRandom;
    });

    it('should handle failure without any consequences defined', () => {
      const originalRandom = Math.random;
      Math.random = jest.fn(() => 0.9);

      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'stairs_up',
        'Stairs',
        'desc',
        { difficulty: 0.5 }
      );

      const result = verticalNav.attemptMovement('player1', connectionId);

      expect(result.success).toBe(false);
      expect(result.damage).toBe(0);
      expect(result.message).toContain('stumble');

      Math.random = originalRandom;
    });
  });

  describe('Connection Type Success Messages', () => {
    it('should generate correct message for stairs_up', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'stairs_up',
        'Wooden Stairs',
        'desc',
        { difficulty: 1.0 }
      );

      const result = verticalNav.attemptMovement('player1', connectionId);
      expect(result.message).toContain('climb up');
      expect(result.message).toContain('Wooden Stairs');
    });

    it('should generate correct message for stairs_down', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'stairs_down',
        'Stone Stairs',
        'desc',
        { difficulty: 1.0 }
      );

      const result = verticalNav.attemptMovement('player1', connectionId);
      expect(result.message).toContain('Stone Stairs');
    });

    it('should generate correct message for rope_up', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'rope_up',
        'Climbing Rope',
        'desc',
        { difficulty: 1.0 }
      );

      const result = verticalNav.attemptMovement('player1', connectionId);
      expect(result.message).toContain('grab');
      expect(result.message).toContain('climb up');
    });

    it('should generate correct message for ladder', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'ladder',
        'Metal Ladder',
        'desc',
        { difficulty: 1.0 }
      );

      const result = verticalNav.attemptMovement('player1', connectionId);
      expect(result.message).toContain('climb');
      expect(result.message).toContain('Metal Ladder');
    });

    it('should generate correct message for vine', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'vine',
        'Jungle Vine',
        'desc',
        { difficulty: 1.0 }
      );

      const result = verticalNav.attemptMovement('player1', connectionId);
      expect(result.message).toContain('grab');
      expect(result.message).toContain('Jungle Vine');
    });

    it('should generate correct message for slide', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'slide',
        'Metal Slide',
        'desc',
        { difficulty: 1.0 }
      );

      const result = verticalNav.attemptMovement('player1', connectionId);
      expect(result.message).toContain('slide');
      expect(result.message).toContain('Metal Slide');
    });

    it('should generate correct message for elevator', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'elevator',
        'Old Elevator',
        'desc',
        { difficulty: 1.0 }
      );

      const result = verticalNav.attemptMovement('player1', connectionId);
      expect(result.message).toContain('Old Elevator');
      expect(result.message).toContain('carries you');
    });

    it('should generate correct message for magic_portal', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'magic_portal',
        'Arcane Portal',
        'desc',
        { difficulty: 1.0 }
      );

      const result = verticalNav.attemptMovement('player1', connectionId);
      expect(result.message).toContain('step through');
      expect(result.message).toContain('Arcane Portal');
    });

    it('should generate correct message for teleporter', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'teleporter',
        'Sci-Fi Teleporter',
        'desc',
        { difficulty: 1.0 }
      );

      const result = verticalNav.attemptMovement('player1', connectionId);
      expect(result.message).toContain('Sci-Fi Teleporter');
      expect(result.message).toContain('teleporting');
    });
  });

  describe('Connection Type Failure Messages', () => {
    let originalRandom: () => number;

    beforeEach(() => {
      originalRandom = Math.random;
      Math.random = jest.fn(() => 0.9);
    });

    afterEach(() => {
      Math.random = originalRandom;
    });

    it('should generate correct failure message for stairs', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'stairs_up',
        'Stairs',
        'desc',
        { difficulty: 0.5 }
      );

      const result = verticalNav.attemptMovement('player1', connectionId);
      expect(result.message).toContain('stumble');
    });

    it('should generate correct failure message for rope', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'rope_up',
        'Rope',
        'desc',
        { difficulty: 0.5 }
      );

      const result = verticalNav.attemptMovement('player1', connectionId);
      expect(result.message).toContain('lose your grip');
    });

    it('should generate correct failure message for ladder', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'ladder',
        'Ladder',
        'desc',
        { difficulty: 0.5 }
      );

      const result = verticalNav.attemptMovement('player1', connectionId);
      expect(result.message).toContain('slips');
    });

    it('should generate correct failure message for vine', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'vine',
        'Vine',
        'desc',
        { difficulty: 0.5 }
      );

      const result = verticalNav.attemptMovement('player1', connectionId);
      expect(result.message).toContain('breaks');
    });

    it('should generate correct failure message for elevator', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'elevator',
        'Elevator',
        'desc',
        { difficulty: 0.5 }
      );

      const result = verticalNav.attemptMovement('player1', connectionId);
      expect(result.message).toContain('broken');
    });

    it('should generate correct failure message for magic_portal', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'magic_portal',
        'Portal',
        'desc',
        { difficulty: 0.5 }
      );

      const result = verticalNav.attemptMovement('player1', connectionId);
      expect(result.message).toContain('flickers');
    });

    it('should generate correct failure message for teleporter', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'teleporter',
        'Teleporter',
        'desc',
        { difficulty: 0.5 }
      );

      const result = verticalNav.attemptMovement('player1', connectionId);
      expect(result.message).toContain('malfunctions');
    });
  });

  describe('Connection Management', () => {
    it('should retrieve connection by id', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'stairs_up',
        'Test Stairs',
        'desc'
      );

      const connection = verticalNav.getConnection(connectionId);
      expect(connection).toBeDefined();
      expect(connection?.name).toBe('Test Stairs');
    });

    it('should return undefined for non-existent connection', () => {
      const connection = verticalNav.getConnection('invalid_id');
      expect(connection).toBeUndefined();
    });

    it('should remove connection successfully', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'stairs_up',
        'Stairs',
        'desc'
      );

      const removed = verticalNav.removeConnection(connectionId);
      expect(removed).toBe(true);

      const connection = verticalNav.getConnection(connectionId);
      expect(connection).toBeUndefined();
    });

    it('should return false when removing non-existent connection', () => {
      const removed = verticalNav.removeConnection('invalid_id');
      expect(removed).toBe(false);
    });

    it('should remove connection from room tracking', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'stairs_up',
        'Stairs',
        'desc'
      );

      verticalNav.removeConnection(connectionId);

      const connections = verticalNav.getAvailableConnections('room1');
      expect(connections).toHaveLength(0);
    });

    it('should remove reversible connection from both rooms', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'stairs_up',
        'Stairs',
        'desc',
        { isReversible: true }
      );

      verticalNav.removeConnection(connectionId);

      const room1Connections = verticalNav.getAvailableConnections('room1');
      const room2Connections = verticalNav.getAvailableConnections('room2');

      expect(room1Connections).toHaveLength(0);
      expect(room2Connections).toHaveLength(0);
    });
  });

  describe('Movement Options', () => {
    it('should get movement options for a room', () => {
      verticalNav.createConnection('room1', 'room2', 'stairs_up', 'Stairs', 'Old wooden stairs');
      verticalNav.createConnection('room1', 'room3', 'rope_up', 'Rope', 'Thick climbing rope');

      const options = verticalNav.getMovementOptions('room1');

      expect(options).toHaveLength(2);
      expect(options[0]).toContain('Stairs');
      expect(options[0]).toContain('Old wooden stairs');
      expect(options[1]).toContain('Rope');
      expect(options[1]).toContain('Thick climbing rope');
    });

    it('should show correct direction in movement options', () => {
      verticalNav.createConnection('room1', 'room2', 'stairs_up', 'Stairs', 'desc');

      const options = verticalNav.getMovementOptions('room1');

      expect(options[0]).toContain('Go up');
    });

    it('should return empty array for room with no connections', () => {
      const options = verticalNav.getMovementOptions('room999');
      expect(options).toHaveLength(0);
    });
  });

  describe('Helper Methods - createStaircase', () => {
    it('should create staircase with default name', () => {
      const connectionId = verticalNav.createStaircase('room1', 'room2');

      const connection = verticalNav.getConnection(connectionId);
      expect(connection?.name).toBe('staircase');
      expect(connection?.connectionType).toBe('stairs_up');
      expect(connection?.difficulty).toBe(0.95);
      expect(connection?.movementTime).toBe(10);
      expect(connection?.soundEffect).toBe('footsteps_on_stairs');
    });

    it('should create staircase with custom name', () => {
      const connectionId = verticalNav.createStaircase('room1', 'room2', 'marble staircase');

      const connection = verticalNav.getConnection(connectionId);
      expect(connection?.name).toBe('marble staircase');
      expect(connection?.description).toContain('marble staircase');
    });
  });

  describe('Helper Methods - createRope', () => {
    it('should create rope with default name', () => {
      const connectionId = verticalNav.createRope('room1', 'room2');

      const connection = verticalNav.getConnection(connectionId);
      expect(connection?.name).toBe('rope');
      expect(connection?.connectionType).toBe('rope_up');
      expect(connection?.difficulty).toBe(0.8);
      expect(connection?.movementTime).toBe(15);
      expect(connection?.requirements?.skills?.strength).toBe(5);
      expect(connection?.requirements?.health).toBe(50);
      expect(connection?.consequences?.damageonFailure).toBe(10);
    });

    it('should create rope with custom name', () => {
      const connectionId = verticalNav.createRope('room1', 'room2', 'silk rope');

      const connection = verticalNav.getConnection(connectionId);
      expect(connection?.name).toBe('silk rope');
    });
  });

  describe('Helper Methods - createVineSwing', () => {
    it('should create vine swing with default name', () => {
      const connectionId = verticalNav.createVineSwing('room1', 'room2');

      const connection = verticalNav.getConnection(connectionId);
      expect(connection?.name).toBe('vine');
      expect(connection?.connectionType).toBe('vine');
      expect(connection?.difficulty).toBe(0.7);
      expect(connection?.movementTime).toBe(8);
      expect(connection?.requirements?.skills?.dexterity).toBe(8);
      expect(connection?.consequences?.damageonFailure).toBe(15);
      expect(connection?.isReversible).toBe(false);
    });

    it('should create vine swing with custom name', () => {
      const connectionId = verticalNav.createVineSwing('room1', 'room2', 'thick vine');

      const connection = verticalNav.getConnection(connectionId);
      expect(connection?.name).toBe('thick vine');
    });
  });

  describe('Helper Methods - createMagicPortal', () => {
    it('should create magic portal with default name', () => {
      const connectionId = verticalNav.createMagicPortal('room1', 'room2');

      const connection = verticalNav.getConnection(connectionId);
      expect(connection?.name).toBe('magical portal');
      expect(connection?.connectionType).toBe('magic_portal');
      expect(connection?.difficulty).toBe(0.9);
      expect(connection?.movementTime).toBe(2);
      expect(connection?.requirements?.skills?.intelligence).toBe(10);
      expect(connection?.consequences?.damageonFailure).toBe(5);
      expect(connection?.soundEffect).toBe('magic_teleport');
    });

    it('should create magic portal with custom name', () => {
      const connectionId = verticalNav.createMagicPortal('room1', 'room2', 'ancient portal');

      const connection = verticalNav.getConnection(connectionId);
      expect(connection?.name).toBe('ancient portal');
    });
  });

  describe('Edge Cases', () => {
    it('should handle connection with no requirements', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'stairs_up',
        'Stairs',
        'desc',
        { difficulty: 1.0 }
      );

      const result = verticalNav.attemptMovement('player1', connectionId, [], {}, 1);
      expect(result.success).toBe(true);
    });

    it('should handle empty inventory when checking requirements', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'stairs_up',
        'Stairs',
        'desc',
        { difficulty: 1.0 }
      );

      const result = verticalNav.attemptMovement('player1', connectionId, [], {}, 100);
      expect(result.success).toBe(true);
    });

    it('should handle empty stats when checking requirements', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'stairs_up',
        'Stairs',
        'desc',
        { difficulty: 1.0 }
      );

      const result = verticalNav.attemptMovement('player1', connectionId, [], {}, 100);
      expect(result.success).toBe(true);
    });

    it('should handle very low health (1 HP)', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'stairs_up',
        'Stairs',
        'desc',
        {
          difficulty: 1.0,
          requirements: { health: 1 }
        }
      );

      const result = verticalNav.attemptMovement('player1', connectionId, [], {}, 1);
      expect(result.success).toBe(true);
    });

    it('should handle extreme difficulty values (0.01)', () => {
      const originalRandom = Math.random;
      Math.random = jest.fn(() => 0.02);

      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'vine',
        'Vine',
        'desc',
        { difficulty: 0.01 }
      );

      const result = verticalNav.attemptMovement('player1', connectionId);
      expect(result.success).toBe(false);

      Math.random = originalRandom;
    });

    it('should record vertical movement event with correct data', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'stairs_up',
        'Test Stairs',
        'desc',
        { difficulty: 1.0 }
      );

      verticalNav.attemptMovement('player1', connectionId);

      expect(mockGameStateManager.recordEvent).toHaveBeenCalledWith(
        'vertical_movement',
        'room2',
        'player1',
        expect.objectContaining({
          connectionType: 'stairs_up',
          connectionName: 'Test Stairs',
          fromRoom: 'room1',
          toRoom: 'room2',
          isReverse: false
        })
      );
    });

    it('should handle additional effects in movement result', () => {
      const connectionId = verticalNav.createConnection(
        'room1',
        'room2',
        'magic_portal',
        'Portal',
        'desc',
        { difficulty: 1.0 }
      );

      const result = verticalNav.attemptMovement('player1', connectionId);

      expect(result.additionalEffects?.verticalMovement).toBe(true);
      expect(result.additionalEffects?.connectionType).toBe('magic_portal');
    });
  });
});
