---
name: ddd-engineer
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
- Open the focused reference files in `references/` only when the task touches that topic:
  - `references/aggregates.md` for aggregate roots, child entities, invariants, lifecycle transitions, and aggregate-emitted events.
  - `references/bounded-contexts.md` for cross-context changes, context maps, shared kernels, and anticorruption layers.
  - `references/contract-changes.md` for APIs, events, websocket, pub/sub, push, jobs, persistence schemas, and downstream consumers.
  - `references/cqrs-read-models.md` for queries, search, dashboards, projections, read models, and read-only screens.
  - `references/domain-events.md` for domain events, integration events, eventual consistency, outbox/event publication, and event consumers.
  - `references/domain-modeling-decisions.md` for deciding whether a concept is a value object, entity, aggregate, policy, specification, factory, read model, or process manager.
  - `references/naming-rules.md` for naming classes, files, folders, messages, commands, queries, ports, events, and tests.
  - `references/pr-checklist.md` for PR handoff, review responses, and final verification summaries.
  - `references/repositories-transactions.md` for repository boundaries, transactions, units of work, concurrency, outbox, and query persistence.
  - `references/value-objects.md` for value-object behavior, primitive conversion, serialization, equality, sorting, filtering, and authorization decisions.

## Operating mode

- Work in the language the user uses.
- Prefer a small complete slice over broad half-finished architecture.
- Apply YAGNI as a hard rule. Do not add abstractions, methods, parameters, helpers, folders, or extension points until a real current use case requires them.
- Do not revert user changes. If the worktree is dirty, inspect it and keep unrelated edits intact.
- Make incremental commits when a coherent slice is finished, following the repository's commit convention.
- Treat PR comments as actionable engineering feedback unless they are clearly informational.
- If a public contract changes, explain the change for consumers of that contract.

## Project conventions

- Every method should have an explicit return type unless the local framework pattern makes that impossible.
- Every class member should declare visibility explicitly: `public`, `private`, or `protected`.
- Dependency injection should follow the project's application/infrastructure pattern. Do not couple use cases or domain classes to a concrete DI container, service locator, or framework decorator.
- Application APIs commonly use:
  - `bodies/` for HTTP body DTO validation.
  - `requests/` for presentation-to-application request objects.
  - `routes/` for thin HTTP controllers.
  - `resources/` or `view-models/` for API response shape.
  - `voters/` or policies for authorization decisions when the project already uses them.
- Asynchronous apps commonly use:
  - `events/` for integration/domain event mapping when applicable.
  - `consumers/` for message-bus consumers.
- Source layout should remain close to:
  - `src/apps/<app-name>/...`
  - `src/contexts/<bounded-context>/{application,domain,infrastructure}/...`
  - `src/shared/{application,domain,infrastructure}/...`

## Domain rules

- Domain objects receive value objects and domain objects, not primitive props bags.
- Domain behavior belongs in aggregates, entities, value objects, domain services, or policies.
- Do not move domain rules into application services, controllers, mappers, repositories, schedulers, or private helper methods.
- Constructors should express the domain model. If a constructor grows unwieldy, introduce a cohesive domain concept or factory only when it removes real complexity.
- A domain constructor with many parameters is a smell, but a generic `props` bag is not the automatic fix. Prefer naming the missing concept: metadata, scope, payload, permissions, participants, window, period, etc.
- Aggregates should expose intent-revealing behavior. Prefer `message.markAsDeleted(byIdentity)` or `community.canManageChannels(identity)` over external code mutating fields or comparing raw ids.
- Aggregate roots must not expose public assertion methods. Public `assertCan...`, `assertIs...`, or `assertHas...` methods on an aggregate root are a design smell; assertions are internal guards, not part of the aggregate's public language.
- If an aggregate collects too many private assertion helpers, extract a cohesive validation class, policy, or domain service named by the concept. For example, move admin checks into `UserValidator.assertIsAdmin(userId)`, and keep `isAdmin(userId)` there too when a boolean question is needed.
- Do not create an anemic domain model wrapped by procedural services.
- Do not use casts in domain or application code unless there is no sane alternative.
- Do not introduce magic strings. Put named domain values behind value objects, constants, or existing enum-style domain values.
- Avoid cross-context domain calls. Coordinate through application services, repositories, domain events, pub/sub, jobs, or API flows.
- Domain events should describe something that happened in ubiquitous language. They should not be transport DTOs with domain-ish names.

