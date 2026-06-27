#!/usr/bin/env bash
# Triggered by Claude Code PostToolUse hook after Edit or Write.
# Reads the tool JSON from stdin, extracts the edited file path,
# and runs the appropriate test suite.

set -euo pipefail

HIVE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

STDIN_JSON=$(cat)
# Claude Code hook payload: { "tool_name": "Edit", "tool_input": { "file_path": "..." }, ... }
FILE_PATH=$(echo "$STDIN_JSON" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path',''))" 2>/dev/null || true)

# Only act on files inside hive_project
if [[ -z "$FILE_PATH" || "$FILE_PATH" != "$HIVE_DIR"* ]]; then
  exit 0
fi

# ── Backend: run pytest on any .py change ──────────────────────────────────────
if [[ "$FILE_PATH" == *.py ]]; then
  echo ""
  echo "Python file changed -- running backend tests..."
  cd "$HIVE_DIR"
  uv run pytest app/tests/ -x -q --tb=short 2>&1
  EXIT=$?
  if [ $EXIT -eq 0 ]; then
    echo "All backend tests passed."
  else
    echo "Backend tests FAILED. Fix before proceeding."
    exit $EXIT
  fi
fi

# ── Frontend: type-check on any .ts/.tsx change ────────────────────────────────
if [[ "$FILE_PATH" == *.tsx || "$FILE_PATH" == *.ts ]]; then
  echo ""
  echo "TypeScript file changed -- running type check..."
  cd "$HIVE_DIR/hive_frontend"
  npx tsc --noEmit 2>&1
  EXIT=$?
  if [ $EXIT -eq 0 ]; then
    echo "TypeScript type check passed."
  else
    echo "TypeScript errors found. Fix before proceeding."
    exit $EXIT
  fi
fi
