# Migration state templates

Create these files under `docs/ddd-migration/` before starting migration work.

## MIGRATION.md

```markdown
# DDD migration

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
- Affected behavior/tests:
- Tests/checks run:
- Full-suite status: not needed | deferred until milestone | required now | completed
- Done criteria:

## Risks

## Validation strategy

- Default level:
- Affected-test selection rule:
- Milestone/full validation trigger:
- Known expensive commands:
- Full-suite deferral policy:

## Next slices
```

## TARGET_ARCHITECTURE.md

```markdown
# Target DDD architecture

## Scope

## Current structure summary

## Target structure

```text
```

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

## Future folders not yet created
```

## CONTEXT_MAP.md

```markdown
# Context map

## Candidate bounded contexts

| Context | Capability | Owned model | Persistence owner | Public contracts | Notes |
|---|---|---|---|---|---|

## Relationships

| Upstream | Downstream | Relationship | Contract | Translation/ACL | Notes |
|---|---|---|---|---|---|

## Shared kernel candidates

## Anticorruption layers
```

## DECISIONS.md

```markdown
# Architecture decisions

## ADR-0001: <title>

- Date:
- Status: proposed | accepted | superseded
- Context:
- Decision:
- Consequences:
- Related slices:
```

## GLOSSARY.md

```markdown
# Ubiquitous language

| Term | Meaning | Context | Conflicts/aliases | Source |
|---|---|---|---|---|
```

## SLICE_LOG.md

```markdown
# Migration slice log

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
- Next slice:
```
