# CQRS, queries, and read models

Use this reference when implementing queries, dashboards, search, reports, lists, counts, projections, or read-only screens.

## Command model versus query model

Use aggregate behavior for command-side decisions and lifecycle changes.

Do not hydrate aggregates just to serve read-only screens, lists, counts, dashboards, or search results if the project has read models, projections, query repositories, resources, or API views for that purpose.

Use read models and projections for query-side representation. They can be shaped for the caller, but they should not make domain decisions.

## Queries

A query object may receive primitives at the boundary and convert or validate them according to the local application pattern.

Query handlers or query use cases should express intent in ubiquitous language, not database mechanics.

Do not put lifecycle changes, invariant enforcement, or business decisions in query code.

## Projections

Projection code translates events or persisted state into query-optimized views.

Projection payloads and read-model storage are boundary concerns. Keep them out of the write-side domain model.

When changing a projection, consider backfill, rebuild, migration, idempotency, ordering, and compatibility with existing consumers.

## Acceptance tests

For read-side behavior, test the public query result or projection behavior that consumers depend on.

When a command changes a read model through events or projection updates, add integration or acceptance coverage if the project normally verifies that workflow end to end.
