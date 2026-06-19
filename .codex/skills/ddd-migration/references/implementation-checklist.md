# Implementation checklist

Use this with the `ddd-engineer` skill for each migration slice.

## Before editing

- Read migration state files.
- Confirm active slice id, size, non-goals, expected files, and validation level.
- Read `TARGET_ARCHITECTURE.md` and confirm the slice moves toward it.
- Inspect nearby implementation and tests.
- Add characterization tests only when behavior is underprotected or risky.
- List expected files to change.

## While editing

- Keep behavior stable unless the slice explicitly changes it.
- Complete a coherent boundary instead of stopping at a tiny mechanical move.
- Avoid speculative folders and abstractions.
- Preserve public contracts or update docs/schemas/tests.
- Keep compatibility adapters until consumers are migrated.
- Add architecture decisions to `DECISIONS.md`.
- Update `TARGET_ARCHITECTURE.md` if the real structure changes.

## Validation

Use the validation level selected in the roadmap. Affected-scope validation is the default.

- L0: documentation/static inspection only.
- L1: affected tests/checks only: changed test files, nearby tests for touched modules, focused typecheck, or changed-package checks.
- L2: affected module/package validation: module/package lint, typecheck, relevant integration tests, contract tests, migration seam tests, or package-level checks.
- L3: full repository lint/build/typecheck/test.

Start with the smallest level that covers the risk. Do not repeatedly run L3 after every edit or every slice. Run L3 only at migration completion, milestone boundaries, before final PR handoff, after risky cross-cutting changes, after dependency/build-system changes, when affected tests cannot cover the risk, or when required by repository instructions.

Before running tests, identify affected files and behavior. Prefer direct test targets, changed-package commands, or local typechecks over full-suite commands. Record full-suite commands that were intentionally deferred.

If an affected test fails because unrelated existing tests are broken, document the failure and continue only if the active slice remains verifiable another way.

## Before handoff

- Run the selected validation level.
- Run empty-directory detection.
- Review diff for out-of-scope changes.
- Update `SLICE_LOG.md`, `MIGRATION.md`, `TARGET_ARCHITECTURE.md`, and related docs.
- Record next slice with suggested size and validation level.
