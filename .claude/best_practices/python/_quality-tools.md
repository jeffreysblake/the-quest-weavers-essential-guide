---
name: python-quality-tools
requires_deps: ["black", "isort", "mypy", "flake8", "pytest"]
---

# Python Code Quality Tools

## Required Tools

- **black**: Code formatting (line length: 100)
- **isort**: Import sorting (compatible with black)
- **mypy**: Static type checking (strict mode)
- **flake8**: Linting
- **pytest**: Testing framework
- **pytest-cov**: Coverage reporting

## Configuration (pyproject.toml)

```toml
[tool.black]
line-length = 100
target-version = ['py311']  # Adjust to your Python version

[tool.isort]
profile = "black"
line_length = 100

[tool.mypy]
python_version = "3.11"  # Adjust to your Python version
strict = true
warn_return_any = true
warn_unused_configs = true
disallow_untyped_defs = true

[tool.pytest.ini_options]
minversion = "7.0"
addopts = "-ra -q --cov=app --cov-report=term-missing --cov-fail-under={{COVERAGE_BACKEND}}"
testpaths = ["tests"]

[tool.coverage.run]
source = ["app"]  # Adjust to your source directory
omit = ["*/tests/*", "*/migrations/*"]
```

## Running Quality Checks

```bash
# Format code
black app/ tests/

# Sort imports
isort app/ tests/

# Type checking
mypy app/

# Linting
flake8 app/ tests/

# Run all tests with coverage
pytest

# Run specific test file
pytest tests/test_auth.py -v

# Run tests matching pattern
pytest -k "test_user" -v
```