## Encapsulation, getters, and setters

- Do not add getters or setters to domain/application objects just to make tests easier or to let callers inspect internals.
- Do not add any production method whose only consumer is a test. Tests must exercise real public behavior, persisted state, emitted events, or boundary serialization; they must not force test-only APIs into the model.
- Public getters are allowed only when they expose a genuine boundary value or a stable domain concept that callers are meant to know. They are not a license to pull primitives out and make decisions elsewhere.
- If a method is a getter, name it with a `get` prefix. Use `getAddress()` instead of `address()` when the method only returns the address.
- If a method is a setter, name it with a `set` prefix. Use `setAddress(address)` instead of `address(address)` when the method only replaces the address.
- Do not hide getters or setters behind noun-only method names to avoid an apparent code smell. The smell is unnecessary state exposure or mutation, not the `get` or `set` word itself.
- Setters are almost always wrong in domain code. Prefer intent-revealing behavior:
  - `message.edit(payload, editedBy, editedAt)` instead of `message.setPayload(payload)`.
  - `community.renameChannel(channelId, name, actor)` instead of `channel.setName(name)`.
  - `identity.updateProfile(profile, timestamp)` instead of `identity.setProfile(profile)`.
- If a test needs to inspect state after behavior, prefer testing observable domain behavior, recorded domain events, repository persistence, or serialized shape at a boundary.
- If application code needs a getter to compare, filter, authorize, or branch, move that question into the aggregate, entity, value object, collection, or policy.
- Domain behavior is different from getters and setters. Keep ubiquitous-language methods for questions and commands that express behavior:
  - `belongsTo(identityId)`.
  - `wasCreatedBy(identityId)`.
  - `canBeEditedBy(identityId)`.
  - `hasParticipant(identityId)`.
  - `includesPermission(permission)`.
- Do not expose mutable arrays, maps, or nested objects. Return domain collections, immutable copies, or answer the question through behavior.
- A getter returning a primitive from a value object is a Demeter warning. At boundaries it may be acceptable; in domain/application decisions it is usually a design bug.

## Application rules

- Every application entrypoint that receives external primitives or DTOs must have an explicit message, command, query, or request object.
- That boundary object receives primitives and converts them to value objects.
- Use cases receive boundary messages, value objects, domain objects, or explicit application results. They should not receive anonymous primitive bags.
- Use cases expose ubiquitous-language methods such as `create`, `find`, `send`, `accept`, `update`, `delete`, `reconcile`, or `publish`.
- Do not default to generic method names like `execute` when the codebase expects ubiquitous language.
- Private methods in use cases are only for orchestration mechanics. If a private method names a business rule, move it into the domain.
- Do not create pass-through ports. A port must describe a real outbound dependency in ubiquitous language.
- Do not use defensive programming as a default. Do not return `Foo | undefined`, `Foo | null`, or broad optional unions just to force every caller to guard against missing data.
- If absence is part of the ubiquitous language, model it explicitly as a domain concept. If the project uses `@haskou/value-objects` and a required value/object is missing, return `NullObject.new(Foo)` instead of widening the return type, and let the appropriate error handler handle that failure path.

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
- Infrastructure must not contain business logic or domain decisions. Repositories, adapters, mappers, controllers, consumers, and SDK clients move data across boundaries; they do not decide permissions, lifecycle transitions, invariants, eligibility, pricing, status changes, or ownership rules.
- If infrastructure code needs a business decision to persist, map, publish, or call an external service, move that decision into the aggregate, entity, value object, policy, domain service, or application use case and pass infrastructure only the result.
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

