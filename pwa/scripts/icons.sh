#!/usr/bin/env bash
# pwa-kit: icons/scripts/icons.sh v1
# Regenerate src/lib/icons.ts from the material-symbols font. See scripts/icons.py.
# Add icons:  npm run icon <name> [<name>...]      List icons:  npm run icon
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d .venv ]; then
  echo "Creating .venv and installing fonttools..."
  python3 -m venv .venv
  .venv/bin/pip install --quiet "fonttools[woff]" brotli
fi

.venv/bin/python3 scripts/icons.py "$@"
