#!/bin/bash
# Rebuild better-sqlite3 for the specified target, only if needed.
# Usage: ./scripts/rebuild-native.sh [--electron|--node]
set -e

TARGET="${1:---node}"
CACHE_FILE="node_modules/.native-target"
REBUILD_MARKER="node_modules/.native-rebuilt-for-${TARGET}"

case "$TARGET" in
  --electron)
    CMD="npx electron-rebuild -f -w better-sqlite3"
    DESC="Electron"
    ;;
  --node)
    CMD="pnpm rebuild better-sqlite3"
    DESC="system Node"
    ;;
  *)
    echo "Usage: $0 [--electron|--node]"
    exit 1
    ;;
esac

# Skip rebuild if already built for this target
if [ -f "$CACHE_FILE" ] && [ "$(cat "$CACHE_FILE")" = "$TARGET" ]; then
  echo "better-sqlite3 already built for $DESC — skipping rebuild"
  exit 0
fi

echo "Rebuilding better-sqlite3 for $DESC..."
$CMD
echo "$TARGET" > "$CACHE_FILE"
echo "Done"
