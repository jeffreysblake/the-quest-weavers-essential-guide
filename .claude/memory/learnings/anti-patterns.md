# Anti-Patterns - What NOT To Do
# Documented mistakes to avoid - consolidated from corrections

## Meta
- **Purpose**: Clear documentation of mistakes and anti-patterns
- **Source**: Consolidated from recurring user corrections
- **Usage**: Referenced by agents/skills to avoid repeated mistakes

---

## Anti-Patterns Library

_This file will grow from user-corrections.md as patterns emerge (3+ occurrences)_

---

## Anti-Pattern Template

```markdown
## Anti-Pattern: [Pattern Name]

**What NOT to do**: Clear description of the mistake
**Why it's wrong**: Explanation of the problem it causes
**Correct approach**: What to do instead

**Examples of mistake**:
```code
# BAD - Example of the anti-pattern
...
```

**Correct implementation**:
```code
# GOOD - Correct way to do it
...
```

**Detection**: How to recognize when you're about to make this mistake
**Prevention**: Specific check to perform before acting

**Related rules**: Links to memory/agents/skills
**Frequency**: X occurrences before documented

---
```

## Initial Anti-Pattern (Universal - from project setup)

### Anti-Pattern: Creating Helper/Utils Files Unnecessarily

**What NOT to do**: Create separate `*_helper.*` or `*_utils.*` files for small functions

**Why it's wrong**:
- Fragments codebase unnecessarily
- Harder to locate related functionality
- Violates anti-bloat principle
- Increases import complexity

**Correct approach**: Add functions to existing related module

**Examples of mistake**:
- Creating `user_validator.py` when `user.py` exists
- Creating `auth_utils.ts` when `auth.ts` exists
- Creating `string_helpers.js` for one function

**Correct implementation**:
- Add validation method to existing service class
- Add utility function to existing module
- Only create new file if approaching 400-line limit

**Detection**: Ask yourself:
1. Does a related file already exist?
2. Is this functionality tightly coupled to an existing module?
3. Is this file going to be <100 lines? (probably should be merged)

**Prevention**:
- Check `Edit existing file` before `Write new file`
- Follow anti-bloat priority order in .claude-memory

**Related rules**: `.claude/memory/.claude-memory` - Anti-Bloat Rules #1
**Frequency**: Common mistake - pre-documented

---
