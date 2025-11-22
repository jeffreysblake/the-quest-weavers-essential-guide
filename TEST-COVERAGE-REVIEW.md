# Test Coverage Review - Working Document

**Date:** 2025-11-22
**Session:** Hotel Game Testing & Test Coverage Analysis
**Status:** Ready for Next Session

---

## 🚀 Quick Start for Next Session

### Environment Setup

```bash
# Navigate to project root
cd /home/user/the-quest-weavers-essential-guide/nestjs-app

# Verify current branch
git branch
# Should be on: claude/play-hotel-game-01DsrghWaMjPJkd1pDkpNTKr

# Check git status
git status
# Should be clean (all test files committed)

# Install dependencies if needed
npm install

# Run existing tests to verify everything works
npm test

# Run specific test suites we just created
npm test -- item-name-matcher.util.spec.ts base-command.handler.spec.ts use-command.handler.spec.ts dialogue-choice-command.handler.spec.ts
```

### What We Completed This Session

✅ **Architecture Verification**
- Verified NpcService approach is correct (uses GameStateService)
- No build errors remaining

✅ **Created 4 New Test Files** (114 tests, all passing)
1. `item-name-matcher.util.spec.ts` (32 tests)
2. `base-command.handler.spec.ts` (27 tests)
3. `use-command.handler.spec.ts` (31 tests)
4. `dialogue-choice-command.handler.spec.ts` (24 tests)

✅ **Comprehensive Code Review**
- Used 4 parallel agents to review entire codebase
- Identified 32 files missing test coverage
- Categorized by priority (Critical → Low)

✅ **Committed and Pushed**
- All test files committed: `60f5d9a`
- Branch: `claude/play-hotel-game-01DsrghWaMjPJkd1pDkpNTKr`
- Ready for next session

---

## 📊 Test Coverage Gap Analysis - Summary

### Overall Statistics
- **Total files reviewed:** 37 critical files
- **Files WITH tests:** 5 (13.5%)
- **Files MISSING tests:** 32 (86.5%)
- **Total untested code:** ~6,910 lines
- **Estimated test code needed:** ~9,900 lines
- **Estimated effort:** 7-10 weeks (1 developer, full-time)

---

## 🔴 CRITICAL PRIORITY (P0) - Week 1-2

### Command Handlers (5 files)

#### 1. attack-command.handler.ts
- **LOC:** 416
- **Why Critical:** Core combat system with damage calculations, XP, loot, death handling
- **Risk:** Game-breaking bugs in combat
- **Complexity:** Very high - multiple state changes, rollback logic
- **Test Estimate:** ~600 LOC

#### 2. dialogue-command.handler.ts
- **LOC:** 325
- **Why Critical:** NPC interactions, dialogue tree format conversion
- **Risk:** Quest progression breaks, dialogue corruption
- **Complexity:** Very high - complex format conversion, state management
- **Test Estimate:** ~500 LOC

#### 3. movement-command.handler.ts
- **LOC:** 157
- **Why Critical:** Most used command, core navigation
- **Risk:** Players stuck, locked door bypass
- **Complexity:** High - direction mapping, position validation
- **Test Estimate:** ~300 LOC

#### 4. save-command.handler.ts
- **LOC:** 42
- **Why Critical:** Data persistence - player progress loss unacceptable
- **Risk:** Silent save failures
- **Complexity:** Low-Medium (delegates to GameStateService)
- **Test Estimate:** ~100 LOC

#### 5. load-command.handler.ts
- **LOC:** 42
- **Why Critical:** Data integrity - corrupted loads break game
- **Risk:** Partial load failures, wrong slot loading
- **Complexity:** Low-Medium (delegates to GameStateService)
- **Test Estimate:** ~100 LOC

### Core Services (3 files)

#### 6. game.service.ts 🎯
- **LOC:** 882 (largest service)
- **Why Critical:** Central orchestrator, session management, concurrency control
- **Risk:** Memory leaks, race conditions, session cleanup failures
- **Complexity:** Very high - file I/O, database, Mutex locks, NPC placement
- **Test Estimate:** ~800-1000 LOC
- **Key Areas:**
  - Session creation/cleanup with LRU eviction
  - File loading (rooms, NPCs, objects, connections)
  - Concurrency protection (Mutex locks with timeout)
  - Resource limits (10,000 max sessions)
  - Database transactions

#### 7. game-state.service.ts 💾
- **LOC:** 403
- **Why Critical:** All game state save/load, cross-service integration
- **Risk:** Save corruption, partial restores, lost progress
- **Complexity:** High - aggregates 5+ services, deep serialization
- **Test Estimate:** ~500-700 LOC
- **Key Areas:**
  - Save/load cycles with all service combinations
  - Lock timeout scenarios (10-second timeout)
  - Partial service failures
  - State corruption detection
  - JSON serialization edge cases