## Domain folder structure

- `domain/` contains the business model and business rules. It must not know HTTP, database schemas, queues, SDK payloads, UI components, OpenAPI, JSON resource shapes, or framework decorators.
- Domain code may depend on other domain concepts in the same bounded context and on shared domain primitives/value-object base classes. It should not depend on application or infrastructure.
- Keep domain folders named by domain concept, not by technical convenience.

### `domain/<AggregateRoot>.ts`

- Use for aggregate roots: objects that own consistency boundaries and lifecycle rules.
- Aggregate roots coordinate entities/value objects inside the aggregate.
- They expose intent-revealing methods such as `publish`, `rename`, `join`, `leave`, `markAsRead`, `delete`, `accept`, or `reject`.
- They should protect invariants internally. External code should not need to inspect fields and decide if a transition is allowed.
- Constructors receive value objects and domain objects, not API DTOs or primitive props bags.
- Aggregate roots should record domain events when they are created and when meaningful domain mutations happen.
- A mutating aggregate method should usually either:
  - change no state because the operation is idempotent or rejected.
  - change state and record the corresponding domain event.
- Do not let application services, repositories, or controllers invent domain events for aggregate state changes. The aggregate that owns the invariant should record the event.
- Domain events should be recorded after invariants pass and state has changed, not before validation.
- Do not record events for purely technical persistence/hydration changes.

### `domain/<Entity>.ts`

- Use for domain entities that have identity and lifecycle but are not aggregate roots.
- Entities should still own their behavior. Do not make them passive records unless they are genuinely immutable data under an aggregate.
- Entity identity should be modeled with a value object.
- If an entity cannot exist independently from an aggregate, keep its mutations controlled by the aggregate.

### `domain/value-objects/`

- Use for immutable concepts defined by their value, validation, formatting, and behavior.
- Value objects are the right place for:
  - ids and references.
  - names, handles, titles, descriptions, statuses, scopes, permissions, limits, counters, timestamps, windows, and serialized external identifiers.
  - validation rules such as length, allowed characters, ranges, protocol constraints, or domain-specific parsing.
  - comparison behavior such as equality, ordering, inclusion, expiration, matching, or permission checks.
- A value object should answer domain questions without leaking primitives.
- Do not create a custom value object if the project or a value-object library already has a suitable one.
- Do not create a value object that only wraps a primitive and adds no validation or behavior unless it clarifies a real domain concept.

### `domain/events/`

- Use for domain events: immutable facts that already happened in the domain.
- Event names should be past tense and ubiquitous-language based, such as `MessageWasSent`, `IdentityWasUpdated`, or `CommunityMemberWasAdded`.
- Domain events should contain only the data needed by consumers to react or fetch state.
- Domain events are not transport payloads. Infrastructure can map them to pub/sub, websocket, queue, or integration payloads.
- Do not put command/request intent in events. `CreateUserEvent` is usually wrong; `UserWasCreated` is the domain fact.
- Creation events should be emitted by the aggregate creation path, normally via a named factory/static constructor or constructor pattern already used by the project.
- Mutation events should be emitted by aggregate behavior methods, not by external orchestration after calling setters.
- Event payloads should identify the aggregate, relevant actor when applicable, and the minimal changed facts. Do not dump the whole aggregate unless that is the explicit local event contract.
- Rehydrating an aggregate from persistence must not re-record historical domain events.

### `domain/repositories/`

- Use for repository interfaces owned by the domain/application boundary.
- Repository methods should speak ubiquitous language: `save`, `search`, `findById`, `findByOwner`, `matching`, `exists`, `delete`, depending on local convention.
- Repository interfaces should accept and return aggregates, entities, value objects, or domain collections, not database rows or API DTOs.
- Repository implementations belong in infrastructure.
- Do not leak Mongo, SQL, Redis, HTTP, IPFS, filesystem, or SDK concepts into domain repository interfaces.

