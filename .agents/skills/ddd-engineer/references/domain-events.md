# Domain events, integration events, and eventual consistency

Use this reference when raising, recording, publishing, consuming, or mapping events.

## Event types

Distinguish domain events from integration events.

Domain events are facts raised by domain behavior in ubiquitous language. They describe something that happened inside the model.

Integration events are published boundary contracts for other systems or bounded contexts.

Outbox records, broker messages, queue payloads, and websocket payloads are persistence or transport mechanics.

Map domain events to integration events at an application or infrastructure boundary according to local patterns.

## Domain event design

Name events in past tense using ubiquitous language, such as `MessageDeleted`, `MembershipAccepted`, or `ChannelArchived`.

Domain events should carry the information needed to understand the fact that happened. Do not turn them into transport DTOs with domain-ish names.

Do not put external routing, broker topics, websocket recipients, retry metadata, or transport headers into domain events unless the local architecture intentionally treats those as domain concepts.

## Event lifecycle

When an aggregate raises events, follow the project pattern for recording, pulling, clearing, persisting, publishing, or dispatching them.

Use application or unit-of-work code to coordinate persistence and publication. Do not publish directly from domain objects.

When aggregate changes can conflict, respect expected-version, revision, optimistic-concurrency, or event-stream patterns.

## Eventual consistency

Use eventual consistency for workflows that span aggregate or bounded-context boundaries.

Use a process manager, saga, application handler, scheduled job, or event consumer when a business process reacts to events and coordinates multiple steps over time.

Do not enlarge an aggregate only to avoid asynchronous coordination.

## Contracts and consumers

When an event is consumed outside the current module/context, treat its payload as a public contract.

Document payload shape, routing/topic, recipients, side effects, consumer action, ordering/idempotency assumptions, and compatibility notes when the project maintains such docs.

Add or update integration/contract tests when event payloads, routing, or consumer-visible behavior changes.

## Event sourcing

If the project uses event sourcing, rebuild aggregate state from recorded events and persist new events through the existing event-store pattern.

Do not mix state-based repository shortcuts into an event-sourced aggregate unless the project already has that convention.
