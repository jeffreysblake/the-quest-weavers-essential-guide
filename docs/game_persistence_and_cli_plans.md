# Game Persistence & CLI System Specifications

## Overview
This document outlines the complete specifications for implementing persistent game storage, CLI management interface, and versioning system for Quest Weaver. The system will use TinySQL for database persistence while maintaining the existing in-memory architecture for performance.

## Architecture Principles

### Data Flow
1. **Development**: Create/edit individual scenario files in `games/` directory
2. **Loading**: CLI `game load` command diffs files vs database, creates new versions for changed components  
3. **Runtime**: Game engine loads latest component versions from database on-demand
4. **Versioning**: Each component (room, object, NPC) tracks individual versions with rollback capability
5. **Fallback**: 2-3 version fallback system for loading failures with debug messages

### Persistence Strategy
- **In-Memory First**: Existing services continue working in-memory for performance
- **Database Sync**: Components sync to database with version tracking
- **Lazy Loading**: Load components as needed when entering rooms or accessing objects
- **Cache Management**: Version-aware caching with intelligent invalidation

## Database Schema (TinySQL)

### Core Tables
```sql
-- Games and global configuration
CREATE TABLE games (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    version INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- Rooms with spatial data
CREATE TABLE rooms (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    long_description TEXT,
    position_x REAL DEFAULT 0,
    position_y REAL DEFAULT 0, 
    position_z REAL DEFAULT 0,
    width REAL DEFAULT 10,
    height REAL DEFAULT 10,
    depth REAL DEFAULT 3,
    environment_data TEXT, -- JSON blob for lighting, sound, etc.
    version INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games(id)
);

-- Game objects with material properties
CREATE TABLE objects (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    object_type TEXT NOT NULL, -- weapon, item, container, furniture, etc.
    position_x REAL DEFAULT 0,
    position_y REAL DEFAULT 0,
    position_z REAL DEFAULT 0,
    material TEXT, -- wood, metal, glass, etc.
    material_properties TEXT, -- JSON blob for physics properties
    weight REAL DEFAULT 0,
    health REAL,
    max_health REAL,
    is_portable BOOLEAN DEFAULT true,
    is_container BOOLEAN DEFAULT false,
    can_contain BOOLEAN DEFAULT false,
    container_capacity INTEGER DEFAULT 0,
    state_data TEXT, -- JSON blob for isOpen, isLocked, etc.
    properties TEXT, -- JSON blob for custom properties
    version INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games(id)
);

-- NPCs and players
CREATE TABLE npcs (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    npc_type TEXT DEFAULT 'npc', -- npc, player, monster
    position_x REAL DEFAULT 0,
    position_y REAL DEFAULT 0,
    position_z REAL DEFAULT 0,
    health REAL DEFAULT 100,
    max_health REAL DEFAULT 100,
    level INTEGER DEFAULT 1,
    experience INTEGER DEFAULT 0,
    inventory_data TEXT, -- JSON array of object IDs
    dialogue_tree_data TEXT, -- JSON blob for dialogue system
    behavior_config TEXT, -- JSON blob for AI behaviors
    attributes TEXT, -- JSON blob for stats, abilities, etc.
    version INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games(id)
);

-- Spatial relationships between objects
CREATE TABLE spatial_relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    object_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    relationship_type TEXT NOT NULL, -- on_top_of, inside, next_to, underneath, attached_to
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (object_id) REFERENCES objects(id),
    FOREIGN KEY (target_id) REFERENCES objects(id)
);

-- Room connections and exits
CREATE TABLE room_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    connected_room_id TEXT NOT NULL,
    direction TEXT NOT NULL, -- north, south, east, west, up, down, northeast, etc.
    description TEXT, -- "heavy wooden door", "narrow passage", etc.
    is_locked BOOLEAN DEFAULT false,
    required_key_id TEXT, -- optional key requirement
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id),
    FOREIGN KEY (connected_room_id) REFERENCES rooms(id),
    FOREIGN KEY (required_key_id) REFERENCES objects(id)
);

-- Object placement in rooms
CREATE TABLE room_objects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    object_id TEXT NOT NULL,
    placed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id),
    FOREIGN KEY (object_id) REFERENCES objects(id)
);

-- NPC placement in rooms  
CREATE TABLE room_npcs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    npc_id TEXT NOT NULL,
    placed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id),
    FOREIGN KEY (npc_id) REFERENCES npcs(id)
);

-- Version history for rollback functionality
CREATE TABLE version_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL, -- room, object, npc, game
    entity_id TEXT NOT NULL,
    version_number INTEGER NOT NULL,
    data_snapshot TEXT NOT NULL, -- Full JSON snapshot of entity at this version
    changed_by TEXT, -- CLI user or system
    change_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Indexes for Performance
```sql
CREATE INDEX idx_rooms_game_id ON rooms(game_id);
CREATE INDEX idx_objects_game_id ON objects(game_id);
CREATE INDEX idx_npcs_game_id ON npcs(game_id);
CREATE INDEX idx_room_connections_room_id ON room_connections(room_id);
CREATE INDEX idx_spatial_relationships_object_id ON spatial_relationships(object_id);
CREATE INDEX idx_room_objects_room_id ON room_objects(room_id);
CREATE INDEX idx_room_npcs_room_id ON room_npcs(room_id);
CREATE INDEX idx_version_history_entity ON version_history(entity_type, entity_id);
```

## File Structure Specification

### Directory Layout
```
games/
├── dragon-lair/
│   ├── game-config.json
│   ├── rooms/
│   │   ├── village-square.json
│   │   ├── blacksmith-shop.json
│   │   ├── enchanted-forest.json
│   │   ├── dragon-cave.json
│   │   └── treasure-vault.json
│   ├── objects/
│   │   ├── village-map.json
│   │   ├── iron-sword.json
│   │   ├── dragon-scale-armor.json
│   │   ├── dragon-egg.json
│   │   └── crown-of-power.json
│   ├── npcs/
│   │   ├── village-elder.json
│   │   ├── blacksmith.json
│   │   └── ancient-dragon.json
│   └── connections.json
├── wizard-tower/
│   ├── game-config.json
│   ├── rooms/
│   │   ├── tower-entrance.json
│   │   ├── mystical-library.json
│   │   ├── alchemy-lab.json
│   │   └── tower-summit.json
│   ├── objects/
│   │   ├── entrance-key.json
│   │   ├── ancient-spellbook.json
│   │   ├── levitation-potion.json
│   │   └── master-orb.json
│   ├── npcs/
│   │   └── tower-guardian.json
│   └── connections.json
```

### File Format Specifications

#### game-config.json
```json
{
    "id": "dragon-lair-epic",
    "name": "Dragon's Lair Epic Adventure", 
    "description": "A comprehensive adventure through multiple realms to face an ancient dragon",
    "version": 1,
    "metadata": {
        "difficulty": "hard",
        "estimated_playtime": "2-3 hours",
        "themes": ["adventure", "fantasy", "combat"],
        "starting_room": "village-square",
        "victory_conditions": [
            {
                "type": "obtain_item", 
                "item_id": "crown-of-power",
                "description": "Claim the Crown of Power from the dragon's treasure vault"
            }
        ]
    }
}
```

#### rooms/[room-id].json
```json
{
    "id": "village-square",
    "name": "Village Square",
    "description": "A bustling village center",
    "long_description": "Merchants sell their wares while children play nearby. An old sage sits by the fountain, and you notice a blacksmith's shop to the east.",
    "position": { "x": 0, "y": 0, "z": 0 },
    "size": { "width": 30, "height": 30, "depth": 3 },
    "environment": {
        "lighting": "bright daylight",
        "sound": "bustling marketplace",
        "temperature": "comfortable",
        "weather": "clear skies"
    },
    "properties": {
        "safe_zone": true,
        "allow_combat": false,
        "respawn_point": true
    }
}
```

#### objects/[object-id].json  
```json
{
    "id": "iron-sword",
    "name": "Iron Sword", 
    "description": "A well-crafted iron sword with a leather-wrapped hilt",
    "object_type": "weapon",
    "position": { "x": 0, "y": 0, "z": 0 },
    "material": "metal",
    "material_properties": {
        "material": "metal",
        "density": 8,
        "conductivity": 9, 
        "flammability": 0,
        "brittleness": 3,
        "resistances": { "fire": 8, "ice": 6, "lightning": 2 }
    },
    "weight": 3,
    "health": 100,
    "max_health": 100,
    "is_portable": true,
    "is_container": false,
    "properties": {
        "weapon_damage": 15,
        "durability": 100,
        "enchantment": null,
        "required_skill": "melee_weapons"
    },
    "interactions": {
        "examine": "A sturdy iron blade with minor nicks from use",
        "take": "You pick up the iron sword. It feels well-balanced in your hand.",
        "use": "You swing the sword through the air, testing its weight."
    }
}
```

#### npcs/[npc-id].json
```json
{
    "id": "village-elder",
    "name": "Village Elder",
    "description": "A wise old man with a long white beard",
    "npc_type": "npc",
    "position": { "x": 15, "y": 15, "z": 0 },
    "health": 50,
    "max_health": 50,
    "level": 1,
    "attributes": {
        "wisdom": 18,
        "charisma": 15,
        "strength": 8,
        "agility": 6
    },
    "dialogue_tree": {
        "initial_greeting": {
            "text": "Welcome, traveler! I sense great destiny in you.",
            "choices": [
                {
                    "text": "Tell me about the dragon",
                    "leads_to": "dragon_lore"
                },
                {
                    "text": "What can you teach me?", 
                    "leads_to": "wisdom_sharing"
                },
                {
                    "text": "Farewell",
                    "leads_to": "goodbye"
                }
            ]
        },
        "dragon_lore": {
            "text": "The ancient dragon has slept for centuries in the mountain caves. Its treasure vault contains artifacts of immense power, including the legendary Crown of Power.",
            "choices": [
                {
                    "text": "How do I defeat it?",
                    "leads_to": "dragon_strategy"
                },
                {
                    "text": "Where is the dragon's lair?",
                    "leads_to": "lair_directions"
                }
            ]
        }
    },
    "behaviors": {
        "movement_pattern": "stationary",
        "aggression_level": "peaceful",
        "trade_enabled": false,
        "quest_giver": true
    }
}
```

#### connections.json
```json
{
    "connections": [
        {
            "from_room": "village-square",
            "to_room": "blacksmith-shop", 
            "direction": "east",
            "description": "A well-worn path leads to the blacksmith's workshop",
            "is_locked": false,
            "required_key": null
        },
        {
            "from_room": "village-square",
            "to_room": "enchanted-forest",
            "direction": "north",
            "description": "A forest path disappears into the mysterious woods",
            "is_locked": false,
            "required_key": null
        },
        {
            "from_room": "enchanted-forest",
            "to_room": "dragon-cave",
            "direction": "northeast", 
            "description": "A treacherous mountain path leads to dark caves",
            "is_locked": false,
            "required_key": null
        }
    ]
}
```

## CLI Command Specifications

### High-Level Game Management
```bash
# Create new game from scratch
game create <game-name> [--template=<template-name>]