#### 8. command-validator.service.ts 🔒 SECURITY CRITICAL
- **LOC:** 277
- **Why Critical:** Security boundary for ALL user input
- **Risk:** SQL injection, command injection, XSS, DOS attacks
- **Complexity:** Medium-High - regex patterns, injection detection
- **Test Estimate:** ~400-600 LOC
- **Key Areas:**
  - SQL injection patterns (UNION, DROP, etc.)
  - Command injection (shell metacharacters)
  - XSS prevention (script tags, javascript:)
  - Resource limits (DOS prevention)
  - Game verb whitelisting (drop, put, insert)
  - False positive scenarios

### Entity Services (2 files)

#### 9. object.service.ts 📦
- **LOC:** 808 (largest entity service)
- **Why Critical:** Foundation for ALL game objects, spatial relationships
- **Risk:** Object duplication/loss, inventory corruption, cache desync
- **Complexity:** Very high - 8 relationship types, containers, database sync
- **Test Estimate:** ~800-1000 LOC
- **Key Areas:**
  - Spatial relationships (on, in, under, behind, beside, etc.)
  - Container operations (capacity, nested containment)
  - Material property generation
  - Cache synchronization (3 locations: local, EntityService, database)
  - Batch loading (N+1 query prevention)
  - NULL safety scenarios

#### 10. physics.service.ts 💥
- **LOC:** 624
- **Why Critical:** Combat effects, chain reactions, elemental damage
- **Risk:** 4+ known bugs already fixed (zombie resurrection, chain reactions)
- **Complexity:** Very high - multiple effect types, material interactions
- **Test Estimate:** ~500-700 LOC
- **Key Areas:**
  - Fire effects (flammability, explosions)
  - Lightning effects (conductivity, chaining)
  - Ice effects (freezing, brittleness)
  - Force effects (shattering)
  - Damage calculation edge cases (0 health, undefined, negative)
  - Chain reaction depth limits
  - Spatial queries (getObjectsInRange, getConnectedObjects)

**Known Bug Fixes to Test:**
1. ✓ Zombie resurrection (applying damage to 0 health objects)
2. ✓ Flammable materials damage calculation
3. ✓ Lightning chaining to conductive objects

### Utilities (4 files)

#### 11. command-validation.util.ts
- **LOC:** 215
- **Why Critical:** Used by ALL command handlers
- **Risk:** Wide usage means bugs affect entire system
- **Complexity:** Medium - validation logic, error result builders
- **Test Estimate:** ~300 LOC

#### 12. player-inventory.helper.ts 🔁
- **LOC:** 333
- **Why Critical:** Mutex-protected inventory operations
- **Risk:** Item duplication, lock timeout failures
- **Complexity:** High - async-mutex, complex filtering/sorting
- **Test Estimate:** ~500 LOC

#### 13. room-entity-manager.helper.ts 🏛️
- **LOC:** 245
- **Why Critical:** Resource limits, DOS prevention
- **Risk:** Room capacity overflow, concurrent access corruption
- **Complexity:** High - Mutex locks, max limits (100 players, 1000 objects)
- **Test Estimate:** ~350 LOC

#### 14. room-navigation-helper.service.ts 🗺️
- **LOC:** 221
- **Why Critical:** Core navigation logic, spatial calculations
- **Risk:** Navigation bugs block progress, cross-game contamination
- **Complexity:** Medium-High - boundary detection, fallback logic
- **Test Estimate:** ~350 LOC

**Critical Priority Total:** 14 files, ~4,990 LOC untested, ~6,250 LOC tests needed

---

## 🟠 HIGH PRIORITY (P1) - Week 3-4

### Command Handlers (4 files)
- **cast-command.handler.ts** (177 LOC) - Magic system, spell validation
- **drop-command.handler.ts** (116 LOC) - Transaction logic with rollback
- **take-command.handler.ts** (83 LOC) - Transaction logic with rollback
- **examine-command.handler.ts** (90 LOC) - Information gathering, NPC filtering

### Persistence (2 files)
- **player-persistence.helper.ts** (333 LOC) - Database save/load, version management
- **room-persistence.helper.ts** (462 LOC) - Most complex persistence, relationship tables

### Combat (1 file)
- **player-combat.helper.ts** (148 LOC) - Intensity validation, spell casting

**High Priority Total:** 7 files, ~1,409 LOC

---

## 🟡 MEDIUM PRIORITY (P2) - Week 5-6

### Command Handlers (1 file)
- **look-command.handler.ts** (82 LOC) - Room awareness, frequently used

### Import/Export (5 files)
- **database-import.helper.ts** (292 LOC) - Batch imports
- **database-export.helper.ts** (356 LOC) - File writing, filename sanitization
- **entity-converter.helper.ts** (238 LOC) - Format conversion, backward compatibility
- **player-interaction.helper.ts** (223 LOC) - Object interactions
- **json-file-loader.helper.ts** (135 LOC) - File loading with validation

