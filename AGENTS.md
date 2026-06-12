# AGENTS.md

## Working Style

- Work in the language the user uses. If the user writes in Spanish, answer and comment PRs in Spanish.
- Be direct and practical. Prefer fixing the issue over writing a long proposal.
- Do not revert user changes. If the worktree is dirty, inspect it and work around unrelated changes.
- Make incremental commits when a coherent slice is done.
- PR comments are addressed as actionable engineering feedback unless they are clearly informational.
- When replying in PRs, make it obvious the response is from Codex. Use the same language as the comment you are answering.

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
- Do not use `Store` for domain or application persistence contracts. Use `Repository` for domain-owned persistence. `Store` is only acceptable inside infrastructure when adapting a third-party storage primitive whose own API uses that term.

## Architecture Rules

- Keep application messages at the application boundary. They receive primitives and convert them to value objects.
- Every use case must receive an explicit application message object/class, placed in a `messages/` folder under the action folder when the input comes from primitives. The message owns primitive-to-Value-Object conversion and validation. Do not pass anonymous primitive input bags directly to a use case.
- Use cases must expose a ubiquitous-language method (`find`, `create`, `send`, `reconcile`, `accept`, `update`, etc.). Do not use generic `execute`.
- A class named `Factory`, `Mapper`, `Projector`, `Catalog`, `Resolver`, or `Cipher` is not a use case by default. Put it in the layer that matches its responsibility: domain when it creates or enforces domain concepts, infrastructure when it adapts external contracts/serialization/crypto/transport, and presentation when it builds view models. Do not keep these classes in `application/<action>` just to satisfy folder shape.
- Routes and controllers must stay thin. They parse requests, build application messages, call one use case/application service, and return a view model/response. Any persistence decision, infrastructure selection, domain branching, or repeated orchestration belongs outside the route.
- Application messages may receive primitives; domain objects, entities, aggregates, policies, and domain services must receive Value Objects or domain objects.
- Application messages are mandatory for every application entrypoint that receives external primitives or DTOs. The folder must be exactly `application/<action-name>/messages/<MessageClassName>.ts`; do not create empty `messages/` folders, shared generic `application/messages`, or message classes whose filename differs from the exported class.
- Primitive-to-Value-Object transformations belong in application messages or infrastructure mappers. Do not hide this conversion inside arbitrary private methods on use cases.
- Private methods in application services are only for orchestration mechanics. If a private method validates a domain concept, maps a lifecycle/status, chooses a business branch, compares domain values, or names a domain rule, move that behavior into a Value Object, entity, aggregate, domain service, policy, or an application message.
- Do not model domain/application decisions as plain enums when a cohesive Value Object can express the concept and behavior. Prefer a Value Object such as `IncomingOneToOneCallDecision` over `enum IncomingOneToOneCallDecision`.
- Domain constructors should receive value objects, not primitive `props` bags.
- Do not use `as` casts in application/domain code unless there is no sane alternative.
- Prefer `PrimitiveOf<T>` over custom primitive type aliases.
- Follow existing aggregate patterns before inventing new abstractions.
- Avoid cross-context domain calls. Coordinate through application services, repositories, events, or API flows.
- Keep persistence models, API DTOs, OpenAPI schemas, and pub/sub payloads out of the domain model.
- Domain repository contracts belong in `domain/repositories`. Do not create `application/repository`, `application/repositories`, or application-level persistence contracts for aggregate state.
- Repository methods must return aggregate roots, entities, Value Objects, or explicit Null Objects. They must not return infrastructure documents, DTOs, generic interfaces, primitive type bags, or persistence-shaped `types`.
- Finder methods that model domain lookups should return a domain object. When absence is an expected result, return a `NullObject` for that entity/aggregate and let the application service or route map it to a 404, no-op, or explicit response. Avoid `Entity | undefined` as the normal repository contract.
- Infrastructure document shapes and storage DTOs belong under infrastructure. Do not put document `types` in `domain`, and do not leak them into application services.
- Do not create `Store` contracts or `stores` folders in domain or application. If the concept is domain persistence, it is a repository. If it is a third-party storage primitive, keep that adapter in infrastructure.
- Generic repository abstractions are not a replacement for domain repositories. A concrete adapter must implement the real repository contract of the aggregate/context it persists.
- Domain services are only for behavior that genuinely spans multiple domain objects. Do not use them as dumping grounds for logic that belongs in an entity or Value Object.
- Domain services may use domain repositories when the domain behavior requires persisted aggregate state. Application services should orchestrate domain services and repositories instead of inventing procedural shortcuts or infrastructure-facing stores.
- Application services orchestrate use cases. They should not contain domain rules that belong inside aggregates, entities, or Value Objects.
- Aggregate roots must record domain events when they are created and on every state-changing mutation. If a mutation intentionally does not emit an event, the reason must be local-only/non-replicated behavior and should be obvious from the code.
- Do not add an application port unless there is a real outbound dependency needed by a use case. A port must not be a mirror of an HTTP gateway, SDK, repository, or pass-through adapter. If a class only forwards to another adapter, either remove it or move the real implementation into the owning context infrastructure.
- Ports must speak ubiquitous language and accept Value Objects, domain objects, or explicit application messages/results. They must not force use cases to call `.toPrimitives()`, `.toString()`, or `.valueOf()` just to satisfy primitive API-shaped signatures.
- Application may depend on ports it owns, but infrastructure owns serialization to API DTOs, HTTP payloads, worker messages, browser objects, and SDK contracts. Do not put API-shaped interfaces in `application/ports` only because a concrete adapter exists.
- Context infrastructure adapters must live inside the owning context when the behavior belongs to that context. Shared infrastructure is only for genuinely generic HTTP, storage, realtime transport, or composition primitives.
- Folder shape should follow backend style where possible: `application/<action-name>/Class.ts` and `application/<action-name>/messages/Message.ts`, not generic `application/use-cases` or context-name duplication such as `application/notifications`.
- Do not leave root-level `types`, `utils`, `dto`, `messages`, `services`, or `ports` folders inside a context unless they are explicitly layer-owned and named by business language. Generic technical buckets are architecture debt.
- A context is not considered finished unless every non-trivial domain/application/infrastructure class in the touched slice has direct unit coverage, and verification scripts check for architecture regressions.
- Never claim a context/slice is finished while `yarn lint`, `yarn typecheck`, and the relevant tests fail. If any fail, say exactly what fails and keep fixing.

