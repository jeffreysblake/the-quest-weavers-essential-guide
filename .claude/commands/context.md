# /context - Temporary Context Loading

Temporarily loads context-specific best practice templates without modifying the permanent stack configuration.

## What This Does

1. **Loads temporary templates** from `.claude/conditionals/contexts/` based on context name

2. **Injects into session memory** (not CODE.md):
   - Templates are loaded into current session context
   - Does NOT modify CODE.md or loaded_templates.md
   - Auto-expires at session end or when cleared

3. **Useful for focused work**:
   - Testing: Load testing patterns temporarily
   - Security: Load security audit patterns
   - Performance: Load optimization patterns
   - Refactoring: Load refactoring strategies

## Available Contexts

Run `/context:list` to see all available contexts:

**Current Contexts:**
- `testing` - Testing patterns (pytest, vitest, Test-Driven Development)
- `security` - Security audit patterns (planned)
- `performance` - Performance optimization patterns (planned)
- `refactoring` - Refactoring strategies (planned)

## Usage

### Load a Context

```bash
/context:testing
```

### List Available Contexts

```bash
/context:list
```

### Clear Current Context

```bash
/context:clear
```

### Show Current Context

```bash
/context:show
```

## Example Usage

### Scenario 1: Focus on Testing

```
User: /context:testing
Claude: Loading temporary context: testing

Reading context conditional...
✅ Matched: .claude/conditionals/contexts/testing-focus.md

Templates to load:
  - .claude/best_practices/python/pytest.md
  - .claude/best_practices/typescript/vitest.md

Loading into session memory...
✅ Testing patterns loaded (temporary)

This context will:
- NOT modify CODE.md
- NOT modify loaded_templates.md
- Auto-clear at session end or on /context:clear

Focus areas now available:
- Test structure and organization
- Fixture patterns
- Mocking strategies
- Coverage requirements
- Testing Library best practices

Ready to work on tests!
```

### Scenario 2: List Contexts

```
User: /context:list
Claude: Available Contexts:

1. testing
   Description: Load testing-focused patterns for pytest and vitest
   Templates: pytest.md, vitest.md
   Best for: Writing tests, TDD, test refactoring

2. security (planned)
   Description: Security audit and vulnerability patterns
   Templates: security.md, owasp.md
   Best for: Security reviews, penetration testing prep

3. performance (planned)
   Description: Performance optimization patterns
   Templates: performance.md, profiling.md
   Best for: Performance tuning, optimization work

4. refactoring (planned)
   Description: Code refactoring strategies
   Templates: refactoring.md, design-patterns.md
   Best for: Large-scale refactoring, code quality improvements

Use: /context:<name> to load a context
```

### Scenario 3: Clear Context

```
User: /context:clear
Claude: Clearing temporary context...
✅ Context cleared

Removed from session memory:
  - pytest.md patterns
  - vitest.md patterns

Your permanent stack configuration (loaded_templates.md) is unchanged.
```

## Context Conditional Format

Context conditionals live in `.claude/conditionals/contexts/`:

```yaml
---
name: testing-focus
type: context
temporary: true
templates:
  - best_practices/python/pytest.md
  - best_practices/typescript/vitest.md
description: Load testing patterns temporarily for test-focused work
---

# Testing Focus Context

This context loads testing patterns temporarily...
```

## How It Differs from /setup-stack

| Aspect | /setup-stack | /context |
|--------|--------------|----------|
| **Permanence** | Permanent (modifies CODE.md) | Temporary (session only) |
| **State Tracking** | Updates loaded_templates.md | No state tracking |
| **When to Use** | Stack changes | Focused work sessions |
| **Auto-Clear** | Never (manual update required) | Session end or /context:clear |
| **Modifies Files** | Yes (CODE.md, loaded_templates.md) | No |

## Use Cases

### Testing Session
```bash
# Load testing context
/context:testing

# Write tests with testing patterns in context
# ... work on tests ...

# Clear when done
/context:clear
```

### Security Audit
```bash
# Load security context
/context:security

# Perform security audit with OWASP patterns
# ... audit code ...

# Clear when done
/context:clear
```

### Performance Optimization
```bash
# Load performance context
/context:performance

# Optimize with profiling patterns
# ... optimize code ...

# Clear when done
/context:clear
```

## Creating New Context Conditionals

1. Create file in `.claude/conditionals/contexts/`:

```yaml
---
name: performance-opt
type: context
temporary: true
templates:
  - best_practices/python/performance.md
  - best_practices/typescript/performance.md
description: Performance optimization patterns
---

# Performance Optimization Context

Load performance patterns temporarily...
```

2. Create corresponding templates in `.claude/best_practices/`:
   - `python/performance.md`
   - `typescript/performance.md`

3. Update `.claude/conditionals/_index.md` to list the new context

4. Test with `/context:performance-opt`

## Flags (Optional)

- **`--list`**: Show all available contexts (same as `/context:list`)
- **`--clear`**: Clear current context (same as `/context:clear`)
- **`--show`**: Show currently loaded context (same as `/context:show`)

## Related Commands

- `/setup-stack` - Permanent stack configuration
- `/update-practices` - Update permanent stack templates
- `/context:clear` - Clear temporary context

## Related Files

- `.claude/conditionals/contexts/*.md` - Context conditional definitions
- `.claude/best_practices/**/*.md` - Template files
- `.claude/conditionals/_index.md` - List of all conditionals

## Troubleshooting

**Context not loading?**
- Check `.claude/conditionals/contexts/` for context file
- Verify templates exist in `.claude/best_practices/`
- Use `/context:list` to see available contexts

**Want permanent loading?**
- Use `/setup-stack` instead
- Add templates to conditional's `conditional_templates` section
- Add dependency to project files (package.json, requirements.txt)

**Context persisting across sessions?**
- Contexts are session-only by design
- Use `/context:clear` to clear immediately
- For permanent loading, use `/setup-stack`
