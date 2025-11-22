# Python Best Practices Index

## Available Templates (6)

### Core Tools

**`_quality-tools.md`**
- **Dependencies**: black, isort, mypy, flake8, pytest
- **Description**: Essential Python quality tooling
- **Contains**:
  - black configuration (line length, target version)
  - isort configuration (black-compatible)
  - mypy configuration (strict mode)
  - flake8 linting rules
  - pytest configuration with coverage
  - Command reference for running each tool

### Web Frameworks

**`fastapi.md`**
- **Dependencies**: fastapi>=0.100
- **Optional**: sqlalchemy, pydantic
- **Description**: FastAPI backend patterns
- **Contains**:
  - Dependency injection patterns
  - Pydantic model definitions
  - Route handler organization
  - Service layer patterns
  - FastAPI-specific best practices

### Data Validation

**`pydantic.md`**
- **Dependencies**: pydantic>=2.0
- **Description**: Pydantic schema validation
- **Contains**:
  - Basic schema definition
  - Field validation with validators
  - Custom field types
  - Model configuration
  - Pydantic V2 migration notes

### Database

**`sqlalchemy.md`**
- **Dependencies**: sqlalchemy>=2.0
- **Optional**: alembic
- **Description**: SQLAlchemy ORM patterns
- **Contains**:
  - Model definition (SQLAlchemy 2.0 style)
  - Session management
  - Query patterns
  - Relationship patterns
  - Alembic migration commands

### Testing

**`pytest.md`**
- **Dependencies**: pytest, pytest-cov
- **Description**: pytest testing patterns
- **Contains**:
  - Test structure and organization
  - Fixture patterns
  - Coverage requirements
  - FastAPI TestClient usage
  - Parametrized tests

### Security

**`security.md`**
- **Dependencies**: passlib, python-jose
- **Description**: Security best practices
- **Contains**:
  - Password hashing with bcrypt
  - JWT token creation and verification
  - Security best practices

## Planned Templates

These could be added as the need arises:

- `alembic.md` - Database migrations
- `redis.md` - Caching patterns with redis-py
- `celery.md` - Background task patterns
- `pydantic-settings.md` - Configuration management
- `httpx.md` - Async HTTP client patterns
- `django.md` - Django framework patterns

## Usage

These templates are automatically loaded when:
1. You run `/setup-stack`
2. Your project has Python dependencies detected
3. The conditional in `.claude/conditionals/tech-stacks/python-fastapi.md` matches

## Adding New Templates

Create a new file following the pattern:

```yaml
---
name: template-name
requires_deps: ["package-name>=version"]
optional_deps: ["optional-package"]
---

# Template Title

Content here (will be extracted and injected into CODE.md)
```

Then update `.claude/conditionals/tech-stacks/python-*.md` to reference it.
