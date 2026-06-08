# Repositories, transactions, and concurrency

Use this reference when changing persistence boundaries, repositories, units of work, transactional use cases, optimistic concurrency, or event persistence.

## Repository responsibility

Repositories should express aggregate persistence in domain/application language, not database-table operations.

Prefer methods such as `save`, `findById`, `findPendingForIdentity`, or existing local equivalents.

Repositories normally load and save aggregate roots. Do not add repositories for child entities unless the existing codebase has a deliberate exception.

Do not expose ORM query builders, persistence rows, transaction clients, or DTOs through domain/application repository interfaces unless the local architecture explicitly does so.

Repository implementations may call `fromPrimitives()` and `toPrimitives()` or equivalent serialization/hydration behavior. Domain and application decision code should not use serialization as a getter shortcut.

## Unit of work

Application use cases usually define the transaction boundary.

A typical command use case loads aggregate roots, calls domain behavior, saves changes, records or publishes resulting events according to local pattern, and returns an explicit result.

Do not let controllers, mappers, repositories, or infrastructure callbacks decide business transaction boundaries.

When multiple repositories participate, follow the project’s unit-of-work or transaction pattern instead of passing low-level transaction handles through domain objects.

## Concurrency

When aggregate changes can conflict, follow the project’s versioning or optimistic-concurrency pattern.

Respect versions, revision numbers, event-stream positions, updated-at checks, or expected-version checks when they exist.

Do not silently overwrite aggregate state. If concurrent modification is a domain-relevant failure, surface it through the project’s error/result pattern or retry policy.

## Event persistence and outbox

When events are persisted or published with aggregate changes, keep persistence and dispatch consistent with the project’s unit-of-work or outbox pattern.

Do not publish integration events directly before the aggregate transaction commits unless the project intentionally does so.

Outbox rows, transport messages, broker metadata, and retries are infrastructure concerns. Keep them out of aggregate behavior.

## Query persistence

Do not force command-side repositories to serve read-heavy query needs if the project has query repositories, read models, projections, or reporting views.

Query repositories can return read models or resources, but they should not become a place for domain decisions.
