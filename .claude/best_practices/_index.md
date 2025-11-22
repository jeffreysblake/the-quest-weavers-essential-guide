# Best Practices Index

This directory contains modular best practice templates for different technologies and frameworks.

## Purpose

These files are **NOT loaded directly** during normal Claude Code sessions. Instead:

1. `/setup-stack` scans your project to detect technologies
2. Reads relevant best practice files (with frontmatter for metadata)
3. **Extracts content** (strips frontmatter)
4. **Injects** clean content into `CODE.md`
5. Your sessions read the lean `CODE.md` (no frontmatter bloat)

## Structure

```
best_practices/
├── python/          # Python ecosystem
├── typescript/      # TypeScript/JavaScript ecosystem
├── java/            # Java ecosystem (placeholder)
├── go/              # Go ecosystem (placeholder)
└── _index.md        # This file
```

## Available Templates

### Python Stack (6 templates)

| Template | Dependencies | Description |
|----------|--------------|-------------|
| `_quality-tools.md` | black, isort, mypy, flake8, pytest | Code formatters, linters, type checkers |
| `fastapi.md` | fastapi>=0.100 | Dependency injection, Pydantic models, routes, services |
| `pydantic.md` | pydantic>=2.0 | Schema validation, field validators, Pydantic v2 patterns |
| `pytest.md` | pytest, pytest-cov | Testing patterns, fixtures, coverage strategies |
| `security.md` | passlib, python-jose | Password hashing (bcrypt), JWT tokens |
| `sqlalchemy.md` | sqlalchemy>=2.0 | ORM patterns, sessions, relationships, queries |

### TypeScript Stack (6 templates)

| Template | Dependencies | Description |
|----------|--------------|-------------|
| `_quality-tools.md` | typescript, eslint, prettier | TypeScript config, ESLint, Prettier |
| `react.md` | react | Component patterns, custom hooks, API clients |
| `express.md` | express | Routes, controllers, middleware, error handling |
| `vitest.md` | vitest, @testing-library/react | Vitest testing patterns, mocking, Testing Library |
| `zod.md` | zod | Runtime type validation, API validation, forms |
| `tanstack-query.md` | @tanstack/react-query | Data fetching, caching, mutations, optimistic updates |

### Java Stack (0 templates)

*Placeholder - contributions welcome!*

### Go Stack (0 templates)

*Placeholder - contributions welcome!*

## Adding New Templates

1. Create file in appropriate directory (e.g., `python/redis.md`)
2. Add minimal frontmatter:
   ```yaml
   ---
   name: redis
   requires_deps: ["redis"]
   optional_deps: ["redis-py"]
   ---
   ```
3. Write clean content (will be extracted)
4. Update conditional in `.claude/conditionals/tech-stacks/` to reference it
5. Update this index

## File Naming Conventions

- **`_quality-tools.md`**: Language-wide tooling (prefix with `_`)
- **`framework.md`**: Main framework patterns (e.g., `fastapi.md`, `react.md`)
- **`library.md`**: Specific library patterns (e.g., `pytest.md`, `zod.md`)

## See Also

- **Conditionals**: `.claude/conditionals/_index.md` - Tech stack detection rules
- **Setup**: Run `/setup-stack` to auto-detect and load templates
- **Update**: Run `/update-practices` to check for new dependencies
