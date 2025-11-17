/**
 * NPC Manager for Quest Weaver
 * Manages all NPCs, their AI updates, interactions, and sensory events
 */

import { NPC, INPC, SensoryEvent, EventType, StateContext } from './npc-system';
import { IEntity } from '../nestjs-app/src/entity/entity.interface';
import { RoomSystem } from './room-system';
import { ItemSystem } from './item-system';

export interface NPCManagerConfig {
  updateInterval?: number; // milliseconds between AI updates
  maxSensoryEvents?: number; // maximum events to track
  eventDecayTime?: number; // how long events remain active (ms)
}

export class NPCManager {
  private npcs: Map<string, NPC> = new Map();
  private sensoryEvents: SensoryEvent[] = [];
  private roomSystem: RoomSystem;
  private itemSystem: ItemSystem;
  private config: NPCManagerConfig;
  private lastUpdateTime: number = Date.now();
  private eventIdCounter: number = 0;

  constructor(
    roomSystem: RoomSystem, 
    itemSystem: ItemSystem,
    config: NPCManagerConfig = {}
  ) {
    this.roomSystem = roomSystem;
    this.itemSystem = itemSystem;
    this.config = {
      updateInterval: 1000, // 1 second default
      maxSensoryEvents: 50,
      eventDecayTime: 30000, // 30 seconds
      ...config
    };
  }

  // ===== NPC MANAGEMENT =====

  addNPC(npc: NPC): void {
    this.npcs.set(npc.id, npc);
    console.log(`Added NPC: ${npc.name} (${npc.npcType}) to the game`);
  }

  removeNPC(npcId: string): boolean {
    return this.npcs.delete(npcId);
  }

  getNPC(npcId: string): NPC | undefined {
    return this.npcs.get(npcId);
  }

  getAllNPCs(): NPC[] {
    return Array.from(this.npcs.values());
  }

  getNPCsInRoom(roomId: string): NPC[] {
    return this.getAllNPCs().filter(npc => {
      // In a real implementation, we'd check the NPC's current room
      // For now, we'll use a simple check
      return this.isNPCInRoom(npc, roomId);
    });
  }

  private isNPCInRoom(npc: NPC, roomId: string): boolean {
    // Simple room check - in a real implementation this would be more sophisticated
    const room = this.roomSystem.getRoom(roomId);
    if (!room) return false;

    // Check if NPC position is within room bounds
    return (
      npc.position.x >= room.position.x &&
      npc.position.x <= room.position.x + room.size.width &&
      npc.position.y >= room.position.y &&
      npc.position.y <= room.position.y + room.size.height
    );
  }

  // ===== SENSORY EVENT SYSTEM =====

  createSensoryEvent(
    type: EventType,
    sourceId: string,
    location: { x: number; y: number; z: number },
    intensity: number,
    description: string
  ): string {
    const event: SensoryEvent = {
      id: `event_${++this.eventIdCounter}`,
      type,
      source: sourceId,
      location,
      intensity: Math.max(0, intensity), // Ensure non-negative (no upper limit - higher values mean further detection)
      description,
      timestamp: Date.now()
    };

    this.addSensoryEvent(event);
    return event.id;
  }

  private addSensoryEvent(event: SensoryEvent): void {
    this.sensoryEvents.push(event);
    
    // Keep only the most recent events
    if (this.sensoryEvents.length > this.config.maxSensoryEvents!) {
      this.sensoryEvents.shift();
    }
    
    console.log(`🔊 Sensory event: ${event.type} at (${event.location.x}, ${event.location.y}, ${event.location.z}) - ${event.description}`);
  }

  private cleanupOldEvents(): void {
    const now = Date.now();
    const cutoffTime = now - this.config.eventDecayTime!;
    
    this.sensoryEvents = this.sensoryEvents.filter(event => 
      event.timestamp > cutoffTime
    );
  }

  // ===== UPDATE SYSTEM =====

