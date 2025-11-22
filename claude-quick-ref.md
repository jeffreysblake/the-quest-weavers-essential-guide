# {{PROJECT_NAME}} - Quick Reference (CONTEXT ANCHOR)

**Load this file at the start of EVERY session to prevent context drift**

---

## ⚠️ CRITICAL: TEST-AFTER-CODE WORKFLOW (PRAGMATIC)

**Follow this sequence for features and changes:**

```
1. 💻 Write implementation code to solve the problem
2. 📝 Write tests to verify correctness (unit + integration)
3. 🔍 Run tests → they MUST PASS (green)
4. 🧹 Run linters and type checkers
5. 📊 Verify tests exist for modified files
6. ✅ Manual testing (if applicable)
7. 💾 Git commit
```

### ❌ NEVER Do This:
- Commit code without corresponding tests
- Skip test coverage for new/modified code
- Bypass pre-commit hooks with `--no-verify`

### ✅ Good Testing Practices:
1. Write tests that verify actual behavior
2. Cover edge cases and error conditions
3. Ensure tests are maintainable and readable
4. Match upstream project testing conventions
5. Run tests before committing

---

## 🚨 CRITICAL: NEVER USE `--no-verify`

**ABSOLUTELY FORBIDDEN: Using `git commit --no-verify` bypasses all quality checks**

### Why this rule exists:
- Pre-commit hooks enforce code quality standards
- Bypassing them defeats the entire purpose of having rules
- Creates technical debt that compounds over time
- Violates the professional standards of this project

### ❌ NEVER use `--no-verify` - NO EXCEPTIONS

### ✅ If pre-commit hook fails:
1. **Fix the issues** - Don't bypass them
2. If file size violations: Split the file immediately
3. If linter errors: Run the linter and fix them
4. If test coverage low: Add more tests
5. If you believe the hook is wrong: Ask the user for guidance

### 🔴 If you find yourself wanting to use `--no-verify`:
- STOP and ask yourself WHY you want to bypass quality checks
- Fix the underlying issue instead
- If truly stuck, ask the user for help - don't bypass

**Breaking this rule is a CRITICAL violation of project standards.**

---

## 📏 FILE SIZE GUIDANCE (ADVISORY)

**GUIDELINE: Keep new/modified files under 400 lines (excludes tests)**

