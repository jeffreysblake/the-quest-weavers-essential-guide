/**
 * Comprehensive NPC System Tests
 * Tests for AI behavior, dialogue, sensory awareness, and complex interactions
 */

import { NPC, NPCType, DialogueBuilder, SensoryEvent, StateContext } from './npc-system';
import { NPCManager, NPCFactory } from './npc-manager';
import { GameSystems } from './game-systems';
import { IEntity } from '../nestjs-app/src/entity/entity.interface';

describe('NPC System Tests', () => {
  let gameSystems: GameSystems;
  let npcManager: NPCManager;
  
  beforeEach(() => {
    gameSystems = new GameSystems();
    const roomSystem = gameSystems.getRoomSystem();
    const itemSystem = gameSystems.getItemSystem();
    npcManager = new NPCManager(roomSystem, itemSystem);
    
    // Create test rooms
    roomSystem.createRoom('tavern', 'The Prancing Pony', 'A cozy tavern.', 'description', { x: 0, y: 0 }, { width: 20, height: 20 });
    roomSystem.createRoom('street', 'Main Street', 'A busy street.', 'description', { x: 25, y: 0 }, { width: 30, height: 10 });
    roomSystem.createRoom('guardhouse', 'Guard House', 'The local guard station.', 'description', { x: 60, y: 0 }, { width: 15, height: 15 });
  });

  describe('NPC Creation and Basic Properties', () => {
    it('should create an NPC with proper stats and properties', () => {
      const npc = new NPC({
        id: 'test-guard-1',
        name: 'Captain Marcus',
        position: { x: 10, y: 10, z: 0 },
        npcType: 'guard',
        stats: {
          health: 100,
          maxHealth: 100,
          strength: 15,
          dexterity: 12,
          intelligence: 10,
          charisma: 8,
          level: 3,
          experience: 300
        },
        sensoryRange: 8.0,
        sensoryTypes: ['sight', 'sound'],
        faction: 'guards'
      });
      
      expect(npc.id).toBe('test-guard-1');
      expect(npc.name).toBe('Captain Marcus');
      expect(npc.npcType).toBe('guard');
      expect(npc.currentState).toBe('idle');
      expect(npc.stats.health).toBe(100);
      expect(npc.sensoryRange).toBe(8.0);
      expect(npc.sensoryTypes).toContain('sight');
      expect(npc.faction).toBe('guards');
    });

    it('should create NPCs using factory methods', () => {
      const guard = NPCFactory.createGuard('guard-1', 'Town Guard', { x: 5, y: 5, z: 0 });
      const merchant = NPCFactory.createMerchant('merchant-1', 'Shopkeeper Bob', { x: 15, y: 15, z: 0 });
      const monster = NPCFactory.createHostileMonster('monster-1', 'Angry Goblin', { x: 25, y: 25, z: 0 });
      const villager = NPCFactory.createFriendlyVillager('villager-1', 'Farmer John', { x: 35, y: 35, z: 0 });
      
      expect(guard.npcType).toBe('guard');
      expect(merchant.npcType).toBe('merchant');
      expect(monster.npcType).toBe('monster');
      expect(villager.npcType).toBe('friendly');
      
      expect(guard.stats.strength).toBeGreaterThan(merchant.stats.strength);
      expect(monster.stats.strength).toBeGreaterThan(villager.stats.strength);
      expect(merchant.stats.charisma).toBeGreaterThan(monster.stats.charisma);
    });
  });

  describe('State Machine Behavior', () => {
    it('should transition from idle to patrolling for guards with patrol routes', () => {
      const guard = NPCFactory.createGuard('patrol-guard', 'Patrol Guard', 
        { x: 10, y: 10, z: 0 }, ['tavern', 'street', 'guardhouse']);
      
      npcManager.addNPC(guard);
      
      const context: StateContext = {
        sensoryEvents: [],
        nearbyEntities: [],
        currentRoom: 'tavern',
        timeDelta: 1000
      };
      
      guard.update(context);
      
      // Should transition to patrolling since it has a patrol route
      expect(guard.currentState).toBe('patrolling');
    });

    it('should detect and chase hostile targets', () => {
      const monster = NPCFactory.createHostileMonster('hostile-1', 'Angry Orc', { x: 10, y: 10, z: 0 });
      const player: IEntity = {
        id: 'player-1',
        name: 'Hero',
        position: { x: 12, y: 12, z: 0 },
        type: 'player'
      };
      
      npcManager.addNPC(monster);
      
      const context: StateContext = {
        sensoryEvents: [],
        nearbyEntities: [player],
        currentRoom: 'tavern',
        timeDelta: 1000,
        playerInRoom: player
      };
      
      monster.update(context);
      
      // Monster should detect player and start chasing
      expect(monster.currentState).toBe('chasing');
      expect(monster.lastSeenPlayer?.entityId).toBe('player-1');
    });

    it('should flee when health is low', () => {
      const monster = NPCFactory.createHostileMonster('fleeing-monster', 'Wounded Wolf', { x: 10, y: 10, z: 0 });
      const player: IEntity = {
        id: 'player-1',
        name: 'Hero',
        position: { x: 11, y: 11, z: 0 },
        type: 'player'
      };
      
      // Set low health (below 20% threshold)
      monster.health = 10; // 10 out of 80 max health
      monster.currentState = 'fighting';
      
      const context: StateContext = {
        sensoryEvents: [],
        nearbyEntities: [player],
        currentRoom: 'tavern',
        timeDelta: 1000,
        playerInRoom: player
      };
      
      monster.update(context);
      
      // Monster should flee due to low health
      expect(monster.currentState).toBe('fleeing');
    });
  });

  describe('Sensory System', () => {
    it('should detect and react to explosions within sensory range', () => {
      const guard = NPCFactory.createGuard('alert-guard', 'Alert Guard', { x: 10, y: 10, z: 0 });
      npcManager.addNPC(guard);
      
      // Create an explosion nearby
      npcManager.triggerExplosion({ x: 15, y: 15, z: 0 }, 0.8);
      
      // Update NPCs to process the explosion event
      npcManager.update(undefined, true);
      
      // Guard should have heard the explosion
      const events = guard.knownEvents;
      expect(events.length).toBeGreaterThan(0);
      
      const explosionEvent = events.find(e => e.type === 'explosion');
      expect(explosionEvent).toBeDefined();
      expect(explosionEvent?.description).toContain('explosion');
    });

    it('should not detect events outside sensory range', () => {
      const guard = NPCFactory.createGuard('distant-guard', 'Distant Guard', { x: 10, y: 10, z: 0 });
      npcManager.addNPC(guard);
      
      // Create an explosion far away (beyond sensory range)
      npcManager.triggerExplosion({ x: 100, y: 100, z: 0 }, 0.5);
      
      // Update the NPC to process events
      npcManager.update(undefined, true);
      
      // Guard should not have detected the distant explosion
      const events = guard.knownEvents;
      const explosionEvent = events.find(e => e.type === 'explosion');
      expect(explosionEvent).toBeUndefined();
    });

    it('should react appropriately to different event types based on NPC type', () => {
      const guard = NPCFactory.createGuard('reactive-guard', 'Reactive Guard', { x: 10, y: 10, z: 0 });
      const merchant = NPCFactory.createMerchant('scared-merchant', 'Scared Merchant', { x: 12, y: 12, z: 0 });
      
      npcManager.addNPC(guard);
      npcManager.addNPC(merchant);
      
      // Trigger theft event
      npcManager.triggerTheft('thief-1', { x: 11, y: 11, z: 0 }, 'precious gems');
      
      npcManager.update(undefined, true);
      
      // Both should have detected the theft, but may react differently
      expect(guard.knownEvents.some(e => e.type === 'theft')).toBe(true);
      expect(merchant.knownEvents.some(e => e.type === 'theft')).toBe(true);
    });
  });

  describe('Dialogue System', () => {
    it('should create and use dialogue trees', () => {
      const dialogueTree = new DialogueBuilder('tavern-keeper-chat', 'Tavern Keeper Conversation')
        .addNode('greeting', 'Welcome to the Prancing Pony! What can I do for you?', true)
        .addResponse('greeting', 'ask-rooms', 'Do you have any rooms available?', 'rooms-response')
        .addResponse('greeting', 'ask-rumors', 'Have you heard any interesting rumors?', 'rumors-response')
        .addResponse('greeting', 'goodbye', 'Nothing, thanks.', null)
        .addNode('rooms-response', 'Yes, we have rooms for 5 gold per night. Interested?')
        .addResponse('rooms-response', 'rent-room', 'Yes, I\'ll take a room.', null)
        .addResponse('rooms-response', 'decline', 'Maybe later.', null)
        .addNode('rumors-response', 'I heard strange noises from the old mine last night...')
        .addResponse('rumors-response', 'continue', 'Tell me more.', null)
        .addResponse('rumors-response', 'dismiss', 'Interesting.', null)
        .build();
      
      const tavernKeeper = NPCFactory.createFriendlyVillager(
        'tavern-keeper', 'Barkeep Bill', { x: 5, y: 5, z: 0 }
      );
      tavernKeeper.dialogueTree = dialogueTree;
      
      npcManager.addNPC(tavernKeeper);
      
      // Start conversation
      const result = npcManager.handlePlayerInteraction('player-1', 'tavern-keeper', 'talk');
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Welcome to the Prancing Pony');
      expect(tavernKeeper.currentState).toBe('talking');
      expect(tavernKeeper.currentDialogueNode).toBe('greeting');
    });

    it('should handle dialogue progression and responses', () => {
      const dialogueTree = new DialogueBuilder('simple-chat', 'Simple Chat')
        .addNode('start', 'Hello there!', true)
        .addResponse('start', 'response1', 'Hello!', 'end')
        .addNode('end', 'Nice to meet you!')
        .addResponse('end', 'final', 'Likewise!', null)
        .build();
      
      const npc = NPCFactory.createFriendlyVillager('friendly-npc', 'Friendly NPC', { x: 0, y: 0, z: 0 });
      npc.dialogueTree = dialogueTree;
      npc.currentDialogueNode = 'start';
      
      npcManager.addNPC(npc);
      
      // Continue dialogue with first response
      const result1 = npcManager.continueDialogue('friendly-npc', 'response1');
      expect(result1.success).toBe(true);
      expect(result1.message).toContain('Nice to meet you');
      expect(npc.currentDialogueNode).toBe('end');
      
      // End dialogue with final response
      const result2 = npcManager.continueDialogue('friendly-npc', 'final');
      expect(result2.success).toBe(true);
      expect(result2.effects?.endDialogue).toBe(true);
      expect(npc.currentDialogueNode).toBeUndefined();
      expect(npc.currentState).toBe('idle');
    });
  });

  describe('Complex NPC Interactions', () => {
    it('should handle merchant trading interactions', () => {
      const merchant = NPCFactory.createMerchant('trader-1', 'Merchant Mary', { x: 15, y: 15, z: 0 });
      npcManager.addNPC(merchant);
      
      const result = npcManager.handlePlayerInteraction('player-1', 'trader-1', 'trade');
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Here are my goods');
      expect(result.effects?.openTradeWindow).toBe(true);
      expect(result.effects?.merchantId).toBe('trader-1');
    });

    it('should handle combat initiation and NPC reactions', () => {
      const guard = NPCFactory.createGuard('combat-guard', 'Combat Guard', { x: 20, y: 20, z: 0 });
      const bystander = NPCFactory.createFriendlyVillager('witness', 'Witness', { x: 22, y: 22, z: 0 });
      
      npcManager.addNPC(guard);
      npcManager.addNPC(bystander);
      
      const result = npcManager.handlePlayerInteraction('player-1', 'combat-guard', 'attack');
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Combat begins');
      expect(result.effects?.combatStarted).toBe(true);
      expect(guard.currentState).toBe('fighting');
      
      // Check that a combat event was created that bystanders can detect
      npcManager.update(undefined, true);
      expect(bystander.knownEvents.some(e => e.type === 'combat')).toBe(true);
    });

    it('should coordinate multiple NPCs responding to events', () => {
      // Create multiple guards in the same area
      const guard1 = NPCFactory.createGuard('guard-1', 'Guard Alpha', { x: 10, y: 10, z: 0 });
      const guard2 = NPCFactory.createGuard('guard-2', 'Guard Beta', { x: 15, y: 15, z: 0 });
      const guard3 = NPCFactory.createGuard('guard-3', 'Guard Gamma', { x: 20, y: 20, z: 0 });
      
      npcManager.addNPC(guard1);
      npcManager.addNPC(guard2);
      npcManager.addNPC(guard3);
      
      // Trigger a loud explosion
      npcManager.triggerExplosion({ x: 12, y: 12, z: 0 }, 1.0);
      
      // Update all NPCs
      npcManager.update(undefined, true);
      
      // All guards should have detected the explosion
      expect(guard1.knownEvents.some(e => e.type === 'explosion')).toBe(true);
      expect(guard2.knownEvents.some(e => e.type === 'explosion')).toBe(true);
      // Guard 3 might be too far depending on sensory range and explosion intensity
    });

    it('should handle faction-based hostility', () => {
      const cityGuard = NPCFactory.createGuard('city-guard', 'City Guard', { x: 10, y: 10, z: 0 });
      cityGuard.hostileToFactions = ['thieves', 'monsters'];
      
      const thief: IEntity = {
        id: 'thief-1',
        name: 'Sneaky Pete',
        position: { x: 12, y: 12, z: 0 },
        type: 'player' // Simulating player with thief faction
      };
      
      npcManager.addNPC(cityGuard);
      
      const context: StateContext = {
        sensoryEvents: [],
        nearbyEntities: [thief],
        currentRoom: 'street',
        timeDelta: 1000,
        playerInRoom: thief
      };
      
      cityGuard.update(context);
      
      // Guard should become hostile to thief (this would need faction system enhancement)
      // For now, we test the basic hostile detection logic
      expect(cityGuard.currentState).toBe('chasing');
    });
  });

  describe('Advanced NPC Scenarios', () => {
    it('should handle a tavern brawl scenario with multiple NPCs reacting', () => {
      // Set up tavern scene
      const barkeep = NPCFactory.createFriendlyVillager('barkeep', 'Barkeep Tom', { x: 10, y: 10, z: 0 });
      const patron1 = NPCFactory.createFriendlyVillager('patron1', 'Drunk Patron', { x: 8, y: 8, z: 0 });
      const patron2 = NPCFactory.createFriendlyVillager('patron2', 'Scared Patron', { x: 12, y: 12, z: 0 });
      const guard = NPCFactory.createGuard('town-guard', 'Town Guard', { x: 15, y: 15, z: 0 });
      
      npcManager.addNPC(barkeep);
      npcManager.addNPC(patron1);
      npcManager.addNPC(patron2);
      npcManager.addNPC(guard);
      
      // Start combat in tavern
      const combatResult = npcManager.handlePlayerInteraction('player-1', 'patron1', 'attack');
      expect(combatResult.success).toBe(true);
      
      // Let NPCs process the combat event
      npcManager.update(undefined, true);
      
      // Check various NPC reactions
      expect(barkeep.knownEvents.some(e => e.type === 'combat')).toBe(true);
      expect(patron2.knownEvents.some(e => e.type === 'combat')).toBe(true);
      expect(guard.knownEvents.some(e => e.type === 'combat')).toBe(true);
      
      // Verify system status
      const status = npcManager.getSystemStatus();
      expect(status.npcCount).toBe(4);
      expect(status.activeEvents).toBeGreaterThan(0);
    });

    it('should handle monster chase and guard response scenario', () => {
      const monster = NPCFactory.createHostileMonster('orc-raider', 'Orc Raider', { x: 5, y: 5, z: 0 });
      const guard1 = NPCFactory.createGuard('guard-1', 'Gate Guard', { x: 25, y: 25, z: 0 });
      const guard2 = NPCFactory.createGuard('guard-2', 'Patrol Guard', { x: 30, y: 30, z: 0 });
      const villager = NPCFactory.createFriendlyVillager('villager', 'Terrified Villager', { x: 28, y: 28, z: 0 });
      
      npcManager.addNPC(monster);
      npcManager.addNPC(guard1);
      npcManager.addNPC(guard2);
      npcManager.addNPC(villager);
      
      // Player enters and monster detects them
      const player: IEntity = {
        id: 'player-1',
        name: 'Adventurer',
        position: { x: 7, y: 7, z: 0 },
        type: 'player'
      };
      
      const context1: StateContext = {
        sensoryEvents: [],
        nearbyEntities: [player],
        currentRoom: 'street',
        timeDelta: 1000,
        playerInRoom: player
      };
      
      monster.update(context1);
      expect(monster.currentState).toBe('chasing');
      
      // Combat starts - creates event for guards to detect
      npcManager.triggerLoudNoise('orc-raider', { x: 6, y: 6, z: 0 }, 'Orc roars and charges!');
      
      npcManager.update([player], true);
      
      // Guards should detect the noise/threat
      const guardEvents = guard1.knownEvents.concat(guard2.knownEvents);
      expect(guardEvents.some(e => e.type === 'loud_noise')).toBe(true);

      // Villager should also be aware
      expect(villager.knownEvents.some(e => e.type === 'loud_noise')).toBe(true);
    });
  });

  describe('NPC Manager System Tests', () => {
    it('should manage multiple NPCs efficiently', () => {
      // Add various NPCs
      for (let i = 0; i < 10; i++) {
        const npc = NPCFactory.createFriendlyVillager(`villager-${i}`, `Villager ${i}`, 
          { x: i * 5, y: i * 5, z: 0 });
        npcManager.addNPC(npc);
      }
      
      const status = npcManager.getSystemStatus();
      expect(status.npcCount).toBe(10);
      expect(status.npcStates.length).toBe(10);
      
      // All should start in idle state
      expect(status.npcStates.every(npc => npc.state === 'idle')).toBe(true);
    });

    it('should clean up old sensory events', (done) => {
      // Set short decay time for testing
      const testManager = new NPCManager(gameSystems.getRoomSystem(), gameSystems.getItemSystem(), {
        eventDecayTime: 100 // 100ms
      });
      
      // Create an event
      testManager.triggerExplosion({ x: 10, y: 10, z: 0 }, 0.5);
      
      // Should have 1 event initially
      let status = testManager.getSystemStatus();
      expect(status.activeEvents).toBe(1);
      
      // Wait for event to decay
      setTimeout(() => {
        testManager.update(); // Trigger cleanup
        status = testManager.getSystemStatus();
        expect(status.activeEvents).toBe(0);
        done();
      }, 150);
    });

    it('should provide useful debugging information', () => {
      const guard = NPCFactory.createGuard('debug-guard', 'Debug Guard', { x: 0, y: 0, z: 0 });
      npcManager.addNPC(guard);
      npcManager.triggerExplosion({ x: 1, y: 1, z: 0 }, 0.8);
      
      // This should log useful information without throwing errors
      expect(() => npcManager.logNPCBehavior()).not.toThrow();
      
      const status = npcManager.getSystemStatus();
      expect(status).toHaveProperty('npcCount');
      expect(status).toHaveProperty('activeEvents'); 
      expect(status).toHaveProperty('npcStates');
      expect(status.npcStates[0]).toHaveProperty('id');
      expect(status.npcStates[0]).toHaveProperty('name');
      expect(status.npcStates[0]).toHaveProperty('type');
      expect(status.npcStates[0]).toHaveProperty('state');
    });
  });
});