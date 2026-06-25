#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-docs/ddd-migration}"
for file in MIGRATION.md TARGET_ARCHITECTURE.md CONTEXT_MAP.md DECISIONS.md GLOSSARY.md SLICE_LOG.md; do
  path="$ROOT/$file"
  if [ -f "$path" ]; then
    echo "===== $path ====="
    sed -n '1,220p' "$path"
    echo
  else
    echo "missing $path"
  fi
done
