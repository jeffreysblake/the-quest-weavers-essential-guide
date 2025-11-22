---
description: Generate comprehensive tests for new or modified code
---

# Test Generation

Generate comprehensive tests for the specified code: $ARGUMENTS

## Test Requirements

Create tests that:

1. **Cover All Code Paths**
   - Happy path scenarios
   - Edge cases (empty inputs, null, undefined, max values)
   - Error conditions and exception handling
   - Boundary conditions

2. **Follow Testing Best Practices**
   - Tests are independent and can run in any order
   - Use descriptive test names that explain what is being tested
   - Follow AAA pattern: Arrange, Act, Assert
   - Mock external dependencies appropriately
   - Use test data builders for complex objects

3. **Co-locate Tests**
   - Place tests adjacent to the implementation
   - Use the same directory structure
   - Name test files consistently (e.g., `foo.test.js` for `foo.js`)

4. **Verify Behavior, Not Implementation**
   - Test public interfaces, not internal details
   - Focus on behavior and outcomes
   - Avoid brittle tests that break with refactoring

5. **Include Integration Tests Where Appropriate**
   - Test interactions between components
   - Verify end-to-end workflows
   - Test with realistic data

## Test Structure

For each function/component:
- Test name clearly describes the scenario
- Setup is minimal and clear
- One logical assertion per test (or related assertions)
- Teardown/cleanup when needed

## Coverage Goals

Aim for:
- 100% branch coverage
- All error paths tested
- All public methods tested
- Critical business logic thoroughly tested

After generating tests:
1. Run the tests to verify they pass
2. Check code coverage metrics
3. Identify any gaps in coverage
4. Add additional tests for uncovered scenarios
