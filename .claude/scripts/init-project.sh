#!/bin/bash
#
# Project Initialization Script
# Sets up a new project with Claude Code best practices
#
# Usage: ./.claude/scripts/init-project.sh [project-type]
# Project types: node, python, go, rust, general

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_TYPE="${1:-general}"

echo -e "${BLUE}🚀 Initializing Claude Code project setup...${NC}"
echo -e "Project type: ${GREEN}$PROJECT_TYPE${NC}"
echo ""

# Detect project structure
detect_project() {
  if [ -f package.json ]; then
    echo "node"
  elif [ -f go.mod ]; then
    echo "go"
  elif [ -f Cargo.toml ]; then
    echo "rust"
  elif [ -f requirements.txt ] || [ -f pyproject.toml ]; then
    echo "python"
  else
    echo "general"
  fi
}

# If no type specified, detect it
if [ "$PROJECT_TYPE" = "general" ]; then
  DETECTED=$(detect_project)
  if [ "$DETECTED" != "general" ]; then
    echo -e "${GREEN}✓${NC} Detected $DETECTED project"
    PROJECT_TYPE="$DETECTED"
  fi
fi

# Update CLAUDE.md with project-specific information
update_claude_md() {
  local claude_file=".claude/CLAUDE.md"

  if [ ! -f "$claude_file" ]; then
    echo -e "${RED}✗${NC} CLAUDE.md not found!"
    exit 1
  fi

  echo -e "${BLUE}📝 Updating CLAUDE.md with project information...${NC}"

  # Create temporary file with updated content
  case "$PROJECT_TYPE" in
    node)
      # Detect package manager
      if [ -f pnpm-lock.yaml ]; then
        PKG_MGR="pnpm"
      elif [ -f yarn.lock ]; then
        PKG_MGR="yarn"
      else
        PKG_MGR="npm"
      fi

      # Detect framework
      FRAMEWORK="Node.js"
      if grep -q "\"react\"" package.json 2>/dev/null; then
        FRAMEWORK="React"
      elif grep -q "\"next\"" package.json 2>/dev/null; then
        FRAMEWORK="Next.js"
      elif grep -q "\"vue\"" package.json 2>/dev/null; then
        FRAMEWORK="Vue"
      elif grep -q "\"express\"" package.json 2>/dev/null; then
        FRAMEWORK="Express"
      fi

      # Detect testing framework
      TEST_FW="Unknown"
      if grep -q "\"jest\"" package.json 2>/dev/null; then
        TEST_FW="Jest"
      elif grep -q "\"vitest\"" package.json 2>/dev/null; then
        TEST_FW="Vitest"
      elif grep -q "\"mocha\"" package.json 2>/dev/null; then
        TEST_FW="Mocha"
      fi

      cat > /tmp/claude_project_info <<EOF
### Technology Stack
- Primary language(s): JavaScript/TypeScript
- Framework(s): $FRAMEWORK
- Testing framework(s): $TEST_FW
- Build tools: $PKG_MGR
- Linting/formatting: ESLint, Prettier

### Key Commands
- Install dependencies: $PKG_MGR install
- Run tests: $PKG_MGR test
- Run linters: $PKG_MGR run lint
- Build project: $PKG_MGR run build
- Run development server: $PKG_MGR run dev
- Check coverage: $PKG_MGR run test:coverage

### Coding Conventions
- Use ES modules (import/export)
- Prefer const over let, never var
- Use arrow functions for callbacks
- Async/await over raw promises
- Destructuring where appropriate
- Template literals over string concatenation
EOF
      ;;

    python)
      # Detect if using poetry or pip
      if [ -f pyproject.toml ]; then
        PKG_MGR="poetry"
        INSTALL_CMD="poetry install"
        RUN_PREFIX="poetry run"
      else
        PKG_MGR="pip"
        INSTALL_CMD="pip install -r requirements.txt"
        RUN_PREFIX=""
      fi

      TEST_FW="pytest"
      if grep -q "unittest" requirements.txt 2>/dev/null; then
        TEST_FW="unittest"
      fi

      cat > /tmp/claude_project_info <<EOF
### Technology Stack
- Primary language(s): Python
- Framework(s): (Detect from requirements.txt)
- Testing framework(s): $TEST_FW
- Build tools: $PKG_MGR
- Linting/formatting: pylint, black, isort

### Key Commands
- Install dependencies: $INSTALL_CMD
- Run tests: ${RUN_PREFIX} pytest
- Run linters: ${RUN_PREFIX} pylint src/
- Build project: ${RUN_PREFIX} python setup.py build
- Run development server: ${RUN_PREFIX} python -m app
- Check coverage: ${RUN_PREFIX} pytest --cov

### Coding Conventions
- Follow PEP 8
- Use type hints
- Prefer list comprehensions
- Use context managers for resources
- Document with docstrings
EOF
      ;;

    go)
      cat > /tmp/claude_project_info <<EOF
### Technology Stack
- Primary language(s): Go
- Framework(s): (Detect from go.mod)
- Testing framework(s): testing (stdlib)
- Build tools: go
- Linting/formatting: golint, gofmt

### Key Commands
- Install dependencies: go mod download
- Run tests: go test ./...
- Run linters: golint ./...
- Build project: go build ./...
- Run development server: go run main.go
- Check coverage: go test -cover ./...

