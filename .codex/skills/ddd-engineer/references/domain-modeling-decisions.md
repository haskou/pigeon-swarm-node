# Domain modeling decisions

Use this reference when deciding where a concept or behavior belongs.

## Choosing a model type

Use a value object when equality is structural, identity does not matter, and the concept is defined by its values. Value objects should be immutable when the local language and framework make that practical.

Use an entity when identity and lifecycle matter inside an aggregate. A child entity should usually be loaded, changed, and persisted through its aggregate root.

Use an aggregate root when external code needs a consistency, lifecycle, and transaction boundary. Other objects inside the aggregate should not be mutated from outside the root unless the local codebase has an explicit pattern for it.

Use a domain service only for domain behavior that belongs to the ubiquitous language, requires multiple domain objects, or cannot naturally live on a single aggregate, entity, or value object. A domain service should not orchestrate repositories, DTO mapping, transactions, logging, queues, or framework concerns.

Use a policy for a named, reusable business decision such as `MessageDeletionPolicy` or `ChannelManagementPolicy`. Do not extract one-line checks unless naming the rule clarifies the model or reuse is real.

Use a specification only when the codebase already uses specification-style predicates or when the predicate is a meaningful domain concept that benefits from composition.

Use a factory when creation has real domain meaning, multiple valid construction paths, generated identities, default invariants, or coordinated child-entity creation. Do not create factories just to hide constructors or pass through primitives.

Use a read model or projection when the use case is query-oriented and should not hydrate aggregates.

Use a process manager, saga, or job when a business process reacts to events and coordinates multiple steps over time across aggregate or bounded-context boundaries.

## Invariants versus validation

Input validation checks shape, required fields, formats, and boundary constraints. It belongs at the boundary: request schemas, message constructors, DTO mappers, or application input validation according to local patterns.

Domain invariants protect business truth. They belong in aggregate roots, entities, value objects, domain services, policies, or specifications.

Do not rely on controllers, request schemas, database constraints, or UI validation to enforce domain invariants. Those can provide defense in depth, but they should not be the only place business truth is protected.

## Lifecycle and state

Model lifecycle transitions explicitly: create, activate, suspend, archive, delete, restore, expire, publish, cancel, complete.

Prefer named transition methods over direct status mutation. Invalid transitions should be rejected by domain behavior using the project’s error/result pattern.

Avoid state strings that are interpreted in many places. Put state transitions and state questions behind domain behavior, value objects, enum-style domain values, or policies.

## Time and clocks

Pass time into domain behavior as a value object, timestamp, clock result, or project-specific time object.

Use clock abstractions at the application boundary when the project provides them. Do not call system time directly inside domain objects unless the local architecture permits it.

Model periods, windows, expirations, deadlines, and schedules as domain concepts when behavior depends on them.

## Domain failures

Use the project’s existing error/result pattern for domain failures.

Domain errors should name business failures, such as `CannotArchiveLastOwnerChannel` or `MembershipAlreadyAccepted`, not technical failures.

Do not throw generic errors for domain-rule violations if the project has typed domain errors, result objects, or failure values.
