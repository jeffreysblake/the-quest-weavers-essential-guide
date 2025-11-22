---
description: Initialize a new project with best practices and complete configuration
---

# Project Initialization

Initialize the project with complete Claude Code setup and best practices.

## Project Type
$ARGUMENTS (e.g., "node", "python", "react", "vue", "general")

## Initialization Steps

### 1. Detect or Create Project Structure
- Identify existing project type and structure
- Detect package managers (npm, yarn, pnpm, poetry, etc.)
- Find configuration files
- Identify testing frameworks
- Detect linting/formatting tools

### 2. Update CLAUDE.md with Project Context
Fill in the project-specific sections:
- Technology stack details
- Key commands (test, build, lint, dev server)
- Architecture overview
- Directory structure
- Coding conventions
- Import/export patterns
- State management approach

### 3. Create/Update Configuration Files
- Add or verify .gitignore entries
- Configure linters (eslint, pylint, etc.)
- Configure formatters (prettier, black, etc.)
- Set up test coverage reporting
- Configure pre-commit hooks if needed

### 4. Set Up Testing Infrastructure
- Verify test framework is configured
- Create test utilities and helpers
- Set up test coverage tracking
- Create example tests if none exist
- Configure test scripts in package.json

### 5. Create Standard Scripts
Add standard commands:
- `test` - Run test suite
- `test:coverage` - Run tests with coverage
- `test:watch` - Run tests in watch mode
- `lint` - Run linter
- `lint:fix` - Auto-fix linting issues
- `format` - Format code
- `build` - Build project
- `dev` - Development server

### 6. Analyze Existing Code
- Check file sizes (identify files near 600 lines)
- Analyze test coverage
- Identify code duplication opportunities
- Find files without tests
- Check for linting issues

### 7. Create Development Baseline
- Document current state
- Create technical debt log if issues found
- Set up improvement priorities
- Create action items for gaps

## Output

Generate a complete project report:

```
Project Initialization Complete
================================

Technology Stack:
- Language: [detected language(s)]
- Framework: [detected framework(s)]
- Package Manager: [npm/yarn/pnpm/etc.]
- Test Framework: [jest/pytest/etc.]
- Linter: [eslint/pylint/etc.]
- Formatter: [prettier/black/etc.]

Project Structure:
- Source: [src directory]
- Tests: [test directory]
- Config: [config files]
- Build: [build directory]

Key Commands:
- Install: [command]
- Test: [command]
- Lint: [command]
- Build: [command]
- Dev: [command]

Current State Assessment:
- Total files: [count]
- Files over 600 lines: [count and list]
- Files without tests: [count and list]
- Test coverage: [percentage]
- Linting issues: [count]

Recommended Actions:
1. [Action item 1]
2. [Action item 2]
...

Next Steps:
- Run /review to check current code quality
- Run /consolidate to find duplicate code
- Run /test to add missing tests
- Run /check-coverage to improve coverage
```

## Post-Initialization

After initialization:
1. Run full test suite
2. Run linters
3. Check test coverage
4. Create baseline metrics
5. Set up any missing development tools
6. Verify all scripts work correctly

The project is now ready for development with:
- Complete CLAUDE.md configuration
- Quality enforcement tools
- Testing infrastructure
- Clear development commands
- Baseline metrics for tracking improvement
