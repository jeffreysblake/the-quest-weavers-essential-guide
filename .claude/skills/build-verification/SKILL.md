---
name: build-verification
description: Ensure code is built/compiled before running tests or execution. Prevent "compilation amnesia" where builds are skipped, especially after dependency changes. Use before running tests, executing code, or after modifying dependencies.
---

# Build Verification Skill: Always Build Before Run

This skill prevents the common "compilation amnesia" problem where builds are forgotten.

## Core Principle

**Code must be built before it can run.**
**Tests run against built code, not source.**
**Dependencies changed = Build required.**

## The Amnesia Problem

Claude often forgets to build/compile code before running it, especially when:
- Dependencies have changed
- This is not the first run in a session
- Working with compiled languages
- After making code changes
- When build commands aren't obvious

## Build-First Workflow

### Standard Development Cycle

**ALWAYS follow this order:**
1. ✅ Make code changes
2. ✅ Install/update dependencies (if needed)
3. ✅ **BUILD THE CODE**
4. ✅ Run tests
5. ✅ Run linters
6. ✅ Execute/verify

**NEVER:**
1. ❌ Make changes
2. ❌ Run tests ← Missing build!
3. ❌ Wonder why changes don't work

## When Build is Required

### Always Build After:
- ✅ Installing new dependencies
- ✅ Updating existing dependencies
- ✅ Modifying package.json / requirements.txt / go.mod / etc.
- ✅ Changing build configuration
- ✅ Modifying source code (in compiled languages)
- ✅ Switching branches
- ✅ Pulling changes
- ✅ First time in a session

### Language-Specific Triggers

**JavaScript/TypeScript:**
- After `npm install`, `yarn install`, `pnpm install`
- After modifying dependencies in package.json
- When using TypeScript (compile required)
- When using bundlers (webpack, vite, rollup, etc.)

**Go:**
- After `go get` or `go mod` commands
- After modifying go.mod or go.sum
- Before running any executables
- Always use `go install` or `go build` before `go test`

**Python:**
- After `pip install` or `poetry install`
- When using compiled extensions
- After modifying setup.py or pyproject.toml

**Java/Kotlin:**
- After modifying build.gradle / pom.xml
- After dependency updates
- Always compile before running

**Rust:**
- After `cargo add` or Cargo.toml changes
- Before running tests with `cargo test`
- Before execution with `cargo run`

**C/C++:**
- After any source changes
- After header changes
- After dependency updates
- Always run make/cmake/build system

## Build Commands by Project Type

### Common Build Patterns

```bash
# Node.js/TypeScript
npm run build
npm install  # If deps changed
npm run build

# Go
go mod download  # If deps changed
go install ./...
# OR
go build ./...

# Python
pip install -r requirements.txt  # If deps changed
python setup.py build
# OR
poetry install
poetry build

# Java/Maven
mvn clean install

# Java/Gradle
./gradlew build

# Rust
cargo build
# OR for tests
cargo test --no-run  # Build tests
cargo test            # Run them

# C/C++
make clean
make
# OR
cmake --build build/
```

## Detection Strategy

### Check for Build Indicators

**Before running ANY tests or code:**
1. Check if project is compiled language
2. Check if dependencies were just modified
3. Check for build artifacts existence
4. Check last build time vs. last code change
5. When in doubt, build!

### Project Type Detection

Look for these files to determine build needs:
- `package.json` + `tsconfig.json` = TypeScript build needed
- `go.mod` = Go build needed
- `Cargo.toml` = Rust build needed
- `pom.xml` or `build.gradle` = Java build needed
- `Makefile` or `CMakeLists.txt` = C/C++ build needed
- `setup.py` or `pyproject.toml` = Python build (sometimes)

## Examples

### ❌ Bad: Skip Build
```bash
# Modified go.mod
go mod download
go test ./...  # WRONG! Need to build first!
```

### ✅ Good: Build Then Test
```bash
# Modified go.mod
go mod download
go install ./...  # Build!
go test ./...     # Now test
```

### ❌ Bad: Assume Built
```bash
npm install new-package
npm test  # WRONG! Need to build after new dep!
```

### ✅ Good: Build After Deps
```bash
npm install new-package
npm run build  # Build with new dependency!
npm test       # Now test
```

### ✅ Good: Always Build First
```bash
# Every time, start with build
npm run build && npm test
# OR
cargo build && cargo test
# OR
go install ./... && go test ./...
```

## Self-Check Before Running Code

Before `npm test`, `go test`, `cargo test`, etc.:

**Ask yourself:**
1. **When was the last build?**
   - If unsure → Build now
   - If before recent changes → Build now

2. **Did dependencies change?**
   - If yes → Build required
   - If unsure → Check and build

3. **Is this a compiled language?**
   - If yes → Always build
   - If TypeScript → Always build
   - If using bundler → Always build

4. **Do build artifacts exist?**
   - If no → Build required
   - If old → Build required

5. **Would a missing build explain current errors?**
   - If yes → Build now!

## The Build-Test Pattern

**Create this habit:**

```bash
# Pattern: BUILD && TEST
npm run build && npm test
go install ./... && go test ./...
cargo build && cargo test
mvn clean install

# NOT: TEST (hoping it works)
npm test  # Where's the build?
```

## Project Setup

When starting work on a project:

```bash
# 1. Install dependencies
npm install / go mod download / cargo fetch / etc.

# 2. BUILD
npm run build / go install / cargo build / make

# 3. Verify build worked
ls dist/ / ls bin/ / check build output

# 4. NOW run tests
npm test / go test / cargo test

# 5. Continue with build-first mindset
```

## Red Flags

**STOP if you're about to:**
- Run tests without building first
- Execute code without building first
- Ignore build errors and try to test anyway
- Assume "it's probably already built"
- Skip build "to save time"

## Auto-Build Checklist

**Before EVERY test run:**
- [ ] Check if dependencies changed
- [ ] Check if code changed since last build
- [ ] Check if build artifacts exist
- [ ] Run build command if any doubt
- [ ] Verify build succeeded
- [ ] NOW run tests

**After EVERY dependency change:**
- [ ] Install/update dependencies
- [ ] BUILD immediately
- [ ] Verify build includes new deps
- [ ] Test with new build

## The Golden Rule

**When in doubt, build.**
**After deps change, always build.**
**Before tests run, always build.**
**Build is not optional.**

Remember: **Running tests against stale builds wastes time. Build first, test second, debug less.**
