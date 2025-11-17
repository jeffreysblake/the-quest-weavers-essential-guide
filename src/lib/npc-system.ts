/**
 * NPC System for Quest Weaver
 * Comprehensive system for Non-Player Characters with AI, dialogue, and interactions
 */

import { IEntity, IBaseEntity, IInteractionResult } from '../nestjs-app/src/entity/entity.interface';
import { Item } from './item-system';

// ===== CORE NPC INTERFACES =====

export type NPCType = 'friendly' | 'neutral' | 'hostile' | 'merchant' | 'guard' | 'monster' | 'animal';
export type NPCState = 'idle' | 'patrolling' | 'chasing' | 'fighting' | 'fleeing' | 'talking' | 'dead' | 'sleeping' | 'working';
export type SenseType = 'sight' | 'sound' | 'smell' | 'touch' | 'telepathic';
export type EventType = 'explosion' | 'combat' | 'theft' | 'magic' | 'loud_noise' | 'player_entered' | 'item_used';

export interface NPCStats {
  health: number;
  maxHealth: number;
  strength: number;
  dexterity: number;
  intelligence: number;
  charisma: number;
  level: number;
  experience: number;
}

export interface SensoryEvent {
  id: string;
  type: EventType;
  source: string; // Entity ID that caused the event
  location: { x: number; y: number; z: number };
  intensity: number; // 0-1 scale
  description: string;
  timestamp: number;
}

export interface DialogueNode {
  id: string;
  text: string;
  condition?: (npc: NPC, player: IEntity) => boolean;
  responses: DialogueResponse[];
  effects?: (npc: NPC, player: IEntity) => void;
}

export interface DialogueResponse {
  id: string;
  text: string;
  nextNodeId: string | null; // null means end conversation
  condition?: (npc: NPC, player: IEntity) => boolean;
  cost?: { gold?: number; items?: string[] }; // Player requirements
}

export interface DialogueTree {
  id: string;
  name: string;
  rootNodeId: string;
  nodes: Map<string, DialogueNode>;
}

// ===== STATE MACHINE =====

export interface StateTransition {
  from: NPCState;
  to: NPCState;
  condition: (npc: NPC, context: StateContext) => boolean;
  action?: (npc: NPC, context: StateContext) => void;
}

export interface StateContext {
  sensoryEvents: SensoryEvent[];
  nearbyEntities: IEntity[];
  currentRoom: string;
  timeDelta: number;
  playerInRoom?: IEntity;
}

export interface StateMachine {
  currentState: NPCState;
  transitions: StateTransition[];
  stateActions: Map<NPCState, (npc: NPC, context: StateContext) => void>;
}

// ===== NPC CLASS =====

export interface INPC extends IEntity {
  npcType: NPCType;
  stats: NPCStats;
  currentState: NPCState;
  dialogueTree?: DialogueTree;
  currentDialogueNode?: string;
  stateMachine: StateMachine;
  sensoryRange: number;
  sensoryTypes: SenseType[];
  faction?: string;
  hostileToFactions?: string[];
  friendlyToFactions?: string[];
  patrolRoute?: string[]; // Array of room IDs
  currentPatrolIndex?: number;
  homeRoomId?: string;
  lastSeenPlayer?: { entityId: string; location: { x: number; y: number; z: number }; timestamp: number };
  knownEvents: SensoryEvent[];
  maxEventMemory: number;
}

export class NPC implements INPC {
  // IBaseEntity properties
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  type: 'player' | 'object' | 'room' = 'object'; // NPCs are treated as special objects

  // IEntity properties
  health?: number;
  inventory?: Item[];

  // NPC-specific properties
  npcType: NPCType;
  stats: NPCStats;
  currentState: NPCState;
  dialogueTree?: DialogueTree;
  currentDialogueNode?: string;
  stateMachine: StateMachine;
  sensoryRange: number;
  sensoryTypes: SenseType[];
  faction?: string;
  hostileToFactions?: string[];
  friendlyToFactions?: string[];
  patrolRoute?: string[];
  currentPatrolIndex?: number;
  homeRoomId?: string;
  lastSeenPlayer?: { entityId: string; location: { x: number; y: number; z: number }; timestamp: number };
  knownEvents: SensoryEvent[] = [];
  maxEventMemory: number = 10;

