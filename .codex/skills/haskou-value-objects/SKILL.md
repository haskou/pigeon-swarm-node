---
name: haskou-value-objects
description: Use @haskou/value-objects correctly in TypeScript DDD projects. Enforce Value Object behavior, Demeter-friendly comparisons, serialization boundaries, SOLID, cohesive naming, and project naming conventions.
---

# @haskou/value-objects Skill

Use this skill whenever touching TypeScript code that creates, compares, serializes, hydrates, or tests Value Objects using `@haskou/value-objects`.

This project works with DDD. Treat Value Objects as domain behavior, not decorated primitives. The whole point is to stop spraying strings, numbers, and bags of props through the domain like confetti at a legacy wedding.

## Core rule

Do not unwrap a Value Object to make a domain decision.

Use the methods exposed by the object:

- `isEqual(other)` and `isNotEqual(other)` for equality.
- `isGreaterThan`, `isGreaterOrEqualThan`, `isLessThan`, `isLessOrEqualThan`, `isZero` for numeric Value Objects.
- `add`, `subtract`, `multiply`, `divide` for numeric operations.
- `isBefore`, `isAfter`, `isBeforeOrEqual`, `isAfterOrEqual`, `isSameDay`, `isSameMonth`, `isSameYear` for timestamps.
- `includes`, `getOverlappingInterval`, `getDuration`, `getStart`, `getEnd` for timestamp intervals.
- Specific accessors like `getLatitude`, `getLongitude`, `getMonth`, `getYear`, `getDay`, `getHours`, `getMinutes`, etc.

Bad:

```ts
const isSameUser = user.id.toPrimitives() === otherUser.id.toPrimitives();
const isSameEmail = user.email.valueOf() === email.valueOf();
const startsBefore = interval.toPrimitives().start < timestamp.valueOf();
```

Good:

```ts
const isSameUser = user.id.isEqual(otherUser.id);
const isSameEmail = user.email.isEqual(email);
const includesTimestamp = interval.includes(timestamp);
```

## Boundary rule

Primitives live at boundaries. Value Objects live in the domain.

Application messages, HTTP DTOs, CLI inputs, event payloads, persistence rows, and OpenAPI schemas receive or expose primitives. Application services convert primitives into Value Objects before calling domain constructors or domain methods.

Domain constructors must receive Value Objects, not primitive `props` bags.

Bad:

```ts
new User({
  id: '507f1f77bcf86cd799439011',
  email: 'user@example.com',
});
```

Good:

```ts
new User(
  new UserId('507f1f77bcf86cd799439011'),
  new Email('user@example.com'),
);
```

## Serialization and hydration

`toPrimitives()` and `fromPrimitives()` are for crossing boundaries only:

- persistence mappers,
- DTO mapping,
- published events,
- OpenAPI/API responses,
- test snapshots of serialized contracts.

Never use `toPrimitives()` for equality, ordering, branching, filtering, or deciding business rules. That is a Demeter violation and a fast lane back to primitive obsession, which humanity apparently keeps reinventing for sport.

`valueOf()` and `toString()` are also boundary tools. Use them when writing primitives out to persistence, logs, telemetry, API responses, or external libraries. Do not use them as the default comparison mechanism inside domain or application code.

## Preferred imports

Import from the actual package name unless the project already has a local wrapper or path alias:

```ts
import { Email, PositiveNumber, ShortId, Timestamp } from '@haskou/value-objects';
```

Follow existing project import conventions first. Do not invent a parallel Value Object abstraction when the package already covers the case.

## Built-in Value Objects and methods to prefer

Common primitives:

- `StringValueObject`: string validation and `isEmpty()`.
- `NumberValueObject`: numeric comparisons and arithmetic.
- `Integer`: whole numbers.
- `PositiveNumber`: numbers greater than zero.
- `Email`: validated email values.
- `Color`: validated hex colors and case-insensitive `isEqual`.

Identifiers:

- `ShortId.generate()` for MongoDB ObjectId-style ids.
- `UUID.generate()` for UUID v4 ids.
- Compare ids with `isEqual`, never by string extraction.

Time:

- `Timestamp.now()`, `Timestamp.new(value)`, `Timestamp.fromSeconds(value)`.
- Timestamp comparison and arithmetic methods instead of primitive math.
- `CalendarDay`, `Day`, `DayOfWeek`, `Month`, `MonthOfYear`, `Year`, `Hour`, `Duration` for explicit temporal concepts.
- `TimestampInterval.fromPrimitives()` and `toPrimitives()` only for serialization/hydration.

