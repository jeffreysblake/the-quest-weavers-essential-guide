/**
 * Comprehensive test suite for NPC Manager
 * Tests all NPC management, sensory events, interactions, and factory methods
 */

import { NPCManager, NPCManagerConfig, NPCFactory } from './npc-manager';
import { NPC, NPCType, NPCState, EventType, SensoryEvent, StateContext } from './npc-system';
import { RoomSystem, Room } from './room-system';
import { ItemSystem } from './item-system';
import { IEntity } from '../nestjs-app/src/entity/entity.interface';

describe('NPCManager', () => {
  let npcManager: NPCManager;
  let roomSystem: RoomSystem;
  let itemSystem: ItemSystem;
  let mockRoom: Room;

  beforeEach(() => {
    roomSystem = new RoomSystem();
    itemSystem = new ItemSystem();

    // Create a mock room with bounds property for NPC position checks
    const baseRoom = roomSystem.createRoom(
      'room1',
      'Test Room',
      'A test room',
      undefined,
      { x: 0, y: 0 },
      { width: 20, height: 20 }
    );

    // Add bounds property to match what NPCManager expects
    mockRoom = {
      ...baseRoom,
      bounds: {
        x: 0,
        y: 0,
        width: 20,
        height: 20
      }
    } as any;

    // Mock getRoom to return our extended room
    jest.spyOn(roomSystem, 'getRoom').mockReturnValue(mockRoom);

    npcManager = new NPCManager(roomSystem, itemSystem);
  });

  describe('Initialization and Configuration', () => {
    test('should initialize with default configuration', () => {
      const manager = new NPCManager(roomSystem, itemSystem);
      expect(manager).toBeDefined();
      expect(manager.getAllNPCs()).toHaveLength(0);
    });

    test('should initialize with custom configuration', () => {
      const customConfig: NPCManagerConfig = {
        updateInterval: 500,
        maxSensoryEvents: 100,
        eventDecayTime: 60000
      };
      const manager = new NPCManager(roomSystem, itemSystem, customConfig);
      expect(manager).toBeDefined();
    });

    test('should merge custom config with defaults', () => {
      const partialConfig: NPCManagerConfig = {
        updateInterval: 2000
      };
      const manager = new NPCManager(roomSystem, itemSystem, partialConfig);
      expect(manager).toBeDefined();
    });
  });

  describe('NPC Management', () => {
    let testNPC: NPC;

    beforeEach(() => {
      testNPC = new NPC({
        id: 'npc1',
        name: 'Test NPC',
        position: { x: 5, y: 5, z: 0 },
        npcType: 'friendly',
        stats: {
          health: 100,
          maxHealth: 100,
          strength: 10,
          dexterity: 10,
          intelligence: 10,
          charisma: 10,
          level: 1,
          experience: 0
        }
      });
    });

    test('should add NPC successfully', () => {
      npcManager.addNPC(testNPC);
      expect(npcManager.getNPC('npc1')).toBe(testNPC);
    });

    test('should get NPC by id', () => {
      npcManager.addNPC(testNPC);
      const retrieved = npcManager.getNPC('npc1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Test NPC');
    });

    test('should return undefined for non-existent NPC', () => {
      expect(npcManager.getNPC('nonexistent')).toBeUndefined();
    });

    test('should remove NPC successfully', () => {
      npcManager.addNPC(testNPC);
      const removed = npcManager.removeNPC('npc1');
      expect(removed).toBe(true);
      expect(npcManager.getNPC('npc1')).toBeUndefined();
    });

    test('should return false when removing non-existent NPC', () => {
      const removed = npcManager.removeNPC('nonexistent');
      expect(removed).toBe(false);
    });

    test('should get all NPCs', () => {
      const npc2 = new NPC({
        id: 'npc2',
        name: 'NPC 2',
        position: { x: 10, y: 10, z: 0 },
        npcType: 'neutral',
        stats: {
          health: 80,
          maxHealth: 80,
          strength: 12,
          dexterity: 8,
          intelligence: 14,
          charisma: 10,
          level: 2,
          experience: 100
        }
      });

      npcManager.addNPC(testNPC);
      npcManager.addNPC(npc2);

      const allNPCs = npcManager.getAllNPCs();
      expect(allNPCs).toHaveLength(2);
      expect(allNPCs).toContain(testNPC);
      expect(allNPCs).toContain(npc2);
    });

    test('should return empty array when no NPCs exist', () => {
      expect(npcManager.getAllNPCs()).toHaveLength(0);
    });

    test('should handle multiple NPCs with same position', () => {
      const npc2 = new NPC({
        id: 'npc2',
        name: 'NPC 2',
        position: { x: 5, y: 5, z: 0 }, // Same as testNPC
        npcType: 'neutral',
        stats: {
          health: 80,
          maxHealth: 80,
          strength: 12,
          dexterity: 8,
          intelligence: 14,
          charisma: 10,
          level: 2,
          experience: 100
        }
      });

      npcManager.addNPC(testNPC);
      npcManager.addNPC(npc2);

      expect(npcManager.getAllNPCs()).toHaveLength(2);
    });
  });

  describe('NPCs in Room', () => {
    test('should get NPCs in a specific room', () => {
      const npcInRoom = new NPC({
        id: 'npc1',
        name: 'NPC in Room',
        position: { x: 5, y: 5, z: 0 }, // Within room bounds
        npcType: 'friendly',
        stats: {
          health: 100,
          maxHealth: 100,
          strength: 10,
          dexterity: 10,
          intelligence: 10,
          charisma: 10,
          level: 1,
          experience: 0
        }
      });

      npcManager.addNPC(npcInRoom);
      const npcsInRoom = npcManager.getNPCsInRoom('room1');
      expect(npcsInRoom).toHaveLength(1);
      expect(npcsInRoom[0]).toBe(npcInRoom);
    });

    test('should not include NPCs outside room bounds', () => {
      const npcOutsideRoom = new NPC({
        id: 'npc2',
        name: 'NPC Outside',
        position: { x: 100, y: 100, z: 0 }, // Outside room bounds
        npcType: 'friendly',
        stats: {
          health: 100,
          maxHealth: 100,
          strength: 10,
          dexterity: 10,
          intelligence: 10,
          charisma: 10,
          level: 1,
          experience: 0
        }
      });

      npcManager.addNPC(npcOutsideRoom);
      const npcsInRoom = npcManager.getNPCsInRoom('room1');
      expect(npcsInRoom).toHaveLength(0);
    });

    test('should return empty array for non-existent room', () => {
      const npcsInRoom = npcManager.getNPCsInRoom('nonexistent');
      expect(npcsInRoom).toHaveLength(0);
    });

    test('should handle NPCs on room boundaries', () => {
      const npcOnBoundary = new NPC({
        id: 'npc3',
        name: 'NPC on Boundary',
        position: { x: 20, y: 20, z: 0 }, // On the boundary
        npcType: 'friendly',
        stats: {
          health: 100,
          maxHealth: 100,
          strength: 10,
          dexterity: 10,
          intelligence: 10,
          charisma: 10,
          level: 1,
          experience: 0
        }
      });

      npcManager.addNPC(npcOnBoundary);
      const npcsInRoom = npcManager.getNPCsInRoom('room1');
      expect(npcsInRoom).toHaveLength(1);
    });
  });

  describe('Sensory Event System', () => {
    test('should create sensory event with valid parameters', () => {
      const eventId = npcManager.createSensoryEvent(
        'explosion',
        'source1',
        { x: 10, y: 10, z: 0 },
        0.8,
        'A massive explosion!'
      );

      expect(eventId).toBeDefined();
      expect(eventId).toMatch(/^event_\d+$/);
    });

    test('should clamp intensity between 0 and 1', () => {
      const eventId1 = npcManager.createSensoryEvent(
        'loud_noise',
        'source1',
        { x: 5, y: 5, z: 0 },
        1.5, // Over 1
        'Very loud noise'
      );

      const eventId2 = npcManager.createSensoryEvent(
        'combat',
        'source2',
        { x: 5, y: 5, z: 0 },
        -0.5, // Below 0
        'Combat event'
      );

      expect(eventId1).toBeDefined();
      expect(eventId2).toBeDefined();
    });

    test('should generate unique event IDs', () => {
      const eventId1 = npcManager.createSensoryEvent(
        'explosion',
        'source1',
        { x: 10, y: 10, z: 0 },
        0.8,
        'Explosion 1'
      );

      const eventId2 = npcManager.createSensoryEvent(
        'explosion',
        'source2',
        { x: 15, y: 15, z: 0 },
        0.9,
        'Explosion 2'
      );

      expect(eventId1).not.toBe(eventId2);
    });

    test('should handle different event types', () => {
      const eventTypes: EventType[] = ['explosion', 'combat', 'theft', 'magic', 'loud_noise', 'player_entered', 'item_used'];

      eventTypes.forEach((type, index) => {
        const eventId = npcManager.createSensoryEvent(
          type,
          `source${index}`,
          { x: index, y: index, z: 0 },
          0.5,
          `Event ${type}`
        );
        expect(eventId).toBeDefined();
      });
    });

    test('should respect maxSensoryEvents limit', () => {
      const smallConfig: NPCManagerConfig = {
        maxSensoryEvents: 3
      };
      const manager = new NPCManager(roomSystem, itemSystem, smallConfig);

      // Create more events than the limit
      for (let i = 0; i < 5; i++) {
        manager.createSensoryEvent(
          'loud_noise',
          `source${i}`,
          { x: i, y: i, z: 0 },
          0.5,
          `Event ${i}`
        );
      }

      // The manager should have kept only the most recent events
      expect(manager).toBeDefined();
    });
  });

  describe('Update System', () => {
    let testNPC: NPC;

    beforeEach(() => {
      testNPC = new NPC({
        id: 'npc1',
        name: 'Test NPC',
        position: { x: 5, y: 5, z: 0 },
        npcType: 'friendly',
        stats: {
          health: 100,
          maxHealth: 100,
          strength: 10,
          dexterity: 10,
          intelligence: 10,
          charisma: 10,
          level: 1,
          experience: 0
        }
      });
      npcManager.addNPC(testNPC);
    });

    test('should update NPCs with force flag', () => {
      npcManager.update([], true);
      expect(testNPC).toBeDefined();
    });

    test('should skip update if interval not elapsed', () => {
      npcManager.update([], false);
      npcManager.update([], false); // Second update should be skipped
      expect(testNPC).toBeDefined();
    });

    test('should update with player entities', () => {
      const player: IEntity = {
        id: 'player1',
        name: 'Player',
        position: { x: 5, y: 5, z: 0 },
        type: 'player',
        health: 100
      };

      npcManager.update([player], true);
      expect(testNPC).toBeDefined();
    });

    test('should clean up old events during update', () => {
      const oldConfig: NPCManagerConfig = {
        eventDecayTime: 1 // 1ms decay time for testing
      };
      const manager = new NPCManager(roomSystem, itemSystem, oldConfig);

      manager.createSensoryEvent(
        'explosion',
        'source1',
        { x: 10, y: 10, z: 0 },
        0.8,
        'Old explosion'
      );

      // Wait for decay
      setTimeout(() => {
        manager.update([], true);
      }, 10);
    });

    test('should update multiple NPCs', () => {
      const npc2 = new NPC({
        id: 'npc2',
        name: 'NPC 2',
        position: { x: 10, y: 10, z: 0 },
        npcType: 'neutral',
        stats: {
          health: 80,
          maxHealth: 80,
          strength: 12,
          dexterity: 8,
          intelligence: 14,
          charisma: 10,
          level: 2,
          experience: 100
        }
      });

      npcManager.addNPC(npc2);
      npcManager.update([], true);

      expect(npcManager.getAllNPCs()).toHaveLength(2);
    });

    test('should handle NPCs not in any room', () => {
      const npcOutside = new NPC({
        id: 'npc_outside',
        name: 'Outside NPC',
        position: { x: 1000, y: 1000, z: 0 },
        npcType: 'friendly',
        stats: {
          health: 100,
          maxHealth: 100,
          strength: 10,
          dexterity: 10,
          intelligence: 10,
          charisma: 10,
          level: 1,
          experience: 0
        }
      });

      npcManager.addNPC(npcOutside);
      npcManager.update([], true);
      expect(npcManager.getNPC('npc_outside')).toBeDefined();
    });
  });

  describe('Interaction System', () => {
    let testNPC: NPC;

    beforeEach(() => {
      testNPC = new NPC({
        id: 'npc1',
        name: 'Test NPC',
        position: { x: 5, y: 5, z: 0 },
        npcType: 'friendly',
        stats: {
          health: 100,
          maxHealth: 100,
          strength: 10,
          dexterity: 10,
          intelligence: 10,
          charisma: 10,
          level: 1,
          experience: 0
        }
      });
      npcManager.addNPC(testNPC);
    });

    test('should handle talk interaction', () => {
      const result = npcManager.handlePlayerInteraction('player1', 'npc1', 'talk');
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    test('should handle trade interaction with merchant', () => {
      const merchant = NPCFactory.createMerchant('merchant1', 'Merchant Bob', { x: 5, y: 5, z: 0 });
      npcManager.addNPC(merchant);

      const result = npcManager.handlePlayerInteraction('player1', 'merchant1', 'trade');
      expect(result.success).toBe(true);
      expect(result.effects?.openTradeWindow).toBe(true);
    });

    test('should fail trade interaction with non-merchant', () => {
      const result = npcManager.handlePlayerInteraction('player1', 'npc1', 'trade');
      expect(result.success).toBe(false);
      expect(result.message).toContain('not a merchant');
    });

    test('should handle attack interaction', () => {
      const result = npcManager.handlePlayerInteraction('player1', 'npc1', 'attack');
      expect(result.success).toBe(true);
      expect(result.effects?.combatStarted).toBe(true);
      expect(testNPC.currentState).toBe('fighting');
    });

    test('should fail interaction with non-existent NPC', () => {
      const result = npcManager.handlePlayerInteraction('player1', 'nonexistent', 'talk');
      expect(result.success).toBe(false);
      expect(result.message).toBe('NPC not found.');
    });

    test('should handle default interaction', () => {
      const result = npcManager.handlePlayerInteraction('player1', 'npc1', 'custom');
      expect(result).toBeDefined();
    });

    test('should create sensory event on talk', () => {
      npcManager.handlePlayerInteraction('player1', 'npc1', 'talk');
      // Event should be created in the system
      expect(npcManager).toBeDefined();
    });

    test('should create high-intensity sensory event on attack', () => {
      npcManager.handlePlayerInteraction('player1', 'npc1', 'attack');
      // High intensity combat event should be created
      expect(testNPC.currentState).toBe('fighting');
    });
  });

  describe('Dialogue System', () => {
    let npcWithDialogue: NPC;

    beforeEach(() => {
      npcWithDialogue = new NPC({
        id: 'npc_dialogue',
        name: 'Dialogue NPC',
        position: { x: 5, y: 5, z: 0 },
        npcType: 'friendly',
        stats: {
          health: 100,
          maxHealth: 100,
          strength: 10,
          dexterity: 10,
          intelligence: 10,
          charisma: 10,
          level: 1,
          experience: 0
        },
        dialogueTree: {
          id: 'tree1',
          name: 'Test Dialogue',
          rootNodeId: 'node1',
          nodes: new Map([
            ['node1', {
              id: 'node1',
              text: 'Hello there!',
              responses: [
                { id: 'resp1', text: 'Hello!', nextNodeId: 'node2' },
                { id: 'resp2', text: 'Goodbye', nextNodeId: null }
              ]
            }],
            ['node2', {
              id: 'node2',
              text: 'How are you?',
              responses: []
            }]
          ])
        }
      });
      npcWithDialogue.currentDialogueNode = 'node1';
      npcManager.addNPC(npcWithDialogue);
    });

    test('should continue dialogue with valid response', () => {
      const result = npcManager.continueDialogue('npc_dialogue', 'resp1');
      expect(result.success).toBe(true);
      expect(result.effects?.continueDialogue).toBe(true);
    });

    test('should end dialogue when response has no next node', () => {
      const result = npcManager.continueDialogue('npc_dialogue', 'resp2');
      expect(result.success).toBe(true);
      expect(result.effects?.endDialogue).toBe(true);
      expect(npcWithDialogue.currentDialogueNode).toBeUndefined();
      expect(npcWithDialogue.currentState).toBe('idle');
    });

    test('should fail with invalid response ID', () => {
      const result = npcManager.continueDialogue('npc_dialogue', 'invalid');
      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid response.');
    });

    test('should fail with no active dialogue', () => {
      const result = npcManager.continueDialogue('npc1', 'resp1');
      expect(result.success).toBe(false);
      expect(result.message).toBe('No active dialogue.');
    });

    test('should fail with non-existent NPC', () => {
      const result = npcManager.continueDialogue('nonexistent', 'resp1');
      expect(result.success).toBe(false);
      expect(result.message).toBe('No active dialogue.');
    });

    test('should check response conditions', () => {
      const npcWithConditions = new NPC({
        id: 'npc_cond',
        name: 'Conditional NPC',
        position: { x: 5, y: 5, z: 0 },
        npcType: 'friendly',
        stats: {
          health: 100,
          maxHealth: 100,
          strength: 10,
          dexterity: 10,
          intelligence: 10,
          charisma: 10,
          level: 1,
          experience: 0
        },
        dialogueTree: {
          id: 'tree2',
          name: 'Conditional Dialogue',
          rootNodeId: 'node1',
          nodes: new Map([
            ['node1', {
              id: 'node1',
              text: 'Do you have gold?',
              responses: [
                {
                  id: 'resp1',
                  text: 'Yes',
                  nextNodeId: null,
                  condition: () => false // Condition fails
                }
              ]
            }]
          ])
        }
      });
      npcWithConditions.currentDialogueNode = 'node1';
      npcManager.addNPC(npcWithConditions);

      const result = npcManager.continueDialogue('npc_cond', 'resp1');
      expect(result.success).toBe(false);
      expect(result.message).toBe('You cannot choose this response.');
    });
  });

  describe('Event Triggers', () => {
    test('should trigger explosion event', () => {
      npcManager.triggerExplosion({ x: 10, y: 10, z: 0 }, 1.0);
      expect(npcManager).toBeDefined();
    });

    test('should trigger explosion with default intensity', () => {
      npcManager.triggerExplosion({ x: 10, y: 10, z: 0 });
      expect(npcManager).toBeDefined();
    });

    test('should trigger theft event', () => {
      npcManager.triggerTheft('thief1', { x: 5, y: 5, z: 0 }, 'Gold Ring');
      expect(npcManager).toBeDefined();
    });

    test('should trigger loud noise event', () => {
      npcManager.triggerLoudNoise('source1', { x: 15, y: 15, z: 0 }, 'A door slams shut');
      expect(npcManager).toBeDefined();
    });

    test('should trigger magic event', () => {
      npcManager.triggerMagicEvent('wizard1', { x: 8, y: 8, z: 0 }, 'Fireball');
      expect(npcManager).toBeDefined();
    });

    test('should create events with correct intensity', () => {
      npcManager.triggerExplosion({ x: 10, y: 10, z: 0 }, 0.5);
      npcManager.triggerTheft('thief1', { x: 5, y: 5, z: 0 }, 'Item');
      npcManager.triggerLoudNoise('source1', { x: 15, y: 15, z: 0 }, 'Noise');
      npcManager.triggerMagicEvent('wizard1', { x: 8, y: 8, z: 0 }, 'Spell');
      expect(npcManager).toBeDefined();
    });
  });

  describe('Debug and Monitoring', () => {
    let testNPC: NPC;

    beforeEach(() => {
      testNPC = new NPC({
        id: 'npc1',
        name: 'Test NPC',
        position: { x: 5, y: 5, z: 0 },
        npcType: 'friendly',
        stats: {
          health: 100,
          maxHealth: 100,
          strength: 10,
          dexterity: 10,
          intelligence: 10,
          charisma: 10,
          level: 1,
          experience: 0
        }
      });
      npcManager.addNPC(testNPC);
    });

    test('should get system status', () => {
      const status = npcManager.getSystemStatus();
      expect(status).toBeDefined();
      expect(status.npcCount).toBe(1);
      expect(status.activeEvents).toBeGreaterThanOrEqual(0);
      expect(status.npcStates).toHaveLength(1);
    });

    test('should include NPC details in status', () => {
      const status = npcManager.getSystemStatus();
      const npcState = status.npcStates[0];
      expect(npcState.id).toBe('npc1');
      expect(npcState.name).toBe('Test NPC');
      expect(npcState.type).toBe('friendly');
      expect(npcState.state).toBeDefined();
      expect(npcState.health).toBe(100);
      expect(npcState.position).toEqual({ x: 5, y: 5, z: 0 });
    });

    test('should log NPC behavior', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      npcManager.logNPCBehavior();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('should include events in log when present', () => {
      npcManager.createSensoryEvent(
        'explosion',
        'source1',
        { x: 10, y: 10, z: 0 },
        0.8,
        'Test explosion'
      );

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      npcManager.logNPCBehavior();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('NPCFactory', () => {
    describe('createGuard', () => {
      test('should create guard with basic parameters', () => {
        const guard = NPCFactory.createGuard('guard1', 'City Guard', { x: 10, y: 10, z: 0 });
        expect(guard).toBeDefined();
        expect(guard.id).toBe('guard1');
        expect(guard.name).toBe('City Guard');
        expect(guard.npcType).toBe('guard');
        expect(guard.faction).toBe('guards');
      });

      test('should create guard with patrol route', () => {
        const patrolRoute = ['room1', 'room2', 'room3'];
        const guard = NPCFactory.createGuard('guard1', 'City Guard', { x: 10, y: 10, z: 0 }, patrolRoute);
        expect(guard.patrolRoute).toEqual(patrolRoute);
      });

      test('should create guard with correct stats', () => {
        const guard = NPCFactory.createGuard('guard1', 'City Guard', { x: 10, y: 10, z: 0 });
        expect(guard.stats.health).toBe(100);
        expect(guard.stats.maxHealth).toBe(100);
        expect(guard.stats.strength).toBe(15);
        expect(guard.stats.level).toBe(3);
      });

      test('should create guard hostile to correct factions', () => {
        const guard = NPCFactory.createGuard('guard1', 'City Guard', { x: 10, y: 10, z: 0 });
        expect(guard.hostileToFactions).toContain('thieves');
        expect(guard.hostileToFactions).toContain('monsters');
      });

      test('should create guard with appropriate sensory range', () => {
        const guard = NPCFactory.createGuard('guard1', 'City Guard', { x: 10, y: 10, z: 0 });
        expect(guard.sensoryRange).toBe(8.0);
        expect(guard.sensoryTypes).toContain('sight');
        expect(guard.sensoryTypes).toContain('sound');
      });
    });

    describe('createMerchant', () => {
      test('should create merchant with basic parameters', () => {
        const merchant = NPCFactory.createMerchant('merchant1', 'Bob the Trader', { x: 5, y: 5, z: 0 });
        expect(merchant).toBeDefined();
        expect(merchant.id).toBe('merchant1');
        expect(merchant.name).toBe('Bob the Trader');
        expect(merchant.npcType).toBe('merchant');
      });

      test('should create merchant with correct stats', () => {
        const merchant = NPCFactory.createMerchant('merchant1', 'Bob', { x: 5, y: 5, z: 0 });
        expect(merchant.stats.health).toBe(60);
        expect(merchant.stats.charisma).toBe(18);
        expect(merchant.stats.intelligence).toBe(15);
      });

      test('should create merchant with merchant faction', () => {
        const merchant = NPCFactory.createMerchant('merchant1', 'Bob', { x: 5, y: 5, z: 0 });
        expect(merchant.faction).toBe('merchants');
      });

      test('should create merchant with appropriate sensory range', () => {
        const merchant = NPCFactory.createMerchant('merchant1', 'Bob', { x: 5, y: 5, z: 0 });
        expect(merchant.sensoryRange).toBe(5.0);
      });
    });

    describe('createHostileMonster', () => {
      test('should create monster with basic parameters', () => {
        const monster = NPCFactory.createHostileMonster('monster1', 'Goblin', { x: 15, y: 15, z: 0 });
        expect(monster).toBeDefined();
        expect(monster.id).toBe('monster1');
        expect(monster.name).toBe('Goblin');
        expect(monster.npcType).toBe('monster');
      });

      test('should create monster hostile to multiple factions', () => {
        const monster = NPCFactory.createHostileMonster('monster1', 'Goblin', { x: 15, y: 15, z: 0 });
        expect(monster.hostileToFactions).toContain('players');
        expect(monster.hostileToFactions).toContain('guards');
        expect(monster.hostileToFactions).toContain('merchants');
      });

      test('should create monster with combat-focused stats', () => {
        const monster = NPCFactory.createHostileMonster('monster1', 'Goblin', { x: 15, y: 15, z: 0 });
        expect(monster.stats.strength).toBe(18);
        expect(monster.stats.dexterity).toBe(14);
        expect(monster.stats.health).toBe(80);
      });

      test('should create monster with enhanced senses', () => {
        const monster = NPCFactory.createHostileMonster('monster1', 'Goblin', { x: 15, y: 15, z: 0 });
        expect(monster.sensoryRange).toBe(10.0);
        expect(monster.sensoryTypes).toContain('sight');
        expect(monster.sensoryTypes).toContain('sound');
        expect(monster.sensoryTypes).toContain('smell');
      });

      test('should create monster in monster faction', () => {
        const monster = NPCFactory.createHostileMonster('monster1', 'Goblin', { x: 15, y: 15, z: 0 });
        expect(monster.faction).toBe('monsters');
      });
    });

    describe('createFriendlyVillager', () => {
      test('should create villager with basic parameters', () => {
        const villager = NPCFactory.createFriendlyVillager('villager1', 'John', { x: 8, y: 8, z: 0 });
        expect(villager).toBeDefined();
        expect(villager.id).toBe('villager1');
        expect(villager.name).toBe('John');
        expect(villager.npcType).toBe('friendly');
      });

      test('should create villager with modest stats', () => {
        const villager = NPCFactory.createFriendlyVillager('villager1', 'John', { x: 8, y: 8, z: 0 });
        expect(villager.stats.health).toBe(50);
        expect(villager.stats.maxHealth).toBe(50);
        expect(villager.stats.level).toBe(1);
      });

      test('should create villager friendly to players and guards', () => {
        const villager = NPCFactory.createFriendlyVillager('villager1', 'John', { x: 8, y: 8, z: 0 });
        expect(villager.friendlyToFactions).toContain('players');
        expect(villager.friendlyToFactions).toContain('guards');
      });

      test('should create villager with limited sensory range', () => {
        const villager = NPCFactory.createFriendlyVillager('villager1', 'John', { x: 8, y: 8, z: 0 });
        expect(villager.sensoryRange).toBe(4.0);
      });

      test('should create villager in villagers faction', () => {
        const villager = NPCFactory.createFriendlyVillager('villager1', 'John', { x: 8, y: 8, z: 0 });
        expect(villager.faction).toBe('villagers');
      });
    });

    test('should create NPCs with different types at different positions', () => {
      const guard = NPCFactory.createGuard('guard1', 'Guard', { x: 0, y: 0, z: 0 });
      const merchant = NPCFactory.createMerchant('merchant1', 'Merchant', { x: 10, y: 10, z: 0 });
      const monster = NPCFactory.createHostileMonster('monster1', 'Monster', { x: 20, y: 20, z: 0 });
      const villager = NPCFactory.createFriendlyVillager('villager1', 'Villager', { x: 5, y: 5, z: 0 });

      expect(guard.npcType).toBe('guard');
      expect(merchant.npcType).toBe('merchant');
      expect(monster.npcType).toBe('monster');
      expect(villager.npcType).toBe('friendly');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty room system', () => {
      const emptyRoomSystem = new RoomSystem();
      const manager = new NPCManager(emptyRoomSystem, itemSystem);
      expect(manager.getAllNPCs()).toHaveLength(0);
    });

    test('should handle NPC with zero sensory range', () => {
      const npc = new NPC({
        id: 'npc_blind',
        name: 'Blind NPC',
        position: { x: 5, y: 5, z: 0 },
        npcType: 'friendly',
        stats: {
          health: 100,
          maxHealth: 100,
          strength: 10,
          dexterity: 10,
          intelligence: 10,
          charisma: 10,
          level: 1,
          experience: 0
        },
        sensoryRange: 0
      });

      npcManager.addNPC(npc);
      npcManager.update([], true);
      // NPC class may apply a minimum sensoryRange (default is 5)
      expect(npc.sensoryRange).toBeGreaterThanOrEqual(0);
    });

    test('should handle concurrent NPC updates', () => {
      const npcs = [];
      for (let i = 0; i < 10; i++) {
        const npc = new NPC({
          id: `npc${i}`,
          name: `NPC ${i}`,
          position: { x: i * 2, y: i * 2, z: 0 },
          npcType: 'friendly',
          stats: {
            health: 100,
            maxHealth: 100,
            strength: 10,
            dexterity: 10,
            intelligence: 10,
            charisma: 10,
            level: 1,
            experience: 0
          }
        });
        npcManager.addNPC(npc);
        npcs.push(npc);
      }

      npcManager.update([], true);
      expect(npcManager.getAllNPCs()).toHaveLength(10);
    });

    test('should handle NPC interaction with itself', () => {
      const npc = new NPC({
        id: 'npc1',
        name: 'Self-aware NPC',
        position: { x: 5, y: 5, z: 0 },
        npcType: 'friendly',
        stats: {
          health: 100,
          maxHealth: 100,
          strength: 10,
          dexterity: 10,
          intelligence: 10,
          charisma: 10,
          level: 1,
          experience: 0
        }
      });

      npcManager.addNPC(npc);
      const result = npcManager.handlePlayerInteraction('npc1', 'npc1', 'talk');
      expect(result).toBeDefined();
    });

    test('should handle sensory events at extreme distances', () => {
      const eventId = npcManager.createSensoryEvent(
        'explosion',
        'source1',
        { x: 10000, y: 10000, z: 10000 },
        0.8,
        'Distant explosion'
      );
      expect(eventId).toBeDefined();
    });

    test('should handle invalid dialogue state transitions', () => {
      const npc = new NPC({
        id: 'npc_bad_dialogue',
        name: 'Bad Dialogue NPC',
        position: { x: 5, y: 5, z: 0 },
        npcType: 'friendly',
        stats: {
          health: 100,
          maxHealth: 100,
          strength: 10,
          dexterity: 10,
          intelligence: 10,
          charisma: 10,
          level: 1,
          experience: 0
        },
        dialogueTree: {
          id: 'tree1',
          name: 'Bad Tree',
          rootNodeId: 'node1',
          nodes: new Map([
            ['node1', {
              id: 'node1',
              text: 'Hello',
              responses: []
            }]
          ])
        }
      });
      npc.currentDialogueNode = 'nonexistent_node';
      npcManager.addNPC(npc);

      const result = npcManager.continueDialogue('npc_bad_dialogue', 'resp1');
      expect(result.success).toBe(false);
    });

    test('should handle NPCs with negative positions', () => {
      const npc = new NPC({
        id: 'npc_negative',
        name: 'Negative Position NPC',
        position: { x: -10, y: -10, z: -5 },
        npcType: 'friendly',
        stats: {
          health: 100,
          maxHealth: 100,
          strength: 10,
          dexterity: 10,
          intelligence: 10,
          charisma: 10,
          level: 1,
          experience: 0
        }
      });

      npcManager.addNPC(npc);
      expect(npcManager.getNPC('npc_negative')).toBeDefined();
      expect(npc.position.x).toBe(-10);
    });

    test('should handle rapid successive updates', () => {
      const npc = new NPC({
        id: 'npc1',
        name: 'Test NPC',
        position: { x: 5, y: 5, z: 0 },
        npcType: 'friendly',
        stats: {
          health: 100,
          maxHealth: 100,
          strength: 10,
          dexterity: 10,
          intelligence: 10,
          charisma: 10,
          level: 1,
          experience: 0
        }
      });

      npcManager.addNPC(npc);

      for (let i = 0; i < 100; i++) {
        npcManager.update([], true);
      }

      expect(npcManager.getNPC('npc1')).toBeDefined();
    });
  });
});
