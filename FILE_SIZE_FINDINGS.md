# File Size Findings - Files Exceeding 600 Lines

## Overview

This document lists all TypeScript files in the repository that exceed the proposed 600-line limit. These files are candidates for refactoring to improve maintainability and readability.

**Date**: 2025-11-16
**Total Files Exceeding 600 Lines**: 48

---

## Critical Priority (>2000 lines) - 8 files

These files are extremely large and should be prioritized for refactoring:

| Lines | File | Category | Recommendation |
|-------|------|----------|----------------|
| 4,019 | `src/dialogue/dialogue-manager.service.spec.ts` | Test | Split into multiple test suites by feature area |
| 3,307 | `src/game/state-integrity-after-load.spec.ts` | Test | Break into separate test files per validation type |
| 2,782 | `src/entity/combat-concurrency.spec.ts` | Test | Split into combat-concurrency, combat-effects, combat-state |
| 2,466 | `src/game/persistence-performance.spec.ts` | Test | Separate by performance test categories |
| 2,215 | `src/inventory/inventory-manager.service.spec.ts` | Test | Split into inventory-basic, inventory-concurrency, inventory-edge-cases |
| 2,175 | `src/game/progression-blocker-prevention.spec.ts` | Test | Break into separate files per blocker category |
| 2,125 | `src/game/command-processor.service.ts` | Service | Extract command handlers into separate strategy classes |
| 2,112 | `src/quest/quest-concurrency.spec.ts` | Test | Split into multiple test suites |

---

## High Priority (1500-2000 lines) - 10 files

| Lines | File | Category | Recommendation |
|-------|------|----------|----------------|
| 1,868 | `src/game/entity-reference-validation.spec.ts` | Test | Split by entity type validation |
| 1,783 | `src/quest/quest-manager.service.spec.ts` | Test | Separate by quest lifecycle stages |
| 1,732 | `src/trigger/trigger-manager.service.spec.ts` | Test | Split by trigger types |
| 1,732 | `src/entity/combat-performance.spec.ts` | Test | Separate combat performance scenarios |
| 1,628 | `src/entity/navigation-performance.spec.ts` | Test | Split by navigation feature |
| 1,507 | `src/entity/object.service.integration.spec.ts` | Test | Separate integration scenarios |
| 1,480 | `src/game/save-versioning-migration.spec.ts` | Test | Split by version migration paths |
| 1,452 | `src/effects/effect-manager.service.spec.ts` | Test | Separate by effect types |
| 1,450 | `src/validation/game-logic-validator.service.spec.ts` | Test | Split by validation category |
| 1,431 | `src/world-state/world-state-manager.service.spec.ts` | Test | Separate by world state concerns |

---

## Medium Priority (1000-1500 lines) - 17 files

| Lines | File | Category | Recommendation |
|-------|------|----------|----------------|
| 1,428 | `src/llm/services/llm-error-handler.service.spec.ts` | Test | Split error handling scenarios |
| 1,422 | `src/llm/services/prompt-template.service.ts` | Service | Extract template builders into separate modules |
| 1,395 | `src/entity/player.service.ts` | Service | Extract player actions, inventory, combat into separate services |
| 1,393 | `src/entity/room-concurrency.spec.ts` | Test | Split by concurrency scenario type |
| 1,340 | `src/validation/validation.service.spec.ts` | Test | Separate by validation domain |
| 1,337 | `src/inventory/inventory-concurrency.spec.ts` | Test | Split by concurrency pattern |
| 1,308 | `src/physics/physics.service.spec.ts` | Test | Separate physics scenarios |
| 1,300 | `src/llm/services/room-generator.service.spec.ts` | Test | Split by generation feature |
| 1,288 | `src/game/game-logic-stress.spec.ts` | Test | Separate stress test scenarios |
| 1,259 | `src/integration/full-system-stress.spec.ts` | Test | Split by system component |
| 1,147 | `src/game/command-processor.service.spec.ts` | Test | Split by command category |
| 1,058 | `src/file-system/game-file.service.ts` | Service | Extract file format handlers |
| 1,055 | `src/components/component-manager.service.spec.ts` | Test | Split by component type |
| 1,034 | `src/entity/room.service.ts` | Service | Extract room relationships, room state into separate services |
| 1,004 | `src/game/save-corruption-detection.spec.ts` | Test | Split by corruption detection type |
| 954 | `src/events/event-emitter.service.spec.ts` | Test | Split by event category |
| 932 | `src/entity/object.service.ts` | Service | Extract object interactions, object state |

---

## Low Priority (600-1000 lines) - 13 files

| Lines | File | Category |
|-------|------|----------|
| 897 | `src/database/database-stress.spec.ts` | Test |
| 870 | `src/inventory/inventory-manager.service.ts` | Service |
| 866 | `src/database/database.service.spec.ts` | Test |
| 861 | `src/cli/cli.service.ts` | Service |
| 847 | `src/entity/entity-relationships-stress.spec.ts` | Test |
| 826 | `src/effects/effect-combat.spec.ts` | Test |
| 813 | `src/effects/effect-manager.service.ts` | Service |
| 772 | `src/llm/services/context-builder.service.ts` | Service |
| 770 | `src/llm/services/story-agent.service.ts` | Service |
| 766 | `src/database/database.service.ts` | Service |
| 763 | `src/quest/quest-manager.service.ts` | Service |
| 729 | `src/integration/persistence-integration.spec.ts` | Test |
| 726 | `src/world-state/world-state-manager.service.ts` | Service |
| 722 | `src/llm/services/conflict-resolver.service.ts` | Service |

---

## Summary Statistics

- **Total Files Over 600 Lines**: 48
- **Test Files**: 35 (73%)
- **Service Files**: 13 (27%)
- **Largest File**: 4,019 lines (dialogue-manager.service.spec.ts)
- **Average Size of Oversized Files**: 1,336 lines

---

## Refactoring Strategy Recommendations

### For Test Files:
1. **Split by Feature/Scenario**: Group related tests into separate files
2. **Extract Shared Fixtures**: Create test helper modules for common setup code
3. **Use Test Suites**: Organize into logical describe blocks first, then split files

### For Service Files:
1. **Single Responsibility**: Break large services into smaller, focused services
2. **Extract Strategies**: Move conditional logic into strategy pattern classes
3. **Create Modules**: Group related functionality into feature modules
4. **Use Composition**: Prefer composition over large monolithic classes

### Suggested Refactoring Order:
1. Start with Critical Priority files (>2000 lines)
2. Focus on service files first as they impact production code
3. Refactor test files to match the new service structure
4. Work down through priority levels

---

## Enforcement Going Forward

To maintain the 600-line limit:

1. **Pre-commit Hook**: Add a git hook to warn about files exceeding 600 lines
2. **Code Review**: Make file size a standard review criterion
3. **Linting**: Add a custom ESLint rule or similar tool to flag oversized files
4. **Documentation**: Document the rationale and refactoring patterns in CONTRIBUTING.md

---

## Notes

- This analysis excludes node_modules, dist, build, and other generated directories
- Line counts include comments and whitespace
- Test files naturally tend to be longer; consider a higher limit (800-1000 lines) for test files if needed
- The 600-line guideline is a soft limit meant to encourage modular, maintainable code