When creating or modifying files that approach 400 lines:
- Consider splitting by domain/responsibility
- Create subdirectory with multiple files
- Update imports accordingly
- Legacy files >400 lines are acceptable (don't require immediate refactoring)

Example:
```
# LEGACY: Acceptable if already exists
src/api/users.py  (600 lines) ← Don't require immediate split

# NEW CODE: Prefer modular approach
src/api/users/
  __init__.py
  crud.py         (150 lines)
  schemas.py      (100 lines)
  routes.py       (120 lines)
  permissions.py  (80 lines)
```

---

## 📊 COVERAGE APPROACH

**Match upstream project standards:**
- Follow the project's existing coverage configuration (if any)
- Ensure tests exist for all new/modified source files
- No template-enforced thresholds (respect upstream conventions)
- Focus on meaningful tests, not just percentage targets

**For new files without project standards:**
- Aim for 60%+ as pragmatic baseline
- Cover critical paths thoroughly
- Test edge cases and error conditions

*Run `/setup-stack` to detect project coverage config and test framework*

---

## 📋 SESSION START CHECKLIST

**Before accepting ANY task:**
- [ ] Read claude-quick-ref.md (this file)
- [ ] Review relevant planning documents if they exist
- [ ] Understand test-after-code workflow
- [ ] Check for monorepo structure (run `/setup-monorepo` if needed)
- [ ] Create TodoWrite task list for multi-step work

---

## 🚫 NO "PRE-EXISTING" EXCUSES

When a task says "Fix all [errors/issues]", it means ALL of them, not just the ones
introduced in the current phase.

**NEVER use phrases like:**
- "The remaining errors are pre-existing"
- "These errors existed before my changes"
- "Only X new errors, the rest are old"

**If you believe a task scope is too broad:**
1. Ask for clarification BEFORE starting the task
2. Propose a scoped alternative (e.g., "Fix all type errors in the auth module")
3. Get user approval for the scope

**Once you commit to a task, complete it fully. "Pre-existing" is not a valid reason
to leave work incomplete.**

---

## 🔄 CONTEXT CHECKPOINT RULE

**Trigger checkpoints every:**
- 50 tool calls, OR
- When starting a new major task

**At each checkpoint:**
1. Re-read `claude-quick-ref.md` (this file)
2. Verify current task against test-after-code workflow
3. Check if tests exist for all new/modified files
4. Ensure new/modified files stay reasonable in size (~400 lines)

---

## 📐 PHASE SIZE GUIDELINES

**Small Phase:** <200 lines implementation, ~10-20 tests
**Medium Phase:** 200-400 lines, ~20-40 tests
**Large Phase:** MUST split into sub-phases (A, B, C)

**Rule:** If phase description >50 lines → split it

---

## 💾 GIT PRE-COMMIT HOOK (ADVISORY)

**Location:** `.git/hooks/pre-commit`

**Warns when:**
- New/modified source files lack corresponding tests
- New/modified files exceed 400 lines (excludes tests)
- TODO/FIXME found in production code directories

**Blocks commits when:**
- Tests fail for affected packages
- Linter errors exist
- Matches upstream project pre-commit requirements

---

## 🎯 TODOWRITE USAGE

**MANDATORY for every phase and complex task**

```typescript
// Starting a task
TodoWrite([
  { content: "Write tests for feature X", status: "in_progress", activeForm: "Writing tests for feature X" },
  { content: "Implement feature X", status: "pending", activeForm: "Implementing feature X" }
]);

// Completing a task
TodoWrite([
  { content: "Write tests for feature X", status: "completed", activeForm: "Writing tests for feature X" },
  { content: "Implement feature X", status: "in_progress", activeForm: "Implementing feature X" }
]);
```

**CRITICAL:** Mark tasks completed IMMEDIATELY after finishing, not in batches.

---

## 🛡️ SECURITY RULES

1. NEVER implement custom cryptography - use established libraries
2. Use industry-standard password hashing (bcrypt, argon2)
3. Use established JWT libraries for authentication tokens
4. Validate ALL inputs with appropriate validation libraries
5. Use parameterized queries or ORM (never raw SQL with string interpolation)
6. Rate limit authentication endpoints
7. Never commit secrets (.env files, API keys, credentials)

---

## 📝 CONVENTIONAL COMMITS

**Format:**
```
<type>(<scope>): <subject>

<body>
```

**Types:** feat, fix, docs, style, refactor, test, chore

**Examples:**
```bash
git commit -m "feat(auth): implement JWT authentication"
git commit -m "test: add tests for user management endpoints"
git commit -m "fix(users): resolve account lockout counter bug"
```

---

## 🤖 SPECIALIZED COMMANDS

**Universal quality and design commands available:**

### Quality Commands
- `/review` - Code quality review (file size, style, security, DRY)
- `/security-audit` - Comprehensive security check
- `/test-file <path>` - Run tests for specific file(s)
- `/test-package <name>` - Run tests for workspace package
- `/coverage <path>` - Show coverage for file/package

### Design Commands
- `/architect` - System design + planning
- `/ux-review` - UX/UI and developer experience review
- `/document` - Generate/update all documentation

### Optimization
- `/ratchet` - Meta-optimizer for continuous improvement

### Tech Stack & Structure
- `/setup-stack` - Detect technologies and load best practices
- `/setup-monorepo` - Detect and map workspace structure
- `/update-practices` - Re-scan for new tools and suggest practice updates

*Run `/setup-stack` to enable language-specific practices (type-check, testing, etc.)*

---

**End of Quick Reference**