### `domain/services/`

- Use only for domain behavior that genuinely spans multiple domain objects and does not naturally belong to one aggregate or value object.
- Domain services should be rare, cohesive, and named by the business capability or decision.
- They should receive domain objects/value objects and return domain objects/value objects/domain decisions.
- Do not use domain services as a dumping ground for code that felt awkward inside a use case.
- If a service only calls a repository or external adapter, it is probably application or infrastructure, not domain.

### `domain/policies/`

- Use for named reusable business decisions, permissions, or lifecycle rules.
- Policies should answer clear questions: `canDeleteMessage`, `canManageChannel`, `shouldReplicateContent`, `canJoinCommunity`.
- Policies receive domain objects/value objects and return domain decisions, booleans, or domain result objects.
- If a policy needs primitives from a value object, add behavior to the value object instead.
- Do not hide persistence or external calls inside a domain policy.

### `domain/specifications/`

- Use only if the project already uses the Specification pattern or the predicate is a meaningful domain concept.
- Specifications should model reusable predicates, not replace simple methods.
- Avoid creating `Specification` classes just to avoid adding behavior to an entity or value object.

### `domain/factories/`

- Use for domain creation when construction has real business complexity, multiple valid construction paths, generated domain ids, default domain state, or invariants spanning nested objects.
- Factories receive primitives only if the local project explicitly treats them as boundary factories. Otherwise they receive value objects/domain objects.
- Do not add factories just because a constructor has several parameters. First look for missing named concepts.
- A factory should create a valid domain object, not partially initialized state.

### `domain/collections/`

- Use for collections with domain behavior, not as aliases for arrays.
- A domain collection may enforce uniqueness, ordering, membership rules, limits, or query behavior in ubiquitous language.
- Callers should ask the collection domain questions instead of extracting arrays and filtering primitives.

### `domain/errors/`

- Use for domain errors that represent violated business rules.
- Error names should describe the rule: `CommunityOwnerCannotLeaveError`, `MessageAlreadyDeletedError`, `InvalidIdentityHandleError`.
- Do not throw generic `Error` for expected business violations.
- Do not put HTTP status codes, controller response shapes, or transport details inside domain errors.

### `domain/exceptions/`

- Use only if the project convention says "exceptions" instead of "errors".
- Do not keep both `errors/` and `exceptions/` for the same concept unless the existing codebase already distinguishes them clearly.

### `domain/enums/`

- Avoid plain enums when behavior matters.
- Prefer enum-style value objects for statuses, types, permissions, visibility, modes, and lifecycle states.
- If a plain enum exists by convention, keep domain behavior out of external switch statements where possible.
- Do not scatter string literal states across application or infrastructure.

### `domain/types/`

- Avoid this folder by default.
- Domain-specific concepts should usually be value objects, entities, policies, or collections.
- Boundary primitive helper types belong near the boundary that serializes/deserializes them.
- If the project uses a value-object helper such as `PrimitiveOf<T>`, prefer it over custom primitive aliases.

### `domain/utils/` and `domain/helpers/`

- Do not create these folders.
- A helper in domain almost always means behavior is missing from a value object, entity, aggregate, collection, service, or policy.
- If a utility is truly generic and not domain-specific, it belongs in shared infrastructure or a shared kernel only if the project has one.

### `domain/constants/`

- Avoid this folder for business concepts.
- Stable domain values should usually be value objects, enum-style value objects, policies, or named concepts.
- Use constants only for genuinely universal, stable, non-behavioral values where the local codebase convention allows it.

### `domain/index.ts`

- Use only as a deliberate public module barrel if the project allows barrels.
- Do not put behavior, initialization, side effects, or unrelated exports in `index.ts`.
- Do not use barrels to hide circular dependencies.

### `domain/mappers/` and `domain/dto/`