  constructor(config: {
    id: string;
    name: string;
    position: { x: number; y: number; z: number };
    npcType: NPCType;
    stats: NPCStats;
    sensoryRange?: number;
    sensoryTypes?: SenseType[];
    faction?: string;
    hostileToFactions?: string[];
    friendlyToFactions?: string[];
    dialogueTree?: DialogueTree;
    patrolRoute?: string[];
    homeRoomId?: string;
  }) {
    this.id = config.id;
    this.name = config.name;
    this.position = config.position;
    this.npcType = config.npcType;
    this.stats = config.stats;
    this.health = config.stats.health;
    this.inventory = [];
    this.currentState = 'idle';
    this.sensoryRange = config.sensoryRange || 5.0;
    this.sensoryTypes = config.sensoryTypes || ['sight', 'sound'];
    this.faction = config.faction;
    this.hostileToFactions = config.hostileToFactions;
    this.friendlyToFactions = config.friendlyToFactions;
    this.dialogueTree = config.dialogueTree;
    this.patrolRoute = config.patrolRoute;
    this.homeRoomId = config.homeRoomId;
    this.currentPatrolIndex = 0;

    // Initialize default state machine
    this.stateMachine = this.createDefaultStateMachine();
  }

  private createDefaultStateMachine(): StateMachine {
    return {
      currentState: 'idle',
      transitions: [
        // Idle -> Patrolling (if has patrol route)
        {
          from: 'idle',
          to: 'patrolling',
          condition: (npc) => !!npc.patrolRoute && npc.patrolRoute.length > 1
        },
        
        // Any state -> Chasing (if hostile player detected)
        {
          from: 'idle',
          to: 'chasing',
          condition: (npc, context) => this.detectHostileTarget(context)
        },
        {
          from: 'patrolling',
          to: 'chasing', 
          condition: (npc, context) => this.detectHostileTarget(context)
        },
        
        // Chasing -> Fighting (if close to target)
        {
          from: 'chasing',
          to: 'fighting',
          condition: (npc, context) => this.isTargetInMeleeRange(context)
        },
        
        // Fighting -> Chasing (if target moves away)
        {
          from: 'fighting',
          to: 'chasing',
          condition: (npc, context) => !this.isTargetInMeleeRange(context) && this.hasValidTarget(context)
        },
        
        // Chasing -> Idle (if lost target)
        {
          from: 'chasing',
          to: 'idle',
          condition: (npc, context) => !this.hasValidTarget(context)
        },
        
        // Any state -> Talking (if player initiates dialogue)
        {
          from: 'idle',
          to: 'talking',
          condition: (npc, context) => this.isPlayerTalking(context)
        },
        
        // Talking -> Previous state (when dialogue ends)
        {
          from: 'talking',
          to: 'idle',
          condition: (npc) => !npc.currentDialogueNode
        },
        
        // Any state -> Fleeing (if low health)
        {
          from: 'fighting',
          to: 'fleeing',
          condition: (npc) => (npc.health || 0) < (npc.stats.maxHealth * 0.2)
        }
      ],
      stateActions: new Map([
        ['idle', this.idleAction.bind(this)],
        ['patrolling', this.patrolAction.bind(this)],
        ['chasing', this.chaseAction.bind(this)],
        ['fighting', this.fightAction.bind(this)],
        ['fleeing', this.fleeAction.bind(this)],
        ['talking', this.talkAction.bind(this)],
      ])
    };
  }

  // ===== STATE MACHINE CONDITIONS =====

  private detectHostileTarget(context: StateContext): boolean {
    if (this.npcType !== 'hostile' && this.npcType !== 'guard' && this.npcType !== 'monster') return false;
    
    const hostileEntity = context.nearbyEntities.find(entity => 
      this.isHostileTo(entity) && this.canSense(entity, context)
    );
    
    return !!hostileEntity;
  }

  private isTargetInMeleeRange(context: StateContext): boolean {
    const target = this.getCurrentTarget(context);
    if (!target) return false;
    
    const distance = this.calculateDistance(this.position, target.position);
    return distance <= 2.0; // 2 units for melee range
  }

  private hasValidTarget(context: StateContext): boolean {
    return !!this.getCurrentTarget(context);
  }

  private isPlayerTalking(context: StateContext): boolean {
    // This would be set by the game engine when player initiates dialogue
    return !!this.currentDialogueNode;
  }

  private getCurrentTarget(context: StateContext): IEntity | null {
    // First check if we have a current hostile target from recent sensory data
    const hostileTarget = context.nearbyEntities.find(entity => 
      this.isHostileTo(entity) && this.canSense(entity, context)
    );
    
    if (hostileTarget) {
      return hostileTarget;
    }
    
    // Fallback to last seen player if still in range
    if (this.lastSeenPlayer && context.playerInRoom?.id === this.lastSeenPlayer.entityId) {
      return context.playerInRoom;
    }
    
    return null;
  }

