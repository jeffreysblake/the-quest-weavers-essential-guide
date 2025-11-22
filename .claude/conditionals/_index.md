# Conditionals Index

Conditionals are meta-templates that tell `/setup-stack` **what to detect** and **which templates to load**.

## Purpose

Conditionals serve two purposes:

1. **Detection Logic**: Define how to identify a tech stack (fingerprint files + dependencies)
2. **Template Selection**: Specify which best practice files to load (core + conditional)

## Structure

```
conditionals/
├── tech-stacks/     # Technology stack detection
│   ├── python-fastapi.md
│   ├── typescript-react.md
│   └── ... (more stacks)
├── contexts/        # Temporary context loading
│   ├── testing-focus.md
│   └── ... (more contexts)
└── _index.md        # This file
```

## Tech Stack Conditionals

### Available (2)

**`tech-stacks/python-fastapi.md`**
- **Detection**: `requirements.txt` OR `pyproject.toml` + `fastapi` dependency
- **Core Templates**: _quality-tools, fastapi, pytest
- **Conditional Templates**: sqlalchemy, redis, alembic, celery, pydantic-settings
- **Injects Into**: CODE.md

**`tech-stacks/typescript-react.md`**
- **Detection**: `package.json` + `tsconfig.json` + `react` + `typescript` dependencies
- **Core Templates**: _quality-tools, react
- **Conditional Templates**: vitest, jest, @tanstack/react-query, zod, zustand
- **Injects Into**: CODE.md

### Planned

- `python-django.md` - Django framework
- `typescript-vue.md` - Vue 3 framework
- `node-express.md` - Express backend (without React)
- `java-spring.md` - Spring Boot framework
- `go-standard.md` - Go standard library patterns
- `rust-actix.md` - Actix web framework

## Context Conditionals

### Available (1)

**`contexts/testing-focus.md`**
- **Type**: Temporary context
- **Templates**: pytest.md, vitest.md
- **When**: Load when focusing on testing tasks
- **Usage**: `/context:testing`
- **Auto-unload**: On `/context:clear` or session end

### Planned

- `security-audit.md` - Security-focused patterns
- `performance-opt.md` - Performance optimization patterns
- `refactoring.md` - Refactoring strategies
- `documentation.md` - Documentation writing patterns

## Conditional Format

```yaml
---
name: stack-name
detection:
  files: ["file1", "file2"]              # Must have at least one
  dependencies: ["dep1", "dep2"]         # Must have all listed
core_templates:                          # Always load these
  - best_practices/lang/template1.md
  - best_practices/lang/template2.md
conditional_templates:                    # Load if dependency detected
  package-name: best_practices/lang/template3.md
  another-package: best_practices/lang/template4.md
inject_into:                             # Where to inject content
  - CODE.md
---

# Human-Readable Description

This conditional is triggered when...

## Core Templates (Always Loaded)
...

## Conditional Templates (Loaded if Detected)
...
```

## Detection Flow

When `/setup-stack` runs:

1. **Scan Project**
   - Look for fingerprint files (`package.json`, `requirements.txt`, etc.)
   - Parse dependencies from those files

2. **Match Conditionals**
   - Check each conditional's detection criteria
   - Match based on files + dependencies

3. **Load Templates**
   - Read conditional frontmatter
   - Build list: core + conditional (if deps match)

4. **Extract & Inject**
   - Read each best practice file
   - Strip frontmatter
   - Extract content
   - Inject into CODE.md

## Adding New Conditionals

### Tech Stack Conditional

1. Create file in `tech-stacks/` (e.g., `python-django.md`)
2. Define detection criteria in frontmatter
3. List core and conditional templates
4. Add human-readable description in content
5. Update this index

### Context Conditional

1. Create file in `contexts/` (e.g., `performance-opt.md`)
2. Set `type: context` and `temporary: true` in frontmatter
3. List templates to load
4. Add usage instructions in content
5. Update this index
6. Create corresponding `/context:name` command

## See Also

- **Best Practices**: `.claude/best_practices/_index.md` - Available templates
- **Setup Command**: `.claude/commands/setup-stack.md` - Detection and loading logic
- **Context Command**: `.claude/commands/context.md` - Temporary context loading
