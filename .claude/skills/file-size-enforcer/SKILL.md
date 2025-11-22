---
name: file-size-enforcer
description: Enforces strict 400-line file size limit. Use when files approach 350 lines, when splitting files, or when user mentions file size. Provides splitting strategies for all languages and file types. Alerts proactively before limit is reached.
---

# File Size Enforcer Skill

## Purpose

Enforces the strict 400-line file size limit across all project files.

## When to Use

Claude automatically invokes this skill when:
- A file approaches 350 lines (warning threshold)
- User mentions "file too large", "split file", or "file size"
- Adding significant code to an existing large file
- Creating new files that might grow large

## The 400-Line Rule

**STRICT LIMIT**: No file should exceed 400 lines.

**Why 400 lines?**
- Improves code comprehension
- Encourages proper separation of concerns
- Makes code reviews manageable
- Reduces merge conflicts
- Forces modular design

## Warning Thresholds

- **350+ lines**: ⚠️ Warning - consider splitting soon
- **380+ lines**: 🚨 Urgent - split before adding more
- **400+ lines**: ❌ Violation - split immediately

## Splitting Strategies

### Backend Files (Any Language)

#### Strategy 1: Domain Split

```
# BAD: 600-line monolithic file
src/api/users.py  (600 lines)

# GOOD: Split by domain/responsibility
src/api/users/
  __init__.py          # Re-exports for backward compatibility
  crud.py              (150 lines) - Create, read, update, delete
  admin.py             (120 lines) - Admin-only operations
  profile.py           (100 lines) - User profile management
  auth.py              (80 lines)  - Authentication helpers
```

**Splitting steps:**
1. Create subdirectory with appropriate name
2. Create domain files based on responsibilities
3. Move related functions/classes to each file
4. Create index/init file with re-exports (if needed)
5. Update imports in other files

#### Strategy 2: Functional Split

```
# BAD: 700-line service file
src/services/email.ts  (700 lines)

# GOOD: Split by function
src/services/email/
  index.ts
  sender.ts            (180 lines) - Sending logic
  templates.ts         (150 lines) - Template rendering
  validation.ts        (120 lines) - Email validation
  tracking.ts          (100 lines) - Open/click tracking
```

#### Strategy 3: Model/Entity Split

```
# BAD: 500-line models file
src/models/index.ts  (500 lines)

# GOOD: One model per file
src/models/
  index.ts
  user.ts              (100 lines)
  project.ts           (90 lines)
  message.ts           (80 lines)
  session.ts           (70 lines)
```

### Frontend Component Files

#### Strategy 1: Component Split

```
# BAD: 550-line component
src/components/UserManagement.tsx  (550 lines)

# GOOD: Split into sub-components
src/components/UserManagement/
  index.tsx            (80 lines)  - Main orchestration
  UserList.tsx         (120 lines) - List display
  UserForm.tsx         (100 lines) - Create/edit form
  UserDetails.tsx      (90 lines)  - Detail view
  UserActions.tsx      (70 lines)  - Action buttons/menu
  types.ts             (40 lines)  - Shared types
  hooks.ts             (50 lines)  - Custom hooks
```

#### Strategy 2: Hook/Logic Extraction

```
# BAD: Component with embedded logic (450 lines)
src/components/Dashboard.tsx  (450 lines)

# GOOD: Extract hooks and utilities
src/components/Dashboard/
  Dashboard.tsx        (150 lines) - Component logic
  useDashboardData.ts  (100 lines) - Data fetching
  useDashboardState.ts (80 lines)  - State management
  useDashboardFilters.ts (70 lines) - Filter logic
```

### Test Files

#### Strategy 1: Test Category Split

```
# BAD: 600-line test file
tests/test_users.py  (600 lines)

# GOOD: Split by test category
tests/users/
  test_user_crud.py           (150 lines) - CRUD operations
  test_user_auth.py           (120 lines) - Authentication
  test_user_permissions.py    (100 lines) - Authorization
  test_user_validation.py     (80 lines)  - Input validation
```

#### Strategy 2: Integration vs Unit Split

```
# BAD: Mixed test types (500 lines)
tests/test_api.py  (500 lines)

# GOOD: Separate by test type
tests/
  unit/
    test_api_validation.py    (150 lines)
    test_api_serialization.py (100 lines)
  integration/
    test_api_endpoints.py     (200 lines)
```

## Pre-Commit Hook Enforcement

The pre-commit hook blocks commits with oversized files:

```bash
# .git/hooks/pre-commit
for file in $(git diff --cached --name-only --diff-filter=AM | grep -E '\.(py|ts|tsx|js|jsx|java|go|rs)$'); do
    lines=$(wc -l < "$file")
    if [ "$lines" -gt 400 ]; then
        echo "❌ File $file exceeds 400 lines ($lines lines)"
        echo "   Please split it before committing"
        exit 1
    fi
done
```

**NEVER bypass with `--no-verify`!**

## Splitting Checklist

When splitting a file:

- [ ] Identify logical boundaries (domains, responsibilities, features)
- [ ] Create new directory structure
- [ ] Move code to new files
- [ ] Add proper imports/exports
- [ ] Update imports in dependent files
- [ ] Run tests to verify nothing broke
- [ ] Run type checker
- [ ] Run linters and formatters
- [ ] Verify all files now under 400 lines
- [ ] Commit with descriptive message

## File Size Quick Check

```bash
# Check all source files (adjust extensions as needed)
find src -name "*.py" -o -name "*.ts" -o -name "*.tsx" -o -name "*.js" | \
  xargs wc -l | sort -rn | head -20

# Check test files
find tests -type f | xargs wc -l | sort -rn | head -20
```

## Common Mistakes to Avoid

### ❌ Don't Split Arbitrarily

```
# BAD: Split alphabetically
users_a_to_m.py
users_n_to_z.py
```

### ❌ Don't Create Too Many Tiny Files

```
# BAD: Over-fragmentation
users/create.py       (30 lines)
users/read.py         (25 lines)
users/update.py       (35 lines)
users/delete.py       (28 lines)
```

### ✅ Do Split by Domain/Responsibility

```
# GOOD: Logical grouping
users/crud.py         (150 lines) - All CRUD together
users/permissions.py  (120 lines) - Authorization logic
users/validation.py   (100 lines) - Input validation
```

## Remember

- **400 lines is a STRICT limit**, not a guideline
- **Split proactively** at 350 lines, don't wait for 400
- **Split by domain/responsibility**, not arbitrarily
- **Test after splitting** to ensure nothing broke
- **Never bypass** the pre-commit hook check
- **File size limit applies to ALL files**: source, tests, configs