# Load game configuration from files
game load <game-directory> [--force] [--dry-run]

# List all available games
game list [--verbose] [--active-only]

# Delete game and all associated data
game delete <game-id> [--confirm] [--backup-first]

# Export game to file system
game export <game-id> <output-directory>

# Import game from file system  
game import <directory-path> [--overwrite]

# Start/stop game instances
game start <game-id> [--port=<port>]
game stop <game-id>

# Backup and restore
game backup <game-id> [--include-versions]
game restore <backup-file> [--target-game=<game-id>]
```

### Low-Level CRUD Operations
```bash
# Room management
room create <game-id> <room-id> --name="<name>" --description="<desc>" [--position=<x,y,z>]
room update <game-id> <room-id> [--name="<name>"] [--description="<desc>"] [--position=<x,y,z>]
room delete <game-id> <room-id> [--confirm]
room list <game-id> [--verbose]
room show <game-id> <room-id> [--include-objects] [--include-npcs]

# Object management  
object create <game-id> <object-id> --name="<name>" --type=<type> [--material=<material>] [--portable]
object update <game-id> <object-id> [--name="<name>"] [--description="<desc>"] [--properties=<json>]
object delete <game-id> <object-id> [--confirm]
object place <game-id> <object-id> --in-room=<room-id> [--position=<x,y,z>]
object relate <game-id> <object-id> --to=<target-id> --relationship=<type> [--description="<desc>"]

