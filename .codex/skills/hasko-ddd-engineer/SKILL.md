---
name: hasko-ddd-engineer
description: Implement, refactor, review, and document software using practical Domain-Driven Design, SOLID, explicit application boundaries, value objects, tests, and public-contract discipline.
---

# DDD engineer

Use this skill when the user asks to implement, refactor, review, or document code where domain boundaries, application use cases, value objects, repositories, events, API contracts, or acceptance tests matter.

This is an execution skill, not a theoretical DDD checklist. Read the existing code first, follow local patterns, and leave the codebase cleaner than you found it.

## Required references

- Read repository instructions first when present: `AGENTS.md`, `CONTRIBUTING.md`, architecture docs, or context docs.
- Inspect existing code in the same area before adding structure.
- For a backend slice, inspect at least one nearby aggregate/entity, use case, message/command/query, repository, route/controller, mapper/resource, and test.
- For a frontend slice, inspect the existing feature boundary, application service/hook, domain model, API gateway, component structure, and tests.
- When a project uses a value-object library, follow its comparison, validation, and serialization rules instead of treating value objects as decorated primitives.

## Operating mode

- Work in the language the user uses.
- Prefer a small complete slice over broad half-finished architecture.
- Do not revert user changes. If the worktree is dirty, inspect it and keep unrelated edits intact.
- Make incremental commits when a coherent slice is finished, following the repository's commit convention.
- Treat PR comments as actionable engineering feedback unless they are clearly informational.
- If a public contract changes, explain the change for consumers of that contract.

## Domain rules

- Domain objects receive value objects and domain objects, not primitive props bags.
- Domain behavior belongs in aggregates, entities, value objects, domain services, or policies.
- Do not move domain rules into application services, controllers, mappers, repositories, schedulers, or private helper methods.
- Constructors should express the domain model. If a constructor grows unwieldy, introduce a cohesive domain concept or factory only when it removes real complexity.
- A domain constructor with many parameters is a smell, but a generic `props` bag is not the automatic fix. Prefer naming the missing concept: metadata, scope, payload, permissions, participants, window, period, etc.
- Aggregates should expose intent-revealing behavior. Prefer `message.markAsDeleted(byIdentity)` or `community.canManageChannels(identity)` over external code mutating fields or comparing raw ids.
- Do not create an anemic domain model wrapped by procedural services.
- Do not use casts in domain or application code unless there is no sane alternative.
- Do not introduce magic strings. Put named domain values behind value objects, constants, or existing enum-style domain values.
- Avoid cross-context domain calls. Coordinate through application services, repositories, domain events, pub/sub, jobs, or API flows.
- Domain events should describe something that happened in ubiquitous language. They should not be transport DTOs with domain-ish names.

## Application rules

- Every application entrypoint that receives external primitives or DTOs must have an explicit message, command, query, or request object.
- That boundary object receives primitives and converts them to value objects.
- Use cases receive boundary messages, value objects, domain objects, or explicit application results. They should not receive anonymous primitive bags.
- Use cases expose ubiquitous-language methods such as `create`, `find`, `send`, `accept`, `update`, `delete`, `reconcile`, or `publish`.
- Do not default to generic method names like `execute` when the codebase expects ubiquitous language.
- Private methods in use cases are only for orchestration mechanics. If a private method names a business rule, move it into the domain.
- Do not create pass-through ports. A port must describe a real outbound dependency in ubiquitous language.

## Messages, commands, and queries

- Boundary messages are translators, not domain models.
- A message may receive primitives because it lives at the application boundary.
- A message should expose value-object getters or a method that returns a cohesive application input, depending on the local pattern.
- Message classes should convert primitives once. Do not duplicate primitive-to-value-object conversion in routes, use cases, and private methods.
- Keep message names tied to intent: `CreateCommunityMessage`, `SendMessageCommand`, `FindIdentityQuery`, `PublishKeychainMessage`.
- Avoid vague message names such as `RequestData`, `Input`, `Payload`, `Params`, `Body`, or `Props` unless they are API DTOs in the presentation layer.
- Do not pass API body classes directly into use cases if the codebase separates presentation and application.
- Optional fields should still be explicit. A missing primitive should become a meaningful absence in the message, not a surprise `undefined` leaking into the domain.
- If a message needs complex validation that names domain rules, push that behavior into a value object, entity, aggregate, or policy.
- If two use cases receive the same primitives but mean different things, create two message classes. Reuse is less important than clear intent at the boundary.
- If several messages duplicate the same conversion, extract a domain value object or a mapper at the correct boundary; do not create a generic conversion helper by reflex.

## Value objects

- Prefer existing value-object base classes or project value-object libraries before creating custom primitive wrappers.
- Prefer derived primitive helper types supplied by the value-object library over hand-written primitive aliases.
- Compare value objects through behavior:
  - equality methods for identity/equality.
  - numeric comparison methods for numbers.
  - timestamp and interval methods for time.
  - domain-specific methods for domain-specific questions.
- Serialization methods such as `toPrimitives()`, `valueOf()`, and `toString()` are boundary tools only: persistence, DTOs, events, logs, telemetry, external libraries, and contract tests.
- Do not pull primitive internals out of value objects to compare, sort, filter, or branch in domain/application logic.
- If behavior is missing, add it to the value object instead of writing a helper that knows its internals.

## Serialization and hydration

