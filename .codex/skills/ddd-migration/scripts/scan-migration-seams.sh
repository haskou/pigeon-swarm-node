#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-.}"
cd "$ROOT"

echo "== Repository guidance =="
find .. . -maxdepth 3 \( -name AGENTS.md -o -name AGENTS.override.md -o -name CONTRIBUTING.md -o -iname '*architecture*' -o -iname '*context*' \) -type f 2>/dev/null | sort | sed 's#^./##' | head -80

echo
printf '== Possible entrypoints ==\n'
find . -type f \( -iname '*controller*' -o -iname '*route*' -o -iname '*handler*' -o -iname '*consumer*' -o -iname '*job*' -o -iname '*command*' \) 2>/dev/null | sed 's#^./##' | head -120

echo
printf '== Possible contracts ==\n'
find . -type f \( -iname '*openapi*' -o -iname '*.proto' -o -iname '*schema*' -o -iname '*event*' -o -iname '*webhook*' \) 2>/dev/null | sed 's#^./##' | head -120

echo
printf '== Possible tests ==\n'
find . -type f \( -iname '*test*' -o -iname '*spec*' -o -iname '*.feature' \) 2>/dev/null | sed 's#^./##' | head -120
