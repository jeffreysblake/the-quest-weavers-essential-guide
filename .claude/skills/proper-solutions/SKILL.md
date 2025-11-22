---
name: proper-solutions
description: Ensure proper, complete solutions instead of quick fixes, workarounds, or temporary hacks. Enforce production-quality code from the start. Use when tempted to suggest shortcuts or temporary solutions.
---

# Proper Solutions Skill: Do It Right The First Time

This skill ensures production-quality solutions instead of shortcuts and workarounds.

## Core Principle

**There is no such thing as a temporary solution.**
**Workarounds become permanent.**
**Quick fixes create technical debt.**
**Do it right the first time.**

## The Workaround Trap

What starts as:
- "Quick fix for now..."
- "Temporary workaround..."
- "We can improve this later..."

Becomes:
- Permanent production code
- Technical debt nobody fixes
- Source of future bugs
- Maintenance nightmare

## Forbidden Shortcuts

### 🚫 Never Suggest:

**Temporary Patches:**
- "Quick fix for now, we'll do it properly later"
- "Temporary workaround while we figure out the real solution"
- "Patch this and we'll refactor later"
- Later never comes. Do it right now.

**Partial Solutions:**
- "This handles the main case, you can add edge cases"
- "This works for simple inputs..."
- "For complex scenarios, you'll need to..."
- Handle ALL cases now, not just easy ones.

**Manual Steps:**
- "You can manually run this command..."
- "Just update this file by hand..."
- "Manually copy these files..."
- Automate it now, don't defer to user.

**Config Hacks:**
- "Just change this environment variable..."
- "Temporarily disable this check..."
- "Comment out this validation..."
- Find the real solution, don't hack config.

**Dependency Workarounds:**
- "Use an older version to avoid the issue..."
- "Pin this dep to bypass the error..."
- "Install this package globally to fix it..."
- Fix compatibility properly, don't pin problems.

**Test Shortcuts:**
- "Skip tests for now, we'll add them later"
- "This is tested enough..."
- "Manual testing is fine for this..."
- Tests are not optional. Write them now.

## The Proper Solution Approach

### When Facing a Problem

**DON'T:**
1. Look for the quickest workaround
2. Find a hack that makes it "work"
3. Suggest temporary measures
4. Defer proper solution to "later"

**DO:**
1. Understand the root cause fully
2. Design a complete, proper solution
3. Implement it correctly
4. Test thoroughly
5. Document why this is the right approach

### Decision Matrix

Ask: "Is this the solution I'd want in production?"

**If NO:**
- Don't suggest it
- Don't implement it
- Find the proper solution

**If YES:**
- Implement it fully
- Test it thoroughly
- Document it well

## Production-Quality Checklist

**Every solution must:**
- [ ] Solve the complete problem (not partial)
- [ ] Handle all cases (not just main case)
- [ ] Include error handling
- [ ] Have comprehensive tests
- [ ] Be maintainable and clear
- [ ] Follow project conventions
- [ ] Be properly documented
- [ ] Work in all environments
- [ ] Have no known limitations
- [ ] Be something you'd be proud to show

## Examples

### ❌ Bad: Quick Fix
```javascript
// WRONG: Quick workaround
function processData(data) {
  // FIXME: This is a temporary hack
  if (data.type === 'special') {
    return data.value * 2; // Magic number!
  }
  return processNormally(data);
}

// What's wrong:
// - Magic number with no explanation
// - "Temporary" hack that becomes permanent
// - No tests for special case
// - No proper error handling
```

### ✅ Good: Proper Solution
```javascript
// RIGHT: Complete, proper implementation
const SPECIAL_TYPE_MULTIPLIER = 2;

function processData(data) {
  validateData(data);

  if (data.type === DATA_TYPES.SPECIAL) {
    return applySpecialProcessing(data);
  }

  return processStandardData(data);
}

function applySpecialProcessing(data) {
  // Special type requires double value per business rule #123
  return data.value * SPECIAL_TYPE_MULTIPLIER;
}

// Proper because:
// - Named constant explains the "why"
// - Validation included
// - Extracted special logic
// - Documented business reason
// - (Tests would be alongside this)
```

### ❌ Bad: Partial Solution
```python
# WRONG: Only handles happy path
def fetch_user(user_id):
    response = requests.get(f"/api/users/{user_id}")
    return response.json()

# What's missing:
# - No error handling
# - No timeout
# - No retry logic
# - No validation
# - No logging
```

