# Quest Weaver - Room Navigation and Item System

This document describes the room navigation and item interaction systems implemented for Quest Weaver.

## Overview

The implementation includes three core components:
1. **Room System** - Manages rooms with relative positioning and connections
2. **Item System** - Handles items in rooms and player inventory
3. **Navigation System** - Controls player movement between rooms

## Room System

### Features
- Create rooms with relative positioning (x, y coordinates)
- Define room dimensions (width, height)
- Connect rooms in 4 directions (north, south, east, west)
- Manage room connections and navigation paths

### Usage Example
```typescript
const roomSystem = new RoomSystem();

// Create a room
const startRoom = roomSystem.createRoom(
  'start-room',
  'Village Square',
  'A peaceful village square',
  { x: 0, y: 0 },
  { width: 200, height: 200 }
);

// Connect rooms
roomSystem.addConnection('start-room', 'forest-room', 'east');
```

## Item System

### Features
- Create items with various properties (name, description, type)
- Manage player inventory
- Track item characteristics (weight, value)

### Usage Example
```typescript
const itemSystem = new ItemSystem();

// Create an item
const potion = itemSystem.createItem(
  'health-potion',
  'Health Potion',
  'Restores health',
  'consumable'
);

// Add to player inventory
itemSystem.addItemToInventory('player1', potion);
```

## Navigation System

### Features
- Create players with initial positions
- Move players between rooms
- Track current room for each player

### Usage Example
```typescript
const navigationSystem = new NavigationSystem();

// Create a player
const player = navigationSystem.createPlayer(
  'player1',
  'Hero',
  'start-room'
);

// Move player to another room
navigationSystem.movePlayer('player1', 'forest-room');
```

## Game Systems Integration

All systems are integrated through the `GameSystems` class:

```typescript
const gameSystems = new GameSystems();

// Get individual systems
const roomSystem = gameSystems.getRoomSystem();
const itemSystem = gameSystems.getItemSystem();
const navigationSystem = gameSystems.getNavigationSystem();
```

This architecture allows for easy expansion and testing of each component in isolation while maintaining proper integration between them.

## Testing

Comprehensive tests have been implemented to ensure:
- Room creation and connection functionality
- Item management and inventory handling  
- Player navigation between rooms
- Integration between all systems

Tests are written using Jest and TypeScript, following best practices for type safety.