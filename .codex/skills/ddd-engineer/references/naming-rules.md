# Naming rules

Use this reference when creating or renaming classes, messages, commands, queries, services, folders, ports, events, value objects, or tests.

## General rule

Names should come from the ubiquitous language, not from technical convenience. Prefer names that answer:

- What domain concept is this?
- Why does it change?
- Which boundary owns it?

## Prefer cohesive names

Good examples:

- `ConversationMessage`, not `MessageData`.
- `CommunityMembershipRequest`, not `CommunityRequestInfo`.
- `UnreadMessageCounter`, not `CounterHelper`.
- `IdentityPresence`, not `PresenceDto` in domain/application code.

Avoid names that hide missing design:

- `Manager`
- `Helper`
- `Utils`
- `Common`
- `Base`
- `Data`
- `Info`
- `Processor`
- generic `Service`

Use `Service` only when the class is genuinely a domain, application, or infrastructure service and the local codebase uses the suffix intentionally.

Use `Handler` for framework handlers or event handlers, not as a dumping ground for orchestration and domain decisions.

Use `Mapper`, `Projector`, `Resource`, `Presenter`, or `Serializer` only at boundaries where shape conversion is the responsibility.

Use `Policy` for a reusable domain decision.

Use `Specification` only when the codebase already uses specification-style predicates and the object represents a meaningful domain predicate.

Use `Factory` only when object creation has real domain complexity or multiple valid construction paths.

## Messages, commands, and queries

Boundary messages are translators, not domain models.

Message names should be tied to intent:

- `CreateCommunityMessage`
- `SendMessageCommand`
- `FindIdentityQuery`
- `PublishKeychainMessage`

Avoid vague message names such as:

- `RequestData`
- `Input`
- `Payload`
- `Params`
- `Body`
- `Props`

Those names may be acceptable for API DTOs in the presentation layer if the project uses that convention, but they should not leak into application/domain naming.

If two use cases receive the same primitives but mean different things, create two message classes. Reuse is less important than clear intent at the boundary.

## Folder and file names

A folder name should name a layer or business action, not a generic bucket.

Prefer:

- `application/create-community/`
- `application/send-message/`
- `domain/value-objects/`
- `infrastructure/postgres-community-repository/`

Avoid root-level generic buckets inside a module unless the project already has a clear convention:

- `types/`
- `utils/`
- `dto/`
- `messages/`
- `services/`
- `ports/`
- `helpers/`
- `common/`

File names should match exported class names unless the project has a clear convention otherwise.

If a name contains `And`, `Or`, `With`, or several concepts glued together, check whether the class has multiple responsibilities.
