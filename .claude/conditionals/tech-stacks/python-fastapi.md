---
name: python-fastapi
detection:
  files: ["requirements.txt", "pyproject.toml"]
  dependencies: ["fastapi"]
core_templates:
  - best_practices/python/_quality-tools.md
  - best_practices/python/fastapi.md
  - best_practices/python/pytest.md
conditional_templates:
  sqlalchemy: best_practices/python/sqlalchemy.md
  redis: best_practices/python/redis.md
  alembic: best_practices/python/alembic.md
  celery: best_practices/python/celery.md
  pydantic-settings: best_practices/python/pydantic-settings.md
inject_into:
  - CODE.md
---

# Python/FastAPI Tech Stack

This conditional is triggered when:
- `requirements.txt` OR `pyproject.toml` exists
- Contains dependency: `fastapi`

## Core Templates (Always Loaded)

1. **`_quality-tools.md`** - black, isort, mypy, flake8, pytest configuration
2. **`fastapi.md`** - Dependency injection, Pydantic models, route handlers, service layer
3. **`pytest.md`** - Testing patterns, fixtures, coverage requirements

## Conditional Templates (Loaded if Detected)

| Dependency | Template | Description |
|------------|----------|-------------|
| `sqlalchemy` | `sqlalchemy.md` | ORM patterns, session management, relationships |
| `redis` | `redis.md` | Caching patterns with redis-py |
| `alembic` | `alembic.md` | Database migration patterns |
| `celery` | `celery.md` | Background task patterns |
| `pydantic-settings` | `pydantic-settings.md` | Configuration management |

## Version Considerations

- **FastAPI 0.100+**: Uses Pydantic v2 (breaking changes from v1)
- **Python 3.11+**: Native tomllib, exception groups, Self type hints
- **Python 3.12+**: Type parameter syntax, override decorator
