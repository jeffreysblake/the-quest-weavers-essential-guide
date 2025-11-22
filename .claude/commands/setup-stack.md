# /setup-stack - Technology Stack Detection and Configuration

Automatically detects the technologies used in your project and injects relevant best practices into `CODE.md`.

## What This Does

1. **Validates canary files** (double-check):
   - `CLAUDE.md` in project root (created by `/init`)
   - `.claude/memory/loaded_templates.md` (will be created)
   - Use `--skip-init-check` flag to bypass validation when testing

2. **Scans project files** for technology fingerprints:
   - `package.json` + `tsconfig.json` → TypeScript detected
   - `requirements.txt` OR `pyproject.toml` → Python detected
   - `pom.xml` OR `build.gradle` → Java detected
   - `go.mod` → Go detected
   - `Cargo.toml` → Rust detected

3. **Parses dependencies** to identify frameworks and tools:
   - Python: FastAPI, Django, Flask, pytest, mypy, sqlalchemy
   - Node/TS: Express, NestJS, React, Vue, Vitest, Jest, Zod, TanStack Query
   - Java: Spring Boot, JUnit, Hibernate
   - Go: gin, echo, gorm, testify

4. **Matches conditional templates** from `.claude/conditionals/tech-stacks/`:
   - Each conditional defines detection criteria (files + dependencies)
   - Specifies core templates (always load) and conditional templates (load if detected)

5. **Extracts content from best practice files**:
   - Reads files from `.claude/best_practices/`
   - **Strips frontmatter** (metadata is for tooling only)
   - Extracts clean content for injection

6. **Injects into CODE.md**:
   - Clears content between canary markers in CODE.md
   - Injects extracted best practices (without frontmatter)
   - Keeps CODE.md lean and focused

7. **Generates `.claude/memory/loaded_templates.md`**:
   - Tracks which templates are loaded
   - Snapshots dependencies for future comparison
   - Serves as second canary file

## When to Use

- **First time setup**: Run once when starting with this template
- **Tech stack changes**: Re-run when adding new languages/frameworks
- **New team member**: Load practices for the current stack
- **Switching projects**: Different project = different stack = re-run

## Example Usage

```
User: /setup-stack
Claude: Validating canary files...
✅ CLAUDE.md exists (project initialized)
⏳ loaded_templates.md will be created

Scanning project for technology fingerprints...

Detected Files:
✅ requirements.txt (Python)
✅ package.json + tsconfig.json (TypeScript)

Parsing Dependencies:
✅ fastapi>=0.100 → FastAPI framework
✅ sqlalchemy>=2.0 → SQLAlchemy ORM
✅ pytest → pytest testing
✅ react → React UI
✅ vitest → Vitest testing
✅ @tanstack/react-query → TanStack Query

Matching Conditionals:
✅ Matched: .claude/conditionals/tech-stacks/python-fastapi.md
✅ Matched: .claude/conditionals/tech-stacks/typescript-react.md

Building Template List:
Core Templates (Python):
  - .claude/best_practices/python/_quality-tools.md
  - .claude/best_practices/python/fastapi.md
  - .claude/best_practices/python/pytest.md

Conditional Templates (Python):
  - .claude/best_practices/python/sqlalchemy.md (sqlalchemy detected)

Core Templates (TypeScript):
  - .claude/best_practices/typescript/_quality-tools.md
  - .claude/best_practices/typescript/react.md

Conditional Templates (TypeScript):
  - .claude/best_practices/typescript/vitest.md (vitest detected)
  - .claude/best_practices/typescript/tanstack-query.md (@tanstack/react-query detected)

Extracting and Injecting:
⏳ Reading best practice files...
⏳ Stripping frontmatter...
✅ Injected 7 templates into CODE.md

Generating State File:
✅ Created .claude/memory/loaded_templates.md

Summary:
- Detected Stack: python-fastapi, typescript-react
- Templates Loaded: 7 (5 core + 2 conditional)
- CODE.md updated with extracted best practices
- State tracked in loaded_templates.md

You can now use language-specific patterns and commands.
Run /update-practices to refresh when dependencies change.
```