# NPC management
npc create <game-id> <npc-id> --name="<name>" [--type=<type>] [--level=<level>]
npc update <game-id> <npc-id> [--health=<health>] [--dialogue=<json-file>] [--behaviors=<json>]
npc place <game-id> <npc-id> --in-room=<room-id> [--position=<x,y,z>]

# Room connections
connect <game-id> <from-room> <to-room> --direction=<direction> [--description="<desc>"] [--locked] [--key=<key-id>]
disconnect <game-id> <from-room> <to-room> --direction=<direction>
```

### Version Control Operations
```bash
# Version management
version list <entity-type> <entity-id> [--limit=<n>]
version show <entity-type> <entity-id> <version-number>
version diff <entity-type> <entity-id> <version1> <version2>
version rollback <entity-type> <entity-id> <target-version> [--reason="<reason>"]

# Rollback shortcuts
rollback room <game-id> <room-id> <version> [--reason="<reason>"]
rollback object <game-id> <object-id> <version> [--reason="<reason>"] 
rollback npc <game-id> <npc-id> <version> [--reason="<reason>"]

# Version cleanup
version cleanup <game-id> [--keep-versions=<n>] [--older-than=<days>]
```

### Development and Testing Commands
```bash
# Validation and testing
game validate <game-directory> [--strict] [--fix-errors]
game test <game-id> [--scenario=<scenario-file>] [--verbose]

