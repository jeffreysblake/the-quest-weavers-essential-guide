---
description: Find and merge duplicate code patterns into reusable utilities
---

# Code Consolidation

Search for duplicate or similar code patterns and consolidate them.

## Analysis Scope
Target: $ARGUMENTS (or entire codebase if not specified)

## Process

### 1. Identify Duplicates
Search for:
- Identical or near-identical functions
- Similar logic patterns with minor variations
- Repeated utility operations
- Copy-pasted code blocks
- Similar test setups

### 2. Analyze Patterns
For each duplicate found:
- Determine the core functionality
- Identify variations and parameterize them
- Check if existing utilities can be extended
- Assess the refactoring safety and impact

### 3. Create Consolidated Solution
- Extract common logic into reusable utilities
- Parameterize variations
- Choose appropriate location (utils, helpers, shared modules)
- Ensure backward compatibility or update all call sites
- Add comprehensive tests for the new utility

### 4. Refactor Call Sites
- Replace duplicates with calls to consolidated utility
- Verify all tests still pass
- Check that behavior is unchanged
- Update any affected documentation

### 5. Cleanup
- Remove now-unused code
- Update imports
- Verify no files exceed 600 lines after consolidation
- Run linters and formatters

## Common Consolidation Opportunities

**Utility Functions**
- String manipulation (formatting, validation, parsing)
- Date/time operations
- Array/object transformations
- Validation logic
- Error handling patterns

**Component Patterns**
- Similar UI components with slight variations
- Repeated layout structures
- Common hooks or custom hooks
- Shared prop types or interfaces

**Business Logic**
- Calculation formulas
- Data transformations
- API call patterns
- State management operations

**Test Helpers**
- Test data builders
- Mock setups
- Common assertions
- Setup/teardown patterns

## Safety Checks

Before consolidating:
- [ ] All affected code has tests
- [ ] New consolidated utility has comprehensive tests
- [ ] All existing tests still pass
- [ ] No unintended behavior changes
- [ ] Performance is not negatively impacted

After consolidating:
- [ ] Run full test suite
- [ ] Check code coverage hasn't decreased
- [ ] Verify linting passes
- [ ] Review for any introduced coupling

## Output

For each consolidation opportunity:
1. Show the duplicate code locations
2. Explain the proposed consolidated solution
3. Estimate the impact (files changed, tests needed)
4. Implement the consolidation
5. Verify all tests pass