  update(players?: IEntity[], forceUpdate: boolean = false): void {
    const now = Date.now();
    const timeDelta = now - this.lastUpdateTime;

    // Clean up old events regardless of update interval
    // This ensures events decay properly even when NPCs aren't being updated
    this.cleanupOldEvents();

    // Skip NPC AI update if not enough time has passed (unless forced)
    if (!forceUpdate && timeDelta < this.config.updateInterval!) {
      return;
    }

    // Update each NPC
    const npcArray = Array.from(this.npcs.values());
    for (const npc of npcArray) {
      this.updateNPC(npc, timeDelta, players);
    }

    this.lastUpdateTime = now;
  }

  private updateNPC(npc: NPC, timeDelta: number, players?: IEntity[]): void {
    // Get NPCs current room (may be null if NPC is not in a defined room)
    const currentRoomId = this.getCurrentRoomId(npc);

    // Find nearby entities
    let nearbyNPCs: NPC[] = [];
    let nearbyPlayers: IEntity[] = [];

    if (currentRoomId) {
      // NPC is in a room, get entities in that room
      nearbyNPCs = this.getNPCsInRoom(currentRoomId).filter(other => other.id !== npc.id);
      nearbyPlayers = players?.filter(player => this.isEntityInRoom(player, currentRoomId)) || [];
    } else {
      // NPC is not in a room, find nearby entities by distance
      nearbyNPCs = this.getAllNPCs().filter(other => {
        if (other.id === npc.id) return false;
        const distance = this.calculateDistance(npc.position, other.position);
        return distance <= npc.sensoryRange * 2; // Check within a reasonable range
      });
      nearbyPlayers = players?.filter(player => {
        const distance = this.calculateDistance(npc.position, player.position);
        return distance <= npc.sensoryRange * 2;
      }) || [];
    }

    const nearbyEntities: IEntity[] = [...nearbyNPCs, ...nearbyPlayers];
    
    // Get relevant sensory events (within range)
    // Consider event intensity - higher intensity events can be detected from further away
    const relevantEvents = this.sensoryEvents.filter(event => {
      const distance = this.calculateDistance(npc.position, event.location);
      const effectiveRange = npc.sensoryRange * (1 + event.intensity);
      return distance <= effectiveRange;
    });
    
    // Create state context
    const context: StateContext = {
      sensoryEvents: relevantEvents,
      nearbyEntities,
      currentRoom: currentRoomId || 'unknown',
      timeDelta,
      playerInRoom: nearbyPlayers.length > 0 ? nearbyPlayers[0] : undefined
    };
    
    // Update the NPC
    npc.update(context);
  }

  private getCurrentRoomId(entity: IEntity): string | null {
    // In a real implementation, this would be tracked properly
    // For now, we'll use a simple heuristic based on position
    const rooms = this.roomSystem.getAllRooms();
    
    for (const room of rooms) {
      if (this.isEntityInRoom(entity, room.id)) {
        return room.id;
      }
    }
    return null;
  }

  private isEntityInRoom(entity: IEntity, roomId: string): boolean {
    const room = this.roomSystem.getRoom(roomId);
    if (!room) return false;
    
    return (
      entity.position.x >= room.position.x &&
      entity.position.x <= room.position.x + room.size.width &&
      entity.position.y >= room.position.y &&
      entity.position.y <= room.position.y + room.size.height
    );
  }

