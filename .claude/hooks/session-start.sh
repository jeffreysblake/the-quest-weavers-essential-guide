#!/bin/bash
#
# SessionStart Hook: Initialize development session
# Runs at the start of each Claude Code session
#
# This hook:
# 1. Loads recent git commits for context
# 2. Checks for failing tests or linting errors
# 3. Identifies any immediate issues
# 4. Provides session context to Claude

set -euo pipefail

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo "🚀 Initializing Claude Code session..."

# Output JSON structure
output_json() {
  echo "{\"sessionContext\": \"$1\"}"
}

context=""

# Check git status
if [ -d .git ]; then
  echo -e "${BLUE}📊 Git Status:${NC}"
  git_status=$(git status --short 2>/dev/null || echo "")

  if [ -n "$git_status" ]; then
    echo -e "${YELLOW}Modified files:${NC}"
    echo "$git_status"
    context+="Git Status:\n$git_status\n\n"
  fi

  # Show recent commits
  echo -e "${BLUE}📝 Recent commits:${NC}"
  recent_commits=$(git log --oneline -5 2>/dev/null || echo "")
  echo "$recent_commits"
  context+="Recent commits:\n$recent_commits\n\n"
fi

# Check for package.json and dependencies
if [ -f package.json ]; then
  echo -e "${BLUE}📦 Node.js project detected${NC}"
  context+="Project type: Node.js/JavaScript\n"

  # Check if node_modules exists
  if [ ! -d node_modules ]; then
    echo -e "${YELLOW}⚠️  node_modules not found - dependencies may need installation${NC}"
    context+="⚠️ Dependencies not installed\n"
  fi
fi

# Check for Python project
if [ -f requirements.txt ] || [ -f pyproject.toml ]; then
  echo -e "${BLUE}🐍 Python project detected${NC}"
  context+="Project type: Python\n"
fi

# Check for Go project
if [ -f go.mod ]; then
  echo -e "${BLUE}🔷 Go project detected${NC}"
  context+="Project type: Go\n"
fi

# Check for Rust project
if [ -f Cargo.toml ]; then
  echo -e "${BLUE}🦀 Rust project detected${NC}"
  context+="Project type: Rust\n"
fi

# Try to detect and run tests (non-blocking)
echo -e "${BLUE}🧪 Checking test status...${NC}"
test_result="unknown"

if [ -f package.json ] && command -v npm &> /dev/null; then
  # Check for test script
  if grep -q '"test"' package.json; then
    if npm test &>/dev/null; then
      echo -e "${GREEN}✅ Tests passing${NC}"
      test_result="passing"
    else
      echo -e "${RED}❌ Tests failing${NC}"
      test_result="FAILING"
      context+="⚠️ TESTS ARE FAILING - Should investigate\n"
    fi
  fi
elif [ -f go.mod ] && command -v go &> /dev/null; then
  if go test ./... &>/dev/null; then
    echo -e "${GREEN}✅ Tests passing${NC}"
    test_result="passing"
  else
    echo -e "${RED}❌ Tests failing${NC}"
    test_result="FAILING"
    context+="⚠️ TESTS ARE FAILING - Should investigate\n"
  fi
fi

# Check for linting errors
echo -e "${BLUE}🔍 Checking linting...${NC}"
lint_result="unknown"

if [ -f package.json ] && command -v npm &> /dev/null; then
  if grep -q '"lint"' package.json; then
    if npm run lint &>/dev/null; then
      echo -e "${GREEN}✅ Linting passing${NC}"
      lint_result="passing"
    else
      echo -e "${YELLOW}⚠️  Linting issues detected${NC}"
      lint_result="has issues"
      context+="⚠️ Linting issues detected - Should run linter\n"
    fi
  fi
fi

# Summary
echo ""
echo -e "${GREEN}✨ Session initialized${NC}"
echo -e "Tests: $test_result | Linting: $lint_result"
echo ""

# Output context as JSON for Claude
if [ -n "$context" ]; then
  # Escape newlines and quotes for JSON
  context_escaped=$(echo -e "$context" | jq -Rs .)
  echo "{\"additionalContext\": $context_escaped}"
fi

exit 0