### ✅ Good: Complete Solution
```python
# RIGHT: Production-ready implementation
def fetch_user(user_id: int) -> Optional[User]:
    """
    Fetch user by ID from API.

    Returns User object or None if not found.
    Raises APIError for server errors.
    """
    validate_user_id(user_id)

    try:
        response = requests.get(
            f"{API_BASE}/users/{user_id}",
            timeout=API_TIMEOUT,
            headers=get_auth_headers()
        )
        response.raise_for_status()

        data = response.json()
        return User.from_dict(data)

    except requests.Timeout:
        logger.error(f"Timeout fetching user {user_id}")
        raise APIError("User fetch timeout")

    except requests.HTTPError as e:
        if e.response.status_code == 404:
            return None
        logger.error(f"HTTP error fetching user {user_id}: {e}")
        raise APIError(f"Failed to fetch user: {e}")

    except ValueError as e:
        logger.error(f"Invalid JSON for user {user_id}: {e}")
        raise APIError("Invalid user data")

# Complete because:
# - Full error handling
# - Proper timeouts
# - Logging
# - Type hints
# - Documentation
# - Returns or raises consistently
```

### ❌ Bad: Manual Workaround
```
"To fix this, you'll need to:
1. Manually edit config.json
2. Add the missing field
3. Restart the server
4. Run the migration script
5. Manually verify it worked"

# WRONG! This should be automated!
```

### ✅ Good: Automated Solution
```python
# RIGHT: Automated migration
def migrate_config():
    """Automatically update config with required fields."""
    config_path = Path("config.json")

    with config_path.open() as f:
        config = json.load(f)

    # Add missing fields with defaults
    if 'newField' not in config:
        config['newField'] = get_default_value()
        logger.info("Added missing newField to config")

    # Validate config structure
    validate_config(config)

    # Write back atomically
    write_config_atomic(config_path, config)

    logger.info("Config migration complete")
    return config

# Then use it:
migrate_config()
restart_server()
run_migrations()
verify_migration()

# Automated, repeatable, testable!
```

## Quality Questions

Before implementing ANY solution, ask:

1. **Is this production-ready?**
   - Would I deploy this to production?
   - Would I be comfortable supporting this?
   - Is this something I'm proud of?

2. **Is this complete?**
   - Handles all cases, not just main case?
   - Includes error handling?
   - Has tests?
   - Is documented?

3. **Is this maintainable?**
   - Would someone else understand this?
   - Is it clear why it works this way?
   - Can it be modified safely?
   - Follows project conventions?

4. **Am I cutting corners?**
   - Skipping tests "for now"?
   - Deferring edge cases?
   - Using magic numbers?
   - Adding TODOs instead of finishing?

5. **Would this pass code review?**
   - Meets coding standards?
   - Has proper tests?
   - Well documented?
   - No obvious improvements needed?

## The "Later" Lie

**These phrases mean "never":**
- "We'll refactor this later"
- "I'll add tests later"
- "Improve this in a future PR"
- "TODO: Make this better"

**Do it now, or it won't get done.**

## Acceptable Temporary Measures

**The ONLY time temporary solutions are acceptable:**

1. **Explicitly requested by user**
   - User says "Just get it working, we'll fix it later"
   - Document it clearly as temporary
   - Create tracking issue for proper fix

2. **Genuine unknowns requiring research**
   - Don't know the right approach yet
   - Need to prototype to learn
   - Document what needs investigation

3. **Blocked by external factors**
   - Waiting on API changes
   - Dependency bug being fixed
   - Third-party service limitation
   - Document the blocking issue

**In ALL cases:**
- Document why it's temporary
- Create issue to track proper fix
- Set reminder to revisit
- Make temporary nature obvious in code

## Production Code Standards

**Every line of code should:**
- Be clear and maintainable
- Handle errors gracefully
- Be thoroughly tested
- Follow conventions
- Be documented where complex
- Work in all scenarios
- Be performance-appropriate
- Be security-conscious

**No exceptions. No shortcuts. No "later".**

## Self-Enforcement

**Before suggesting ANY solution, ask:**
- [ ] Is this the proper, complete solution?
- [ ] Does it handle all cases?
- [ ] Is it fully tested?
- [ ] Is it production-ready?
- [ ] Would I be proud to have written this?
- [ ] Am I avoiding this because it's hard?
- [ ] Am I suggesting shortcuts to save time?

**If you answered "no" to any: Find the proper solution.**

Remember: **Quick fixes cost more in the long run. Do it right the first time. There is no "later".**
