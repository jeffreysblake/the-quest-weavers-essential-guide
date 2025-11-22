#!/bin/bash
#
# PreToolUse Hook: Safety checks for Bash commands
# Prevents dangerous or destructive operations
#
# This hook blocks or warns about:
# 1. Destructive file operations
# 2. Dangerous git commands
# 3. System-level modifications
# 4. Force operations

set -euo pipefail

# Read input from stdin
input=$(cat)

# Extract command from input
command=$(echo "$input" | jq -r '.parameters.command // empty')

# If no command, allow
if [ -z "$command" ]; then
  echo '{"permissionDecision": "allow"}'
  exit 0
fi

# Dangerous patterns
dangerous_patterns=(
  "rm -rf /"
  "rm -rf \*"
  "git push --force"
  "git push -f"
  "git reset --hard origin"
  "> /dev/sda"
  "dd if="
  "mkfs\."
  "fdisk"
  ":(){:|:&};:"  # Fork bomb
  "chmod -R 777"
)

# Check for dangerous patterns
for pattern in "${dangerous_patterns[@]}"; do
  if echo "$command" | grep -q "$pattern"; then
    echo "{
      \"permissionDecision\": \"deny\",
      \"message\": \"🚫 Blocked dangerous command: $pattern\"
    }"
    exit 2
  fi
done

# Warn about potentially dangerous operations
warning_patterns=(
  "rm -rf"
  "git reset --hard"
  "npm uninstall"
  "drop database"
  "DROP TABLE"
  "DELETE FROM.*WHERE"
)

for pattern in "${warning_patterns[@]}"; do
  if echo "$command" | grep -qi "$pattern"; then
    echo "{
      \"permissionDecision\": \"ask\",
      \"message\": \"⚠️ This command looks potentially dangerous: $command\n\nAre you sure you want to proceed?\"
    }"
    exit 0
  fi
done

# Check for protected files
protected_files=(
  ".env"
  ".git/config"
  "package-lock.json"
  "yarn.lock"
  "pnpm-lock.yaml"
  "go.sum"
  "Cargo.lock"
)

for protected in "${protected_files[@]}"; do
  if echo "$command" | grep -q "rm.*$protected"; then
    echo "{
      \"permissionDecision\": \"ask\",
      \"message\": \"⚠️ Attempting to remove protected file: $protected\n\nAre you sure?\"
    }"
    exit 0
  fi
done

# Allow command
echo '{"permissionDecision": "allow"}'
exit 0