  // ===== STATE ACTIONS =====

  private idleAction(npc: NPC, context: StateContext): void {
    // Look around, process sensory events, maybe interact with environment
    this.processSensoryEvents(context.sensoryEvents);
    
    // Random idle behaviors
    if (Math.random() < 0.1) {
      // 10% chance to do something interesting
      this.performIdleBehavior();
    }
  }

  private patrolAction(npc: NPC, context: StateContext): void {
    if (!this.patrolRoute || this.patrolRoute.length === 0) return;
    
    // Move to next patrol point
    const targetRoomId = this.patrolRoute[this.currentPatrolIndex || 0];
    
    // In a real implementation, this would trigger actual movement
    // For now, we'll just update the patrol index
    this.currentPatrolIndex = ((this.currentPatrolIndex || 0) + 1) % this.patrolRoute.length;
    
    console.log(`${this.name} patrols to room ${targetRoomId}`);
  }

  private chaseAction(npc: NPC, context: StateContext): void {
    const target = this.getCurrentTarget(context);
    if (!target) return;
    
    // Move towards the target
    console.log(`${this.name} chases ${target.name}!`);
    
    // Update last seen player location
    this.lastSeenPlayer = {
      entityId: target.id,
      location: { ...target.position },
      timestamp: Date.now()
    };
  }

  private fightAction(npc: NPC, context: StateContext): void {
    const target = this.getCurrentTarget(context);
    if (!target) return;
    
    // Perform combat action
    const damage = this.calculateDamage(target);
    console.log(`${this.name} attacks ${target.name} for ${damage} damage!`);
    
    // In a real implementation, this would apply damage to the target
  }

  private fleeAction(npc: NPC, context: StateContext): void {
    console.log(`${this.name} flees from combat!`);
    
    // Try to move away from threats
    if (this.homeRoomId) {
      console.log(`${this.name} retreats to home room ${this.homeRoomId}`);
    }
  }

  private talkAction(npc: NPC, context: StateContext): void {
    // Handle ongoing dialogue - this would interact with dialogue system
    if (this.currentDialogueNode && context.playerInRoom) {
      console.log(`${this.name} continues conversation with ${context.playerInRoom.name}`);
    }
  }

  // ===== SENSORY SYSTEM =====

  processSensoryEvents(events: SensoryEvent[]): void {
    for (const event of events) {
      if (this.canPerceiveEvent(event)) {
        this.addEventToMemory(event);
        this.reactToEvent(event);
      }
    }
  }

  private canPerceiveEvent(event: SensoryEvent): boolean {
    const distance = this.calculateDistance(this.position, event.location);

    // Check if event is within sensory range
    // Higher intensity events can be detected from further away
    const effectiveRange = this.sensoryRange * (1 + event.intensity);
    if (distance > effectiveRange) return false;
    
    // Check if NPC has the right senses
    switch (event.type) {
      case 'explosion':
      case 'loud_noise':
        return this.sensoryTypes.includes('sound');
      case 'combat':
      case 'theft':
        return this.sensoryTypes.includes('sight') || this.sensoryTypes.includes('sound');
      case 'magic':
        return this.sensoryTypes.includes('telepathic') || this.sensoryTypes.includes('sight');
      default:
        return this.sensoryTypes.includes('sight');
    }
  }

  private addEventToMemory(event: SensoryEvent): void {
    this.knownEvents.push(event);
    
    // Keep only the most recent events
    if (this.knownEvents.length > this.maxEventMemory) {
      this.knownEvents.shift();
    }
  }

  private reactToEvent(event: SensoryEvent): void {
    switch (event.type) {
      case 'explosion':
      case 'loud_noise':
        if (this.npcType === 'guard') {
          console.log(`${this.name} investigates the loud noise from ${event.description}`);
        }
        break;
      
      case 'combat':
        if (this.npcType === 'guard') {
          console.log(`${this.name} rushes to help with the combat!`);
        } else if (this.npcType === 'friendly') {
          console.log(`${this.name} hides from the combat.`);
        }
        break;
      
      case 'theft':
        if (this.npcType === 'guard' || this.npcType === 'merchant') {
          console.log(`${this.name} notices the theft and becomes alert!`);
        }
        break;
    }
  }

  // ===== UTILITY METHODS =====