Coordinates:

- `Latitude`, `Longitude`, `Coordinates`.
- Use `Coordinates.fromString(value)` when parsing external strings.
- Use `getLatitude()` and `getLongitude()` when domain behavior needs the coordinate parts.

Collections:

- `UniqueObjectArray<T>` expects items with `isEqual(item)`. Use it for uniqueness by Value Object behavior instead of deduping with primitives.

Hashes, media, and crypto:

- Use `MD5Hash`, `SHA256Hash`, `SHA512Hash`, `Media`, `KeyPair`, `EncryptedKeyPair`, `PrivateKey`, `PublicKey`, `Signature`, etc. when the domain actually needs those concepts.
- Do not leak crypto payload internals across the domain. Keep encryption/signing behavior on the relevant objects.

## Custom Value Objects

When the domain needs a concept that is not covered by the library, create a cohesive class that extends the closest built-in base class.

Example:

```ts
import { StringValueObject } from '@haskou/value-objects';

export class UserName extends StringValueObject {
  private static readonly MAX_LENGTH = 80;

  constructor(value: string | StringValueObject) {
    super(value, UserName.MAX_LENGTH);
  }
}
```

Rules:

- The class name must express one domain concept.
- Put validation inside the constructor or explicit factory.
- Put domain-specific behavior inside the Value Object.
- Do not create `*Utils`, `*Helper`, or primitive comparison functions when behavior belongs in the object.
- Preserve immutability. Methods should return new Value Objects unless the library type explicitly models mutation.

## Equality inside entities and aggregates

Entities and aggregates should expose meaningful behavior instead of forcing callers to inspect ids.

Bad:

```ts
if (order.customerId.valueOf() === customer.id.valueOf()) {
  // ...
}
```

Good:

```ts
if (order.belongsToCustomer(customer.id)) {
  // ...
}
```

Inside the entity:

```ts
belongsToCustomer(customerId: CustomerId): boolean {
  return this.customerId.isEqual(customerId);
}
```

## PrimitiveOf<T>

Prefer `PrimitiveOf<T>` over custom primitive aliases when a class exposes `toPrimitives()`.

Good:

```ts
type TimestampIntervalPrimitives = PrimitiveOf<TimestampInterval>;
```

Bad:

```ts
type TimestampIntervalDto = {
  start: number;
  end: number;
};
```

Create explicit DTO types only when the external contract deliberately differs from the domain primitive shape.

## Testing rules

Test behavior through Value Object methods.

Bad:

```ts
expect(email.valueOf()).toBe('user@example.com');
expect(interval.toPrimitives().start).toBe(start.valueOf());
```

Good:

```ts
expect(email.isEqual(new Email('user@example.com'))).toBe(true);
expect(interval.getStart().isEqual(start)).toBe(true);
expect(interval.includes(start)).toBe(true);
```

Use primitive assertions only for mappers, serializers, DTO contracts, snapshots, and integration boundaries.

## Architecture constraints

- DDD is mandatory.
- SOLID is mandatory.
- Keep application messages at the application boundary.
- Domain code must not depend on HTTP DTOs, OpenAPI schemas, persistence rows, or pub/sub payloads.
- Avoid cross-context domain calls. Coordinate through application services, repositories, events, or API flows.
- Follow existing aggregate patterns before introducing abstractions.
- Do not use `as` casts in application/domain code unless there is no sane alternative.
- Prefer cohesive behavior over procedural services.

## Naming constraints

- Classes use UpperCamelCase/PascalCase and singular names: `User`, `UserEmail`, `TimestampInterval`.
- File names use kebab-case and plural names: `users.ts`, `user-emails.ts`, `timestamp-intervals.ts`.
- Names must be cohesive. One name, one concept, one reason to change.
- Avoid vague names like `Data`, `Info`, `Manager`, `Helper`, `Utils`, `Common`, `Base` unless the existing codebase already has a justified convention.

## Review checklist

Before handing off code that touches Value Objects, verify:

- No `.toPrimitives()` is used for comparisons or domain branching.
- No `.valueOf()` or `.toString()` is used for avoidable domain comparison.
- Value Objects are built at boundaries and passed into the domain.
- Domain constructors do not receive primitive bags.
- Value Object methods are used for equality, ordering, arithmetic, dates, intervals, ids, and uniqueness.
- Serialization stays in mappers/DTOs/events/persistence.
- Names are cohesive, classes are singular, files are plural kebab-case.
- SOLID and DDD boundaries are preserved.
