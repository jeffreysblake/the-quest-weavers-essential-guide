# TypeScript Best Practices Index

## Available Templates (6)

### Core Tools

**`_quality-tools.md`**
- **Dependencies**: typescript, eslint, prettier
- **Description**: Essential TypeScript quality tooling
- **Contains**:
  - TypeScript configuration (strict mode, compiler options)
  - ESLint configuration (TypeScript-specific rules)
  - Prettier configuration
  - Command reference for linting, formatting, type-checking
  - Testing setup (Vitest/Jest)

### Frontend Frameworks

**`react.md`**
- **Dependencies**: react
- **Optional**: @tanstack/react-query, axios
- **Description**: React + TypeScript patterns
- **Contains**:
  - Component structure with forwardRef
  - Type-safe props with interfaces
  - Custom hooks patterns
  - API client setup with axios
  - React best practices

### Backend Frameworks

**`express.md`**
- **Dependencies**: express
- **Optional**: jsonwebtoken
- **Description**: Express.js API patterns
- **Contains**:
  - Route organization
  - Controller pattern
  - Middleware patterns (auth, validation)
  - Error handling
  - Type-safe request/response

### Data Fetching

**`tanstack-query.md`**
- **Dependencies**: @tanstack/react-query
- **Description**: TanStack Query (React Query) patterns
- **Contains**:
  - Setup and configuration
  - Basic queries with useQuery
  - Mutations with useMutation
  - Optimistic updates
  - Cache invalidation patterns

### Validation

**`zod.md`**
- **Dependencies**: zod
- **Description**: Runtime type validation
- **Contains**:
  - Schema definition
  - Type inference with z.infer
  - API validation middleware
  - Form validation with React Hook Form
  - Error handling

### Testing

**`vitest.md`**
- **Dependencies**: vitest, @testing-library/react
- **Description**: Vitest + Testing Library patterns
- **Contains**:
  - Test structure and organization
  - Component testing with Testing Library
  - Mocking patterns (functions, modules, timers)
  - Coverage configuration
  - Best practices (query by role, avoid test IDs)

## Planned Templates

These could be added as the need arises:

- `jest.md` - Jest testing patterns (alternative to Vitest)
- `nestjs.md` - NestJS framework patterns
- `vue.md` - Vue 3 + TypeScript patterns
- `zustand.md` - State management with Zustand
- `trpc.md` - Type-safe API with tRPC
- `next.md` - Next.js patterns
- `remix.md` - Remix framework patterns

## Usage

These templates are automatically loaded when:
1. You run `/setup-stack`
2. Your project has TypeScript/Node dependencies detected
3. The conditional in `.claude/conditionals/tech-stacks/typescript-*.md` matches

## Adding New Templates

Create a new file following the pattern:

```yaml
---
name: template-name
requires_deps: ["package-name"]
optional_deps: ["optional-package"]
---

# Template Title

Content here (will be extracted and injected into CODE.md)
```

Then update `.claude/conditionals/tech-stacks/typescript-*.md` to reference it.