**Medium Priority Total:** 6 files, ~1,326 LOC

---

## 🟢 LOW PRIORITY (P3) - Week 7+

### Command Handlers (3 files)
- **inventory-command.handler.ts** (42 LOC) - Simple read operation
- **help-command.handler.ts** (54 LOC) - Static text
- **container-command.handler.ts** (75 LOC) - Stub implementation

### Helpers (2 files)
- **room-connection.helper.ts** (91 LOC) - Distance calculations
- **object-placement.helper.ts** (126 LOC) - Validation logic

**Low Priority Total:** 5 files, ~388 LOC

---

## ⚠️ Top 10 Highest Risk Areas

| Rank | File | Risk Factor | Impact |
|------|------|-------------|--------|
| 1 🔒 | command-validator.service.ts | SECURITY | System compromise via injection |
| 2 💥 | physics.service.ts | BUG HISTORY | 4+ known bugs, chain reactions |
| 3 💰 | game.service.ts | CORE ENGINE | Session management, crashes |
| 4 🎮 | attack-command.handler.ts | COMBAT | Most complex command handler |
| 5 💾 | game-state.service.ts | DATA LOSS | Save/load corruption |
| 6 🗺️ | object.service.ts | INVENTORY | 808 LOC, spatial relationships |
| 7 🔁 | player-inventory.helper.ts | CONCURRENCY | Item duplication via race |
| 8 🚪 | movement-command.handler.ts | NAVIGATION | Most used, locked door bypass |
| 9 💬 | dialogue-command.handler.ts | QUESTS | Dialogue tree corruption |
| 10 🏛️ | room-persistence.helper.ts | COMPLEXITY | 462 LOC, relationship tables |

---

## 📝 Testing Strategy Recommendations

### Phase 1: Security & Core (Weeks 1-2)
**Goal:** Prevent security vulnerabilities and game-breaking bugs

**Priority Order:**
1. command-validator.service.ts - Security first
2. attack-command.handler.ts - Most complex command
3. dialogue-command.handler.ts - Quest system
4. movement-command.handler.ts - Navigation
5. save/load-command.handler.ts - Data persistence

**Deliverables:**
- 5 new test files
- ~1,600 LOC of tests
- Security vulnerabilities addressed
- Core commands protected

### Phase 2: Services & Data (Weeks 3-4)
**Goal:** Ensure data integrity and service reliability

**Priority Order:**
1. game.service.ts - Session management
2. game-state.service.ts - State persistence
3. object.service.ts - Spatial relationships
4. physics.service.ts - Combat effects
5. Persistence helpers

**Deliverables:**
- 7 new test files
- ~3,500 LOC of tests
- Data corruption prevented
- Service reliability ensured

### Phase 3: Completion (Weeks 5-7)
**Goal:** Full coverage for production readiness

**Priority Order:**
1. Remaining command handlers
2. Import/export utilities
3. Navigation and interaction helpers
4. Low priority utilities

**Deliverables:**
- 13 new test files
- ~2,000 LOC of tests
- Production-ready test suite

---

## 🎯 Immediate Next Steps

### Session Startup Checklist

1. **Verify Environment**
   ```bash
   cd /home/user/the-quest-weavers-essential-guide/nestjs-app
   git status  # Should be clean
   npm test    # Should show 114 passing tests
   ```

2. **Choose Starting Point** (recommend in order):

   **Option A: Security First** (RECOMMENDED)
   ```bash
   # Create command-validator.service.spec.ts
   # Focus: SQL injection, XSS, command injection tests
   # Estimated: 2-3 hours
   ```

   **Option B: Combat System**
   ```bash
   # Create attack-command.handler.spec.ts
   # Focus: Damage, XP, loot, death, rollback
   # Estimated: 3-4 hours
   ```

   **Option C: Physics/Effects**
   ```bash
   # Create physics.service.spec.ts
   # Focus: Elemental effects, chain reactions, zombie resurrection
   # Estimated: 3-4 hours
   ```

3. **Testing Pattern to Follow**
   - Use existing test files as templates
   - Mock all service dependencies
   - Test both success and failure paths
   - Include edge cases (null, undefined, empty)
   - Test rollback/transaction logic explicitly
   - Verify event emissions

4. **Run Tests After Creation**
   ```bash
   npm test -- <new-test-file>.spec.ts
   ```

5. **Commit and Push**
   ```bash
   git add src/path/to/new-test.spec.ts
   git commit -m "Add comprehensive tests for <component>"
   git push -u origin claude/play-hotel-game-01DsrghWaMjPJkd1pDkpNTKr
   ```

---

## 📚 Reference: Test Files Created This Session

