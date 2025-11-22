---
name: typescript-quality-tools
requires_deps: ["typescript", "eslint", "prettier"]
---

# TypeScript Code Quality Tools

## Required Tools

- **ESLint**: JavaScript/TypeScript linting
- **Prettier**: Code formatting
- **TypeScript**: Strict mode enabled
- **Vitest** or **Jest**: Testing framework
- **Testing Library**: Component testing (for React)

## Configuration (tsconfig.json)

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

## Configuration (.eslintrc.json)

```json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "prettier"
  ],
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "project": "./tsconfig.json"
  },
  "rules": {
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "@typescript-eslint/explicit-function-return-type": "warn"
  }
}
```

## Running Quality Checks

```bash
# Lint with auto-fix
npm run lint -- --fix

# Format code
npm run format

# Type checking
npm run type-check
# or
tsc --noEmit

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- src/components/Button.test.tsx
```
