---
name: testing-focus
type: context
templates:
  - best_practices/python/pytest.md
  - best_practices/typescript/vitest.md
inject_into:
  - CODE.md
temporary: true
---

# Testing-Focus Context

Load this context when you're focusing on testing tasks.

## When to Use

- Writing new test suites
- Improving test coverage
- Debugging failing tests
- Refactoring tests
- Setting up test infrastructure

## What Gets Loaded

This context temporarily loads testing-specific best practices:

### Python Testing
- pytest patterns and fixtures
- Coverage requirements and strategies
- Test structure and organization

### TypeScript Testing
- Vitest/Jest testing patterns
- React Testing Library patterns
- Component test strategies

## Usage

```bash
# Load testing context
/context:testing

# Your testing work here...

# Clear when done
/context:clear
```

## Notes

This context is **temporary** and will be automatically removed:
- When you run `/context:clear`
- At the end of your Claude Code session