### 1. item-name-matcher.util.spec.ts
**Tests:** 32
**Coverage:**
- normalizeNameForMatching() - Case conversion, hyphen/underscore handling
- matchesName() - Exact, substring, word-based matching
- getMatchScore() - Scoring algorithm (100/50-90/25/0)
- **Critical fix:** "reality anchor" vs "reality anchor fragment" prioritization

### 2. base-command.handler.spec.ts
**Tests:** 27
**Coverage:**
- matchesName() - Name matching logic
- validateTarget() - Target validation
- findObjectInInventoryOrRoom() - Match scoring integration
- findObjectInInventory() - Inventory search with scoring
- findObjectInRoom() - Room object search with scoring
- createNotFoundError() - Error message generation
- **Critical fix:** Exact matches prioritized over partial matches

### 3. use-command.handler.spec.ts
**Tests:** 31
**Coverage:**
- handleRealityAnchorVictory() - Hotel game victory (3 fragments + 4 keys)
- handleCosmicRepairStation() - Janitor game victory (5 shards + 5 artifacts)
- handleConsumableUse() - Health/mana restoration
- handleWeaponUse() - Weapon equipping
- handleKeyUse() - Container unlocking
- handleToolUse() - Tool activation
- **Critical fix:** Victory conditions with proper fragment counting

### 4. dialogue-choice-command.handler.spec.ts
**Tests:** 24
**Coverage:**
- Input validation (choice numbers)
- Conversation state validation
- Choice validation (range checking)
- Dialogue continuation
- **Combat hint feature** - Hostile NPC dialogue endings
- Context building (flags, variables, inventory)
- Error handling

---

## 🐛 Known Bugs Fixed (Regression Tests Needed)

### Physics Service (4+ bugs)
1. ✓ **Zombie resurrection** - Objects with 0 health coming back to life
2. ✓ **Flammable materials** - Not taking enough fire damage
3. ✓ **Lightning chaining** - Not chaining to conductive objects
4. ✓ **Undefined checks** - Explicit checks to avoid resurrection

### Item Matching (1 bug)
1. ✓ **Fragment vs Anchor** - "reality anchor" matched "reality anchor fragment" first

### Dialogue System (1 bug)
1. ✓ **Combat transition** - No hint to attack after hostile dialogue

**All these bugs need regression tests to prevent recurrence**

---

## 💡 Key Insights from Review

### Security Concerns
- command-validator.service.ts has **ZERO tests** despite being security boundary
- Injection attack prevention not validated
- Resource limits (DOS) not tested

### Concurrency Risks
- Multiple services use Mutex locks without concurrency tests
- Lock timeout scenarios untested
- Race condition potential in inventory/room management

### Data Integrity
- Complex save/load logic lacks unit tests
- JSON serialization edge cases untested
- Partial failure scenarios not covered

### Bug History
- Physics service shows pattern of bugs (4+ fixes)
- Indicates high-complexity area needing thorough testing
- Regression risk without tests

### Integration vs Unit Tests
- Integration tests exist but don't replace unit tests
- Integration tests don't cover all edge cases
- Unit tests faster and isolate failures better

---

## 📈 Success Metrics

### Test Coverage Goals
- **Critical (P0):** 80% coverage minimum
- **Security (command-validator):** 100% branch coverage
- **Bug fix areas (physics):** 100% scenario coverage
- **Overall codebase:** 70% coverage target

### Quality Gates for Production
- ✅ All P0 files have comprehensive tests
- ✅ Security validator fully tested (injection attempts)
- ✅ Physics service bug scenarios covered
- ✅ Attack command edge cases tested
- ✅ Save/load round-trip tests passing
- ✅ No regression in existing 114 tests

---

## 🔗 Related Files

- **Game Design:** `/home/user/the-quest-weavers-essential-guide/games/the-interdimensional-hotel/interdimensional-hotel-notes.md`
- **Gameplay Notes:** `/home/user/the-quest-weavers-essential-guide/hotel-gameplay-notes.md`
- **Test Files Created:**
  - `nestjs-app/src/game/utils/item-name-matcher.util.spec.ts`
  - `nestjs-app/src/game/commands/base-command.handler.spec.ts`
  - `nestjs-app/src/game/commands/use-command.handler.spec.ts`
  - `nestjs-app/src/game/commands/dialogue-choice-command.handler.spec.ts`

---

## 📅 Session History

### 2025-11-22 - Session Summary
- ✅ Verified NpcService architecture (correct implementation)
- ✅ Created 4 test files (114 tests, all passing)
- ✅ Ran comprehensive code review with 4 parallel agents
- ✅ Identified 32 files missing tests
- ✅ Prioritized by criticality, complexity, and risk
- ✅ Committed and pushed all changes
- ✅ Created this working document

**Next Session:** Start with command-validator.service.spec.ts (security critical)

---

**End of Working Document**