  private calculateDistance(pos1: { x: number; y: number; z: number }, pos2: { x: number; y: number; z: number }): number {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = pos1.z - pos2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  private isHostileTo(entity: IEntity): boolean {
    // Check faction hostility
    if (this.hostileToFactions && entity.type === 'player') {
      // In a real implementation, players would have factions too
      // For now, guards/monsters/hostile NPCs with hostile factions will chase players
      return this.npcType === 'hostile' || this.npcType === 'monster' || this.npcType === 'guard';
    }

    // Hostile NPCs are naturally hostile to players
    if (this.npcType === 'hostile' && entity.type === 'player') {
      return true;
    }

    // Monsters are naturally hostile to players
    if (this.npcType === 'monster' && entity.type === 'player') {
      return true;
    }

    return false;
  }

  private canSense(entity: IEntity, context: StateContext): boolean {
    const distance = this.calculateDistance(this.position, entity.position);
    return distance <= this.sensoryRange;
  }

  private calculateDamage(target: IEntity): number {
    // Simple damage calculation based on stats
    return Math.max(1, this.stats.strength + Math.floor(Math.random() * 6) - 3);
  }

  private performIdleBehavior(): void {
    const behaviors = [
      `${this.name} looks around thoughtfully.`,
      `${this.name} adjusts their equipment.`,
      `${this.name} stretches.`,
      `${this.name} mutters something under their breath.`
    ];
    
    const behavior = behaviors[Math.floor(Math.random() * behaviors.length)];
  }

  // ===== UPDATE METHOD =====

  update(context: StateContext): void {
    // Process sensory events first
    this.processSensoryEvents(context.sensoryEvents);
    
    // Check for state transitions
    for (const transition of this.stateMachine.transitions) {
      if (transition.from === this.currentState && transition.condition(this, context)) {
        this.currentState = transition.to;
        if (transition.action) {
          transition.action(this, context);
        }
        break;
      }
    }
    
    // Execute current state action
    const stateAction = this.stateMachine.stateActions.get(this.currentState);
    if (stateAction) {
      stateAction(this, context);
    }
  }

  // ===== INTERACTION METHODS =====

  interactWith(other: IEntity): IInteractionResult {
    if (other.type === 'player') {
      return this.interactWithPlayer(other);
    }
    
    return {
      success: false,
      message: `${this.name} doesn't know how to interact with ${other.name}.`
    };
  }

  private interactWithPlayer(player: IEntity): IInteractionResult {
    // Start dialogue if available
    if (this.dialogueTree && !this.currentDialogueNode) {
      this.currentDialogueNode = this.dialogueTree.rootNodeId;
      this.currentState = 'talking';
      
      const rootNode = this.dialogueTree.nodes.get(this.dialogueTree.rootNodeId);
      if (rootNode) {
        return {
          success: true,
          message: `${this.name}: "${rootNode.text}"`,
          effects: { startedDialogue: true }
        };
      }
    }
    
    // Default interaction based on NPC type
    switch (this.npcType) {
      case 'friendly':
        return {
          success: true,
          message: `${this.name} smiles warmly at you.`
        };
      case 'hostile':
        return {
          success: true,
          message: `${this.name} glares at you menacingly!`,
          effects: { hostile: true }
        };
      case 'neutral':
        return {
          success: true,
          message: `${this.name} nods politely.`
        };
      case 'merchant':
        return {
          success: true,
          message: `${this.name}: "Welcome! Would you like to see my wares?"`
        };
      default:
        return {
          success: true,
          message: `${this.name} acknowledges your presence.`
        };
    }
  }
}

// ===== DIALOGUE HELPERS =====

export class DialogueBuilder {
  private tree: DialogueTree;
  
  constructor(id: string, name: string) {
    this.tree = {
      id,
      name,
      rootNodeId: '',
      nodes: new Map()
    };
  }
  
  addNode(id: string, text: string, isRoot: boolean = false): DialogueBuilder {
    if (isRoot) {
      this.tree.rootNodeId = id;
    }
    
    this.tree.nodes.set(id, {
      id,
      text,
      responses: []
    });
    
    return this;
  }
  
  addResponse(nodeId: string, responseId: string, text: string, nextNodeId: string | null): DialogueBuilder {
    const node = this.tree.nodes.get(nodeId);
    if (node) {
      node.responses.push({
        id: responseId,
        text,
        nextNodeId
      });
    }
    
    return this;
  }
  
  build(): DialogueTree {
    return this.tree;
  }
}