- Do not create these folders for persistence/API conversion.
- Mapping to database rows, HTTP resources, pub/sub payloads, websocket payloads, and external SDK DTOs belongs outside the domain.
- A domain mapper is acceptable only if it maps between domain concepts and is named by that domain transformation.

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

## File naming rules

- File names should reveal the domain/application concept without opening the file.
- A file exporting one main class should normally have the same name as that class:
  - `CreateOrderMessage.ts` exports `CreateOrderMessage`.
  - `OrderCreatedDomainEvent.ts` exports `OrderCreatedDomainEvent`.
  - `OrderRepository.ts` exports `OrderRepository`.
- Do not name files by technical buckets when they contain domain/application concepts:
  - avoid `types.ts`, `helpers.ts`, `utils.ts`, `constants.ts`, `common.ts`, `models.ts`, `data.ts`, `interfaces.ts`, and `index.ts` as dumping grounds.
- A file named `types.ts` is acceptable only when the local convention uses it for pure boundary contract types, never as a place to hide domain decisions.
- A file named `constants.ts` is acceptable only for genuine stable constants at a boundary. Domain values should usually be value objects, enum-style domain values, or named domain concepts.
- A file named `index.ts` should be a deliberate barrel or public module entrypoint. It should not contain domain behavior, application orchestration, or unrelated exports.
- One file should have one main reason to change. If it contains several exported classes with independent responsibilities, split it.
- Keep boundary files named by boundary role:
  - `CreateOrderBody.ts` for HTTP body DTOs.
  - `OrderResource.ts` for API response resources.
  - `MongoOrderRepository.ts` for a Mongo adapter.
  - `OrderWasCreatedPubSubPayload.ts` for an integration payload.
- Keep domain/application files named by ubiquitous language:
  - `OrderPaymentPolicy.ts`, not `PaymentRules.ts`.
  - `CustomerCanPlaceOrder.ts` only if the project uses specification-style predicates.
  - `OrderTotal.ts`, not `AmountWrapper.ts`.
- Avoid suffix drift. Do not rename the same kind of concept across the codebase as `Command`, `Message`, `Request`, and `Input` unless those words mean different things in the project.
- Do not put DTO suffixes on domain classes. `OrderDto` is not a domain object.
- Do not put domain suffixes on DTOs. `OrderDomainModelBody` is nonsense.
- Folder names and file names should agree. A file in `application/create-order/messages/` should not be called `Payload.ts`.
- If a file name needs `For`, `With`, `And`, or several nouns to explain itself, check whether it is mixing responsibilities or missing a named concept.
- Test files should mirror the behavior under test:
  - `OrderTotal.spec.ts` for value-object behavior.
  - `CreateOrder.spec.ts` for a use case.
  - `PostOrderRoute.feature` or equivalent for an acceptance route workflow.
- Do not create "misc" files. If the only honest name is generic, the design is not finished.

## Tests and documentation

- Add or update focused unit tests for non-trivial domain/application behavior.
- Add or update acceptance or integration tests when routes, workflows, or public contracts change.
- Keep acceptance features separated by route or workflow. Do not create giant catch-all feature files.
- Unit tests should use the repository's existing test framework and mocking conventions.
- Prefer AAA structure: arrange, act, assert.
- Use object mothers/builders when creating complex aggregates, entities, value objects, or persisted fixtures. Keep mothers under the existing test mother folder convention.
- Unit specs should live under the repository's unit test tree and mirror the behavior under test, for example `tests/unit/.../CommunityRole.spec.ts`.
- Acceptance scenarios should live in the existing feature folders:
  - API routes under `tests/api/features`.
  - Consumers under `tests/consumers/features`.
  - Commands under `tests/commands/features` when that folder exists.
- Acceptance scenarios should read like user/system behavior. Use `Given`, `When`, `Then`; avoid scenario names that only repeat implementation method names.
- Cover happy path, negative path, and meaningful domain errors when the behavior has rules.
- Do not assert private state through getters added for tests. Exercise behavior and assert domain events, returned results, persistence, resources, or public contract shape.
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
