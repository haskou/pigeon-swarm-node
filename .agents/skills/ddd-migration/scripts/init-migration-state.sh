#!/usr/bin/env bash
set -euo pipefail

root="${1:-docs/ddd-migration}"
mkdir -p "$root"

create_if_missing() {
  local file="$1"
  local content="$2"
  if [ ! -f "$file" ]; then
    printf '%s\n' "$content" > "$file"
    echo "created $file"
  else
    echo "exists  $file"
  fi
}

create_if_missing "$root/MIGRATION.md" "# DDD migration

## Goal

## Scope

## Non-goals

## Current architecture summary

## Target direction

## Active slice

- Id:
- Title:
- Size: XS | S | M | L
- Status:
- Business capability:
- Source area:
- Target boundary:
- Target files/folders:
- Expected files:
- Compatibility constraints:
- Validation level: L0 | L1 | L2 | L3
- Tests/checks:
- Done criteria:

## Risks

## Validation strategy

- Default level:
- Milestone/full validation trigger:
- Known expensive commands:

## Next slices"

create_if_missing "$root/TARGET_ARCHITECTURE.md" "# Target DDD architecture

## Scope

## Current structure summary

## Target structure

\`\`\`text
\`\`\`

## Bounded contexts / modules

| Context/module | Owns | Does not own | Integrates with | Boundary style |
| --- | --- | --- | --- | --- |

## Aggregates and aggregate roots

| Aggregate root | Owns | Invariants | Repository | Events |
| --- | --- | --- | --- | --- |

## Application boundaries

| Use case/workflow | Message/command/query | Inputs | Result | Contracts touched |
| --- | --- | --- | --- | --- |

## Infrastructure boundaries

| Adapter/repository/gateway | Domain/application port | External system or persistence model | Mapping strategy |
| --- | --- | --- | --- |

## Read models / query side

## Compatibility strategy

## Migration order

## Future folders not yet created"

create_if_missing "$root/CONTEXT_MAP.md" "# Context map

## Candidate bounded contexts

| Context | Capability | Owned model | Persistence owner | Public contracts | Notes |
|---|---|---|---|---|---|

## Relationships

| Upstream | Downstream | Relationship | Contract | Translation/ACL | Notes |
|---|---|---|---|---|---|

## Shared kernel candidates

## Anticorruption layers"

create_if_missing "$root/DECISIONS.md" "# Architecture decisions

## ADR-0001: Initial migration state

- Date:
- Status: proposed
- Context:
- Decision:
- Consequences:
- Related slices:"

create_if_missing "$root/GLOSSARY.md" "# Ubiquitous language

| Term | Meaning | Context | Conflicts/aliases | Source |
|---|---|---|---|---|"

create_if_missing "$root/SLICE_LOG.md" "# Migration slice log

## Slice <id>: <title>

- Date:
- Size: XS | S | M | L
- Status:
- Goal:
- Changed files:
- Behavior changed/preserved:
- Contracts changed:
- Validation level:
- Tests/checks:
- Decisions:
- Risks:
- Next slice:"
