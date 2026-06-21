# Roadmap phase

Turn discovery and target architecture into a sequence of coherent, reversible migration slices.

## Slice sizing

Avoid both extremes:

- Do not use huge big-bang slices that rewrite many unrelated workflows.
- Do not use timid micro-slices that only move one helper, create one empty folder, or add one wrapper without completing a usable boundary.

Default to a medium coherent slice. A slice should usually complete one meaningful migration step for one business capability or workflow.

A medium slice may include several related files when they form one boundary, for example:

- route/controller compatibility change;
- boundary message/command/query;
- application use case;
- domain concept/value object/aggregate behavior;
- repository or mapper adjustment;
- resource/DTO mapping;
- focused tests and docs.

This is acceptable when all files belong to the same workflow and the behavior remains reviewable.

## Slice sizes

### XS slice

Use only for high-risk or unclear legacy areas.

Examples:

- add characterization tests around an existing workflow;
- document current behavior and contracts;
- extract one obvious value object used locally.

### S slice

Use for a narrow boundary improvement.

Examples:

- move one business rule into the owning model and update focused tests;
- introduce one application boundary message plus local conversion;
- isolate one external DTO behind an anticorruption mapper.

### M slice, default

Use for normal migration work.

Examples:

- migrate one complete command workflow into application/domain boundaries;
- introduce a use case, message, result, mapper, and focused tests for one endpoint;
- define one aggregate root with its core behavior and repository adapter for one workflow;
- split command behavior from read representation for one feature.

### L slice

Use only when the target boundary would be incoherent if split.

Examples:

- migrate a whole small module around one aggregate root;
- introduce an outbox mapping and integration event for one workflow;
- convert all callers of one old service method to a new use case when partial compatibility would be more dangerous.

Large slices must have explicit non-goals, expected files, validation level, and rollback notes.

## Avoid bad slices

Avoid slices that:

- create folders without real files;
- rename many concepts without changing boundaries;
- introduce a repository interface without a real persistence boundary;
- add a use case that just passes through to the old service with no migration value;
- run full validation repeatedly without a milestone, final handoff, repository requirement, or newly identified cross-cutting risk;
- change multiple unrelated workflows at once.

## Roadmap item template

```markdown
## Slice <id>: <title>

- Size: XS / S / M / L
- Business capability:
- Current pain:
- Source area:
- Target boundary:
- Target files/folders:
- DDD pattern introduced, if any:
- Compatibility plan:
- Validation level: L0 / L1 / L2 / L3
- Tests required:
- Public contracts affected:
- Data migration required:
- Done criteria:
- Rollback/stop condition:
- Non-goals:
```

## Ordering

Prefer this order:

1. Discovery and target architecture.
2. Characterization tests where behavior is unclear.
3. Contract documentation/tests for public boundaries.
4. Boundary mappers/anticorruption seams.
5. Medium workflow slices that establish application/domain structure.
6. Value objects and aggregate behavior for repeated concepts.
7. Repository/unit-of-work cleanup.
8. Read models/query-side separation.
9. Domain/integration events and outbox.
10. Context extraction or service/module split.

Do not split contexts before contracts, tests, target structure, and seams are understood.

## Affected-test validation planning

For each roadmap slice, define the affected validation scope before editing. Prefer direct commands for the changed files, nearby tests, package-level checks, or module-level typechecks.

Use full-suite validation only for migration completion, milestone boundaries, final PR handoff, repository requirements, dependency/build-system changes, risky cross-cutting changes, or when affected tests cannot reasonably cover the change.

Record intentionally deferred full-suite validation in `SLICE_LOG.md` so future agents do not mistake omission for forgetfulness.
