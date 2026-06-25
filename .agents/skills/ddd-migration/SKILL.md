---
name: ddd-migration
description: Use when planning or executing a codebase migration toward DDD using the ddd-engineer conventions. Use for architecture blueprinting, bounded-context migration roadmaps, target project structure, coherent workflow slices, durable migration state, and drift-resistant long-running refactors. Do not use for normal feature work or one-off DDD implementation unless the user asks to migrate architecture.
---

# DDD migration

Use this skill to migrate an existing codebase toward Domain-Driven Design incrementally, using the conventions from the `ddd-engineer` skill for implementation details.

The goal is not to make the smallest possible change. The goal is to deliver coherent, reviewable migration slices that move a business capability toward the target DDD structure without drifting from the plan.

The primary risk is agent drift during long migrations. Treat durable repository files as the source of truth, not the current conversation. Context compaction can preserve state, but it is not a human-readable migration ledger. Maintain explicit migration state in the repository before and after each migration slice.

## First actions

1. Read `AGENTS.md`, repository docs, architecture docs, test docs, and existing migration docs.
2. Read the `ddd-engineer` skill before implementing or reviewing a slice.
3. Look for existing migration state files:
   - `docs/ddd-migration/MIGRATION.md`
   - `docs/ddd-migration/TARGET_ARCHITECTURE.md`
   - `docs/ddd-migration/CONTEXT_MAP.md`
   - `docs/ddd-migration/DECISIONS.md`
   - `docs/ddd-migration/GLOSSARY.md`
   - `docs/ddd-migration/SLICE_LOG.md`
4. If migration state files do not exist, create them before code changes using `references/migration-state-template.md`.
5. Inspect the current architecture before proposing target architecture.
6. Create or update the target DDD project structure before implementation slices using `references/target-architecture.md`.

Do not start broad refactors before creating or updating the migration state and target architecture.

## Migration principles

Migrate by behavior-preserving capability slices. Avoid big-bang rewrites, but also avoid micro-slices that only move one tiny file and do not establish a usable boundary.

Prefer strangler-style extraction, adapter seams, compatibility layers, contract tests, and target-structure preparation over replacing whole modules at once.

A migration slice should be coherent enough to leave the codebase in a useful intermediate state. It should have a clear source area, target boundary, acceptance criteria, rollback note, validation level, and expected files/folders.

Do not introduce DDD patterns everywhere. Introduce a pattern only where it resolves a documented migration pain: scattered business rules, mixed external/persistence/domain models, unclear lifecycle, unsafe cross-module dependency, duplicated validation, or contract drift.

Do not create empty folders or placeholder layers. Every new folder must contain files needed by the current slice. If the target architecture contains a future folder, document it in `TARGET_ARCHITECTURE.md`; do not create it in the codebase until the first real file belongs there.

## Target architecture first

Before implementation work, produce a practical target architecture for the project or selected module.

The target architecture must include:

- candidate bounded contexts or modules;
- target folder layout for each migrated area;
- aggregate roots and aggregate boundaries when known;
- application use-case/message boundaries;
- repository and unit-of-work boundaries;
- read model/query-side boundaries when applicable;
- integration boundaries, anticorruption layers, events, jobs, and public contracts;
- compatibility strategy for old entrypoints;
- migration order by business capability.

The target architecture is a plan, not permission to create empty directories. Keep future structure in documentation until a slice needs the files.

## Slice sizing

Use `references/roadmap.md` for sizing.

Default to a medium coherent slice, not a tiny mechanical one. A good migration slice may touch a full workflow path, such as route/controller -> request/message -> use case/service -> domain model/value object -> repository/mapper -> tests/docs.

Use tiny slices only for high-risk legacy code, unclear behavior, missing tests, or public-contract risk.

Use larger slices when the structure would be incoherent if split further, such as introducing a use case plus its message, mapper, tests, and compatibility adapter together.

## Validation strategy

Use affected-scope validation by default. Do not run the full repository suite for every slice.

