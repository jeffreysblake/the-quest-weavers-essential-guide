# Test Guardian Skill

*Run `/setup-stack` to load language-specific test frameworks and patterns*

---
name: test-guardian
description: Ensures tests are written for all new and modified code. Use when creating/modifying features or when user mentions testing. Prompts for test creation after implementation and verifies test coverage exists. (project)
---

## Purpose

Ensures all new and modified code has corresponding tests following a pragmatic test-after-code workflow.

## When to Use

Claude automatically invokes this skill when:
- Creating new source files
- Modifying existing source files
- User asks to "implement feature" or "add functionality"
- User mentions "testing", "tests", or "coverage"

## Test-After-Code Workflow

### 💻 IMPLEMENT: Write the Code First

**Step 1: Solve the problem with implementation**

Write the code that implements the feature, fixes the bug, or solves the user's problem.

**Focus**: Get the implementation working correctly.

### 📝 TEST: Write Tests to Verify

**Step 2: Write comprehensive tests**

After implementation is complete, write tests that:
- Verify the code works as expected
- Cover edge cases and error conditions
- Test integration points
- Match project test conventions

**Verification**: Run tests → **MUST PASS**

### 🧹 VERIFY: Check Coverage and Quality

**Step 3: Ensure quality standards**

- Run linters and type checkers
- Verify test coverage meets project standards
- Ensure tests are maintainable and readable
- Follow upstream project testing patterns

**Verification**: All checks pass → Ready to commit

## Test Guardian Checklist

When creating or modifying code:

- [ ] Implement the feature/fix
- [ ] Write tests for new/modified code
- [ ] Run tests → verify they PASS
- [ ] Check if corresponding test file exists
- [ ] Run quality checks (linters, type checkers)
- [ ] Verify coverage meets project standards (if configured)
- [ ] Manual testing (if applicable)
- [ ] Git commit with implementation + tests

## What to Check

### For New Files:
1. Does a test file exist (e.g., `feature.test.ts` for `feature.ts`)?
2. If not, suggest creating it with test scenarios
3. Run tests for the new file
4. Check coverage if project has standards

### For Modified Files:
1. Do tests exist for this file?
2. If yes, run them to ensure changes didn't break anything
3. If no, suggest adding tests
4. Update tests if behavior changed

### For Monorepos:
1. Identify which workspace package contains the modified file
2. Run tests only in that package: `npm run test -w <package>`
3. Check for cross-package dependencies
4. Warn if changes might affect other packages

## Coverage Guidelines

**Match upstream project standards:**
- Follow existing coverage configuration (vitest, jest, etc.)
- If no thresholds exist, don't enforce arbitrary ones
- Focus on meaningful tests over percentage targets
- Ensure critical paths are well-tested

**For projects without coverage config:**
- Aim for 60%+ as pragmatic baseline for new files
- Cover edge cases and error handling
- Test public APIs thoroughly
- UI components may have lower coverage (acceptable)

## Anti-Patterns to Prevent

### ❌ NEVER Do This:
1. Commit new/modified code without any tests
2. Skip testing because "it's just a small change"
3. Bypass pre-commit hooks with `--no-verify`
4. Ignore test failures or mark tests as `.skip`
5. Write tests that don't actually verify behavior

### ✅ Good Testing Practices:
1. Write tests that verify actual behavior, not implementation details
2. Test edge cases (empty inputs, null, undefined, large values)
3. Test error conditions and error handling
4. Make tests readable and maintainable
5. Follow project testing conventions (factories, fixtures, mocks)

## Monorepo Awareness

For workspaces (npm, yarn, pnpm):
- Detect which package is being modified
- Run tests only in affected workspace
- Load package-specific test utilities
- Respect package-level test frameworks
- Map inter-package dependencies

Example:
```bash
# Instead of running all 341 tests
npm run test

# Run only affected package
npm run test -w packages/cli

# Or specific directory
npm run test -- packages/cli/src/commands
```

## Integration with Pre-Commit Hook

The pre-commit hook provides:
- **Warnings**: Missing tests, file size over 400 lines
- **Blocks**: Test failures, linter errors, upstream violations

**Never bypass with `--no-verify`!**

## Remember

**Testing is essential but pragmatic:**
- Tests verify code correctness
- Tests enable safe refactoring
- Tests document expected behavior
- Tests catch regressions early
- But tests come after understanding the problem

**When in doubt: IMPLEMENT → TEST → VERIFY**
