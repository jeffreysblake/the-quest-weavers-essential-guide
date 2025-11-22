# User Corrections - Learning Log
# Automatic capture of user corrections during sessions

## Meta
- **Purpose**: Learn from mistakes, track corrections, identify patterns
- **Auto-append**: When user corrects Claude during session
- **Review frequency**: Weekly - look for 3+ occurrences
- **Consolidation**: After 3rd occurrence → move to common-patterns.md

---

## Correction Log

_This file will be automatically populated when user provides corrections during sessions._

---

## Correction Template (auto-appended format)

```markdown
## [YYYY-MM-DD HH:MM] Correction: [Brief Title]

**Context**: What task was being performed
**What Claude did wrong**: Specific mistake made
**User correction**: Exact correction provided
**Root cause**: Why the mistake happened
**Prevention**: How to avoid in future
**Related rule**: Link to memory/agent/skill if applicable

**Status**: New | Under review | Consolidated (after 3rd occurrence)
**Frequency counter**: 1

---
```

## Example Entry (for reference)

```markdown
## [2025-10-28 14:30] Correction: Created unnecessary helper file

**Context**: Implementing user email validation
**What Claude did wrong**: Created new file `app/services/user_validator.py`
**User correction**: "Add the validation method to existing app/services/user.py"
**Root cause**: Defaulting to file creation instead of checking for existing files
**Prevention**: Follow anti-bloat rule - Edit > Write, check existing files first
**Related rule**: .claude/memory/.claude-memory - Anti-Bloat Rules, Priority #1

**Status**: New
**Frequency counter**: 1

---
```
