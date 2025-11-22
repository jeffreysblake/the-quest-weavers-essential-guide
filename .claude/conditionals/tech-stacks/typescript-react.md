---
name: typescript-react
detection:
  files: ["package.json", "tsconfig.json"]
  dependencies: ["react", "typescript"]
core_templates:
  - best_practices/typescript/_quality-tools.md
  - best_practices/typescript/react.md
conditional_templates:
  vitest: best_practices/typescript/vitest.md
  jest: best_practices/typescript/jest.md
  "@tanstack/react-query": best_practices/typescript/tanstack-query.md
  zod: best_practices/typescript/zod.md
  zustand: best_practices/typescript/zustand.md
inject_into:
  - CODE.md
---

# TypeScript/React Tech Stack

This conditional is triggered when:
- `package.json` AND `tsconfig.json` exist
- Contains dependencies: `react` AND `typescript`

## Core Templates (Always Loaded)

1. **`_quality-tools.md`** - ESLint, Prettier, TypeScript configuration
2. **`react.md`** - Component patterns, custom hooks, API clients

## Conditional Templates (Loaded if Detected)

| Dependency | Template | Description |
|------------|----------|-------------|
| `vitest` | `vitest.md` | Vitest testing patterns with Testing Library |
| `jest` | `jest.md` | Jest testing patterns with Testing Library |
| `@tanstack/react-query` | `tanstack-query.md` | Data fetching, caching, mutations |
| `zod` | `zod.md` | Runtime type validation |
| `zustand` | `zustand.md` | State management patterns |

## Version Considerations

- **React 18+**: Concurrent features, useTransition, Suspense
- **TypeScript 5+**: Const type parameters, decorators
