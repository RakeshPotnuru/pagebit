#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
CURRENT="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$ROOT/manifest.json")"
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

echo "Current version: $CURRENT"
echo "  1) major  ->  $((MAJOR + 1)).0.0"
echo "  2) minor  ->  $MAJOR.$((MINOR + 1)).0"
echo "  3) patch  ->  $MAJOR.$MINOR.$((PATCH + 1))"
echo ""
read -rp "Bump version [1/2/3]: " CHOICE

case "$CHOICE" in
  1|major) BUMP=major ;;
  2|minor) BUMP=minor ;;
  3|patch) BUMP=patch ;;
  *) echo "Invalid choice. Choose 1, 2, or 3." >&2; exit 1 ;;
esac

python3 "$ROOT/release.py" "$BUMP"
