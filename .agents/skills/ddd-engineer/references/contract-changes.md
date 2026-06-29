# Public contracts and integration boundaries

Use this reference when a change affects APIs, events, pub/sub messages, websockets, jobs, sync payloads, push notifications, persistence schemas, or downstream consumers.

## Boundary types

Treat these as explicit integration boundaries:

- API request and response DTOs.
- OpenAPI, GraphQL, protobuf, JSON schema, or other machine-readable contracts.
- Pub/sub payloads.
- Domain-event publication payloads.
- Websocket payloads.
- Job and scheduler payloads.
- Push notification payloads.
- External SDK payloads.
- Persistence models and migrations.

These shapes must not become domain models.

## Required updates when contracts change

When a public contract changes, check for and update:

- API docs.
- Machine-readable contract files.
- Resource/mapper/presenter/serializer tests.
- Acceptance or integration tests.
- Consumer-facing notes in the final response or PR description.

When an event, pub/sub, websocket, sync, push, or job contract changes, document:

- Payload shape.
- Routing topic/channel/event name.
- Recipients or consumers.
- Side effects.
- Expected consumer action.
- Compatibility or migration notes.

## Contract discipline

Routes/controllers should be thin: parse request, build a boundary message, call a use case, return a resource.

Resource, mapper, presenter, serializer, and projector classes are responsible for boundary shape. They should not make domain decisions.

Repositories hydrate and serialize aggregates. Domain code should not depend on persistence models.

Domain events should describe something that happened in ubiquitous language. They should not be transport DTOs with domain-ish names.

If a public contract changes, explain the change for downstream consumers in the final handoff.
