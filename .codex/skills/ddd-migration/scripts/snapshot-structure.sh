#!/usr/bin/env bash
set -euo pipefail

root="${1:-.}"
max_depth="${2:-4}"

if command -v tree >/dev/null 2>&1; then
  tree -a -L "$max_depth" -I '.git|node_modules|vendor|dist|build|coverage|.next|.turbo|target|__pycache__' "$root"
else
  find "$root" -maxdepth "$max_depth" \
    \( -path '*/.git' -o -path '*/node_modules' -o -path '*/vendor' -o -path '*/dist' -o -path '*/build' -o -path '*/coverage' -o -path '*/.next' -o -path '*/.turbo' -o -path '*/target' -o -path '*/__pycache__' \) -prune \
    -o -print | sort
fi
