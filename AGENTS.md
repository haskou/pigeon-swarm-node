# AGENTS.md

## Working Style

- Work in the language the user uses. If the user writes in Spanish, answer and comment PRs in Spanish.
- Be direct and practical. Prefer fixing the issue over writing a long proposal.
- Do not revert user changes. If the worktree is dirty, inspect it and work around unrelated changes.
- Make incremental commits when a coherent slice is done.
- PR comments are addressed as actionable engineering feedback unless they are clearly informational.
- When replying in PRs, make it obvious the response is from Codex.

## Non-Negotiable Engineering Rules

- This codebase works with Domain-Driven Design. Keep domain behavior inside the domain model.
- SOLID is mandatory: every class must have a single, explicit responsibility; if a class has multiple reasons to change, split it instead of hiding a god object behind “pragmatism”. Do not introduce shortcuts that couple layers, leak primitives, or move domain behavior into procedural helpers.
- Prefer small, cohesive classes and methods with one clear responsibility.
- Do not create abstractions before checking existing aggregate, repository, service, event, and Value Object patterns.
- Do not bypass encapsulation to make a comparison, assertion, mapper, or test easier. That is how codebases become archaeological crime scenes.
- Do not create magic strings.

## Commits

- Always use conventional commits with gitmoji.
- Examples:

```text
feat(api): ✨ Add client bootstrap endpoints
fix(calls): 🐛 Guard call endings and missed events
test(api): ✅ Isolate API feature runs
docs(calls): 📝 Fix calls OpenAPI refs
```

- Do not commit directly to `main`. Create a branch for feature/fix work.
- When a PR is ready, provide title and description.

## Naming Rules

- Names must be cohesive. A name should represent one domain concept and one reason to change.
- Avoid vague names such as `Data`, `Info`, `Manager`, `Helper`, `Utils`, `Common`, or `Base` unless an existing project convention clearly requires it.

## Architecture Rules

- Keep application messages at the application boundary. They receive primitives and convert them to value objects.
- Domain constructors should receive value objects, not primitive `props` bags.
- Do not use `as` casts in application/domain code unless there is no sane alternative.
- Prefer `PrimitiveOf<T>` over custom primitive type aliases.
- Follow existing aggregate patterns before inventing new abstractions.
- Avoid cross-context domain calls. Coordinate through application services, repositories, events, or API flows.
- Keep persistence models, API DTOs, OpenAPI schemas, and pub/sub payloads out of the domain model.
- Domain services are only for behavior that genuinely spans multiple domain objects. Do not use them as dumping grounds for logic that belongs in an entity or Value Object.
- Application services orchestrate use cases. They should not contain domain rules that belong inside aggregates, entities, or Value Objects.

## @haskou/value-objects

- Use `@haskou/value-objects` for reusable Value Objects and base classes when available.
- Import from the actual package unless the project already defines a wrapper or alias:

```ts
import { Email, PositiveNumber, ShortId, Timestamp } from '@haskou/value-objects';
```

- Treat Value Objects as behavior, not decorated primitives.
- Prefer built-in classes before creating custom ones: `StringValueObject`, `NumberValueObject`, `Integer`, `PositiveNumber`, `Email`, `Color`, `ShortId`, `UUID`, `Timestamp`, `TimestampInterval`, `CalendarDay`, `Hour`, `Duration`, `Latitude`, `Longitude`, `Coordinates`, `UniqueObjectArray`, hashes, media, and crypto objects.
- Compare Value Objects with their own methods:
  - `isEqual(other)` / `isNotEqual(other)` for equality.
  - `isGreaterThan`, `isGreaterOrEqualThan`, `isLessThan`, `isLessOrEqualThan`, `isZero` for numbers.
  - `isBefore`, `isAfter`, `isBeforeOrEqual`, `isAfterOrEqual`, `isSameDay`, `isSameMonth`, `isSameYear` for timestamps.
  - `includes`, `getOverlappingInterval`, `getDuration`, `getStart`, `getEnd` for intervals.
  - Domain-specific accessors such as `getLatitude`, `getLongitude`, `getMonth`, `getYear`, `getDay`, `getHours`, `getMinutes` when behavior needs parts of a value.
- Never use `.toPrimitives()` to compare, sort, filter, branch, or enforce business rules.
- Avoid `.valueOf()` and `.toString()` for domain comparisons. Use them only at boundaries: persistence, DTOs, events, logs, telemetry, external libraries, and contract tests.
- `toPrimitives()` and `fromPrimitives()` are serialization/hydration tools only. Valid places: persistence mappers, DTO mappers, published events, OpenAPI/API responses, and serialized contract tests.
- Do not break Demeter by pulling primitive internals out of Value Objects when the object already exposes behavior.
- Do not create helper functions that compare primitives extracted from Value Objects. Move the behavior into the Value Object, entity, or aggregate.
- When creating a custom Value Object, extend the closest base class from the package and keep validation/behavior inside the class.

Bad:

```ts
const sameUser = user.id.toPrimitives() === other.id.toPrimitives();
const sameEmail = user.email.valueOf() === email.valueOf();
const startsBefore = interval.toPrimitives().start < timestamp.valueOf();
```

Good:

```ts
const sameUser = user.id.isEqual(other.id);
const sameEmail = user.email.isEqual(email);
const includesTimestamp = interval.includes(timestamp);
```

Prefer entity/aggregate behavior over exposing internals to callers:

```ts
class Order {
  belongsToCustomer(customerId: CustomerId): boolean {
    return this.customerId.isEqual(customerId);
  }
}
```

## Skills

- When touching Value Objects or domain comparisons, apply `.codex/skills/haskou-value-objects/SKILL.md`.
- If the skill is not present in the repository, follow the `@haskou/value-objects` rules in this file directly.

## OpenAPI And Docs

- Every public endpoint must be reflected in:
  - `docs/api.md`
  - the relevant `src/apps/apis/*-api/swagger.yaml`
  - `src/apps/apis/open-api.yaml` when it is part of the aggregated spec
- Document gossip/pubsub sync contracts in `docs/pubsub-sync-protocol.md`.
- Keep PlantUML context diagrams aligned when domain structure changes.

## Testing

- Run the smallest relevant tests first.
- Prefer testing domain behavior through methods instead of serialized primitives.
- Only assert `.toPrimitives()`, `.valueOf()`, or `.toString()` in mapper, serializer, DTO, event, logging, or contract tests.
- Before handing off a PR/fix, prefer at least:

```bash
yarn lint
yarn test
```
