---
name: correction-tracker
description: Automatically detects and logs user corrections to enable self-learning. Tracks ALL correction types (code structure, testing, architecture, naming, patterns, tool usage, etc.). Notifies when patterns emerge (3+ occurrences) and proposes skill creation (5+ occurrences). (project)
---

# Correction Tracker Skill

## Purpose

Automatically detects when the user is correcting Claude and logs it to enable continuous self-learning across ALL domains, not just anti-bloat violations.

## When to Use

Claude automatically invokes this skill when:
- User corrects a decision or action Claude made
- User says phrases like "actually...", "no...", "instead...", "that's wrong...", "don't do that..."
- User asks to undo/redo something differently
- User provides contradictory instructions after Claude acts
- User expresses frustration about repeated mistakes

## Correction Detection Patterns

### Explicit Correction Phrases
- "Actually, [correction]"
- "No, you should [correction]"
- "That's wrong, [correction]"
- "Don't [what Claude did], instead [correction]"
- "Why did you [Claude's action]? I wanted [correction]"
- "Stop doing [pattern], always [correction]"

### Implicit Correction Patterns
- User undoes Claude's work and does it differently
- User asks Claude to revert and try a different approach
- User points out that Claude violated a previous instruction
- User says "I told you before..." or "Remember when I said..."

### Frustration Indicators (High Priority)
- "Again?"
- "You keep doing this"
- "How many times..."
- "I've told you this before"
- Multiple corrections on the same topic in one session

## Logging Workflow

When a correction is detected:

### Step 1: Identify the Correction
- **What Claude did wrong**: Specific action or decision
- **User's correction**: What they said or how they fixed it
- **Domain**: Code structure, testing, architecture, naming, tool usage, git workflow, etc.
- **Context**: What task was being performed

### Step 2: Check for Existing Pattern
Read `.claude/memory/learnings/user-corrections.md` and check:
- Has this type of correction happened before?
- What's the current frequency counter for this pattern?

### Step 3: Log the Correction
Append to `.claude/memory/learnings/user-corrections.md` using this format:

```markdown
## [YYYY-MM-DD HH:MM] Correction: [Brief Title]

**Context**: [What task was being performed]
**What Claude did wrong**: [Specific mistake made]
**User correction**: [Exact correction provided]
**Domain**: [e.g., Testing workflow, File naming, Architecture, etc.]
**Root cause**: [Why the mistake happened - be honest]
**Prevention**: [How to avoid in future]
**Related rule**: [Link to memory/command/skill if applicable]

**Status**: New
**Frequency counter**: [1, 2, 3, etc. - check history for similar corrections]

---
```

### Step 4: Check Thresholds and Notify

**After logging, check frequency:**

- **1st-2nd occurrence**: Log silently, no notification
- **3rd occurrence**:
  ```
  ⚠️ PATTERN DETECTED: This type of correction has occurred 3 times.

  I've moved it to `.claude/memory/learnings/common-patterns.md` for consolidation.

  Pattern: [Brief description]
  Frequency: 3

  I'll be more careful about this going forward.
  ```

- **5th occurrence**:
  ```
  🚨 FREQUENT PATTERN: This correction has occurred 5 times.

  Pattern: [Brief description]
  Frequency: 5

  This should probably become an automated skill. Please run `/ratchet` to:
  1. Review this pattern in detail
  2. Propose automated skill creation
  3. Get recommendations for permanent fixes

  I apologize for this recurring issue. Let's automate it so I don't make this mistake again.
  ```

### Step 5: Update common-patterns.md (if threshold met)

**At 3rd occurrence**, also append to `.claude/memory/learnings/common-patterns.md`:

```markdown
## Pattern: [Pattern Name] [Frequency: 3+]

**Issue**: [Brief description of what keeps going wrong]
**Examples**:
- [First occurrence - date and context]
- [Second occurrence - date and context]
- [Third occurrence - date and context]

**Rule**: [Clear guideline to prevent issue]
**Detection**: [How to identify when pattern applies]
**Prevention**: [Specific action Claude should take]
**Related**: [Link to agent, skill, or memory section]

**Status**: Monitoring (consolidate at 5+ or next /ratchet)
**Last updated**: YYYY-MM-DD
**Frequency**: 3

---
```

## Examples of Corrections to Track

### Code Structure
- "Don't create new files, edit existing ones" (anti-bloat)
- "Always use functional components, not class components"
- "Put types in types.ts, not inline"

### Testing
- "Write implementation first, tests after" (workflow)
- "Use describe/it blocks, not test() function"
- "Mock at the module level, not inline"

### Architecture
- "Services should not call other services directly"
- "Use dependency injection for all external dependencies"
- "Keep business logic out of controllers"

### Naming
- "Use camelCase for variables, PascalCase for types"
- "Prefix interfaces with 'I'"
- "Suffix test files with .test.ts not .spec.ts"

### Tool Usage
- "Use pnpm, not npm"
- "Run tests in affected package only, not whole repo"
- "Don't use --no-verify on commits"

### Git Workflow
- "Create feature branches, don't commit to main"
- "Write detailed commit messages, not one-liners"
- "Squash commits before merging"

## Anti-Patterns to Avoid

### ❌ Don't Track
- User asking questions (not corrections)
- User requesting new features (not fixing mistakes)
- Normal clarifications or iterations
- User preferences that vary by context

### ✅ Do Track
- User correcting a mistake Claude made
- User asking Claude to stop doing something
- User expressing frustration about repeated issues
- User reminding Claude of previous instructions

## Integration with /ratchet

When user runs `/ratchet`, the command will:
1. Read all corrections from user-corrections.md
2. Analyze patterns in common-patterns.md
3. Identify patterns with 5+ occurrences
4. Propose skill creation for automation
5. Suggest consolidation into core memory for critical patterns

## Remember

**This skill is about learning from ALL mistakes, not just code bloat.**

Categories of corrections to track:
- Code quality and structure
- Testing and quality assurance
- Architecture and design patterns
- Naming conventions and code style
- Tool and command usage
- Git workflow and commit practices
- File organization and modularity
- Error handling and edge cases
- Performance optimization
- Security practices

**When in doubt: Log it. The frequency counter will tell us if it's a pattern.**
