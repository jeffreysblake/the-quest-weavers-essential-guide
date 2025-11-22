# TDD Workflow Skill

*Run `/setup-stack` to load language-specific test examples*

---
name: tdd-workflow
description: Enforces Test-Driven Development (TDD) RED-GREEN-REFACTOR cycle. Use when writing tests, implementing features, or when user mentions TDD, testing, or test-first development. Automatically ensures tests are written BEFORE implementation code.
---

## Purpose

Enforces strict Test-Driven Development (TDD) workflow: RED-GREEN-REFACTOR cycle.

## When to Use

Claude automatically invokes this skill when:
- User asks to "write tests" or "implement feature"
- User mentions "TDD", "test-first", or "test-driven"
- Starting implementation of any new feature
- Adding functionality to existing code

## RED-GREEN-REFACTOR Cycle

### 🔴 RED: Write Failing Tests First

**Step 1: Write unit tests BEFORE any implementation**

The tests should fail initially because the code doesn't exist yet.

**Verification**: Run tests → **MUST FAIL** (expected behavior)

### 🟢 GREEN: Write Minimal Implementation

**Step 2: Write ONLY enough code to make tests pass**

Don't over-engineer or add features not covered by tests.

**Verification**: Run tests → **MUST PASS**

### 🔨 REFACTOR: Clean Up Code

**Step 3: Refactor for quality (if needed)**
- Extract duplicates
- Improve naming
- Add type hints/annotations
- Optimize performance

**Verification**: Run tests → **MUST STILL PASS**

## TDD Checklist

Before starting ANY feature:

- [ ] Write unit tests FIRST (before implementation)
- [ ] Run tests → verify they FAIL (red)
- [ ] Write minimal code to make tests pass
- [ ] Run tests → verify they PASS (green)
- [ ] Run quality checks (linters, type checkers, formatters)
- [ ] Verify coverage meets minimum thresholds
- [ ] Refactor if needed (tests still pass)
- [ ] Manual testing (if applicable)
- [ ] Git commit with tests + implementation together

## Anti-Patterns to Prevent

### ❌ NEVER Do This:
1. Write implementation code before tests
2. Commit code without tests
3. Skip the RED phase (tests must fail first!)
4. Add tests after implementation ("retroactive testing")
5. Skip failing tests to make the suite pass

### ✅ If You Catch Yourself Violating TDD:
1. **STOP immediately**
2. Revert uncommitted implementation
3. Write tests first
4. Watch them fail (RED)
5. Then write implementation
6. Verify tests pass (GREEN)

## Coverage Verification

Run coverage analysis to ensure minimum thresholds are met:
- Backend: ≥{{COVERAGE_BACKEND}}%
- Frontend: ≥{{COVERAGE_FRONTEND}}%

*Run `/setup-stack` to load language-specific coverage commands*

## Integration with Pre-Commit Hook

The pre-commit hook enforces:
- Implementation files must have corresponding test files
- Coverage must meet minimum thresholds
- All tests must pass

**Never bypass with `--no-verify`!**

## Remember

**TDD is not optional in this project. It's a mandatory workflow that:**
- Prevents bugs
- Ensures code quality
- Maintains high test coverage
- Makes refactoring safe
- Documents expected behavior

**When in doubt, follow the cycle: RED → GREEN → REFACTOR**