## Detection Algorithm

### Step 1: Validate Canary Files

```bash
# Check both canary files exist
if ! [ -f "CLAUDE.md" ]; then
    echo "❌ CLAUDE.md not found. Run /init first."
    exit 1
fi

# Skip if --skip-init-check flag provided (for testing)
if [ "$SKIP_INIT_CHECK" != "true" ]; then
    if [ -f ".claude/memory/loaded_templates.md" ]; then
        echo "⚠️ Templates already loaded. Use --force to reload."
    fi
fi
```

### Step 2: Scan for Fingerprint Files

```bash
# Collect all fingerprint files found
detected_files=[]

if [ -f "package.json" ]; then
    detected_files.append("package.json")
fi
if [ -f "tsconfig.json" ]; then
    detected_files.append("tsconfig.json")
fi
if [ -f "requirements.txt" ]; then
    detected_files.append("requirements.txt")
fi
if [ -f "pyproject.toml" ]; then
    detected_files.append("pyproject.toml")
fi
# ... continue for go.mod, pom.xml, etc.
```

### Step 3: Parse Dependencies

```python
# Parse package.json
with open("package.json") as f:
    package_data = json.load(f)
    dependencies = package_data.get("dependencies", {})
    dev_dependencies = package_data.get("devDependencies", {})
    all_node_deps = {**dependencies, **dev_dependencies}

# Parse requirements.txt
node_deps = []
with open("requirements.txt") as f:
    for line in f:
        # Extract package name (ignore version specifiers)
        package = re.split(r'[=<>~!]', line.strip())[0]
        python_deps.append(package)

# Parse pyproject.toml
import tomli
with open("pyproject.toml", "rb") as f:
    pyproject = tomli.load(f)
    deps = pyproject.get("project", {}).get("dependencies", [])
    # Extract package names from deps
```

### Step 4: Match Conditionals

```python
# Read all conditionals from .claude/conditionals/tech-stacks/
conditionals = glob(".claude/conditionals/tech-stacks/*.md")

matched_conditionals = []
for conditional_file in conditionals:
    # Parse frontmatter
    with open(conditional_file) as f:
        content = f.read()
        frontmatter = parse_yaml_frontmatter(content)

    # Check detection criteria
    detection = frontmatter.get("detection", {})
    required_files = detection.get("files", [])
    required_deps = detection.get("dependencies", [])

    # Match files (at least one must exist)
    file_match = any(f in detected_files for f in required_files)

    # Match dependencies (all must be present)
    if "python" in conditional_file:
        dep_match = all(dep in python_deps for dep in required_deps)
    elif "typescript" in conditional_file or "node" in conditional_file:
        dep_match = all(dep in all_node_deps for dep in required_deps)

    if file_match and dep_match:
        matched_conditionals.append(conditional_file)
```

### Step 5: Build Template List

```python
all_templates = []

for conditional_file in matched_conditionals:
    frontmatter = parse_yaml_frontmatter(conditional_file)

    # Add core templates (always loaded)
    core_templates = frontmatter.get("core_templates", [])
    all_templates.extend(core_templates)

    # Add conditional templates (if dependency detected)
    conditional_templates = frontmatter.get("conditional_templates", {})
    for dep, template_file in conditional_templates.items():
        if dep in python_deps or dep in all_node_deps:
            all_templates.append(template_file)
```

### Step 6: Extract Content (Strip Frontmatter)

```python
def extract_content(template_file):
    """Read best practice file and strip frontmatter."""
    with open(template_file) as f:
        content = f.read()

    # Check for YAML frontmatter
    if content.startswith("---"):
        # Find end of frontmatter
        parts = content.split("---", 2)
        if len(parts) >= 3:
            # Return only content after frontmatter
            return parts[2].strip()

    # No frontmatter found, return full content
    return content

# Extract all templates
extracted_content = []
for template in all_templates:
    content = extract_content(template)
    extracted_content.append(content)
```

### Step 7: Inject into CODE.md

