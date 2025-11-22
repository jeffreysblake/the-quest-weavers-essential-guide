---
description: Comprehensive code review checklist before marking work complete
---

# Code Review

Perform a thorough code review of the recent changes. Check ALL of the following:

## Code Quality
- [ ] All files are under 600 lines (if not, suggest refactoring)
- [ ] No code duplication (search for similar patterns)
- [ ] Functions have single, clear responsibilities
- [ ] Variable and function names are descriptive
- [ ] Complex logic has explanatory comments
- [ ] Error handling is comprehensive with context

## Testing
- [ ] All new code has tests
- [ ] All modified code has updated tests
- [ ] Tests are co-located with implementation
- [ ] Test coverage is at least 80% for changed code
- [ ] All tests pass (run the test suite)
- [ ] Edge cases are tested

## Code Standards
- [ ] Linting passes with no errors
- [ ] Code formatting is consistent
- [ ] Follows project coding conventions
- [ ] No console.logs or debug code left behind
- [ ] No commented-out code blocks
- [ ] Imports are organized and necessary

## Architecture
- [ ] Code fits well into existing architecture
- [ ] No new patterns introduced without justification
- [ ] Dependencies are minimal and justified
- [ ] No circular dependencies
- [ ] Proper separation of concerns

## Documentation
- [ ] Inline documentation for complex logic
- [ ] Updated relevant documentation files
- [ ] API changes are documented
- [ ] Breaking changes are clearly noted

## Security & Performance
- [ ] No security vulnerabilities (SQL injection, XSS, etc.)
- [ ] No performance anti-patterns
- [ ] No memory leaks
- [ ] Proper resource cleanup

## Git
- [ ] Commit message is clear and descriptive
- [ ] Changes are focused and atomic
- [ ] No unrelated changes included

For each item that fails, provide specific recommendations for improvement.
