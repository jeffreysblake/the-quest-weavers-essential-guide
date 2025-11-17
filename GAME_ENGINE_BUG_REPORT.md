# Game Engine Bug Report
**Date:** 2025-11-17
**Testing Game:** The Cosmic Custodian's Calamity
**Tester:** Claude (Automated Testing)

## Executive Summary
Critical bugs discovered preventing game loading and playability. The game engine cannot load games from the filesystem, making all created game content inaccessible.

---

## Critical Bugs

### BUG #1: No Game Loading from Filesystem
**Severity:** CRITICAL
**Status:** IDENTIFIED
**Location:** `nestjs-app/src/game/game.service.ts:86-148`, `nestjs-app/src/game/game.controller.ts:16-27`

**Description:**
The `/api/game/new` endpoint does not accept or process a `gamePath` parameter. Instead, it creates a hardcoded default world with a single "Entry Hall" room, completely ignoring any game data files in the `games/` directory.

**Evidence:**
- API call: `POST /api/game/new` with `{"gamePath": "cosmic-custodian"}`
- Controller ignores the gamePath parameter
- `initializeGameWorld()` creates hardcoded room instead of loading from files
- Cosmic custodian game (15 rooms, 10 NPCs, 21 objects) never loaded

**Impact:**
- All game content in JSON files is inaccessible
- Cannot test created games
- Engine appears functional but loads wrong content
- Game designers cannot use their created games

**Root Cause:**
1. `GameController.createGame()` has no `@Body` parameter
2. `GameService.createGame()` has no gamePath parameter
3. `initializeGameWorld()` has hardcoded content instead of file loading logic

**Expected Behavior:**
```typescript
@Post('new')
async createGame(@Body('gamePath') gamePath?: string) {
  const result = await this.gameService.createGame(gamePath);
  return result;
}
```

---

### BUG #2: Missing File System Loading Infrastructure
**Severity:** CRITICAL
**Status:** IDENTIFIED
**Location:** `nestjs-app/src/game/game.service.ts`

**Description:**
No code exists to:
- Read room JSON files from `games/{gameName}/rooms/`
- Read NPC JSON files from `games/{gameName}/npcs/`
- Read object JSON files from `games/{gameName}/objects/`
- Read connections from `games/{gameName}/connections.json`
- Read game config from `games/{gameName}/game-config.json`

**Impact:**
- Cannot load any game content from files
- All game design work is wasted
- Engine limited to programmatically created content

**Required Implementation:**
```typescript
private async loadGameFromPath(gamePath: string, gameId: string): Promise<void> {
  const basePath = `/path/to/games/${gamePath}`;

  // Load game config
  const config = await fs.readFile(`${basePath}/game-config.json`);

  // Load all rooms
  const roomFiles = await fs.readdir(`${basePath}/rooms`);
  for (const file of roomFiles) {
    const roomData = await fs.readFile(`${basePath}/rooms/${file}`);
    await this.createRoomFromData(roomData, gameId);
  }

  // Load NPCs, objects, connections...
}
```

---

### BUG #3: Room ID Mismatch (Connections Break)
**Severity:** HIGH
**Status:** IDENTIFIED
**Location:** `nestjs-app/src/entity/room.service.ts`

**Description:**
Even if file loading were implemented:
- Room JSON files have string IDs: `"id": "janitor-closet"`
- `RoomService.createRoom()` generates new UUIDs for rooms
- Connections reference string IDs: `"from_room": "janitor-closet"`
- Room lookups fail because IDs don't match (UUID !== string)

**Evidence:**
```json
// Room file: janitor-closet.json
{"id": "janitor-closet", "name": "Janitor's Closet", ...}

// Connections file
{"from_room": "janitor-closet", "to_room": "main-corridor", ...}

// But actual loaded room has:
{id: "050b20bb-a2f1-4503-8d2c-2ba2ba70dbc6", name: "Janitor's Closet", ...}
```

**Impact:**
- Room connections won't work
- Navigation fails
- Game is unplayable even if loading works

**Required Fix:**
- Preserve room IDs from JSON files instead of generating new ones
- Add logic to use provided ID or generate UUID if not provided

---

### BUG #4: Exit Display vs. Navigation Mismatch
**Severity:** MEDIUM (symptom of BUG #3)
**Status:** IDENTIFIED
**Location:** `nestjs-app/src/game/command-processor.service.ts`

**Description:**
The `look` command shows exits that don't actually exist:
```
"exits": ["north", "east"]
```
But movement commands fail:
```
"go north" → "You cannot go north from here."
"go east" → "You cannot go east from here."
```

**Root Cause:**
This is a consequence of BUG #3 - the exit list is probably being populated from connection data, but the actual navigation fails because room IDs don't match.

**Impact:**
- Confusing player experience
- Appears to be broken navigation
- Actually reveals deeper room ID problem

---

## Test Results

### Tests Passed ✓
- Server startup (0 compilation errors)
- Game creation endpoint responds
- Player creation works
- Inventory system functional
- Item pickup works (Brass Key acquired successfully)
- Look command returns formatted response

### Tests Failed ✗
- Game loading from filesystem (not implemented)
- Room navigation (connections broken)
- Full game playthrough (blocked by navigation)

---

## Recommendations

### Immediate Fixes Required (Priority Order):

1. **Implement Game Path Loading**
   - Add gamePath parameter to controller and service
   - Implement file reading infrastructure
   - Load game-config.json first

2. **Implement Room/NPC/Object Loading**
   - Read and parse all JSON files in game directory
   - Preserve IDs from JSON files
   - Create entities with proper gameId association

3. **Implement Connection Loading**
   - Read connections.json
   - Validate all referenced rooms exist
   - Create bidirectional navigation graph

4. **Fix Room ID Preservation**
   - Modify entity creation to use provided ID
   - Only generate UUID if ID not provided
   - Ensure consistency across all entity types

5. **Add Validation**
   - Verify all connection endpoints exist
   - Check for orphaned rooms
   - Validate required objects/NPCs exist

### Testing Plan:
1. Fix bugs in order listed above
2. Load cosmic-custodian game
3. Complete full playthrough
4. Write automated tests for each bug
5. Verify all 15 rooms are navigable
6. Confirm all NPCs and objects load correctly

---

## Code Locations Summary

**Files Requiring Changes:**
- `nestjs-app/src/game/game.controller.ts` - Add gamePath parameter
- `nestjs-app/src/game/game.service.ts` - Implement file loading
- `nestjs-app/src/entity/room.service.ts` - Preserve room IDs
- `nestjs-app/src/entity/object.service.ts` - Preserve object IDs
- `nestjs-app/src/entity/player.service.ts` - Handle NPC loading

**New Files Needed:**
- Game loader service (optional, could be in game.service.ts)
- Connection manager (for navigation graph)

---

## Notes
- All JSON game files are well-formed and valid
- The cosmic-custodian game is complete and ready to test
- Only the loading infrastructure is missing
- This is a feature gap, not corrupted data
