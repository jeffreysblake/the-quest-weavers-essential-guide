# Quest Weaver - Final Development Phases

> **Comprehensive Audit Completed:** January 2025
>
> **Overall Architecture Score:** 5.8/10 - Functional foundation with good practices, but needs significant architectural refactoring for production readiness.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Critical Issues Identified](#critical-issues-identified)
3. [Architecture Improvements](#architecture-improvements)
4. [NLP & Parser Enhancements](#nlp--parser-enhancements)
5. [State Management Unification](#state-management-unification)
6. [Navigation & Room System](#navigation--room-system)
7. [Missing Standard IF Features](#missing-standard-if-features)
8. [Implementation Roadmap](#implementation-roadmap)
9. [Progress Tracking](#progress-tracking)

---

## Executive Summary

### Current Strengths
- ✅ Comprehensive NPC AI with state machines (`src/lib/npc-system.ts`)
- ✅ Strong concurrency protection with Mutex locks
- ✅ Excellent vertical navigation system (`src/lib/vertical-navigation.ts`)
- ✅ 401 passing tests with good coverage
- ✅ Event system implementation (`nestjs-app/src/events/`)
- ✅ LLM integration framework (`src/lib/narrative-llm-system.ts`)

### Critical Weaknesses
- ❌ **Dual/Triple implementations** of core systems (3 inventory systems, 2 room systems)
- ❌ **Tight coupling** - no dependency injection framework
- ❌ **Primitive NLP parser** (2/10 sophistication - early 1980s Zork level)
- ❌ **No graph-based navigation** - position calculations only
- ❌ **Missing standard IF features** - no undo/redo, disambiguation, crafting

### Development Timeline Estimate
- **Part-time (20h/week):** 12 months to production quality
- **Full-time (40h/week):** 6 months to production quality

---

## Critical Issues Identified

### 1. System Fragmentation

| System | Implementations | Files | Impact |
|--------|----------------|-------|---------|
| **Inventory** | 3 separate systems | `item-system.ts`, `inventory-system.ts`, `nestjs-app/src/inventory/` | Data inconsistency, sync bugs |
| **Rooms** | 2 incompatible interfaces | `room-system.ts`, `nestjs-app/src/entity/room.interface.ts` | Schema conflicts |
| **Player State** | 3 different representations | `player-navigation.ts`, `game-state-manager.ts`, `player-state.service.ts` | State synchronization issues |
| **Doors** | 3 different implementations | Connection-based, Item-based, World-state | No unified control |

### 2. Architecture Anti-Patterns

**Hard-coded Dependencies** (`src/lib/game-systems.ts` lines 23-31):
```typescript
// Current: Tight coupling
constructor() {
  this.roomSystem = new RoomSystem();
  this.itemSystem = new ItemSystem();
  this.navigationSystem = new NavigationSystem(this.roomSystem, this.itemSystem);
  // ... more hard-coded instantiation
}
```

**Should be:**
```typescript
// With dependency injection
constructor(
  @Inject('IRoomSystem') private roomSystem: IRoomSystem,
  @Inject('IItemSystem') private itemSystem: IItemSystem,
  @Inject('INavigationSystem') private navigationSystem: INavigationSystem
) {}
```

### 3. NLP Parser Limitations

**Current Sophistication:** 2/10 (comparable to early 1980s text adventures)

**Missing Critical Features:**
- ❌ No pronoun resolution ("examine it" fails)
- ❌ No disambiguation ("take key" when 2 keys present)
- ❌ No multi-step commands ("take sword and attack dragon")
- ❌ No adjective handling ("red key" vs "blue key")
- ❌ No scope awareness (inventory vs room vs container)
- ❌ No part-of-speech tagging
- ❌ No context tracking between commands

**Files Affected:**
- `src/lib/nlp-processor.ts` - Basic stemming and synonyms only
- `src/lib/command-parser.ts` - Pattern matching only
- `src/lib/command-processor.ts` - Execution handlers

---

## Architecture Improvements

### Phase 1: Unify Core Systems (Weeks 1-4)

#### Task 1.1: Create System Interfaces

**Create:** `src/lib/interfaces/systems.interface.ts`

```typescript
export interface ISystem {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}

export interface IInventorySystem extends ISystem {
  addItem(playerId: string, item: Item): Promise<boolean>;
  removeItem(playerId: string, itemId: string): Promise<boolean>;
  getInventory(playerId: string): Promise<Item[]>;
  canCarry(playerId: string, item: Item): boolean;
  getWeight(playerId: string): number;
  hasItem(playerId: string, itemId: string): boolean;
}

export interface IRoomSystem extends ISystem {
  createRoom(config: RoomConfig): Room;
  getRoom(roomId: string): Room | undefined;
  addConnection(fromId: string, toId: string, direction: Direction): boolean;
  removeRoom(roomId: string): boolean;
}

export interface INavigationSystem extends ISystem {
  createPlayer(id: string, name: string, startRoomId: string): Player;
  movePlayer(playerId: string, direction: Direction): NavigationResult;
  getPlayerLocation(playerId: string): string | undefined;
}
```

**Files to modify:**
- [ ] Create `src/lib/interfaces/systems.interface.ts`
- [ ] Update `src/lib/item-system.ts` to implement `IInventorySystem`
- [ ] Update `src/lib/room-system.ts` to implement `IRoomSystem`
- [ ] Update `src/lib/player-navigation.ts` to implement `INavigationSystem`

#### Task 1.2: Unify Inventory Systems

**Goal:** Merge 3 implementations into single source of truth

**Current implementations:**
1. `src/lib/item-system.ts` - Basic inventory as `Map<string, Inventory>`
2. `src/lib/inventory-system.ts` - Quantity-based slots
3. `nestjs-app/src/inventory/inventory-manager.service.ts` - Full featured with equipment

**Strategy:**
1. Analyze feature set of each implementation
2. Design unified interface combining best features
3. Implement in `src/lib/inventory-system-unified.ts`
4. Migrate existing code to use unified system
5. Delete obsolete implementations
6. Update tests

**New Unified System Features:**
```typescript
interface UnifiedInventory {
  // From item-system.ts
  items: Map<ItemId, InventoryItem>;

  // From inventory-system.ts
  stacking: boolean;
  maxStack: number;

  // From inventory-manager.service.ts
  maxSlots: number;
  maxWeight: number;
  equipmentSlots: Map<EquipmentSlot, ItemId>;

  // New features
  containers: Map<ItemId, ItemId[]>; // Nested containers
}
```

**Files to create/modify:**
- [ ] Create `src/lib/inventory-system-unified.ts`
- [ ] Update `src/lib/game-systems.ts` to use unified system
- [ ] Migrate tests from 3 systems to unified tests
- [ ] Delete `src/lib/inventory-system.ts` (old)
- [ ] Update documentation

#### Task 1.3: Unify Room Systems

**Problem:** `src/lib/room-system.ts` vs `nestjs-app/src/entity/room.interface.ts`

**Solution:** Create canonical Room interface

```typescript
interface UnifiedRoom {
  // Identity
  id: string;
  name: string;

  // Descriptions
  shortDescription: string;
  longDescription: string;
  narrativeDescription?: string;

  // Spatial
  position: { x: number; y: number; z: number };
  size: { width: number; height: number; depth: number };

  // Connections
  connections: Map<Direction, Connection>;

  // Contents
  items: Set<ItemId>;
  npcs: Set<NpcId>;
  players: Set<PlayerId>;

  // State
  environment: {
    lighting: number;      // 0-100
    temperature: number;   // Celsius
    sound: string;
    weather?: string;
  };

  // Metadata
  zone?: string;
  tags: Set<string>;
}
```

**Files to create/modify:**
- [ ] Create `src/lib/interfaces/room.interface.ts`
- [ ] Update `src/lib/room-system.ts`
- [ ] Update `nestjs-app/src/entity/room.interface.ts`
- [ ] Add migration utilities if needed
- [ ] Update all room references

#### Task 1.4: Implement Dependency Injection

**Add packages:**
```bash
npm install inversify reflect-metadata
```

**Create:** `src/lib/di-container.ts`

```typescript
import { Container } from 'inversify';
import 'reflect-metadata';

const container = new Container();

// Bind interfaces to implementations
container.bind<IRoomSystem>('IRoomSystem').to(RoomSystem).inSingletonScope();
container.bind<IInventorySystem>('IInventorySystem').to(UnifiedInventorySystem).inSingletonScope();
container.bind<INavigationSystem>('INavigationSystem').to(NavigationSystem).inSingletonScope();

export { container };
```

**Update GameSystems:**
```typescript
import { inject, injectable } from 'inversify';

@injectable()
export class GameSystems {
  constructor(
    @inject('IRoomSystem') private roomSystem: IRoomSystem,
    @inject('IInventorySystem') private inventorySystem: IInventorySystem,
    @inject('INavigationSystem') private navigationSystem: INavigationSystem
  ) {}
}
```

**Files to create/modify:**
- [ ] Add `inversify` and `reflect-metadata` to `package.json`
- [ ] Create `src/lib/di-container.ts`
- [ ] Update `src/lib/game-systems.ts`
- [ ] Update `tsconfig.json` with `experimentalDecorators: true`
- [ ] Create mock implementations for testing

---

## NLP & Parser Enhancements

### Phase 2: Enhanced Natural Language Processing (Weeks 5-8)

**Current State:** Basic pattern matching with synonym support
**Target State:** Modern parser with disambiguation, pronouns, POS tagging

#### Task 2.1: Add Pronoun Resolution

**Create:** `src/lib/parser-context.ts`

```typescript
export class ParserContext {
  private lastNoun: string | null = null;
  private lastNouns: string[] = [];  // For "them"
  private lastAdjective: string | null = null;
  private entityRegistry: Map<string, Entity> = new Map();
  private conversationState: ConversationState | null = null;

  // Register entity with all possible references
  registerEntity(entity: Entity, aliases: string[]): void {
    for (const alias of aliases) {
      this.entityRegistry.set(alias.toLowerCase(), entity);
    }
    this.lastNoun = entity.id;
  }

  // Resolve pronouns to entities
  resolveReference(word: string): Entity | Entity[] | null {
    const lower = word.toLowerCase();

    // Pronouns
    if (lower === 'it' && this.lastNoun) {
      return this.entityRegistry.get(this.lastNoun) || null;
    }
    if (lower === 'them' && this.lastNouns.length > 0) {
      return this.lastNouns.map(id => this.entityRegistry.get(id)).filter(Boolean);
    }

    // Direct reference
    return this.entityRegistry.get(lower) || null;
  }

  // Update context after command
  updateContext(command: ParsedCommand, result: CommandResult): void {
    if (command.item) {
      this.lastNoun = command.item;
    }
    if (command.target) {
      this.lastNouns.push(command.target);
      if (this.lastNouns.length > 5) this.lastNouns.shift();
    }
  }

  // Clear context (e.g., when changing rooms)
  clear(): void {
    this.lastNoun = null;
    this.lastNouns = [];
    this.entityRegistry.clear();
  }
}
```

**Integration:**

Update `src/lib/command-parser.ts`:
```typescript
export class CommandParser {
  private gameSystems: GameSystems;
  private context: ParserContext;  // ADD THIS

  constructor(gameSystems: GameSystems) {
    this.gameSystems = gameSystems;
    this.context = new ParserContext();  // ADD THIS
  }

  parseCommand(input: string): ParsedCommand | null {
    // Before NLP processing, resolve pronouns
    const resolved = this.context.resolvePronouns(input);

    // Then continue with existing parsing...
    const nlpResult = this.parseWithNLP(resolved);
    // ...
  }
}
```

**Files to create/modify:**
- [ ] Create `src/lib/parser-context.ts`
- [ ] Update `src/lib/command-parser.ts` to use context
- [ ] Update `src/lib/command-processor.ts` to update context after execution
- [ ] Add tests for pronoun resolution
- [ ] Update documentation

#### Task 2.2: Implement Disambiguation

**Create:** `src/lib/disambiguation.ts`

```typescript
interface DisambiguationCandidate {
  entity: Entity;
  score: number;
  reason: string;
}

export class DisambiguationEngine {
  // Score candidates by relevance
  scoreCandidates(
    query: string,
    candidates: Entity[],
    context: ParserContext
  ): DisambiguationCandidate[] {
    return candidates.map(entity => {
      let score = 0;
      const reasons: string[] = [];

      // Prefer items in inventory
      if (this.isInInventory(entity)) {
        score += 10;
        reasons.push('in inventory');
      }

      // Prefer items in current room
      if (this.isInCurrentRoom(entity)) {
        score += 5;
        reasons.push('in current room');
      }

      // Prefer recently mentioned items
      if (context.wasRecentlyMentioned(entity.id)) {
        score += 3;
        reasons.push('recently mentioned');
      }

      // Exact name match
      if (entity.name.toLowerCase() === query.toLowerCase()) {
        score += 20;
        reasons.push('exact match');
      }

      return {
        entity,
        score,
        reason: reasons.join(', ')
      };
    }).sort((a, b) => b.score - a.score);
  }

  // Prompt player to choose
  async promptPlayer(candidates: DisambiguationCandidate[]): Promise<Entity> {
    console.log('\nWhich did you mean?');
    candidates.forEach((c, i) => {
      console.log(`  ${i + 1}. ${c.entity.name} (${c.reason})`);
    });
    console.log('  0. Never mind\n');

    const choice = await this.getPlayerInput();
    const index = parseInt(choice) - 1;

    if (index < 0 || index >= candidates.length) {
      throw new Error('Disambiguation cancelled');
    }

    return candidates[index].entity;
  }

  // Auto-select if confidence is high
  async disambiguate(
    query: string,
    candidates: Entity[],
    context: ParserContext
  ): Promise<Entity> {
    if (candidates.length === 0) {
      throw new Error('No matches found');
    }

    if (candidates.length === 1) {
      return candidates[0];
    }

    const scored = this.scoreCandidates(query, candidates, context);

    // If clear winner (score > 2x second place), auto-select
    if (scored[0].score > scored[1].score * 2) {
      return scored[0].entity;
    }

    // Otherwise ask player
    return await this.promptPlayer(scored);
  }
}
```

**Files to create/modify:**
- [ ] Create `src/lib/disambiguation.ts`
- [ ] Update `src/lib/command-parser.ts` to use disambiguation
- [ ] Add tests for scoring logic
- [ ] Handle "all", "everything", "except" quantifiers
- [ ] Update command processor to handle disambiguation results

#### Task 2.3: Add Part-of-Speech Tagging

**Add package:**
```bash
npm install compromise
```

**Create:** `src/lib/nlp-enhanced.ts`

```typescript
import nlp from 'compromise';

export interface POSResult {
  verbs: string[];
  nouns: Array<{
    noun: string;
    adjectives: string[];
    determiner?: string;
  }>;
  prepositions: Array<{
    preposition: string;
    object: string;
  }>;
  confidence: number;
}

export class EnhancedNLP {
  static parseWithPOS(input: string): POSResult {
    const doc = nlp(input);

    // Extract verbs
    const verbs = doc.verbs().out('array');

    // Extract nouns with adjectives
    const nounPhrases = doc.nouns().out('array');
    const adjectives = doc.adjectives().out('array');

    const nouns = nounPhrases.map(noun => {
      // Find adjectives that modify this noun
      const modifiers = this.findModifiers(noun, adjectives, input);
      return {
        noun,
        adjectives: modifiers,
        determiner: this.findDeterminer(noun, input)
      };
    });

    // Extract prepositional phrases
    const prepositions = doc.prepositions().out('array');
    const preps = prepositions.map(prep => ({
      preposition: prep,
      object: this.findPrepositionObject(prep, input)
    }));

    return {
      verbs,
      nouns,
      prepositions: preps,
      confidence: this.calculateConfidence(doc)
    };
  }

  // Match adjectives to nouns based on position
  private static findModifiers(
    noun: string,
    adjectives: string[],
    input: string
  ): string[] {
    const nounIndex = input.toLowerCase().indexOf(noun.toLowerCase());
    const mods: string[] = [];

    for (const adj of adjectives) {
      const adjIndex = input.toLowerCase().indexOf(adj.toLowerCase());
      // Adjective should come before noun and be adjacent
      if (adjIndex < nounIndex && adjIndex + adj.length + 1 >= nounIndex) {
        mods.push(adj);
      }
    }

    return mods;
  }

  private static calculateConfidence(doc: any): number {
    // Higher confidence if we found verbs and nouns
    let confidence = 0.5;
    if (doc.verbs().length > 0) confidence += 0.2;
    if (doc.nouns().length > 0) confidence += 0.2;
    if (doc.match('#Determiner').length > 0) confidence += 0.1;
    return Math.min(confidence, 1.0);
  }
}
```

**Integration:**

Update `src/lib/command-parser.ts`:
```typescript
private parseWithNLP(input: string): ParsedCommand | null {
  // Use enhanced NLP with POS tagging
  const posResult = EnhancedNLP.parseWithPOS(input);

  // Map to command structure
  const action = this.mapVerbToAction(posResult.verbs[0]);

  // Handle nouns with adjectives
  const primaryObject = posResult.nouns[0];
  const item = primaryObject.adjectives.length > 0
    ? `${primaryObject.adjectives.join(' ')} ${primaryObject.noun}`
    : primaryObject.noun;

  // Handle prepositions
  const prep = posResult.prepositions[0];
  const target = prep ? prep.object : undefined;

  return {
    action,
    item,
    target,
    confidence: posResult.confidence
  };
}
```

**Files to create/modify:**
- [ ] Add `compromise` to `package.json`
- [ ] Create `src/lib/nlp-enhanced.ts`
- [ ] Update `src/lib/command-parser.ts`
- [ ] Add tests comparing old vs new parsing
- [ ] Keep fallback to old parser for backwards compatibility

#### Task 2.4: Add Scope and Reachability

**Create:** `src/lib/scope-resolver.ts`

```typescript
export enum Scope {
  INVENTORY = 'inventory',
  CURRENT_ROOM = 'current_room',
  VISIBLE = 'visible',      // In room and not hidden
  REACHABLE = 'reachable',  // Can touch/manipulate
  KNOWN = 'known'           // Player has seen before
}

export class ScopeResolver {
  constructor(
    private gameSystems: GameSystems,
    private playerId: string
  ) {}

  // Get entities in specific scope
  getEntitiesInScope(scope: Scope): Entity[] {
    switch (scope) {
      case Scope.INVENTORY:
        return this.getInventoryItems();

      case Scope.CURRENT_ROOM:
        return this.getRoomItems();

      case Scope.VISIBLE:
        return this.getVisibleItems();

      case Scope.REACHABLE:
        return this.getReachableItems();

      case Scope.KNOWN:
        return this.getKnownItems();
    }
  }

  // Check if entity is in scope
  isInScope(entity: Entity, scope: Scope): boolean {
    const scopeEntities = this.getEntitiesInScope(scope);
    return scopeEntities.some(e => e.id === entity.id);
  }

  // Find entity by name within scope
  findInScope(name: string, scope: Scope): Entity[] {
    const scopeEntities = this.getEntitiesInScope(scope);
    return scopeEntities.filter(e =>
      e.name.toLowerCase().includes(name.toLowerCase()) ||
      e.aliases?.some(a => a.toLowerCase().includes(name.toLowerCase()))
    );
  }

  // Automatic scope detection
  detectScope(entityName: string): Scope {
    // Try inventory first (fastest)
    if (this.findInScope(entityName, Scope.INVENTORY).length > 0) {
      return Scope.INVENTORY;
    }

    // Then visible items in room
    if (this.findInScope(entityName, Scope.VISIBLE).length > 0) {
      return Scope.VISIBLE;
    }

    // Then known items (mentioned before)
    if (this.findInScope(entityName, Scope.KNOWN).length > 0) {
      return Scope.KNOWN;
    }

    return Scope.CURRENT_ROOM;
  }

  private getVisibleItems(): Entity[] {
    const roomItems = this.getRoomItems();
    const player = this.gameSystems.getNavigationSystem().getPlayer(this.playerId);
    const currentRoom = this.gameSystems.getRoomSystem().getRoom(player.currentRoomId);

    // Filter by lighting
    if (currentRoom.environment.lighting < 30) {
      // Too dark - only luminous items visible
      return roomItems.filter(item => item.properties?.luminous === true);
    }

    // Filter by container (only items not in closed containers)
    return roomItems.filter(item => {
      const container = this.getContainer(item);
      return !container || container.state.isOpen;
    });
  }
}
```

**Files to create/modify:**
- [ ] Create `src/lib/scope-resolver.ts`
- [ ] Update `src/lib/command-parser.ts` to use scope
- [ ] Update `src/lib/command-processor.ts` to validate scope
- [ ] Add "You can't see that here" messages
- [ ] Add tests for different scope scenarios

---

## State Management Unification

### Phase 3: Centralized State (Weeks 9-12)

#### Task 3.1: Implement Command Pattern for Undo/Redo

**Create:** `src/lib/commands/command-base.ts`

```typescript
export interface ICommand<T = any> {
  execute(): Promise<T>;
  undo(): Promise<void>;
  redo(): Promise<T>;
  canUndo(): boolean;
  getDescription(): string;
}

export abstract class Command<T = any> implements ICommand<T> {
  protected executed: boolean = false;
  protected undone: boolean = false;

  abstract execute(): Promise<T>;
  abstract undo(): Promise<void>;

  async redo(): Promise<T> {
    if (!this.undone) {
      throw new Error('Cannot redo - command was not undone');
    }
    this.undone = false;
    this.executed = true;
    return await this.execute();
  }

  canUndo(): boolean {
    return this.executed && !this.undone;
  }

  abstract getDescription(): string;
}
```

**Create concrete commands:**

`src/lib/commands/move-command.ts`:
```typescript
export class MoveCommand extends Command<NavigationResult> {
  private previousRoom: string;

  constructor(
    private playerId: string,
    private direction: Direction,
    private gameSystems: GameSystems
  ) {
    super();
  }

  async execute(): Promise<NavigationResult> {
    const nav = this.gameSystems.getNavigationSystem();
    const player = nav.getPlayer(this.playerId);
    this.previousRoom = player.currentRoomId;

    const result = await nav.movePlayer(this.playerId, this.direction);
    this.executed = true;
    return result;
  }

  async undo(): Promise<void> {
    if (!this.canUndo()) {
      throw new Error('Cannot undo move');
    }

    const nav = this.gameSystems.getNavigationSystem();
    const player = nav.getPlayer(this.playerId);

    // Move back to previous room
    await nav.teleportPlayer(this.playerId, this.previousRoom);
    this.undone = true;
  }

  getDescription(): string {
    return `Move ${this.direction}`;
  }
}
```

`src/lib/commands/take-item-command.ts`:
```typescript
export class TakeItemCommand extends Command<boolean> {
  private itemWasInRoom: boolean = false;

  constructor(
    private playerId: string,
    private itemId: string,
    private gameSystems: GameSystems
  ) {
    super();
  }

  async execute(): Promise<boolean> {
    const inventory = this.gameSystems.getInventorySystem();
    const roomSystem = this.gameSystems.getRoomSystem();
    const nav = this.gameSystems.getNavigationSystem();

    const player = nav.getPlayer(this.playerId);
    const room = roomSystem.getRoom(player.currentRoomId);

    // Check if item is in room
    this.itemWasInRoom = room.items.has(this.itemId);

    // Remove from room, add to inventory
    if (this.itemWasInRoom) {
      room.items.delete(this.itemId);
    }

    const result = await inventory.addItem(this.playerId, this.itemId);
    this.executed = true;
    return result;
  }

  async undo(): Promise<void> {
    if (!this.canUndo()) {
      throw new Error('Cannot undo take item');
    }

    const inventory = this.gameSystems.getInventorySystem();
    const roomSystem = this.gameSystems.getRoomSystem();
    const nav = this.gameSystems.getNavigationSystem();

    // Remove from inventory
    await inventory.removeItem(this.playerId, this.itemId);

    // Add back to room
    if (this.itemWasInRoom) {
      const player = nav.getPlayer(this.playerId);
      const room = roomSystem.getRoom(player.currentRoomId);
      room.items.add(this.itemId);
    }

    this.undone = true;
  }

  getDescription(): string {
    return `Take ${this.itemId}`;
  }
}
```

**Create command history manager:**

`src/lib/command-history.ts`:
```typescript
export class CommandHistory {
  private undoStack: ICommand[] = [];
  private redoStack: ICommand[] = [];
  private maxHistory: number = 100;

  // Execute and track command
  async execute<T>(command: ICommand<T>): Promise<T> {
    const result = await command.execute();

    // Add to undo stack
    this.undoStack.push(command);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }

    // Clear redo stack (can't redo after new action)
    this.redoStack = [];

    return result;
  }

  // Undo last command
  async undo(): Promise<void> {
    if (this.undoStack.length === 0) {
      throw new Error('Nothing to undo');
    }

    const command = this.undoStack.pop()!;
    await command.undo();
    this.redoStack.push(command);
  }

  // Redo last undone command
  async redo(): Promise<any> {
    if (this.redoStack.length === 0) {
      throw new Error('Nothing to redo');
    }

    const command = this.redoStack.pop()!;
    const result = await command.redo();
    this.undoStack.push(command);
    return result;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  // Get command history
  getHistory(): string[] {
    return this.undoStack.map(cmd => cmd.getDescription());
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
```

**Files to create/modify:**
- [ ] Create `src/lib/commands/command-base.ts`
- [ ] Create `src/lib/commands/move-command.ts`
- [ ] Create `src/lib/commands/take-item-command.ts`
- [ ] Create `src/lib/commands/drop-item-command.ts`
- [ ] Create `src/lib/commands/use-item-command.ts`
- [ ] Create `src/lib/command-history.ts`
- [ ] Update `src/lib/command-processor.ts` to use commands
- [ ] Add "undo" and "redo" command handlers
- [ ] Add tests for all commands

---

## Navigation & Room System

### Phase 4: Graph-Based Navigation (Months 3-4)

#### Task 4.1: Implement Graph Structure

**Create:** `src/lib/navigation-graph.ts`

```typescript
interface GraphNode {
  roomId: string;
  neighbors: Map<Direction, GraphEdge>;
}

interface GraphEdge {
  targetRoomId: string;
  weight: number;        // Travel cost/time
  bidirectional: boolean;
  blocked: boolean;      // Door locked, etc.
  requirements?: {
    keys?: string[];
    skills?: Map<string, number>;
  };
}

export class NavigationGraph {
  private nodes: Map<string, GraphNode> = new Map();

  // Add room to graph
  addRoom(roomId: string): void {
    if (!this.nodes.has(roomId)) {
      this.nodes.set(roomId, {
        roomId,
        neighbors: new Map()
      });
    }
  }

  // Add connection (edge) between rooms
  addConnection(
    fromId: string,
    toId: string,
    direction: Direction,
    weight: number = 1,
    bidirectional: boolean = true
  ): void {
    this.addRoom(fromId);
    this.addRoom(toId);

    const fromNode = this.nodes.get(fromId)!;
    fromNode.neighbors.set(direction, {
      targetRoomId: toId,
      weight,
      bidirectional,
      blocked: false
    });

    if (bidirectional) {
      const toNode = this.nodes.get(toId)!;
      const reverseDir = this.getReverseDirection(direction);
      toNode.neighbors.set(reverseDir, {
        targetRoomId: fromId,
        weight,
        bidirectional: true,
        blocked: false
      });
    }
  }

  // A* pathfinding
  findPath(startId: string, goalId: string): Direction[] {
    const openSet = new PriorityQueue<string>();
    const cameFrom = new Map<string, { roomId: string, direction: Direction }>();
    const gScore = new Map<string, number>();
    const fScore = new Map<string, number>();

    gScore.set(startId, 0);
    fScore.set(startId, this.heuristic(startId, goalId));
    openSet.enqueue(startId, fScore.get(startId)!);

    while (!openSet.isEmpty()) {
      const current = openSet.dequeue();

      if (current === goalId) {
        return this.reconstructPath(cameFrom, current);
      }

      const currentNode = this.nodes.get(current)!;
      for (const [direction, edge] of currentNode.neighbors) {
        if (edge.blocked) continue;

        const neighbor = edge.targetRoomId;
        const tentativeGScore = gScore.get(current)! + edge.weight;

        if (tentativeGScore < (gScore.get(neighbor) || Infinity)) {
          cameFrom.set(neighbor, { roomId: current, direction });
          gScore.set(neighbor, tentativeGScore);
          fScore.set(neighbor, tentativeGScore + this.heuristic(neighbor, goalId));

          if (!openSet.contains(neighbor)) {
            openSet.enqueue(neighbor, fScore.get(neighbor)!);
          }
        }
      }
    }

    return []; // No path found
  }

  // Euclidean distance heuristic
  private heuristic(roomId1: string, roomId2: string): number {
    const room1 = this.getRoomPosition(roomId1);
    const room2 = this.getRoomPosition(roomId2);

    return Math.sqrt(
      Math.pow(room1.x - room2.x, 2) +
      Math.pow(room1.y - room2.y, 2) +
      Math.pow(room1.z - room2.z, 2)
    );
  }

  private reconstructPath(
    cameFrom: Map<string, { roomId: string, direction: Direction }>,
    current: string
  ): Direction[] {
    const path: Direction[] = [];

    while (cameFrom.has(current)) {
      const { roomId, direction } = cameFrom.get(current)!;
      path.unshift(direction);
      current = roomId;
    }

    return path;
  }

  // BFS for finding nearest item/NPC
  findNearest(startId: string, predicate: (roomId: string) => boolean): string | null {
    const visited = new Set<string>();
    const queue: string[] = [startId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;

      visited.add(current);

      if (predicate(current)) {
        return current;
      }

      const node = this.nodes.get(current)!;
      for (const edge of node.neighbors.values()) {
        if (!edge.blocked && !visited.has(edge.targetRoomId)) {
          queue.push(edge.targetRoomId);
        }
      }
    }

    return null;
  }
}
```

**Files to create/modify:**
- [ ] Create `src/lib/navigation-graph.ts`
- [ ] Create `src/lib/priority-queue.ts` (for A*)
- [ ] Update `src/lib/room-system.ts` to build graph
- [ ] Add graph visualization method for debugging
- [ ] Add pathfinding tests

#### Task 4.2: Unify Door System

**Create:** `src/lib/door-system.ts`

```typescript
interface Door {
  id: string;
  fromRoomId: string;
  toRoomId: string;
  direction: Direction;

  state: {
    isOpen: boolean;
    isLocked: boolean;
    isBroken: boolean;
  };

  requirements?: {
    keyId?: string;
    skillCheck?: { skill: string, difficulty: number };
  };

  properties: {
    canCrawlThrough: boolean;
    canSeeTrough: boolean;
    soundproof: boolean;
    oneWay: boolean;
  };

  onOpen?: () => void;
  onClose?: () => void;
  onUnlock?: () => void;
  onBreak?: () => void;
}

export class DoorSystem {
  private doors: Map<string, Door> = new Map();

  createDoor(config: Partial<Door> & { fromRoomId: string, toRoomId: string }): Door {
    const door: Door = {
      id: `door_${config.fromRoomId}_${config.toRoomId}`,
      fromRoomId: config.fromRoomId,
      toRoomId: config.toRoomId,
      direction: config.direction || 'north',
      state: {
        isOpen: false,
        isLocked: false,
        isBroken: false,
        ...config.state
      },
      properties: {
        canCrawlThrough: false,
        canSeeTrough: false,
        soundproof: false,
        oneWay: false,
        ...config.properties
      },
      requirements: config.requirements,
      onOpen: config.onOpen,
      onClose: config.onClose,
      onUnlock: config.onUnlock,
      onBreak: config.onBreak
    };

    this.doors.set(door.id, door);
    return door;
  }

  canPass(doorId: string, playerId: string): boolean {
    const door = this.doors.get(doorId);
    if (!door) return false;

    // Broken doors always passable
    if (door.state.isBroken) return true;

    // Open doors passable
    if (door.state.isOpen) return true;

    // Can crawl through some closed doors
    if (door.properties.canCrawlThrough) return true;

    return false;
  }

  async open(doorId: string, playerId: string): Promise<boolean> {
    const door = this.doors.get(doorId);
    if (!door) return false;

    if (door.state.isBroken) return false;
    if (door.state.isLocked) return false; // Must unlock first
    if (door.state.isOpen) return false; // Already open

    door.state.isOpen = true;
    door.onOpen?.();

    // Update navigation graph
    this.updateGraph(doorId, true);

    return true;
  }

  async unlock(doorId: string, playerId: string, keyId: string): Promise<boolean> {
    const door = this.doors.get(doorId);
    if (!door) return false;

    if (!door.state.isLocked) return false;
    if (door.requirements?.keyId && door.requirements.keyId !== keyId) {
      return false; // Wrong key
    }

    door.state.isLocked = false;
    door.onUnlock?.();

    return true;
  }

  private updateGraph(doorId: string, passable: boolean): void {
    const door = this.doors.get(doorId);
    if (!door) return;

    // Update navigation graph edge
    const graph = this.getNavigationGraph();
    graph.setEdgeBlocked(door.fromRoomId, door.toRoomId, door.direction, !passable);
  }
}
```

**Files to create/modify:**
- [ ] Create `src/lib/door-system.ts`
- [ ] Remove door logic from `room-system.ts`
- [ ] Remove door items from `item-system.ts`
- [ ] Update world state to use DoorSystem
- [ ] Migrate existing doors to new system
- [ ] Add door tests

---

## Missing Standard IF Features

### Phase 5: Essential Gameplay (Months 5-6)

#### Task 5.1: Implement Crafting System

**Create:** `src/lib/crafting-system.ts`

```typescript
interface Recipe {
  id: string;
  name: string;
  description: string;

  ingredients: Array<{
    itemId: string;
    quantity: number;
    consumed: boolean; // If false, tool not consumed
  }>;

  result: {
    itemId: string;
    quantity: number;
  };

  requirements?: {
    location?: string;  // "forge", "alchemy-table"
    tools?: string[];   // Tools needed but not consumed
    skills?: Map<string, number>;
  };

  craftTime?: number;
  difficulty?: number; // 0-1 chance of success
  onFailure?: {
    consumeIngredients: boolean;
    createByproduct?: string;
  };
}

export class CraftingSystem {
  private recipes: Map<string, Recipe> = new Map();

  registerRecipe(recipe: Recipe): void {
    this.recipes.set(recipe.id, recipe);
  }

  // Find recipes that can be made with available items
  getAvailableRecipes(playerId: string): Recipe[] {
    const inventory = this.gameSystems.getInventorySystem();

    return Array.from(this.recipes.values()).filter(recipe =>
      this.canCraft(playerId, recipe.id)
    );
  }

  canCraft(playerId: string, recipeId: string): boolean {
    const recipe = this.recipes.get(recipeId);
    if (!recipe) return false;

    const inventory = this.gameSystems.getInventorySystem();
    const player = this.gameSystems.getNavigationSystem().getPlayer(playerId);

    // Check ingredients
    for (const ing of recipe.ingredients) {
      const count = inventory.getItemCount(playerId, ing.itemId);
      if (count < ing.quantity) return false;
    }

    // Check tools
    if (recipe.requirements?.tools) {
      for (const tool of recipe.requirements.tools) {
        if (!inventory.hasItem(playerId, tool)) return false;
      }
    }

    // Check location
    if (recipe.requirements?.location) {
      const room = this.gameSystems.getRoomSystem().getRoom(player.currentRoomId);
      if (!room.tags.has(recipe.requirements.location)) return false;
    }

    // Check skills
    if (recipe.requirements?.skills) {
      for (const [skill, level] of recipe.requirements.skills) {
        if ((player.skills.get(skill) || 0) < level) return false;
      }
    }

    return true;
  }

  async craft(playerId: string, recipeId: string): Promise<CraftResult> {
    const recipe = this.recipes.get(recipeId);
    if (!recipe) throw new Error('Recipe not found');

    if (!this.canCraft(playerId, recipeId)) {
      throw new Error('Cannot craft - missing requirements');
    }

    // Roll for success
    const success = recipe.difficulty
      ? Math.random() < recipe.difficulty
      : true;

    if (!success) {
      if (recipe.onFailure?.consumeIngredients) {
        await this.consumeIngredients(playerId, recipe);
      }
      return {
        success: false,
        message: `Crafting failed!`,
        byproduct: recipe.onFailure?.createByproduct
      };
    }

    // Consume ingredients
    await this.consumeIngredients(playerId, recipe);

    // Create result items
    const inventory = this.gameSystems.getInventorySystem();
    const resultItem = this.gameSystems.getItemSystem().getItem(recipe.result.itemId);

    for (let i = 0; i < recipe.result.quantity; i++) {
      await inventory.addItem(playerId, resultItem);
    }

    // Emit event
    this.gameSystems.getEventEmitter().emit('ITEM_CRAFTED', {
      playerId,
      recipeId,
      resultItemId: recipe.result.itemId,
      quantity: recipe.result.quantity
    });

    return {
      success: true,
      message: `You crafted ${recipe.result.quantity}x ${recipe.name}!`,
      items: [resultItem]
    };
  }

  private async consumeIngredients(playerId: string, recipe: Recipe): Promise<void> {
    const inventory = this.gameSystems.getInventorySystem();

    for (const ing of recipe.ingredients) {
      if (ing.consumed) {
        for (let i = 0; i < ing.quantity; i++) {
          await inventory.removeItem(playerId, ing.itemId);
        }
      }
    }
  }
}
```

**Example recipes:**

```typescript
// Torch crafting
craftingSystem.registerRecipe({
  id: 'craft-torch',
  name: 'Torch',
  description: 'A simple torch for light',
  ingredients: [
    { itemId: 'stick', quantity: 1, consumed: true },
    { itemId: 'cloth', quantity: 1, consumed: true },
    { itemId: 'oil', quantity: 1, consumed: true }
  ],
  result: { itemId: 'torch', quantity: 1 },
  craftTime: 5,
  difficulty: 0.9
});

// Potion brewing (requires alchemy table)
craftingSystem.registerRecipe({
  id: 'brew-health-potion',
  name: 'Health Potion',
  description: 'Restores 50 HP',
  ingredients: [
    { itemId: 'red-herb', quantity: 2, consumed: true },
    { itemId: 'water', quantity: 1, consumed: true }
  ],
  result: { itemId: 'health-potion', quantity: 1 },
  requirements: {
    location: 'alchemy-table',
    tools: ['mortar-pestle'],
    skills: new Map([['alchemy', 3]])
  },
  craftTime: 30,
  difficulty: 0.7,
  onFailure: {
    consumeIngredients: true,
    createByproduct: 'failed-potion'
  }
});
```

**Files to create/modify:**
- [ ] Create `src/lib/crafting-system.ts`
- [ ] Create recipe definitions in `data/recipes/`
- [ ] Add crafting command to command processor
- [ ] Add location tags to rooms
- [ ] Create crafting UI/feedback
- [ ] Add crafting tests

#### Task 5.2: Implement Trading System

**Create:** `src/lib/trading-system.ts`

```typescript
interface MerchantInventory {
  stock: Map<string, number>;  // itemId -> quantity
  prices: Map<string, number>;  // itemId -> price
  buyback: Map<string, number>; // Items merchant will buy (percentage of value)
}

interface TradeOffer {
  offeredItems: Array<{ itemId: string, quantity: number }>;
  requestedItems: Array<{ itemId: string, quantity: number }>;
  currencyOffered: number;
  currencyRequested: number;
}

export class TradingSystem {
  private merchants: Map<string, MerchantInventory> = new Map();

  // Initialize merchant with stock
  createMerchant(npcId: string, config: {
    stock: Map<string, number>,
    priceMultiplier?: number
  }): void {
    const inventory: MerchantInventory = {
      stock: config.stock,
      prices: new Map(),
      buyback: new Map()
    };

    // Set prices based on item values
    for (const [itemId, quantity] of config.stock) {
      const item = this.gameSystems.getItemSystem().getItem(itemId);
      const price = item.value! * (config.priceMultiplier || 1.5);
      inventory.prices.set(itemId, price);
    }

    this.merchants.set(npcId, inventory);
  }

  // Player buys from merchant
  async buyItem(
    playerId: string,
    merchantId: string,
    itemId: string,
    quantity: number = 1
  ): Promise<TradeResult> {
    const merchant = this.merchants.get(merchantId);
    if (!merchant) throw new Error('Merchant not found');

    const stock = merchant.stock.get(itemId) || 0;
    if (stock < quantity) {
      return { success: false, message: 'Not enough stock' };
    }

    const price = merchant.prices.get(itemId)! * quantity;
    const playerCurrency = this.getPlayerCurrency(playerId);

    if (playerCurrency < price) {
      return { success: false, message: 'Not enough gold' };
    }

    // Execute trade
    await this.deductCurrency(playerId, price);
    merchant.stock.set(itemId, stock - quantity);

    const inventory = this.gameSystems.getInventorySystem();
    for (let i = 0; i < quantity; i++) {
      await inventory.addItem(playerId, itemId);
    }

    return {
      success: true,
      message: `Purchased ${quantity}x ${itemId} for ${price} gold`,
      cost: price
    };
  }

  // Player sells to merchant
  async sellItem(
    playerId: string,
    merchantId: string,
    itemId: string,
    quantity: number = 1
  ): Promise<TradeResult> {
    const merchant = this.merchants.get(merchantId);
    if (!merchant) throw new Error('Merchant not found');

    const buybackPercent = merchant.buyback.get(itemId) || 0.5;
    if (buybackPercent === 0) {
      return { success: false, message: 'Merchant does not buy this item' };
    }

    const inventory = this.gameSystems.getInventorySystem();
    const playerStock = inventory.getItemCount(playerId, itemId);

    if (playerStock < quantity) {
      return { success: false, message: 'You don\'t have that many' };
    }

    const item = this.gameSystems.getItemSystem().getItem(itemId);
    const sellPrice = Math.floor(item.value! * buybackPercent * quantity);

    // Execute trade
    for (let i = 0; i < quantity; i++) {
      await inventory.removeItem(playerId, itemId);
    }

    await this.addCurrency(playerId, sellPrice);

    const currentStock = merchant.stock.get(itemId) || 0;
    merchant.stock.set(itemId, currentStock + quantity);

    return {
      success: true,
      message: `Sold ${quantity}x ${itemId} for ${sellPrice} gold`,
      profit: sellPrice
    };
  }

  // Barter (trade items for items)
  async barter(
    playerId: string,
    merchantId: string,
    offer: TradeOffer
  ): Promise<TradeResult> {
    // Validate offer
    const offerValue = this.calculateOfferValue(offer.offeredItems, offer.currencyOffered);
    const requestValue = this.calculateOfferValue(offer.requestedItems, offer.currencyRequested);

    // Merchant accepts if offer >= 90% of request value
    if (offerValue < requestValue * 0.9) {
      return { success: false, message: 'Merchant rejects your offer' };
    }

    // Execute barter
    // ... transfer items both ways

    return { success: true, message: 'Trade successful!' };
  }
}
```

**Files to create/modify:**
- [ ] Create `src/lib/trading-system.ts`
- [ ] Create currency/gold item type
- [ ] Add merchant stock to NPC definitions
- [ ] Add "buy", "sell", "trade" commands
- [ ] Create trading UI
- [ ] Add trading tests

---

## Implementation Roadmap

### Month 1: Foundation
- **Week 1-2:** Unify inventory systems, create interfaces
- **Week 3-4:** Implement dependency injection, add pronoun resolution

### Month 2: Parser Enhancement
- **Week 5-6:** Add disambiguation, POS tagging
- **Week 7-8:** Implement scope resolution, multi-step commands

### Month 3: State & Navigation
- **Week 9-10:** Command pattern with undo/redo
- **Week 11-12:** Graph-based navigation, unified doors

### Month 4: Gameplay Systems
- **Week 13-14:** Crafting system
- **Week 15-16:** Trading/economy system

### Month 5: Advanced Features
- **Week 17-18:** Dynamic descriptions, lighting mechanics
- **Week 19-20:** Quest-dialogue integration

### Month 6: Polish & Testing
- **Week 21-22:** ECS migration planning
- **Week 23-24:** Performance optimization, comprehensive testing

---

## Progress Tracking

### Phase 1: Foundation (Weeks 1-4)
- [ ] Task 1.1: Create system interfaces
- [ ] Task 1.2: Unify inventory systems
- [ ] Task 1.3: Unify room systems
- [ ] Task 1.4: Implement dependency injection

### Phase 2: Parser (Weeks 5-8)
- [ ] Task 2.1: Add pronoun resolution
- [ ] Task 2.2: Implement disambiguation
- [ ] Task 2.3: Add POS tagging (compromise.js)
- [ ] Task 2.4: Add scope and reachability

### Phase 3: State (Weeks 9-12)
- [ ] Task 3.1: Implement command pattern for undo/redo
- [ ] Task 3.2: Create command history manager
- [ ] Task 3.3: Convert all actions to commands
- [ ] Task 3.4: Add state snapshots

### Phase 4: Navigation (Months 3-4)
- [ ] Task 4.1: Implement graph structure
- [ ] Task 4.2: Add A* pathfinding
- [ ] Task 4.3: Unify door system
- [ ] Task 4.4: Add dynamic descriptions

### Phase 5: Gameplay (Months 5-6)
- [ ] Task 5.1: Implement crafting system
- [ ] Task 5.2: Implement trading system
- [ ] Task 5.3: Add lighting mechanics
- [ ] Task 5.4: Quest-dialogue integration

---

## Files Modified Summary

### Created
- `src/lib/interfaces/systems.interface.ts`
- `src/lib/interfaces/room.interface.ts`
- `src/lib/inventory-system-unified.ts`
- `src/lib/parser-context.ts`
- `src/lib/disambiguation.ts`
- `src/lib/nlp-enhanced.ts`
- `src/lib/scope-resolver.ts`
- `src/lib/commands/command-base.ts`
- `src/lib/commands/move-command.ts`
- `src/lib/commands/take-item-command.ts`
- `src/lib/command-history.ts`
- `src/lib/navigation-graph.ts`
- `src/lib/door-system.ts`
- `src/lib/crafting-system.ts`
- `src/lib/trading-system.ts`
- `src/lib/di-container.ts`

### Modified
- `src/lib/game-systems.ts` - Use DI
- `src/lib/item-system.ts` - Implement interface
- `src/lib/room-system.ts` - Implement interface, add graph
- `src/lib/command-parser.ts` - Use enhanced NLP
- `src/lib/command-processor.ts` - Use commands
- `src/lib/nlp-processor.ts` - Keep as fallback
- `package.json` - Add inversify, compromise

### Deprecated (to be removed)
- `src/lib/inventory-system.ts` - Replaced by unified
- Door logic in `room-system.ts` - Moved to DoorSystem
- Door items in `item-system.ts` - Moved to DoorSystem

---

## Notes for Future Sessions

### Key Principles
1. **Backwards Compatibility**: Keep old parsers as fallbacks during migration
2. **Test Coverage**: Write tests before refactoring
3. **Incremental**: Don't break existing functionality
4. **Documentation**: Update docs as you go

### Testing Strategy
- Unit tests for each new system
- Integration tests for system interactions
- Regression tests to ensure nothing breaks
- Performance tests for graph algorithms

### Common Pitfalls to Avoid
- Don't delete old code until new code is proven
- Don't break save file compatibility
- Don't introduce new coupling while fixing old coupling
- Don't optimize prematurely - make it work first

### When Resuming Work
1. Read this document fully
2. Run tests to ensure current state: `npm test`
3. Check current branch and recent commits
4. Pick highest priority uncompleted task
5. Create feature branch: `git checkout -b feature/task-name`
6. Implement, test, commit, push
7. Update this document with progress

---

**Last Updated:** January 2025
**Next Review:** When Phase 1 is 50% complete
