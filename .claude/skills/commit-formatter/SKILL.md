---
name: commit-formatter
description: Generates clear, conventional commit messages from git diffs. Use when committing changes, writing commit messages, or when user says "commit" or "git commit". Follows conventional commit format with detailed body and Claude Code footer.
---

# Commit Formatter Skill

## Purpose

Generates clear, conventional commit messages that accurately describe changes.

## When to Use

Claude automatically invokes this skill when:
- User asks to "commit", "create commit", or "git commit"
- Reviewing staged changes for commit
- User mentions "commit message" or "changelog"
- Before running `git commit` command

## Conventional Commit Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type

| Type | When to Use |
|------|-------------|
| `feat` | New feature or functionality |
| `fix` | Bug fix |
| `docs` | Documentation changes only |
| `style` | Code style changes (formatting, missing semicolons, etc.) |
| `refactor` | Code changes that neither fix bugs nor add features |
| `perf` | Performance improvements |
| `test` | Adding or modifying tests |
| `chore` | Build process, dependency updates, tooling |
| `ci` | CI/CD configuration changes |
| `revert` | Reverting a previous commit |

### Scope (Optional)

The scope specifies what part of the codebase is affected:
- `auth` - Authentication/authorization
- `api` - API endpoints
- `db` - Database models/migrations
- `ui` - User interface components
- `docs` - Documentation
- `tests` - Test files
- `deps` - Dependencies
- etc.

### Subject

- Use **imperative mood**: "add feature" not "added feature" or "adds feature"
- Don't capitalize first letter
- No period at the end
- Maximum 72 characters
- Describe **what** and **why**, not **how**

### Body

- Separate from subject with blank line
- Explain **what** changed and **why**
- Use bullet points for multiple changes
- Wrap at 100 characters per line
- Include context and rationale

### Footer

Always include Claude Code attribution:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

## Commit Message Generation Process

### Step 1: Analyze Changes

```bash
# View staged changes
git diff --cached --stat
git diff --cached
```

Understand:
- Which files changed?
- What type of changes (feat/fix/refactor)?
- What is the scope/domain?
- Why were changes made?

### Step 2: Categorize Change Type

```
# New functionality → feat
feat(chat): add message regeneration feature

# Bug fix → fix
fix(auth): resolve token expiration edge case

# Code improvement → refactor
refactor(api): extract validation logic to service layer

# Documentation → docs
docs(readme): update installation instructions

# Tests → test
test(users): add integration tests for user creation

# Dependencies → chore
chore(deps): upgrade framework to latest version
```

### Step 3: Write Descriptive Body

Good commit body explains:
- **What** changed (high-level)
- **Why** it changed (motivation)
- **Impact** of the change
- Any **caveats** or **limitations**

## Example Commit Messages

### Example 1: Feature Addition

```
feat(chat): implement message regeneration

## Summary
- Add regenerate_response endpoint to regenerate AI responses
- Store generation history in database for tracking
- Add frontend button to trigger regeneration

## Changes
- New endpoint: POST /api/v1/chat/messages/{id}/regenerate
- Database: Add regeneration_count to messages table
- Frontend: Add RegenerateButton component with retry logic

## Testing
- Unit tests for endpoint and service logic
- Integration test for full regeneration flow
- Frontend component tests with user interactions

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Example 2: Bug Fix

```
fix(rate-limit): correct Redis key filtering in get_stats

## Issue
RateLimitService.get_stats() was attempting to parse JSON whitelist
entries as integers, causing ValueError exceptions.

## Root Cause
The method was iterating over ALL Redis keys without filtering out
configuration and whitelist/blacklist keys.

## Solution
Added comprehensive filtering logic to exclude:
- rate_limit:config
- rate_limit:whitelist/blacklist
- Individual whitelist/blacklist entries

## Impact
- get_stats() now returns accurate statistics
- No more ValueError exceptions in logs
- Admin dashboard displays correct rate limit data

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Example 3: Refactoring

```
refactor(analytics): split oversized test file for compliance

## Motivation
test_analytics.py exceeded 400-line file size limit (was 595 lines).

## Changes
Split into 3 focused test files:
- test_analytics_events.py (103 lines) - Event tracking tests
- test_analytics_metrics.py (290 lines) - Metrics retrieval tests
- test_analytics_aggregation.py (234 lines) - Aggregation/export tests

## Impact
- All files now comply with 400-line limit
- Tests are better organized by functionality
- Easier to navigate and maintain

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

## Commit Command Template

```bash
git commit -m "$(cat <<'EOF'
<type>(<scope>): <subject>

## Summary
<High-level overview of changes>

## Changes
- <Change 1>
- <Change 2>
- <Change 3>

## Impact
<What effect these changes have>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

## Best Practices

### ✅ Do

- Use imperative mood ("add" not "added")
- Keep subject under 72 characters
- Explain WHY, not just WHAT
- Reference issue numbers if applicable
- Group related changes together
- Be specific about what changed

### ❌ Don't

- Write vague messages ("fix bugs", "update code")
- Include implementation details in subject
- Commit unrelated changes together
- Forget the Claude Code attribution footer
- Write commit messages in past tense
- Exceed 72 characters in subject line

## Quick Reference

```bash
# View what will be committed
git diff --cached --stat
git status

# Generate commit (use heredoc for multi-line)
git commit -m "$(cat <<'EOF'
feat(auth): implement JWT refresh token rotation

## Summary
Adds automatic JWT refresh token rotation for improved security.
Old refresh tokens are invalidated when new ones are issued.

## Changes
- Add token rotation logic to auth service
- Store refresh token hashes in database
- Add /auth/refresh endpoint
- Update frontend to handle token refresh

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"

# Amend last commit message (if needed)
git commit --amend
```

## Remember

- **Commit messages are documentation** - write for your future self
- **Be descriptive** - explain context and motivation
- **Use conventional format** - makes history searchable
- **Always include footer** - attribute Claude Code contribution
- **One logical change per commit** - easier to review and revert