## Dependency Injection

- `src/shared/infrastructure/dependencyInjection/DependencyInjection.ts` is shared infrastructure. It must contain only generic container mechanics.
- Application-specific bindings belong in the composition root (`src/index.ts`) or app-level composition modules, not in shared infrastructure.
- `src/index.ts` is the composition root. It may choose implementations and register runtimes, schedulers, consumers, and routes, but it must stay declarative. If composition becomes noisy, extract app-level composition modules instead of constructing collaborators inline.
- Routes and app entrypoints must request use cases or domain/application contracts from DI with `this.get<Contract>(Contract)` or `Kernel.di.getService<Contract>(Contract)` at the composition boundary.
- Routes must call use cases. They must not instantiate repositories, infrastructure adapters, domain services, application services, or private factories for those collaborators.
- Use DI instead of manual `new` when the class is an application service, repository, adapter, consumer, scheduler, runtime, projector, publisher, or other app component.
- Consumers, schedulers, runtimes, and projectors should be resolved through one consistent DI path. Avoid parallel registration APIs that instantiate the same kind of component differently unless a real framework boundary forces it.
- App runtimes belong under `src/apps/**/runtimes` or an equivalent app composition folder. Do not hide runtime startup inside arbitrary use cases or route constructors.
- Do not call `new` inside constructors to build dependencies. Dependencies must be injected by the container.
- Classes that must be resolved automatically by the container should be exported as `default` so the generated `services.yaml` can wire them.
- `services.yaml` is generated by the container build flow. Do not hand-maintain it to hide missing exports or bad constructors.
- Abstract/domain contracts must be bound to concrete implementations in the composition root, an app-level composition module, or the generated DI configuration. Do not add dependency aliases in shared infrastructure to patch bad design.
- Do not create hand-written dependency token constants, encoded strings, or alias exports just to make erased TypeScript interfaces injectable. Injectable contracts must follow the project DI pattern, and concrete implementations must implement the real contract directly.
- Infrastructure implementations must implement the real domain/application contract they satisfy. Do not introduce generic repositories, stores, or aliases just to make DI compile.
- Do not default-export a class and then re-export it under another name or import it with `as` to hide a bad abstraction. Rename the class or contract so the names match the domain concept.
- Do not create classes that exist only to be tested. Test behavior through the real production class or extract a production abstraction only when it has a real runtime responsibility.
- Constructor dependencies must be declared directly in the constructor with visibility modifiers, for example `constructor(private readonly repository: Repository) {}`.
- Do not declare constructor dependency fields separately from the constructor unless there is a concrete technical reason, such as framework-required initialization that cannot use constructor property promotion. If there is a reason, leave it obvious in the code.
- If a constructor parameter is optional only for tests, that is a smell. Prefer proper DI, a real domain/application collaborator, or a typed mock in the test.

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
- Do not create large fake classes in tests just to satisfy interfaces.
- Use `jest-mock-extended` for typed mocks:

```ts
import { mock, MockProxy } from 'jest-mock-extended';
```

- Prefer configuring only the methods required by the scenario.
- Use hand-written test doubles only when they express meaningful domain behavior that a mock would obscure.
- Before handing off a PR/fix, prefer at least:

```bash
yarn lint
yarn test
```
