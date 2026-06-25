#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-.}"
find "$ROOT" -type d -empty \
  -not -path '*/.git/*' \
  -not -path '*/node_modules/*' \
  -not -path '*/vendor/*' \
  -not -path '*/dist/*' \
  -not -path '*/build/*' \
  -print