# Development helpers
game scaffold <game-name> <template-type> [--output-dir=<dir>]
game clone <source-game-id> <new-game-name>
```

## Service Integration Specifications

### Database Service
```typescript
@Injectable()
export class DatabaseService {
    // Connection management
    async connect(): Promise<void>
    async disconnect(): Promise<void>
    async migrate(): Promise<void>
    
    // Transaction support
    async transaction<T>(callback: (db: Database) => Promise<T>): Promise<T>
    
    // Version management
    async saveVersion<T>(entityType: string, entityId: string, data: T, reason?: string): Promise<number>
    async getVersion<T>(entityType: string, entityId: string, version?: number): Promise<T | null>
    async listVersions(entityType: string, entityId: string): Promise<VersionInfo[]>
    async rollbackToVersion(entityType: string, entityId: string, version: number): Promise<boolean>
}
```

### Enhanced Entity Services
```typescript
// Extended RoomService with persistence
@Injectable() 
export class RoomService {
    // Existing in-memory methods remain unchanged
    createRoom(data: CreateRoomDto): IRoom
    getRoom(id: string): IRoom | null
    updateRoom(id: string, updates: Partial<IRoom>): IRoom | null
    
    // New persistence methods
    async saveRoom(room: IRoom): Promise<void>
    async loadRoom(gameId: string, roomId: string, version?: number): Promise<IRoom | null>
    async loadRoomLatest(gameId: string, roomId: string): Promise<IRoom | null>
    async getRoomVersions(gameId: string, roomId: string): Promise<VersionInfo[]>
    async rollbackRoom(gameId: string, roomId: string, version: number): Promise<IRoom | null>
    
