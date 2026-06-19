# Context management and drift prevention

Long DDD migrations are vulnerable to context loss, stale assumptions, and architectural drift. Codex may compact long-running context, but the migration must not depend on the chat transcript as the only memory.

## Durable state over conversation memory

Create and maintain `docs/ddd-migration/` as the durable source of truth:

- `MIGRATION.md`: current goal, scope, status, active slice, constraints, risks, and done criteria.
- `TARGET_ARCHITECTURE.md`: planned DDD structure, aggregate roots, use cases, repositories, adapters, compatibility strategy, and future folders not yet created.
- `CONTEXT_MAP.md`: candidate bounded contexts, upstream/downstream relationships, shared kernel decisions, anticorruption layers, and integration contracts.
- `DECISIONS.md`: append-only architecture decision log.
- `GLOSSARY.md`: ubiquitous language and terms with conflicting meanings.
- `SLICE_LOG.md`: chronological slice log with changed files, validation level, verification, and next steps.

Before coding after a pause, context compaction, or long tool session, re-read these files. If they are missing or stale, update them before continuing.

## Compaction-safe slice protocol

Each slice must be self-contained and recoverable from repository state.

Record this before coding:

- slice id and title;
- slice size;
- business capability;
- current source files;
- target boundary;
- target files/folders;
- expected changed files;
- compatibility constraints;
- validation level;
- tests/checks to run;
- non-goals.

Record this after coding:

- files changed;
- behavior changed or preserved;
- contracts changed;
- validation level used;
- tests/checks run;
- decisions added;
- risks discovered;
- next recommended slice.

## Drift alarms

Pause and re-read migration state if any of these occur:

- the agent starts changing files outside the active slice;
- a new folder tree is created without files needed for the slice;
- the agent keeps choosing XS slices when the roadmap calls for a workflow boundary;
- the agent runs full validation repeatedly without a milestone, final handoff, repository requirement, or newly identified cross-cutting risk;
- terminology diverges from `GLOSSARY.md`;
- public contracts change unexpectedly;
- a DDD pattern is introduced where the roadmap did not call for one;
- tests are skipped because the architecture is in transition;
- the agent relies on “as discussed earlier” instead of repository files.

## Handoff format

The final response for every slice must include:

- active slice id and size;
- summary;
- migration state files updated;
- changed code files;
- validation level;
- tests/checks run;
- risks or blockers;
- next slice.
