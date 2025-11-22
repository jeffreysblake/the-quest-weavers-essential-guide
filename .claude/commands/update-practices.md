# /update-practices - Technology Stack Update Scanner

Re-scans your project for new tools and dependencies, compares to previous snapshot, and re-injects updated best practices.

## What This Does

1. **Validates canary files** (double-check):
   - `CLAUDE.md` in project root
   - `.claude/memory/loaded_templates.md` (must exist from previous `/setup-stack`)

2. **Re-scans** project dependency files (package.json, requirements.txt, etc.)

3. **Compares** to `dependencies_snapshot` in `.claude/memory/loaded_templates.md`

4. **Identifies changes**:
   - New dependencies added → load new conditional templates
   - Dependencies removed → unload templates
   - No changes → skip re-injection

5. **Re-runs extraction/injection** if changes detected:
   - Match conditionals with new dependencies
   - Extract content from best practice files
   - Strip frontmatter
   - Inject into CODE.md
   - Update loaded_templates.md with new snapshot

## When to Use

- **After adding dependencies**: `npm install some-new-lib` or `pip install new-package`
- **Regular maintenance**: Monthly check for stack evolution
- **Before major features**: Ensure practices are up-to-date
- **Team onboarding**: Show what's changed since last documentation update

## Example Usage

### Scenario 1: New Dependencies Added

```
User: /update-practices
Claude: Validating canary files...
✅ CLAUDE.md exists
✅ loaded_templates.md exists (last updated 2025-11-01T10:00:00Z)

Scanning current dependencies...

Comparing to previous snapshot...

Changes Detected:

✅ New Dependencies Added:
  - zod (TypeScript)
  - @tanstack/react-query (TypeScript)

📊 Template Changes:
  + zod.md will be loaded (zod detected)
  + tanstack-query.md will be loaded (@tanstack/react-query detected)

Re-matching conditionals...
✅ Matched: typescript-react (2 new conditional templates)

Extracting and Injecting:
⏳ Reading 2 new template files...
⏳ Stripping frontmatter...
✅ Re-injected templates into CODE.md (now 9 total)

Updating State:
✅ Updated .claude/memory/loaded_templates.md
   - New timestamp: 2025-11-03T14:30:00Z
   - New dependencies snapshot recorded

Summary:
- Added 2 new templates
- Total templates loaded: 9 (7 previous + 2 new)
- CODE.md updated with zod and TanStack Query patterns
```

### Scenario 2: No Changes

```
User: /update-practices
Claude: Validating canary files...
✅ CLAUDE.md exists
✅ loaded_templates.md exists

Scanning current dependencies...

Comparing to previous snapshot...

ℹ️ No Changes Detected

Dependencies match previous snapshot:
  - fastapi>=0.100
  - sqlalchemy>=2.0
  - pytest
  - react
  - typescript
  - vitest

Templates are up-to-date. No action needed.
```

### Scenario 3: Dependencies Removed

```
User: /update-practices
Claude: Validating canary files...
✅ CLAUDE.md exists
✅ loaded_templates.md exists

Scanning current dependencies...

Comparing to previous snapshot...

Changes Detected:

❌ Dependencies Removed:
  - @tanstack/react-query (TypeScript)

📊 Template Changes:
  - tanstack-query.md will be unloaded

Re-matching conditionals...
✅ Matched: typescript-react (1 conditional template removed)

Extracting and Injecting:
⏳ Reading remaining template files...
⏳ Stripping frontmatter...
✅ Re-injected templates into CODE.md (now 8 total)

Updating State:
✅ Updated .claude/memory/loaded_templates.md

Summary:
- Removed 1 template
- Total templates loaded: 8
- TanStack Query patterns removed from CODE.md
```

## Detection Process

### Step 1: Validate Canary Files

```bash
# Both must exist
if ! [ -f "CLAUDE.md" ]; then
    echo "❌ CLAUDE.md not found. Run /init first."
    exit 1
fi

if ! [ -f ".claude/memory/loaded_templates.md" ]; then
    echo "❌ loaded_templates.md not found. Run /setup-stack first."
    exit 1
fi
```

### Step 2: Load Previous Snapshot

```python
# Parse loaded_templates.md frontmatter
import yaml

with open(".claude/memory/loaded_templates.md") as f:
    content = f.read()
    # Extract YAML frontmatter
    frontmatter = yaml.safe_load(content.split("---")[1])

previous_deps = frontmatter["dependencies_snapshot"]["detected_dependencies"]
last_updated = frontmatter["loaded_at"]

# Example:
# previous_deps = ["fastapi>=0.100", "sqlalchemy>=2.0", "react", "vitest"]
```