    // Dynamic loading for gameplay
    async loadRoomOnDemand(gameId: string, roomId: string): Promise<IRoom>
    async refreshRoom(gameId: string, roomId: string): Promise<IRoom>
}
```

### File System Integration
```typescript
@Injectable()
export class GameFileService {
    // File scanning and change detection
    async scanGameDirectory(path: string): Promise<GameFileInfo>
    async detectChanges(gameId: string, directory: string): Promise<ChangeSet>
    
    // File loading and parsing
    async loadGameConfig(directory: string): Promise<GameConfig>
    async loadRooms(directory: string): Promise<IRoom[]>
    async loadObjects(directory: string): Promise<IObject[]>
    async loadNpcs(directory: string): Promise<INpc[]>
    async loadConnections(directory: string): Promise<RoomConnection[]>
    
    // File writing and export
    async exportGame(gameId: string, outputDirectory: string): Promise<void>
    async writeGameFiles(game: GameData, directory: string): Promise<void>
    
    // Validation
    async validateGameFiles(directory: string): Promise<ValidationResult>
}
```

## Testing Strategy

### CLI Test Framework
The testing approach will use the existing narrative test scenarios as blueprints to validate the entire persistence and CLI system:

1. **Dragon's Lair Epic Test**: Recreate the complete 33-action adventure using only CLI commands
2. **Wizard's Tower Challenge Test**: Build the multi-stage puzzle scenario via CLI
3. **Short Narrative Tests**: Validate quick scenarios like "Mysterious Lamp" and "Talking Tree"

### Test Implementation
```typescript
describe('CLI Game Creation and Playthrough', () => {
    it('should create Dragon Lair Epic via CLI and complete quest', async () => {
        // Phase 1: Create game structure via CLI
        await cli.execute('game create dragon-lair-epic');
        await cli.execute('room create dragon-lair-epic village-square --name="Village Square" --description="A bustling village center"');
        // ... create all rooms, objects, NPCs, connections via CLI
        
        // Phase 2: Load and validate game
        await cli.execute('game load games/dragon-lair-epic');
        
        // Phase 3: Play through the complete narrative
        const gameSession = await gameService.createGame('dragon-lair-epic');
        const commands = [
            "examine the village square",
            "talk to the old sage about dragons", 
            "take the village map",
            // ... all 33 commands from the epic narrative test
        ];
        
        // Execute each command and verify success
        for (const command of commands) {
            const result = await gameService.processCommand(gameSession.gameId, command);
            expect(result.success).toBe(true);
        }
        
        // Verify quest completion
        const finalState = await gameService.getGame(gameSession.gameId);
        expect(finalState.gameState.questCompleted).toBe(true);
    });
});
```

## Implementation Priorities

### Phase 1: Foundation (Weeks 1-2)
1. TinySQL integration and database schema creation
2. Core database service with connection management  
3. Basic migration system
4. File structure setup with example games

### Phase 2: Services (Weeks 3-4)  
5. Enhanced entity services with persistence
6. File scanning and loading system
7. Version management infrastructure
8. Basic CLI framework setup

### Phase 3: CLI Development (Weeks 5-6)
9. High-level CLI commands (create, load, list, delete)
10. Low-level CRUD commands for all entities
11. Version control CLI commands
12. Dynamic loading system implementation

### Phase 4: Testing & Validation (Week 7)
13. CLI test framework development
14. Narrative scenario recreation via CLI
15. End-to-end quest completion testing
16. Performance optimization and bug fixes

This specification provides the complete blueprint for implementing persistent game storage with CLI management while maintaining the existing in-memory performance and adding robust versioning capabilities.