  private calculateDistance(pos1: { x: number; y: number; z: number }, pos2: { x: number; y: number; z: number }): number {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = pos1.z - pos2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // ===== INTERACTION SYSTEM =====

  handlePlayerInteraction(playerId: string, npcId: string, action: string): any {
    const npc = this.npcs.get(npcId);
    if (!npc) {
      return { success: false, message: "NPC not found." };
    }
    
    // Create a player entity for interaction
    const player: IEntity = {
      id: playerId,
      name: 'Player', // In a real implementation, get actual player name
      position: { x: 0, y: 0, z: 0 }, // In a real implementation, get actual position
      type: 'player'
    };
    
    switch (action) {
      case 'talk':
        return this.handleTalkInteraction(npc, player);
      case 'trade':
        return this.handleTradeInteraction(npc, player);
      case 'attack':
        return this.handleAttackInteraction(npc, player);
      default:
        return npc.interactWith(player);
    }
  }

  private handleTalkInteraction(npc: NPC, player: IEntity): any {
    if (!npc.dialogueTree) {
      return {
        success: true,
        message: `${npc.name} doesn't seem interested in talking.`
      };
    }
    
    // Start or continue dialogue
    const result = npc.interactWith(player);
    
    // Create a sensory event for nearby NPCs
    this.createSensoryEvent(
      'player_entered', // Not perfect, but represents social interaction
      player.id,
      npc.position,
      0.3, // Low intensity for talking
      `${player.name} is talking with ${npc.name}`
    );
    
    return result;
  }

  private handleTradeInteraction(npc: NPC, player: IEntity): any {
    if (npc.npcType !== 'merchant') {
      return {
        success: false,
        message: `${npc.name} is not a merchant.`
      };
    }
    
    // In a real implementation, this would open trade interface
    return {
      success: true,
      message: `${npc.name}: "Here are my goods!"`,
      effects: { openTradeWindow: true, merchantId: npc.id }
    };
  }

  private handleAttackInteraction(npc: NPC, player: IEntity): any {
    // Make NPC hostile and create combat event
    npc.currentState = 'fighting';
    
    this.createSensoryEvent(
      'combat',
      player.id,
      npc.position,
      0.8, // High intensity for combat
      `${player.name} attacks ${npc.name}!`
    );
    
    return {
      success: true,
      message: `You attack ${npc.name}! Combat begins!`,
      effects: { combatStarted: true, targetId: npc.id }
    };
  }

  // ===== DIALOGUE SYSTEM =====

  continueDialogue(npcId: string, responseId: string): any {
    const npc = this.npcs.get(npcId);
    if (!npc || !npc.currentDialogueNode || !npc.dialogueTree) {
      return { success: false, message: "No active dialogue." };
    }
    
    const currentNode = npc.dialogueTree.nodes.get(npc.currentDialogueNode);
    if (!currentNode) {
      return { success: false, message: "Invalid dialogue state." };
    }
    
    const selectedResponse = currentNode.responses.find(r => r.id === responseId);
    if (!selectedResponse) {
      return { success: false, message: "Invalid response." };
    }
    
    // Check response conditions and costs
    if (selectedResponse.condition) {
      const player: IEntity = { id: 'player', name: 'Player', position: { x: 0, y: 0, z: 0 }, type: 'player' };
      if (!selectedResponse.condition(npc, player)) {
        return { success: false, message: "You cannot choose this response." };
      }
    }
    
    // Move to next dialogue node or end conversation
    if (selectedResponse.nextNodeId) {
      npc.currentDialogueNode = selectedResponse.nextNodeId;
      const nextNode = npc.dialogueTree.nodes.get(selectedResponse.nextNodeId);
      
      if (nextNode) {
        return {
          success: true,
          message: `${npc.name}: "${nextNode.text}"`,
          responses: nextNode.responses,
          effects: { continueDialogue: true }
        };
      }
    } else {
      // End dialogue
      npc.currentDialogueNode = undefined;
      npc.currentState = 'idle';
      
      return {
        success: true,
        message: `${npc.name} ends the conversation.`,
        effects: { endDialogue: true }
      };
    }
    
    return { success: false, message: "Dialogue error." };
  }

  // ===== EVENT TRIGGERS =====

  triggerExplosion(location: { x: number; y: number; z: number }, intensity: number = 1.0): void {
    this.createSensoryEvent(
      'explosion',
      'system',
      location,
      intensity,
      'A loud explosion rocks the area!'
    );
  }

  triggerTheft(thiefId: string, location: { x: number; y: number; z: number }, itemName: string): void {
    this.createSensoryEvent(
      'theft',
      thiefId,
      location,
      0.6,
      `Someone stole ${itemName}!`
    );
  }

  triggerLoudNoise(sourceId: string, location: { x: number; y: number; z: number }, description: string): void {
    this.createSensoryEvent(
      'loud_noise',
      sourceId,
      location,
      7.0, // High intensity for loud noises - can be heard from very far away
      description
    );
  }

  triggerMagicEvent(casterId: string, location: { x: number; y: number; z: number }, spellName: string): void {
    this.createSensoryEvent(
      'magic',
      casterId,
      location,
      0.5,
      `${spellName} magic is cast!`
    );
  }

  // ===== DEBUG AND MONITORING =====

  getSystemStatus(): any {
    return {
      npcCount: this.npcs.size,
      activeEvents: this.sensoryEvents.length,
      npcStates: Array.from(this.npcs.values()).map(npc => ({
        id: npc.id,
        name: npc.name,
        type: npc.npcType,
        state: npc.currentState,
        health: npc.health,
        position: npc.position
      }))
    };
  }

  logNPCBehavior(): void {
    console.log('=== NPC System Status ===');
    console.log(`NPCs: ${this.npcs.size}, Events: ${this.sensoryEvents.length}`);
    
    for (const npc of this.npcs.values()) {
      console.log(`- ${npc.name} (${npc.npcType}): ${npc.currentState} at (${npc.position.x}, ${npc.position.y})`);
    }
    
    if (this.sensoryEvents.length > 0) {
      console.log('Recent Events:');
      this.sensoryEvents.slice(-3).forEach(event => {
        console.log(`  • ${event.type}: ${event.description}`);
      });
    }
  }
}

// ===== FACTORY METHODS FOR COMMON NPC TYPES =====

export class NPCFactory {
  static createGuard(id: string, name: string, position: { x: number; y: number; z: number }, patrolRoute?: string[]): NPC {
    return new NPC({
      id,
      name,
      position,
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
      faction: 'guards',
      hostileToFactions: ['thieves', 'monsters'],
      patrolRoute
    });
  }

