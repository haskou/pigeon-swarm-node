# Target architecture phase

Before migrating code, define the target DDD structure for the project or selected module. This prevents the migration from becoming a sequence of disconnected tiny refactors.

## Purpose

The target architecture answers:

- where the domain model will live;
- which bounded contexts or modules own which concepts;
- which aggregate roots own lifecycle and consistency;
- where application use cases/messages live;
- where repositories, mappers, DTOs, events, jobs, and external adapters live;
- how old entrypoints remain compatible during migration;
- which folders should exist now and which are future-only.

## Required output

Create or update `docs/ddd-migration/TARGET_ARCHITECTURE.md` with these sections:

```markdown
# Target DDD architecture

## Scope

## Current structure summary

## Target structure

```text
<document the intended folders/files here>
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

## Rules

Do not create the full target tree immediately. Document future folders in `TARGET_ARCHITECTURE.md` and create each folder only when the active slice adds a real file there.

Prefer a structure that matches the existing repository style. Do not force a generic `domain/application/infrastructure` tree if the codebase has an established module convention that can express the same boundaries clearly.

When the project has no DDD yet, plan an adapter-friendly transition:

1. keep existing public entrypoints stable;
2. add boundary messages/use cases behind those entrypoints;
3. move business rules toward domain concepts;
4. introduce repositories/adapters where persistence leakage is a problem;
5. split bounded contexts only after contracts and seams are clear.

## Structure examples

Use the repository's local conventions first. These are examples, not mandates.

### Module-oriented backend

```text
src/<context>/
  domain/
    <aggregate-root>.ts
    value-objects/
    events/
  application/
    <workflow>/
      <workflow>.use-case.ts
      <workflow>.message.ts
      <workflow>.result.ts
  infrastructure/
    persistence/
    messaging/
  presentation/
    http/
    resources/
```

### Framework-first backend with restrained DDD

```text
src/<module>/
  <module>.controller.ts
  <module>.service.ts              # compatibility orchestration during migration
  application/
    <workflow>/
  domain/
  persistence/
  dto/
```

### Frontend feature boundary

```text
src/features/<feature>/
  domain/
  application/
  api/
  components/
  tests/
```

## Review questions

Before implementing, check:

- Is the target structure documented before folders are created?
- Does every planned folder have a reason tied to a workflow or boundary?
- Are aggregate roots and repositories paired intentionally?
- Are public contracts and compatibility adapters identified?
- Is the first implementation slice large enough to establish a usable boundary?
