# The Clockwork Conspiracy - Gameplay Notes for Detective Sessions

## Game Status: READY TO INVESTIGATE! 🔍

A complex steampunk detective noir adventure awaits. Time to solve a murder and uncover a conspiracy that threatens all of Gearhaven!

## Game Overview

**Setting**: The industrial metropolis of Gearhaven - a steampunk city of clockwork, steam, and corruption
**Your Role**: Detective investigating the murder of Professor Thaddeus Steamwright
**Difficulty**: Hard
**Estimated Playtime**: 3-4 hours
**Victory Condition**: Compile all evidence on the evidence-board to solve the conspiracy

## How to Play

### Step 1: Start the Server
```bash
cd /home/user/the-quest-weavers-essential-guide/nestjs-app
npm run start:prod > /tmp/game-server.log 2>&1 &
```

### Step 2: Verify Server Running
```bash
curl http://localhost:3000/api/health
# Should return: Hello World!
```

### Step 3: Create New Game Session
```bash
curl -s -X POST "http://localhost:3000/api/game/new" \
  -H "Content-Type: application/json" \
  -d '{"gamePath":"the-clockwork-conspiracy"}' | python3 -m json.tool
```

**IMPORTANT**: Save the `gameId` from the response!

### Step 4: Start Your Investigation!
Replace `{GAME_ID}` with your actual game ID:

```bash
# Look around
curl -s -X POST "http://localhost:3000/api/game/{GAME_ID}/command" \
  -H "Content-Type: application/json" \
  -d '{"command":"look"}' | python3 -m json.tool

# Move to a connected room
curl -s -X POST "http://localhost:3000/api/game/{GAME_ID}/command" \
  -H "Content-Type: application/json" \
  -d '{"command":"south"}' | python3 -m json.tool

# Take an item
curl -s -X POST "http://localhost:3000/api/game/{GAME_ID}/command" \
  -H "Content-Type: application/json" \
  -d '{"command":"take case-file"}' | python3 -m json.tool

# Check inventory
curl -s -X POST "http://localhost:3000/api/game/{GAME_ID}/command" \
  -H "Content-Type: application/json" \
  -d '{"command":"inventory"}' | python3 -m json.tool

# Talk to NPCs
curl -s -X POST "http://localhost:3000/api/game/{GAME_ID}/command" \
  -H "Content-Type: application/json" \
  -d '{"command":"talk <npc-name>"}' | python3 -m json.tool

# Examine items for clues
curl -s -X POST "http://localhost:3000/api/game/{GAME_ID}/command" \
  -H "Content-Type: application/json" \
  -d '{"command":"examine <item-name>"}' | python3 -m json.tool
```

## Starting Information

### Your Office - Detective's Office (0, 0, 0)
The game begins in your cramped detective's office on the third floor of a weathered building. Papers scattered, gas lamp flickering, steam pipes hissing - welcome to Gearhaven.

**Starting Items:**
- **case-file** - The Steamwright murder case file
- **magnifying-glass** - Your trusty detective tool

### The Case
**Victim**: Professor Thaddeus Steamwright
**Cause of Death**: Murder
**Suspects**: Unknown
**Your Mission**: Investigate the murder and uncover the truth behind the conspiracy

## Investigation Tips (NO SPOILERS!)

### Essential Detective Work
1. **Talk to Everyone** - This game features 18 NPCs with deep dialogue trees. Exhaust all conversation options.
2. **Examine Everything** - Items contain crucial clues. Read descriptions carefully.
3. **Map the City** - Gearhaven has 26 interconnected rooms. Keep track of locations and what you find.
4. **Collect Evidence** - Gather documents, clues, and evidence throughout your investigation.
5. **Follow Leads** - NPCs will point you toward new locations and suspects. Follow every thread.

### Game Mechanics
- **26 Rooms** - A sprawling steampunk metropolis to explore
- **18 NPCs** - Each with branching dialogue and potential information
- **31 Items** - Evidence, documents, keys, tools, weapons, and clues
- **Multiple Quest Lines** - The main murder investigation plus optional side investigations
- **Locked Areas** - Some locations require specific items or keys to access
- **Combat System** - Be prepared for confrontations with hostile NPCs

### Key Locations to Discover
The city of Gearhaven includes (but is not limited to):
- Police facilities and official buildings
- Industrial districts and factories
- Upscale areas and estates
- Docks and warehouses
- Hidden underground locations
- And more...

### Important Considerations
- **Note Dialogue Flags** - NPCs may remember your choices and conversations
- **Item Requirements** - Some NPCs want specific items before sharing information
- **Multiple Paths** - There are different ways to solve the mystery
- **Keep Evidence** - Don't drop important clues; you'll need them for the final solution
- **Document Your Findings** - Keep notes on suspects, locations, and connections (externally, in a real notebook!)

## Command Cheat Sheet

```bash
# Basic Movement
look, l
north, n, south, s, east, e, west, w, up, down

# Inventory Management
inventory, i
take <item>
drop <item>
examine <item>, x <item>

# Investigation & Interaction
talk <npc>
use <item>
use <item> on <target>
attack <npc> (when necessary)

# Save/Load
save
load
```

## Game World Stats

- **Total Rooms**: 26 interconnected locations
- **Total NPCs**: 18 characters to interview
- **Total Items**: 31 objects to discover and utilize
- **Connections**: 52 bidirectional pathways through Gearhaven

## Investigation Goals

### Primary Objective
🎯 **Solve the Steamwright Murder**: Investigate Professor Thaddeus Steamwright's death and identify the killer(s)

### Secondary Objective
🕵️ **Uncover the Conspiracy**: Discover the secret society and conspiracy threatening Gearhaven

### Victory Condition
✅ **Compile Evidence**: Use the evidence-board with all crucial evidence to solve the case

## Atmosphere & Themes

Expect a rich noir detective story featuring:
- **Detective Noir** - Classic investigation, interrogation, and deduction
- **Steampunk Technology** - Clockwork devices, steam power, Victorian-era industrialism
- **Political Intrigue** - Corruption at the highest levels of Gearhaven society
- **Secret Societies** - Hidden organizations with mysterious agendas
- **Moral Complexity** - Not everyone is who they seem

## Technical Notes

### Game Structure
- Starting room: `detectives-office` at position (0, 0, 0)
- Game path: `the-clockwork-conspiracy`
- All rooms have proper connections via connections.json
- NPCs have complex dialogue trees with choices and flags
- Game fully validated and playable

### Known Game Features
- Branching dialogue with player choices
- Item-based progression (keys, access cards, etc.)
- NPC relationship tracking via flags
- Quest item collection and usage
- Multiple endings possible (discover them yourself!)

## Detective's Creed

"In a city of gears and steam, truth is the rarest commodity. Every cog has its place, every witness their secrets. Follow the evidence, trust your instincts, and remember—in Gearhaven, the conspiracy goes deeper than you think."

Good luck, Detective. Gearhaven is counting on you! 🔍⚙️

---

## Next Session Goals

1. 🚀 Start the server
2. 🎮 Create a new game session
3. 🔍 Begin the investigation at Detective's Office
4. 🗺️ Map out Gearhaven's districts and locations
5. 👥 Interview key witnesses and suspects
6. 📋 Collect evidence and documents
7. 🧩 Piece together the conspiracy
8. ✅ Solve the case and save Gearhaven!

**Remember**: This is a detective game—take notes, think critically, and don't trust anyone completely. The conspiracy runs deep!
