#!/usr/bin/env python3
"""Bump the extension version and package a release."""

import json
import subprocess
import sys
from pathlib import Path


root = Path(__file__).resolve().parent
manifest_path = root / "manifest.json"
original = manifest_path.read_text()
manifest = json.loads(original)

if len(sys.argv) != 2:
    raise SystemExit("Usage: python3 release.py major|minor|patch")

choice = sys.argv[1].lower()
if choice not in {"major", "minor", "patch"}:
    raise SystemExit("Choose major, minor, or patch.")

parts = manifest["version"].split(".")
if len(parts) != 3 or not all(part.isdigit() for part in parts):
    raise SystemExit("Expected a version like 0.1.1 in manifest.json.")
major, minor, patch = map(int, parts)
if choice == "major":
    major, minor, patch = major + 1, 0, 0
elif choice == "minor":
    minor, patch = minor + 1, 0
else:
    patch += 1
if max(major, minor, patch) > 65535:
    raise SystemExit("The new version exceeds Chrome's version limit.")

manifest["version"] = f"{major}.{minor}.{patch}"
manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
try:
    subprocess.run([sys.executable, str(root / "package.py")], cwd=root, check=True)
except Exception:
    manifest_path.write_text(original)
    raise
