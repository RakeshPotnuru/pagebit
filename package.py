#!/usr/bin/env python3
"""Create the upload ZIP for the current extension version."""

import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


root = Path(__file__).resolve().parent
version = json.loads((root / "manifest.json").read_text())["version"]
files = [
    "manifest.json",
    "background.js",
    "capture-page.js",
    "capture-store.js",
    "popup.html",
    "popup.css",
    "popup.js",
    "preview.html",
    "preview.css",
    "preview.js",
    "select-element.js",
    "icons/icon-16.png",
    "icons/icon-32.png",
    "icons/icon-48.png",
    "icons/icon-128.png",
]

archive = root / "release" / f"pagebit-{version}.zip"
archive.parent.mkdir(exist_ok=True)
with ZipFile(archive, "w", compression=ZIP_DEFLATED, compresslevel=9) as zip_file:
    for name in files:
        zip_file.write(root / name, name)

print(archive)
