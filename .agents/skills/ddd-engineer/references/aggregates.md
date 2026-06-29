# Aggregates and aggregate roots

Use this reference when the work touches aggregate design, entity ownership, repository boundaries, lifecycle transitions, invariants, or domain events.

## Aggregate purpose

An aggregate is a consistency boundary. It groups the aggregate root, owned entities, and value objects that must change together to preserve invariants.

Do not introduce an aggregate only to organize files. Introduce or modify an aggregate when there is a real lifecycle, ownership boundary, invariant, or transactional consistency rule.

## Aggregate roots

The aggregate root is the only object outside the aggregate that should be loaded, saved, or referenced directly by repositories and application use cases.

External code should not mutate child entities directly. It should call intent-revealing behavior on the root, such as `conversation.addParticipant(identity)`, `community.archiveChannel(channelId, byIdentity)`, or `order.confirm(payment)`.

Use cases coordinate aggregate roots; they should not reach through the root to enforce child-entity rules.

Aggregate roots should not expose public assertion methods. A public `assertCan...`, `assertIs...`, or `assertHas...` method makes callers orchestrate preconditions instead of asking the aggregate to perform behavior or answer a domain question.

Assertion helpers on an aggregate root should be private implementation details. If there are too many of them, extract a cohesive validation class, policy, or domain service with a clear concept name, such as `UserValidator.assertIsAdmin(userId)`. If callers need the boolean form too, keep `isAdmin(userId)` with that same validator/policy instead of duplicating the rule elsewhere.

Repositories should normally be organized around aggregate roots, not every entity. Avoid repositories for child entities unless the existing codebase has a deliberate exception.

## Invariants and transactions

Keep invariants that must be immediately consistent inside a single aggregate boundary.

If a rule needs data owned by another aggregate or bounded context, coordinate through application services, domain events, policies, read models, jobs, or process managers instead of making cross-aggregate mutations from inside the domain object.

Do not inject repositories, external clients, event buses, clocks, or framework services into aggregate roots unless the local architecture explicitly permits it. Prefer passing already-obtained value objects, domain services, policies, or timestamps into behavior.

## References between aggregates

Prefer references by identity value object rather than embedding another aggregate.

A root may receive another aggregate as a method argument when the domain language and local pattern justify it, but it should not take ownership of that aggregate’s lifecycle.

Avoid primitive ID comparison outside domain behavior. Add methods such as `belongsTo(communityId)`, `isOwnedBy(identityId)`, or `canBeManagedBy(identity)` when the question is domain-specific.

## Child entities and value objects

Use child entities when identity within the aggregate matters over time.

Use value objects when equality is structural and the object has no independent lifecycle.

Do not promote a child entity to an aggregate root only because a controller or repository wants direct access. First check whether the application flow should load the owning aggregate root and call behavior on it.

## Domain events from aggregates

Domain events emitted by aggregates should describe facts that happened in ubiquitous language, such as `CommunityChannelArchived` or `MessageSent`.

Events should be raised as a result of aggregate behavior, not assembled externally as transport payloads with domain-like names.

Keep integration payload mapping at the boundary. The domain event may later be mapped to pub/sub, websocket, email, or job payloads.

## Smells

- A repository per database table rather than per aggregate root.
- Use cases modifying child entities directly.
- Controllers deciding lifecycle transitions.
- Domain events named after transport actions rather than facts.
- Aggregates that expose setters for every field.
- Aggregate roots exposing public assertion methods.
- Large clusters of private assertions that should be a named validator, policy, or domain service.
- Aggregate roots that need many unrelated services to enforce behavior.
- A large aggregate used to avoid eventual consistency where a process or event would be clearer.
- Empty aggregate folders created before any aggregate code exists.