- `toPrimitives()` serializes a domain object for a boundary. It is not a general-purpose getter.
- `fromPrimitives()` hydrates from persistence, fixtures, or external payloads at a boundary. It is not a shortcut constructor for application/domain code.
- Valid places for `toPrimitives()`:
  - repository persistence.
  - resource or DTO mapping.
  - published event payloads.
  - logs, telemetry, and external SDK calls.
  - contract tests that assert serialized shape.
- Valid places for `fromPrimitives()`:
  - repository hydration.
  - test fixtures that intentionally build persisted state.
  - message classes only when the primitive payload is explicitly a serialized version of a value object or aggregate and the local pattern allows it.
- Invalid uses:
  - equality checks.
  - authorization rules.
  - sorting or filtering domain collections.
  - deciding lifecycle transitions.
  - reaching through nested values because adding a method felt slower.
- Prefer behavior:
  - `identityId.isEqual(otherIdentityId)` over `identityId.toPrimitives() === otherIdentityId.toPrimitives()`.
  - `period.includes(timestamp)` over comparing serialized dates.
  - `role.can(permission)` over checking a primitive permission array outside the role.
- If a caller needs a primitive to make a decision, first ask whether that decision belongs inside the value object, entity, aggregate, or policy.

## Infrastructure and boundaries

- Persistence models, API DTOs, OpenAPI schemas, pub/sub payloads, websocket payloads, and external SDK payloads must stay out of the domain.
- Repositories hydrate and serialize aggregates. They may call serialization methods; domain code should not need to.
- API routes/controllers should be thin: parse request, build boundary message, call use case, return resource.
- Resource/mapper classes are responsible for presentation shape, not domain decisions.
- Events, pub/sub, websocket, job, and push contracts are integration boundaries. Keep them explicit, documented, and tested where behavior matters.
- Shared infrastructure is only for genuinely generic concerns. Context-specific adapters belong inside their owning context.

## Structure rules

- Follow the existing module/context layout before inventing folders.
- Prefer explicit layer ownership:
  - `domain/`
  - `domain/value-objects/`
  - `application/<action-name>/`
  - `application/<action-name>/messages/` or the project's equivalent command/query folder.
  - `infrastructure/<adapter-name>/`
- Do not add root-level `types`, `utils`, `dto`, `messages`, `services`, `ports`, `helpers`, or `common` buckets inside a module unless the project already has a clear, layer-owned convention for them.
- Avoid vague class names such as `Manager`, `Helper`, `Utils`, `Common`, `Base`, `Data`, or `Info`.
- Split classes when they have multiple reasons to change. Do not hide a god object behind a prettier name.

## Naming rules

- Names should come from the ubiquitous language, not from technical convenience.
- Prefer names that answer "what domain concept is this?" and "why does it change?"
- Good names are cohesive:
  - `ConversationMessage`, not `MessageData`.
  - `CommunityMembershipRequest`, not `CommunityRequestInfo`.
  - `UnreadMessageCounter`, not `CounterHelper`.
  - `IdentityPresence`, not `PresenceDto` in domain/application.
- Avoid suffixes that hide missing design: `Manager`, `Helper`, `Utils`, `Processor`, `Handler`, `Service`, `Data`, `Info`, `Common`, `Base`.
- Use `Service` only when the class is genuinely a domain/application/infrastructure service and the local codebase uses that suffix intentionally.
- Use `Handler` for framework/event handlers, not as a dumping ground for orchestration and domain decisions.
- Use `Mapper`, `Projector`, `Resource`, `Presenter`, or `Serializer` only at boundaries where shape conversion is the responsibility.
- Use `Policy` for a reusable domain decision.
- Use `Specification` only when the codebase already uses specification-style predicates and the object represents a meaningful domain predicate.
- Use `Factory` only when object creation has real domain complexity or multiple valid construction paths.
- A folder name should name a layer or business action, not a generic bucket.
- File names should match exported class names unless the project has a clear convention otherwise.
- If a name contains `And`, `Or`, `With`, or several concepts glued together, check whether the class has multiple responsibilities.

## Tests and documentation

- Add or update focused unit tests for non-trivial domain/application behavior.
- Add or update acceptance or integration tests when routes, workflows, or public contracts change.
- Keep acceptance features separated by route or workflow. Do not create giant catch-all feature files.
- Public endpoint changes must update the project's API docs and machine-readable contract files when they exist.
- Domain or event changes should update context docs and diagrams when the project maintains them.
- Pub/sub, websocket, sync, push, and job contracts should be documented with payload shape, routing, recipients, side effects, and consumer action.

## PR discipline

- Before opening or handing off a PR, run the smallest relevant checks first.
- Prefer finishing with the repository's lint, build/typecheck, and relevant tests.
- If checks fail, say exactly what fails and keep fixing unless blocked.
- PR descriptions should include:
  - Summary.
  - API or contract changes.
  - Tests run.
  - Notes for frontend or downstream consumers when contracts changed.
- When answering review comments, use the reviewer's language and state what changed or why the code is intentional.

## Never do this

- Do not create domain/application shortcuts because a test or route is inconvenient.
- Do not compare serialized primitives in domain/application code.
- Do not put business rules in controllers, mappers, repositories, schedulers, or UI components.
- Do not create redundant primitive type aliases for value objects.
- Do not add empty boundary-message folders or message classes with mismatched filenames.
- Do not invent abstractions before checking the local pattern.
- Do not leave documentation behind after changing public contracts.
- Do not claim a slice is done while lint, build/typecheck, or relevant tests are failing.