### Step 3: Scan Current Dependencies

```python
# Same logic as /setup-stack
# Parse package.json, requirements.txt, pyproject.toml, etc.

current_deps = scan_project_dependencies()

# Example:
# current_deps = ["fastapi>=0.100", "sqlalchemy>=2.0", "react", "vitest", "zod"]
```

### Step 4: Compute Diff

```python
# Normalize dependency names (strip version specifiers)
def normalize_dep(dep):
    return re.split(r'[=<>~!]', dep)[0]

previous_set = {normalize_dep(d) for d in previous_deps}
current_set = {normalize_dep(d) for d in current_deps}

added = current_set - previous_set
removed = previous_set - current_set

# Example:
# added = {"zod"}
# removed = set()
```

### Step 5: Re-Match Conditionals

```python
# If changes detected, re-run conditional matching
if added or removed:
    # Same logic as /setup-stack Step 4
    matched_conditionals = match_conditionals(
        detected_files=scan_fingerprint_files(),
        dependencies=current_deps
    )

    # Build new template list
    all_templates = build_template_list(matched_conditionals, current_deps)
```

### Step 6: Extract and Inject

```python
# If template list changed, re-inject
if template_list_changed:
    # Same logic as /setup-stack Steps 6-7
    extracted_content = [extract_content(t) for t in all_templates]

    inject_into_code_md(extracted_content)

    # Update loaded_templates.md with new snapshot
    update_loaded_templates(
        templates=all_templates,
        dependencies=current_deps,
        timestamp=datetime.now()
    )
```

## Flags (Optional)

- **`--dry-run`**: Show diff and template changes without injecting
- **`--verbose`**: Show detailed dependency comparison
- **`--force`**: Force re-injection even if no changes detected

## Examples

```bash
# Standard usage after adding dependencies
npm install zod @tanstack/react-query
/update-practices

# Preview changes without modifying files
/update-practices --dry-run

# Force update even if no changes detected
/update-practices --force

# See detailed dependency comparison
/update-practices --verbose
```

## Integration with /setup-stack

```bash
# First time: Run setup-stack
/setup-stack

# Add dependencies
npm install @tanstack/react-query
pip install redis

# Update practices for new dependencies
/update-practices

# Or force full re-setup
/setup-stack --force
```

## How It Differs from /setup-stack

| Command | When to Use | What It Does |
|---------|-------------|--------------|
| `/setup-stack` | First time or major stack changes | Full detection + template loading |
| `/update-practices` | After dependency changes | Incremental update based on diff |
| `/setup-stack --force` | Want to re-detect everything | Same as setup-stack, ignores cache |

## Conditional Template Loading

The system automatically loads/unloads templates based on dependencies:

**Conditional Templates** (from `.claude/conditionals/tech-stacks/*.md`):
- `sqlalchemy` → Loads `sqlalchemy.md` when detected
- `redis` → Loads `redis.md` when detected
- `zod` → Loads `zod.md` when detected
- `@tanstack/react-query` → Loads `tanstack-query.md` when detected

**Core Templates** (always loaded for a stack):
- `_quality-tools.md` - Linters, formatters, type checkers
- `{framework}.md` - Framework-specific patterns (FastAPI, React, etc.)
- `{testing}.md` - Testing framework patterns (pytest, vitest, etc.)

## Missing Templates

If a dependency is detected but no template exists:

```
ℹ️ Dependencies without templates:
  - pydantic-settings (no template available)
  - zustand (no template available)

Consider creating templates:
  - .claude/best_practices/python/pydantic-settings.md
  - .claude/best_practices/typescript/zustand.md

See: .claude/best_practices/_index.md for template format
```

## Related Files

- `CODE.md` - Contains injected best practices
- `.claude/memory/loaded_templates.md` - Tracks current state
- `.claude/best_practices/**/*.md` - Modular best practice files
- `.claude/conditionals/tech-stacks/*.md` - Detection rules

## Troubleshooting

**No changes detected but I added dependencies?**
- Verify dependencies are listed in package.json/requirements.txt
- Check spelling (case-sensitive)
- Use `--verbose` to see full comparison
- Try `/setup-stack --force` to re-detect everything

**Templates not updating?**
- Check `.claude/conditionals/tech-stacks/*.md` for conditional rules
- Verify dependency name matches `requires_deps` in template frontmatter
- Ensure templates exist in `.claude/best_practices/`

**Want to force re-injection?**
- Use `--force` flag to skip diff check