```python
# Read CODE.md
with open("CODE.md") as f:
    code_md = f.read()

# Find canary markers
START_MARKER = "<!-- BEST_PRACTICES_START -->"
END_MARKER = "<!-- BEST_PRACTICES_END -->"

# Build new content
new_content = "\n\n".join(extracted_content)

# Replace content between markers
import re
pattern = f"{START_MARKER}.*?{END_MARKER}"
replacement = f"{START_MARKER}\n\n{new_content}\n\n{END_MARKER}"
updated_code_md = re.sub(pattern, replacement, code_md, flags=re.DOTALL)

# Write back
with open("CODE.md", "w") as f:
    f.write(updated_code_md)
```

### Step 8: Generate loaded_templates.md

```python
# Read template
with open(".claude/memory/loaded_templates.md.template") as f:
    template = f.read()

# Replace placeholders
from datetime import datetime
replacements = {
    "{{ stack_name }}": ", ".join(matched_stack_names),
    "{{ timestamp }}": datetime.now().isoformat(),
    "{{ conditional_file }}": matched_conditionals[0],
    # ... more replacements
}

for placeholder, value in replacements.items():
    template = template.replace(placeholder, value)

# Write loaded_templates.md
with open(".claude/memory/loaded_templates.md", "w") as f:
    f.write(template)
```

## Flags (Optional)

- **`--force`**: Re-run detection even if loaded_templates.md exists
- **`--skip-init-check`**: Bypass CLAUDE.md validation (for testing template repo)
- **`--dry-run`**: Show what would be detected without injecting
- **`--stack=<name>`**: Manually specify stack (e.g., `--stack=python-fastapi`)
- **`--verbose`**: Show detailed detection steps

## Examples

```bash
# Standard usage (first time)
/setup-stack

# Force reload after dependency changes
/setup-stack --force

# Test in template repo itself
/setup-stack --skip-init-check

# See what would be detected without making changes
/setup-stack --dry-run

# Manually specify a stack
/setup-stack --force --stack=typescript-react
```

## State File (.claude/memory/loaded_templates.md)

This file is auto-generated and tracks:

```yaml
---
detected_stack: python-fastapi, typescript-react
loaded_at: 2025-11-03T10:30:00Z
conditional: .claude/conditionals/tech-stacks/python-fastapi.md
core_templates:
  - .claude/best_practices/python/_quality-tools.md
  - .claude/best_practices/python/fastapi.md
  - .claude/best_practices/python/pytest.md
conditional_templates:
  sqlalchemy: .claude/best_practices/python/sqlalchemy.md
dependencies_snapshot:
  detected_files:
    - requirements.txt
    - package.json
    - tsconfig.json
  detected_dependencies:
    - fastapi>=0.100
    - sqlalchemy>=2.0
    - react
    - typescript
---
```

**Note**: This file is gitignored and regenerated on each run.

## Missing Tools Detection

If optional dependencies are missing, best practices for those tools won't load:

```
ℹ️ Optional tools not detected:
  - redis (redis.md not loaded)
  - celery (celery.md not loaded)
  - zod (zod.md not loaded)

Add these dependencies to automatically load their best practices.
```

## Integration with Other Commands

- `/update-practices` - Re-scan and update loaded_templates.md when dependencies change
- `/context:testing` - Temporarily load testing-focused templates
- `/context:clear` - Unload temporary contexts

## Related Files

- `CODE.md` - Contains injected best practices (lean, no frontmatter)
- `.claude/memory/loaded_templates.md` - Tracks loaded state
- `.claude/best_practices/**/*.md` - Modular best practice files
- `.claude/conditionals/tech-stacks/*.md` - Detection and loading rules

## Troubleshooting

**Templates not loading?**
1. Check `.claude/conditionals/_index.md` for available stacks
2. Verify fingerprint files exist (package.json, requirements.txt, etc.)
3. Ensure dependencies are listed correctly
4. Run with `--verbose` flag to see detection steps

**Wrong stack detected?**
1. Use `--stack=<name>` to manually specify
2. Check conditional's detection criteria in `.claude/conditionals/tech-stacks/`
3. Verify dependency names match exactly (case-sensitive)

**Testing in template repo?**
- Use `--skip-init-check` flag to bypass canary validation