### Coding Conventions
- Follow Go conventions
- Use gofmt for formatting
- Error handling: explicit checks
- Prefer composition over inheritance
- Keep packages focused
EOF
      ;;

    rust)
      cat > /tmp/claude_project_info <<EOF
### Technology Stack
- Primary language(s): Rust
- Framework(s): (Detect from Cargo.toml)
- Testing framework(s): Built-in test framework
- Build tools: cargo
- Linting/formatting: clippy, rustfmt

### Key Commands
- Install dependencies: cargo fetch
- Run tests: cargo test
- Run linters: cargo clippy
- Build project: cargo build
- Run development server: cargo run
- Check coverage: cargo tarpaulin

### Coding Conventions
- Follow Rust conventions
- Use rustfmt for formatting
- Handle Result and Option properly
- Prefer iterators over loops
- Use ? operator for error propagation
EOF
      ;;

    *)
      cat > /tmp/claude_project_info <<EOF
### Technology Stack
(To be filled in during project initialization)
- Primary language(s):
- Framework(s):
- Testing framework(s):
- Build tools:
- Linting/formatting:

### Key Commands
(To be filled in during project initialization)
- Install dependencies:
- Run tests:
- Run linters:
- Build project:
- Run development server:
- Check coverage:
EOF
      ;;
  esac

  echo -e "${GREEN}✓${NC} Project information prepared"
}

# Check file sizes
check_file_sizes() {
  echo -e "${BLUE}📏 Checking file sizes...${NC}"

  # Find files over 600 lines
  large_files=$(find . -type f \( -name "*.js" -o -name "*.ts" -o -name "*.py" -o -name "*.go" -o -name "*.rs" \) ! -path "*/node_modules/*" ! -path "*/.venv/*" ! -path "*/target/*" ! -path "*/dist/*" -exec wc -l {} \; | awk '$1 > 600 {print $2 " (" $1 " lines)"}' || true)

  if [ -n "$large_files" ]; then
    echo -e "${YELLOW}⚠️  Files exceeding 600 lines:${NC}"
    echo "$large_files"
  else
    echo -e "${GREEN}✓${NC} All files under 600 lines"
  fi
}

# Check for tests
check_tests() {
  echo -e "${BLUE}🧪 Checking test coverage...${NC}"

  case "$PROJECT_TYPE" in
    node)
      if command -v npm &> /dev/null && [ -f package.json ]; then
        if grep -q '"test"' package.json; then
          echo -e "${GREEN}✓${NC} Test script found in package.json"
          # Try to run tests
          if npm test &>/dev/null; then
            echo -e "${GREEN}✓${NC} Tests passing"
          else
            echo -e "${YELLOW}⚠️  Tests failing or not set up${NC}"
          fi
        else
          echo -e "${YELLOW}⚠️  No test script in package.json${NC}"
        fi
      fi
      ;;
    python)
      if command -v pytest &> /dev/null; then
        if pytest --collect-only &>/dev/null; then
          echo -e "${GREEN}✓${NC} Tests found"
        else
          echo -e "${YELLOW}⚠️  No tests found${NC}"
        fi
      else
        echo -e "${YELLOW}⚠️  pytest not installed${NC}"
      fi
      ;;
    go)
      if go test ./... &>/dev/null; then
        echo -e "${GREEN}✓${NC} Tests passing"
      else
        echo -e "${YELLOW}⚠️  Tests failing or not found${NC}"
      fi
      ;;
  esac
}

# Summary and recommendations
show_summary() {
  echo ""
  echo -e "${GREEN}═══════════════════════════════════════${NC}"
  echo -e "${GREEN}✓ Project initialization complete!${NC}"
  echo -e "${GREEN}═══════════════════════════════════════${NC}"
  echo ""
  echo -e "${BLUE}📋 Next steps:${NC}"
  echo ""
  echo -e "1. Review and customize ${BLUE}.claude/CLAUDE.md${NC}"
  echo -e "2. Run ${BLUE}/review${NC} to check current code quality"
  echo -e "3. Run ${BLUE}/consolidate${NC} to find duplicate code"
  echo -e "4. Run ${BLUE}/check-coverage${NC} to analyze test coverage"
  echo -e "5. Use ${BLUE}/test${NC} to generate tests for uncovered code"
  echo ""
  echo -e "${YELLOW}📚 Available commands:${NC}"
  echo -e "  /review          - Comprehensive code review"
  echo -e "  /test            - Generate tests"
  echo -e "  /consolidate     - Find and merge duplicates"
  echo -e "  /check-coverage  - Analyze test coverage"
  echo -e "  /optimize        - Performance review"
  echo -e "  /research        - Explore codebase patterns"
  echo ""
  echo -e "${YELLOW}🤖 Available agents:${NC}"
  echo -e "  code-reviewer       - Deep code quality analysis"
  echo -e "  test-generator      - Comprehensive test creation"
  echo -e "  refactor-specialist - Safe refactoring"
  echo ""
  echo -e "${YELLOW}⚡ Skills active:${NC}"
  echo -e "  persistence        - Prevents giving up too early"
  echo -e "  test-integrity     - Ensures tests verify correct behavior"
  echo -e "  build-verification - Ensures builds before tests"
  echo -e "  proper-solutions   - Enforces production-quality code"
  echo ""
}

# Main execution
main() {
  update_claude_md
  check_file_sizes
  check_tests
  show_summary
}

main
