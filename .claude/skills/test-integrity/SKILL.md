---
name: test-integrity
description: Prevent modifying tests to match incorrect behavior instead of fixing the code. Ensure tests verify correct behavior, not just make the test suite pass. Use when tests fail or when implementing new features.
---

# Test Integrity Skill: Tests Define Truth

This skill ensures tests maintain their integrity as specifications of correct behavior.

## Core Principle

**Tests should fail when behavior is wrong.**
**Fix the code, not the tests.**

## Anti-Patterns to Prevent

### 🚫 Test Manipulation Red Flags

**Forbidden Actions:**
1. **Changing test assertions to match buggy output**
   - "The test expects X but gets Y, so I'll change the test to expect Y"
   - WRONG! Fix the code to produce X!

2. **Justifying incorrect behavior in tests**
   - "This is actually how it should work anyway"
   - If that's true, discuss with user first. Don't assume.

3. **Making tests less strict to pass**
   - Removing assertions
   - Making exact matches into partial matches without justification
   - Accepting error states as success

4. **Writing tests after the code to match what it does**
   - Tests should define what SHOULD happen
   - Not document what DOES happen (unless that's intentional)

5. **Skipping or disabling failing tests**
   - `.skip()`, `.todo()`, `xit()` without explicit user approval
   - Commenting out test cases

## The Correct Workflow

### Test-Driven Development (TDD)

**Ideal Flow:**
1. **Write test first** - Define expected behavior
2. **Watch it fail** - Verify test catches the missing/wrong behavior
3. **Implement code** - Make the test pass
4. **Verify test passes** - Confirm correct implementation
5. **Refactor** - Improve code while keeping tests green

### When Tests Fail

**Proper Response:**
1. **Read the failure message completely**
   - What was expected?
   - What was actually received?
   - Why is there a difference?

2. **Determine root cause**
   - Is the test expectation correct?
   - Is the implementation wrong?
   - Is there a misunderstanding of requirements?

3. **Fix the RIGHT thing**
   - If behavior is wrong → Fix the code
   - If test is wrong → Verify with user first
   - If requirement changed → Document why

4. **Verify the fix**
   - Test now passes
   - Other tests still pass
   - Behavior is actually correct (not just passing)

### When to Actually Modify Tests

**Valid Reasons:**
- ✅ Requirements changed (documented)
- ✅ Test had incorrect expectations (confirmed with user)
- ✅ Test was too strict/brittle (with justification)
- ✅ Refactoring internals (behavior unchanged)
- ✅ Improving test quality (better coverage, clearer assertions)

**Invalid Reasons:**
- ❌ Test fails and changing it is easier
- ❌ "This is probably what it should do anyway"
- ❌ Making code work is hard
- ❌ Don't understand why test expects X

## Examples

### ❌ Bad: Test Manipulation
```javascript
// Test expects: "Hello, World!"
// Code returns: "Hello World" (missing comma)

// WRONG APPROACH:
test('greeting', () => {
  expect(greet()).toBe("Hello World") // Changed expectation!
})

// RIGHT APPROACH:
function greet() {
  return "Hello, World!" // Fixed the code!
}
```

### ❌ Bad: Justifying Wrong Behavior
```python
# Test fails because function returns None on error
# Instead of empty list as expected

# WRONG:
def test_get_items():
    # Actually, returning None on error makes sense
    assert get_items() is None  # Changed assertion!

# RIGHT:
def get_items():
    try:
        return fetch_items()
    except Exception:
        return []  # Fixed to match specification!
```

### ✅ Good: Fixing Code
```javascript
// Test fails: expected "2025-01-15" but got "15-01-2025"

// WRONG: Change test to expect "15-01-2025"
// RIGHT: Fix the date formatting function

function formatDate(date) {
  // Fixed to return ISO format as test specifies
  return date.toISOString().split('T')[0]
}
```

### ✅ Good: Valid Test Update
```python
# Requirements changed after discussion with user
# Old: Maximum length was 100
# New: Maximum length is 255

def test_validate_input():
    # Updated after requirement change (documented in ticket #123)
    long_input = "x" * 255
    assert validate_input(long_input) == True

    too_long = "x" * 256
    assert validate_input(too_long) == False
```

## Self-Check Questions

Before modifying ANY test, ask:

1. **Why is this test failing?**
   - What behavior does it expect?
   - What behavior is the code producing?
   - Which one is correct?

2. **Am I changing the test because:**
   - ✅ Requirements changed? (Document it!)
   - ✅ Test was incorrect? (Verify with user!)
   - ❌ It's easier than fixing code? (STOP!)
   - ❌ I don't understand it? (Investigate more!)

3. **Have I tried fixing the code first?**
   - If no: Do that first!
   - If yes and it's impossible: Document why!

4. **Will this change make tests weaker?**
   - Fewer assertions = weaker
   - Less specific assertions = weaker
   - If yes: Justify thoroughly!

5. **Would this pass code review?**
   - Can I explain why I changed the test?
   - Would reviewers agree?
   - Is it documented?

## Red Alert Scenarios

**STOP IMMEDIATELY if you find yourself:**

1. **Changing multiple test assertions to make them pass**
   - This is almost always wrong
   - Fix the code instead

2. **Rationalizing why wrong behavior is actually fine**
   - "Actually, returning null makes sense here..."
   - Verify with user first!

3. **Making tests less specific**
   - `expect(x).toBe(42)` → `expect(x).toBeGreaterThan(0)`
   - Why? Tests should be specific!

4. **Removing error case testing**
   - "This error case is unlikely..."
   - Error cases MUST be tested!

## The Test Integrity Promise

**I promise to:**
1. Write tests that specify correct behavior
2. Fix code when tests fail (not tests)
3. Only modify tests with clear justification
4. Verify test changes with user when uncertain
5. Never weaken test coverage
6. Make tests fail when they should fail
7. Treat failing tests as bug reports, not obstacles

**Tests are the specification. The code must match the specification.**

## Workflow Checklist

When a test fails:
- [ ] Read the complete error message
- [ ] Understand what the test expects
- [ ] Understand what the code does
- [ ] Identify the discrepancy
- [ ] Determine which is correct (test or code)
- [ ] Fix the code if it's wrong
- [ ] Only modify test if verified it's wrong
- [ ] Document why if test was modified
- [ ] Verify all tests pass
- [ ] Verify behavior is actually correct

Remember: **Tests are not obstacles to overcome. They are guards preventing bugs from reaching users.**
