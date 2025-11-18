# Quest Weaver Architecture Guide

## Table of Contents

1. [Project Structure Overview](#project-structure-overview)
2. [Attribute-Driven Design Philosophy](#attribute-driven-design-philosophy)
3. [Core Concepts](#core-concepts)
4. [Naming Conventions](#naming-conventions)
5. [Command Handler Architecture](#command-handler-architecture)
6. [File Organization](#file-organization)
7. [Thread Safety and Concurrency](#thread-safety-and-concurrency)
8. [Entity System](#entity-system)

---

## Project Structure Overview

Quest Weaver has a dual-directory structure that reflects its evolution from prototype to production:

```
the-quest-weavers-essential-guide/
├── nestjs-app/          # Production NestJS backend (USE THIS!)
│   ├── src/             # All production code
│   └── games/           # Game data files
└── src/lib/             # Legacy test code and prototypes
```

### Why Both Exist?

**`nestjs-app/`** - The Production Backend
- This is the **main codebase** you should work with
- Built with NestJS for proper dependency injection, testing, and scalability
- Contains all production-ready services, controllers, and game logic
- Structured with best practices for maintainability

**`src/lib/`** - Legacy Prototypes
- Early experimental code and stress tests
- Kept for historical reference and some edge-case test scenarios
- Contains creative test files like `haunted-house-narrative.ts` and `wacky-adventure-scenarios.test.ts`
- **Do not use for new features** - this is archived prototype code

Think of `src/lib/` as a museum of ideas that helped shape the final architecture in `nestjs-app/`. It's kept around because those tests occasionally surface interesting edge cases, but all new development happens in `nestjs-app/`.

---

## Attribute-Driven Design Philosophy

### The Core Principle: Flexibility Over Fixed Types

Quest Weaver follows a revolutionary approach: **game objects are defined by their attributes, not by hard-coded types**. This means game creators have complete freedom to create any object they can imagine.

### Why This Matters

Instead of saying "furniture can't be portable" or "quest items must behave this way," we say: **"The attributes define what an object can do."**

This leads to delightfully creative possibilities:

#### Example 1: The Motivational Poster

```json
{
  "id": "motivational-poster",
  "name": "Motivational Poster",
  "object_type": "furniture",
  "is_portable": true,     // Furniture, but you can take it!
  "weight": 0.2,
  "material": "paper"
}
```

**Traditional rigid system**: "Furniture can't be picked up. Error!"
**Quest Weaver**: "Sure! It's light furniture made of paper. Why not?"

#### Example 2: The Quantum Mop

```json
{
  "id": "quantum-mop",
  "name": "The Quantum Mop",
  "object_type": "quest-item",
  "is_portable": true,     // Quest items can be portable
  "weight": 2,
  "properties": {
    "artifact_level": "legendary",
    "cleaning_power": "quantum"
  }
}
```

**Traditional rigid system**: "Quest items are special and can't be moved!"
**Quest Weaver**: "This legendary mop? Totally portable. Take it across dimensions!"

#### Example 3: Space Quest's Magical Ladders

Remember Space Quest, where you could carry a full-size ladder in your pocket? That's the spirit of Quest Weaver!

```json
{
  "id": "maintenance-ladder",
  "name": "Extendable Maintenance Ladder",
  "object_type": "furniture",
  "is_portable": true,     // A ladder that fits in your pocket!
  "weight": 50,
  "properties": {
    "extendable": true,
    "max_length": 20,
    "space_age_technology": "Yes!"
  }
}
```

**The beauty of attribute-driven design**: Want a portable spaceship? Set `is_portable: true`. Want a tiny pebble that's impossibly heavy and can't be moved? Set `is_portable: false` and `weight: 10000`.

### Key Attribute Examples

| Attribute | Purpose | Example Use Cases |
|-----------|---------|-------------------|
| `is_portable` | Can the player pick this up? | Portable furniture, immovable quest items, pocketable ladders |
| `is_container` | Can it hold other objects? | Bags, chests, pockets, dimensional voids |
| `can_contain` | Alternative container flag | Backward compatibility |
| `container_capacity` | How much can it hold? | Tiny pouches vs. massive crates |
| `weight` | How heavy is it? | Affects realism and game balance |
| `material` | What's it made of? | Determines physics interactions (fire burns wood!) |

### The Philosophy in Action

When creating game objects, ask yourself:
- **What should this object DO?** → Set attributes accordingly
- **Not: What TYPE is this object?** → Types are just labels

This gives game creators **complete creative freedom** while maintaining consistent game mechanics.

---

## Core Concepts

### 1. Object Attributes

Attributes control object behavior. Here are the most important ones:

#### Portability Attributes
- **`isPortable`**: Can be picked up and moved (default: `true`)
- **`weight`**: Affects realism and potential carrying capacity checks

#### Container Attributes
- **`isContainer`**: Object can hold other objects
- **`canContain`**: Alternative container flag (backward compatible)
- **`containerCapacity`**: Maximum storage (items or weight-based)
- **`containedObjects`**: Array of object IDs currently inside

#### State Attributes
- **`state.isOpen`**: For containers - is it currently open?
- **`state.isLocked`**: Requires a key to open
- **`state.isActive`**: For interactive objects
- **`state.isOnFire`**: Physics effect - object is burning
- **`state.frozen`**: Physics effect - object is frozen
- **`state.brittle`**: Physics effect - vulnerable to breaking

#### Material Attributes
- **`material`**: Base material type (wood, metal, stone, etc.)
- **`materialProperties`**: Detailed physics properties
  - `density`: How heavy/solid
  - `conductivity`: Electrical conduction
  - `flammability`: Fire resistance (0-10, higher = more flammable)
  - `brittleness`: How easily it breaks
  - `resistances`: Resistance to different effect types

### 2. Spatial Relationships

Objects can be placed in relation to each other:

```typescript
{
  spatialRelationship: {
    relationshipType: 'on_top_of' | 'inside' | 'next_to' | 'underneath' | 'attached_to',
    targetId: 'target-object-id',
    description: 'The sword rests on the ancient pedestal'
  }
}
```

**Example from Cosmic Custodian:**
```json
{
  "id": "eternal-sponge",
  "spatialRelationship": {
    "relationshipType": "inside",
    "targetId": "supply-crate",
    "description": "tucked inside the supply crate"
  }
}
```

This creates rich, descriptive environments automatically!

### 3. Thread-Safe Operations with Mutex Locks

Quest Weaver uses mutex locks to prevent race conditions in concurrent operations:

```typescript
// From player.service.ts
private readonly playerLocks = new Map<string, Mutex>();
private readonly LOCK_TIMEOUT = 5000; // 5 seconds

// Each player gets their own lock
private getPlayerLock(playerId: string): Mutex {
  if (!this.playerLocks.has(playerId)) {
    this.playerLocks.set(playerId, new Mutex());
  }
  return this.playerLocks.get(playerId)!;
}
```

**Why this matters:**
- Prevents inventory duplication bugs
- Prevents lost updates when multiple operations happen simultaneously
- Ensures state consistency during save operations
- 5-second timeout prevents permanent deadlocks

**Where locks are used:**
- Player inventory modifications
- Room object manipulation
- Game state persistence
- Session management

### 4. Entity System

Quest Weaver has four core entity types:

#### Player
```typescript
interface IPlayer extends IEntity {
  health: number;
  maxHealth: number;
  inventory: string[];      // Object IDs
  level: number;
  experience: number;
  currentRoomId: string;
}
```

#### Room
```typescript
interface IRoom extends IEntity {
  description: string;
  longDescription?: string;
  width: number;
  height: number;
  depth: number;
  objectIds: string[];      // Objects in this room
  playerIds: string[];      // Players in this room
  connections: RoomConnection[];  // Exits to other rooms
}
```

#### Object
```typescript
interface IObject extends IEntity {
  description: string;
  objectType: 'item' | 'furniture' | 'weapon' | 'consumable' | 'container';
  material?: string;
  weight?: number;
  isPortable?: boolean;     // The star of the show!
  isContainer?: boolean;
  containerCapacity?: number;
  containedObjects?: string[];
  materialProperties?: IMaterialProperties;
  currentEffects?: IPhysicsEffect[];
}
```

#### NPC
```typescript
interface INPC extends IEntity {
  npcType: string;
  health: number;
  maxHealth: number;
  level: number;
  dialogueTreeData?: any;
  behaviorConfig?: any;
  inventoryData?: any;
}
```

All entities share base properties from `IEntity`:
```typescript
interface IEntity {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  type: 'player' | 'room' | 'object' | 'npc';
}
```

---

## Naming Conventions

### The Great Snake_Case to camelCase Conversion

Quest Weaver supports **both** naming conventions to maintain backward compatibility while following TypeScript best practices:

| Context | Convention | Example |
|---------|-----------|---------|
| **TypeScript Code** | camelCase | `isPortable`, `isContainer`, `objectType` |
| **JSON Game Files** | snake_case | `is_portable`, `is_container`, `object_type` |

### Auto-Conversion Magic

The conversion happens automatically in **`entity-converter.helper.ts`**:

```typescript
// From JSON file (snake_case) → TypeScript (camelCase)
convertToObjectData(rawObject: any, gameId: string): ObjectData {
  return {
    id: rawObject.id,
    name: rawObject.name,
    objectType: rawObject.object_type,      // snake_case → camelCase
    isPortable: rawObject.is_portable,      // snake_case → camelCase
    isContainer: rawObject.is_container,    // snake_case → camelCase
    containerCapacity: rawObject.container_capacity,
    // ... more conversions
  };
}

// From TypeScript (camelCase) → JSON file (snake_case)
convertObjectDataToFile(objectData: ObjectData): any {
  return {
    id: objectData.id,
    name: objectData.name,
    object_type: objectData.objectType,     // camelCase → snake_case
    is_portable: objectData.isPortable,     // camelCase → snake_case
    is_container: objectData.isContainer,   // camelCase → snake_case
    container_capacity: objectData.containerCapacity,
    // ... more conversions
  };
}
```

### Backward Compatibility

The system also supports legacy naming for compatibility:

```typescript
// All of these work!
if (targetObject.canTake === false ||           // Legacy
    targetObject.is_portable === false ||       // JSON format
    targetObject.isPortable === false) {        // TypeScript format
  // Object is not portable
}
```

**Pro tip**: When creating new game files, use `snake_case` in JSON. The converter handles everything else!

---

## Command Handler Architecture

### The Command Pattern

Quest Weaver uses the **Command Pattern** for handling player actions. Each command is a separate handler that implements a common interface:

```typescript
// command-handler.interface.ts
export interface ICommandHandler {
  handle(
    player: any,
    room: any,
    target: string,
    gameId?: string
  ): Promise<CommandResult>;
}
```

### Command Result Structure

All commands return a consistent result format:

```typescript
interface CommandResult {
  success: boolean;
  type?: 'action_success' | 'action_failure' | 'error' | 'room_description';
  message?: string;
  roomDescription?: string;
  items?: any[];
  npcs?: any[];
  exits?: string[];
  playerStatus?: {
    health?: number;
    location?: string;
    level?: number;
  };
  gameState?: any;
  dialogue?: { npcName: string; text: string; choices?: string[] };
  combatResult?: { damage?: number; targetDefeated?: boolean };
}
```

### Individual Command Handlers

Each command has its own dedicated handler in `/nestjs-app/src/game/commands/`:

#### Example: Take Command Handler

```typescript
// take-command.handler.ts
@Injectable()
export class TakeCommandHandler implements ICommandHandler {
  constructor(
    private playerService: PlayerService,
    private roomService: RoomService,
    private validator: CommandValidatorService,
  ) {}

  async handle(player: any, room: any, target: string): Promise<CommandResult> {
    // 1. Validate input
    if (!target) {
      return { success: false, type: 'error', message: 'Take what?' };
    }

    // 2. Find the object
    const objects = this.roomService.getObjectsInRoom(room.id);
    const targetObject = objects.find(obj =>
      this.matchesName(obj.name, target)
    );

    if (!targetObject) {
      return {
        success: false,
        type: 'action_failure',
        message: `You don't see a ${target} here.`
      };
    }

    // 3. Check if portable (THE KEY CHECK!)
    if (targetObject.isPortable === false) {
      return {
        success: false,
        type: 'action_failure',
        message: `You cannot take the ${targetObject.name}.`
      };
    }

    // 4. Transaction: Add to inventory and remove from room
    const inventoryAdded = this.playerService.addToInventory(
      player.id,
      targetObject.id
    );

    if (!inventoryAdded) {
      return { success: false, type: 'error', message: 'Inventory full!' };
    }

    const removedFromRoom = this.roomService.removeObjectFromRoom(
      room.id,
      targetObject.id
    );

    if (!removedFromRoom) {
      // ROLLBACK: Remove from inventory if room removal failed
      this.playerService.removeFromInventory(player.id, targetObject.id);
      return { success: false, type: 'error', message: 'Failed to take.' };
    }

    // 5. Success!
    return {
      success: true,
      type: 'action_success',
      message: `You take the ${targetObject.name}.`
    };
  }
}
```

### Available Command Handlers

Located in `/nestjs-app/src/game/commands/`:

| Handler | Purpose |
|---------|---------|
| `take-command.handler.ts` | Pick up objects (checks `isPortable`!) |
| `drop-command.handler.ts` | Drop objects from inventory |
| `examine-command.handler.ts` | Inspect objects, rooms, NPCs |
| `look-command.handler.ts` | Get room description |
| `inventory-command.handler.ts` | Show player inventory |
| `movement-command.handler.ts` | Navigate between rooms |
| `container-command.handler.ts` | Open/close containers |
| `use-command.handler.ts` | Use items and objects |
| `attack-command.handler.ts` | Combat actions |
| `cast-command.handler.ts` | Cast magic spells |
| `dialogue-command.handler.ts` | Talk to NPCs |
| `dialogue-choice-command.handler.ts` | Choose dialogue options |
| `save-command.handler.ts` | Save game state |
| `load-command.handler.ts` | Load game state |
| `help-command.handler.ts` | Show available commands |

### Shared Utilities

Common functionality is shared through services:

- **`CommandValidatorService`**: Input validation and sanitization
- **`PlayerService`**: Player state management with mutex locks
- **`RoomService`**: Room and object management with mutex locks
- **`ObjectService`**: Object property and state handling
- **`PhysicsService`**: Material interactions and effects

### Adding New Commands

To add a new command:

1. Create a new handler file: `my-command.handler.ts`
2. Implement the `ICommandHandler` interface
3. Inject required services in the constructor
4. Implement the `handle()` method
5. Register the handler in `CommandProcessorService`

Example template:

```typescript
import { Injectable } from '@nestjs/common';
import { ICommandHandler } from './command-handler.interface';
import { CommandResult } from '../game.service';

@Injectable()
export class MyCommandHandler implements ICommandHandler {
  constructor(
    // Inject needed services
  ) {}

  async handle(
    player: any,
    room: any,
    target: string,
    gameId?: string
  ): Promise<CommandResult> {
    // Your command logic here
    return {
      success: true,
      message: 'Command executed!'
    };
  }
}
```

---

## File Organization

### Production Code Structure

All production code lives in `/nestjs-app/src/`:

```
nestjs-app/src/
├── entity/                    # Entity management (Player, Room, Object, NPC)
│   ├── player.service.ts      # Player operations with mutex locks
│   ├── room.service.ts        # Room and spatial management
│   ├── object.service.ts      # Object properties and physics
│   ├── entity.service.ts      # Base entity operations
│   ├── physics.service.ts     # Material interactions
│   ├── *.interface.ts         # TypeScript interfaces
│   └── helpers/               # Helper classes
│       ├── player-inventory.helper.ts
│       ├── player-combat.helper.ts
│       └── room-entity-manager.helper.ts
│
├── game/                      # Game logic and command processing
│   ├── game.service.ts        # Game session management
│   ├── game-state.service.ts  # State management
│   ├── command-processor.service.ts
│   ├── command-validator.service.ts
│   └── commands/              # Individual command handlers
│       ├── take-command.handler.ts
│       ├── drop-command.handler.ts
│       ├── examine-command.handler.ts
│       └── ... (15+ command handlers)
│
├── file-system/               # Game file loading and persistence
│   ├── game-file.service.ts   # Load/save game files
│   └── helpers/
│       ├── entity-converter.helper.ts  # JSON ↔ TypeScript conversion
│       └── database-import.helper.ts
│
├── database/                  # Data persistence
│   ├── database.service.ts    # SQLite operations with mutex locks
│   └── database.interfaces.ts
│
├── validation/                # Game data validation
│   └── game-integrity-validator.service.ts
│
├── llm/                       # AI integration (optional)
│   ├── services/              # LLM service providers
│   ├── providers/             # OpenAI/Anthropic integrations
│   └── templates/             # Prompt templates
│
├── physics/                   # Physics engine
│   └── material-physics.service.ts
│
├── dialogue/                  # NPC dialogue system
│   └── dialogue-manager.service.ts
│
├── inventory/                 # Inventory management
├── persistence/               # Save/load game state
├── quest/                     # Quest system
├── world-state/              # World state tracking
└── cli/                      # CLI interface

```

### Game Data Files

Game data lives in `/nestjs-app/games/[game-name]/`:

```
nestjs-app/games/cosmic-custodian/
├── game-config.json          # Game metadata
├── rooms/                    # Room definitions
│   ├── janitor-closet.json
│   ├── maintenance-bay.json
│   └── airlock.json
├── objects/                  # Object definitions
│   ├── quantum-mop.json
│   ├── motivational-poster.json
│   └── vacuum-shard-1.json
├── npcs/                     # NPC definitions
│   ├── station-ai.json
│   └── cosmic-supervisor.json
└── connections.json          # Room connections (exits)
```

### Game File Format Examples

#### game-config.json
```json
{
  "id": "cosmic-custodian",
  "name": "Cosmic Custodian",
  "description": "A janitor's quest to save the universe",
  "version": 1,
  "metadata": {
    "author": "Quest Weaver",
    "starting_room": "janitor-closet",
    "starting_message": "Welcome to your first day..."
  }
}
```

#### Room File (rooms/janitor-closet.json)
```json
{
  "id": "janitor-closet",
  "name": "Janitor's Closet",
  "description": "A cramped storage closet filled with cleaning supplies",
  "long_description": "Your personal sanctuary...",
  "position": { "x": 0, "y": 0, "z": 0 },
  "size": { "width": 3, "height": 3, "depth": 3 },
  "environment": {
    "lighting": "dim",
    "temperature": "cool"
  }
}
```

#### Object File (objects/quantum-mop.json)
```json
{
  "id": "quantum-mop",
  "name": "The Quantum Mop",
  "description": "A mop that exists in multiple states simultaneously",
  "object_type": "quest-item",
  "position": { "x": 0, "y": -20, "z": 5 },
  "material": "wood",
  "material_properties": {
    "density": 5,
    "flammability": 6,
    "resistances": { "magic": 10 }
  },
  "weight": 2,
  "is_portable": true,
  "is_container": false,
  "properties": {
    "artifact_level": "legendary",
    "cleaning_power": "quantum"
  },
  "interactions": {
    "examine": "The Quantum Mop is a strange sight...",
    "take": "You grasp the Quantum Mop...",
    "use": "You attempt to mop..."
  }
}
```

#### Connections File (connections.json)
```json
[
  {
    "from_room": "janitor-closet",
    "to_room": "maintenance-bay",
    "direction": "north",
    "description": "A doorway leads to the maintenance bay",
    "is_locked": false
  },
  {
    "from_room": "maintenance-bay",
    "to_room": "airlock",
    "direction": "east",
    "description": "An airlock door",
    "is_locked": true,
    "required_key": "blue-keycard"
  }
]
```

### Finding Specific Functionality

| What You're Looking For | Where to Find It |
|------------------------|------------------|
| Player inventory logic | `/nestjs-app/src/entity/helpers/player-inventory.helper.ts` |
| Room spatial relationships | `/nestjs-app/src/entity/helpers/room-entity-manager.helper.ts` |
| Command handling | `/nestjs-app/src/game/commands/*.handler.ts` |
| JSON to TypeScript conversion | `/nestjs-app/src/file-system/helpers/entity-converter.helper.ts` |
| Physics interactions | `/nestjs-app/src/entity/physics.service.ts` |
| Mutex lock implementation | `/nestjs-app/src/entity/player.service.ts` (lines 11, 30-60) |
| Object attribute checking | `/nestjs-app/src/game/commands/take-command.handler.ts` (line 73) |
| Game data validation | `/nestjs-app/src/validation/game-integrity-validator.service.ts` |
| Save/load operations | `/nestjs-app/src/persistence/` |
| NPC dialogue | `/nestjs-app/src/dialogue/dialogue-manager.service.ts` |

---

## Thread Safety and Concurrency

### Why Thread Safety Matters

In a game engine, multiple operations can happen simultaneously:
- Player picks up an item while the game auto-saves
- Two players interact with the same object
- An NPC modifies an object while a player examines it

Without proper protection, these concurrent operations can cause:
- **Inventory duplication** (item added twice)
- **Lost updates** (state changes overwritten)
- **Inconsistent state** (object both in inventory and on ground)

### Mutex Lock Implementation

Quest Weaver uses the `async-mutex` library to prevent race conditions:

```typescript
import { Mutex, withTimeout } from 'async-mutex';

// Per-player locks prevent concurrent modifications
private readonly playerLocks = new Map<string, Mutex>();
private readonly LOCK_TIMEOUT = 5000; // 5 seconds

// Get or create a lock for a specific player
private getPlayerLock(playerId: string): Mutex {
  if (!this.playerLocks.has(playerId)) {
    this.playerLocks.set(playerId, new Mutex());
  }
  return this.playerLocks.get(playerId)!;
}
```

### Lock Usage Pattern

```typescript
async addToInventory(playerId: string, objectId: string): Promise<boolean> {
  const lock = this.getPlayerLock(playerId);

  // Acquire lock before modifying player state
  const release = await lock.acquire();

  try {
    const player = this.getPlayer(playerId);
    if (!player) return false;

    // Critical section - protected by lock
    if (player.inventory.includes(objectId)) {
      return false; // Already have it
    }

    player.inventory.push(objectId);
    return true;

  } finally {
    // Always release lock, even if error occurs
    release();
  }
}
```

### Where Locks Are Used

1. **Player Service** (`player.service.ts`)
   - Inventory modifications
   - Player state updates
   - Combat operations

2. **Game Service** (`game.service.ts`)
   - Session creation/deletion
   - Game state persistence
   - Map-level operations

3. **Database Service** (`database.service.ts`)
   - SQLite write operations
   - Bulk data updates
   - Transaction management

4. **Room Service** (`room.service.ts`)
   - Object placement/removal
   - Player movement
   - Container operations

### Lock Timeout Protection

All locks have a 5-second timeout to prevent permanent deadlocks:

```typescript
private readonly mapLock = withTimeout(new Mutex(), 5000);
```

If a lock can't be acquired within 5 seconds, an error is thrown, preventing the system from hanging indefinitely.

---

## Entity System

### The Entity Hierarchy

All game entities extend from a base `IEntity` interface:

```typescript
interface IEntity {
  id: string;              // Unique identifier
  name: string;            // Display name
  position: {              // 3D position
    x: number;
    y: number;
    z: number;
  };
  type: 'player' | 'room' | 'object' | 'npc';
}
```

### Entity Services

Each entity type has its own service with specialized operations:

#### EntityService (Base)
- Generic entity CRUD operations
- Entity lookup by ID
- Position management
- Used as a foundation for specialized services

#### PlayerService
- **Key Operations:**
  - `createPlayer()` - Create new player with inventory
  - `getPlayer()` - Get player by ID
  - `addToInventory()` - Add item (with mutex lock)
  - `removeFromInventory()` - Remove item (with mutex lock)
  - `takeDamage()` - Combat damage
  - `gainExperience()` - Level progression

- **Thread Safety:** Per-player mutex locks prevent inventory duplication

#### RoomService
- **Key Operations:**
  - `createRoom()` - Create new room with dimensions
  - `getRoom()` - Get room by ID
  - `addObjectToRoom()` - Place object in room
  - `removeObjectFromRoom()` - Remove object from room
  - `addPlayerToRoom()` - Move player to room
  - `getObjectsInRoom()` - Get all objects in a room

- **Features:** Tracks spatial relationships between objects

#### ObjectService
- **Key Operations:**
  - `createObject()` - Create new object with attributes
  - `getObject()` - Get object by ID
  - `updateObjectState()` - Modify object state
  - `applyPhysicsEffect()` - Apply fire, ice, etc.
  - `checkContainerCapacity()` - Validate container storage

- **Attribute Handling:** Manages all object attributes including `isPortable`

#### NPCService
- **Key Operations:**
  - `createNPC()` - Create new NPC
  - `getNPC()` - Get NPC by ID
  - `updateDialogueState()` - Track conversation progress
  - `performBehavior()` - Execute AI behavior

- **Features:** Integrates with dialogue system and AI

### Service Dependencies

```
GameService
├── GameStateService
├── CommandProcessorService
│   └── Individual Command Handlers
│       ├── PlayerService
│       ├── RoomService
│       ├── ObjectService
│       └── CommandValidatorService
├── EntityService (base)
├── RoomService
├── PlayerService
│   ├── ObjectService
│   ├── PhysicsService
│   └── Helper classes
├── ObjectService
│   └── PhysicsService
└── DatabaseService
```

### Entity Creation Flow

When loading a game from JSON files:

1. **`GameFileService`** reads JSON files
2. **`EntityConverterHelper`** converts snake_case to camelCase
3. **`DatabaseImportHelper`** validates and imports to database
4. **Entity Services** create in-memory entities
5. **Game is ready to play!**

When saving a game:

1. **Entity Services** provide current state
2. **`EntityConverterHelper`** converts camelCase to snake_case
3. **`DatabaseService`** persists to SQLite (with mutex locks)
4. **`GameFileService`** optionally exports to JSON files

---

## Contributing

When contributing to Quest Weaver, remember:

1. **Use the Production Code**: Work in `/nestjs-app/src/`, not `/src/lib/`

2. **Follow Attribute-Driven Design**: Don't hard-code object behaviors. Use attributes!

3. **Respect Naming Conventions**:
   - TypeScript: `camelCase`
   - JSON files: `snake_case`
   - Let the converter handle translation

4. **Maintain Thread Safety**: Use mutex locks for state modifications

5. **Write Tests**: Every new feature should have corresponding tests

6. **Document Your Code**: Especially if creating new attributes or entity types

7. **Think Like a Game Creator**: Would this feature give game creators more flexibility?

---

## Examples from Cosmic Custodian

### Portable vs. Non-Portable Objects

**Portable Quest Item** - The Quantum Mop:
```json
{
  "id": "quantum-mop",
  "object_type": "quest-item",
  "is_portable": true,
  "weight": 2
}
```
Game creators decided this legendary artifact should be carriable!

**Non-Portable Furniture** - A Heavy Workbench:
```json
{
  "id": "workbench",
  "object_type": "furniture",
  "is_portable": false,
  "weight": 500
}
```
Too heavy to carry - stays put!

**Portable Furniture** - Motivational Poster:
```json
{
  "id": "motivational-poster",
  "object_type": "furniture",
  "is_portable": true,
  "weight": 0.2
}
```
Light enough to take down and carry!

### Container Examples

**Open Container** - Supply Crate:
```json
{
  "id": "supply-crate",
  "is_container": true,
  "container_capacity": 10,
  "state_data": {
    "is_open": true,
    "is_locked": false
  },
  "contained_objects": ["eternal-sponge", "cosmic-towel"]
}
```

**Locked Container** - Security Locker:
```json
{
  "id": "security-locker",
  "is_container": true,
  "container_capacity": 5,
  "state_data": {
    "is_open": false,
    "is_locked": true,
    "required_key": "blue-keycard"
  }
}
```

---

## Final Thoughts

Quest Weaver is built on the principle that **game creators should have complete creative freedom**. By using an attribute-driven design instead of rigid type systems, we enable the kind of creative, quirky, and fun game objects that made classic adventure games so memorable.

Whether you're creating a space station janitor with a magical quantum mop, a fantasy dungeon with portable furniture, or a mystery game with impossible-to-move clues, Quest Weaver gives you the tools to bring your vision to life.

Remember: **The attributes define what an object can do. You define the attributes. Therefore, you define what's possible.**

Happy Quest Weaving! 🎮✨
