#!/usr/bin/env bash
set -euo pipefail

base_ref="${1:-HEAD}"

echo "Changed files since ${base_ref}:"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git diff --name-only "${base_ref}" -- || true
else
  echo "Not inside a git repository."
fi

echo
cat <<'EOF'
Suggested affected-scope validation strategy:
1. Run tests directly matching changed test files.
2. Run nearby tests for changed source modules.
3. Run package/module typecheck or lint for touched package boundaries.
4. Run relevant integration/contract tests only when public contracts, persistence, adapters, or events changed.
5. Defer full repository validation until milestone/final handoff unless the change is cross-cutting or repository rules require it.
EOF