Choose one validation level for each slice and record it in `SLICE_LOG.md`:

- L0: no runtime checks; documentation, structure planning, or grep/static inspection only.
- L1: affected tests and checks only: changed test files, nearby tests for touched modules, focused typecheck, or changed-package checks.
- L2: affected module/package validation: module lint/typecheck, relevant integration tests, contract tests, migration seam tests, or package-level checks.
- L3: full repository lint/build/typecheck/test.

For normal implementation slices, prefer L1. Use L2 when contracts, persistence mapping, module boundaries, shared code, migrations, or integration adapters changed. Use L3 only when the migration milestone is complete, before final PR handoff, after risky cross-cutting changes, after dependency/build-system changes, when affected tests cannot identify the risk, or when repository instructions require it.

When choosing tests, first identify the changed files and affected behavior, then run the smallest commands that cover that behavior. Record both commands run and intentionally deferred full-suite commands.

Do not run the full test suite after every slice unless strictly necessary. Batch full validation at migration milestones and at the end of the migration.

## Anti-drift protocol

Before each slice:

1. Read `docs/ddd-migration/MIGRATION.md`, `TARGET_ARCHITECTURE.md`, and `SLICE_LOG.md`.
2. Restate the active slice in one paragraph in the working notes or final handoff.
3. Confirm the slice does not conflict with `DECISIONS.md`.
4. List files expected to change.
5. Choose the validation level before editing.

During the slice:

1. Prefer edits that preserve public behavior unless the migration state explicitly says the contract changes.
2. Keep compatibility adapters around until consumers are migrated.
3. Record newly discovered domain terms in `GLOSSARY.md`.
4. Record architectural choices in `DECISIONS.md`, not only in chat.
5. If the target structure changes, update `TARGET_ARCHITECTURE.md` before continuing.
6. If the direction changes, update the migration state before continuing.

After the slice:

1. Update `SLICE_LOG.md` with changed files, validation level, checks run, contracts touched, and next slice.
2. Update `MIGRATION.md` status and risk list.
3. Update `TARGET_ARCHITECTURE.md` if actual structure diverged from the plan.
4. Run the selected validation level.
5. Run an empty-directory check.
6. Final response must summarize migration-state updates and exact verification.

If the conversation has become long, compressed, or ambiguous, stop using memory from the chat as authoritative. Re-read the migration state files and repository docs.

## Discovery phase

Use `references/discovery.md` before creating a migration roadmap.

Produce or update:

- current architecture map;
- current project structure summary;
- candidate bounded contexts;
- domain vocabulary and conflicting terms;
- public contracts and integration points;
- persistence ownership and transaction boundaries;
- test coverage and missing characterization tests;
- high-risk areas and seams.

Do not rename or move code during discovery unless the user explicitly asks.

## Roadmap phase

Use `references/roadmap.md` to turn discovery and target architecture into a sequence of coherent slices.

Every roadmap item must include:

- business capability or workflow;
- current pain;
- target boundary;
- target folder/file structure for the slice;
- migration approach;
- compatibility plan;
- validation level;
- tests required;
- expected files or folders;
- done criteria;
- rollback or stop condition.

## Implementation phase

Use `ddd-engineer` conventions for each slice.

For a slice that changes business behavior, inspect local tests first and add characterization tests before refactoring when behavior is not already protected.

For a slice that changes a public contract, update contract docs and machine-readable schemas when present.

For a slice that changes persistence, preserve data compatibility or document the migration requirement explicitly.

For a slice that extracts a bounded context, create explicit boundaries and anticorruption mappings. Do not reuse foreign entities, DTOs, persistence rows, or enums as domain objects.

## Done criteria

A migration slice is not done until:

- migration state files are updated;
- target architecture remains accurate;
- no empty placeholder folders remain;
- selected validation level has been run or exact blockers are documented;
- contract changes are documented;
- next slice is recorded;
- final response includes active slice id, changed files, validation level, tests/checks, risks, and migration-state updates.

Use `references/context-management.md` for long-running migration guidance.
