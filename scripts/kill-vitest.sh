#!/bin/bash
# Kill stale vitest worker processes that may be left behind by agent sessions.
# Safe to run at any time — only kills processes matching vitest patterns.

set -euo pipefail

echo "Checking for stale vitest processes..."

# Kill processes named exactly "vitest" or "(vitest N)"
PIDS=$(pgrep -f '\(vitest' 2>/dev/null || true)
if [ -n "$PIDS" ]; then
  echo "Killing stale vitest workers: $PIDS"
  echo "$PIDS" | xargs kill -9 2>/dev/null || true
  echo "Done."
else
  echo "No stale vitest processes found."
fi