  static createMerchant(id: string, name: string, position: { x: number; y: number; z: number }): NPC {
    return new NPC({
      id,
      name,
      position,
      npcType: 'merchant',
      stats: {
        health: 60,
        maxHealth: 60,
        strength: 8,
        dexterity: 10,
        intelligence: 15,
        charisma: 18,
        level: 2,
        experience: 200
      },
      sensoryRange: 5.0,
      sensoryTypes: ['sight', 'sound'],
      faction: 'merchants'
    });
  }

  static createHostileMonster(id: string, name: string, position: { x: number; y: number; z: number }): NPC {
    return new NPC({
      id,
      name,
      position,
      npcType: 'monster',
      stats: {
        health: 80,
        maxHealth: 80,
        strength: 18,
        dexterity: 14,
        intelligence: 6,
        charisma: 4,
        level: 4,
        experience: 400
      },
      sensoryRange: 10.0,
      sensoryTypes: ['sight', 'sound', 'smell'],
      faction: 'monsters',
      hostileToFactions: ['players', 'guards', 'merchants']
    });
  }

  static createFriendlyVillager(id: string, name: string, position: { x: number; y: number; z: number }): NPC {
    return new NPC({
      id,
      name,
      position,
      npcType: 'friendly',
      stats: {
        health: 50,
        maxHealth: 50,
        strength: 10,
        dexterity: 10,
        intelligence: 12,
        charisma: 14,
        level: 1,
        experience: 100
      },
      sensoryRange: 4.0,
      sensoryTypes: ['sight', 'sound'],
      faction: 'villagers',
      friendlyToFactions: ['players', 'guards']
    });
  }
}