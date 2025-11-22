#!/bin/bash
#
# PostToolUse Hook: Quality checks after Edit/Write
# Runs after Edit or Write tool usage
#
# This hook:
# 1. Checks if files exceed 600 lines
# 2. Runs linter if available
# 3. Runs formatter if available
# 4. Provides feedback on code quality

set -euo pipefail

# Read input from stdin (tool call info)
input=$(cat)

# Extract file path from input
file_path=$(echo "$input" | jq -r '.parameters.file_path // empty')

# If no file path, exit successfully
if [ -z "$file_path" ]; then
  echo '{"result": "no file to check"}'
  exit 0
fi

# Check if file exists
if [ ! -f "$file_path" ]; then
  echo "{\"result\": \"file not found: $file_path\"}"
  exit 0
fi

issues=()

# Check file length
line_count=$(wc -l < "$file_path")
if [ "$line_count" -gt 600 ]; then
  issues+=("⚠️ File exceeds 600 lines ($line_count lines) - consider refactoring")
fi

# Check for common issues
if grep -q "console\.log" "$file_path" 2>/dev/null; then
  issues+=("⚠️ console.log found - remove debug statements")
fi

if grep -q "debugger" "$file_path" 2>/dev/null; then
  issues+=("⚠️ debugger statement found - remove before commit")
fi

if grep -q "TODO\|FIXME\|HACK" "$file_path" 2>/dev/null; then
  todo_count=$(grep -c "TODO\|FIXME\|HACK" "$file_path" || true)
  issues+=("📝 $todo_count TODO/FIXME/HACK comments - address before completion")
fi

# Try to run linter if available
file_ext="${file_path##*.}"

case "$file_ext" in
  js|jsx|ts|tsx)
    if command -v eslint &> /dev/null && [ -f .eslintrc.js ] || [ -f .eslintrc.json ]; then
      if ! eslint "$file_path" --quiet 2>/dev/null; then
        issues+=("❌ ESLint errors - run 'eslint $file_path' to see details")
      fi
    fi
    ;;
  py)
    if command -v pylint &> /dev/null; then
      if ! pylint "$file_path" --errors-only &>/dev/null; then
        issues+=("❌ Pylint errors - run 'pylint $file_path' to see details")
      fi
    elif command -v flake8 &> /dev/null; then
      if ! flake8 "$file_path" &>/dev/null; then
        issues+=("❌ Flake8 errors - run 'flake8 $file_path' to see details")
      fi
    fi
    ;;
esac

# Output results
if [ ${#issues[@]} -gt 0 ]; then
  message="Quality checks for $file_path:\n"
  for issue in "${issues[@]}"; do
    message+="$issue\n"
  done

  # Return as non-blocking warning
  echo "{\"additionalContext\": \"$(echo -e "$message" | jq -Rs .)\"}"
  exit 0
else
  echo "{\"result\": \"quality checks passed for $file_path\"}"
  exit 0
fi
