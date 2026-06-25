---
name: haskou-value-objects
description: Use @haskou/value-objects correctly in TypeScript DDD projects. Enforce Value Object behavior, Enum-style domain values, Demeter-friendly comparisons, serialization boundaries, SOLID, cohesive naming, and project naming conventions.
---

# @haskou/value-objects Skill

Use this skill whenever touching TypeScript code that creates, compares, serializes, hydrates, validates, or tests Value Objects using `@haskou/value-objects`.

This project works with DDD. Treat Value Objects as domain behavior, not decorated primitives. The whole point is to stop spraying strings, numbers, enums, and bags of props through the domain like confetti at a legacy wedding.

## Core rule

Do not unwrap a Value Object to make a domain decision.

Use the methods exposed by the object:

- `isEqual(other)` and `isNotEqual(other)` for equality.
- Domain-specific predicates like `isPaid()`, `isDraft()`, `canBeCancelled()`, `belongsToCustomer(customerId)`, etc. when the comparison has business meaning.
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
const isPaid = order.status.valueOf() === 'paid';
```

Good:

```ts
const isSameUser = user.id.isEqual(otherUser.id);
const isSameEmail = user.email.isEqual(email);
const includesTimestamp = interval.includes(timestamp);
const isPaid = order.status.isPaid();
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
new User(new UserId('507f1f77bcf86cd799439011'), new Email('user@example.com'));
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

For `Enum`-style Value Objects, expose `fromPrimitives(value)` or another explicit boundary factory when hydration needs to accept a raw string or number. Keep invalid-value rejection inside the Value Object constructor/factory, not scattered through controllers, repositories, handlers, or other procedural junk drawers.

## Preferred imports

Import from the actual package name unless the project already has a local wrapper or path alias:

```ts
import {
  Email,
  Enum,
  PositiveNumber,
  ShortId,
  Timestamp,
} from '@haskou/value-objects';
```

Follow existing project import conventions first. Do not invent a parallel Value Object abstraction when the package already covers the case.

If the codebase has a local `EnumValueObject` wrapper or alias, treat it as an `Enum`-style Value Object and apply the same rules. Do not introduce both `Enum` and `EnumValueObject` patterns in the same bounded context unless the existing codebase already made that mess and you are containing it, not feeding it.

## Built-in Value Objects and methods to prefer

Common primitives:

- `ValueObject<T>`: base class for single primitive Value Objects.
- `StringValueObject`: string validation and `isEmpty()`.
- `NumberValueObject`: numeric comparisons and arithmetic.
- `Integer`: whole numbers.
- `PositiveNumber`: numbers greater than zero.
- `Email`: validated email values.
- `Color`: validated hex colors, predefined colors, and case-insensitive `isEqual`.

Finite domain values:

- `Enum<T>`: base class for finite, validated primitive sets such as statuses, types, modes, roles, categories, frequencies, or provider codes.
- Use `getValues()` to declare the allowed primitive values.
- Put predicates and transitions on the concrete class, not in random `switch` statements.

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

- `UniqueObjectArray<T>` expects items with `isEqual(item)`.
- Use it for uniqueness by Value Object behavior instead of deduping with primitives.
- Prefer `includes`, `push`, `remove`, `length`, and `toArray()` over hand-rolled array rituals.

Hashes, media, and crypto:

- Use `MD5Hash`, `SHA256Hash`, `SHA512Hash`, `Media`, `KeyPair`, `EncryptedKeyPair`, `PrivateKey`, `EncryptedPrivateKey`, `PublicKey`, `Signature`, etc. when the domain actually needs those concepts.
- Use `Hash.from(...)`, `toBase64()`, `Media.getBuffer()`, `Media.getSize()`, and `Media.getBase64()` at boundaries or crypto/media behavior points.
- Do not leak crypto payload internals across the domain. Keep encryption/signing behavior on the relevant objects.

Nullish behavior:

- `ValueObject` supports the library's Null Object behavior for `null` or `undefined` inputs.
- Do not return `Foo | undefined`, `Foo | null`, or broad optional unions from domain/application code as defensive programming.
- If a required value/object is missing, return `NullObject.new(Foo)` instead of widening the return type, and let the appropriate error handler handle that failure path.
- Do not pass `null` or `undefined` intentionally to mean a business state unless the existing design explicitly models that pattern.
- Prefer explicit domain concepts such as `OptionalDeliveryDate`, `UnassignedOwner`, or nullable fields at the boundary when absence is part of the language.

## Enum / EnumValueObject-style Value Objects

Use an `Enum`-style Value Object when the domain concept has a closed set of valid primitive values and may grow behavior over time.

Good candidates:

- `OrderStatus`, `PaymentStatus`, `InvoiceStatus`.
- `CurrencyCode`, `CountryCode`, `LocaleCode` when the domain cares about the allowed set.
- `NotificationChannel`, `ShipmentProvider`, `BillingPeriod`, `UserRole`.
- `PlanType`, `FeatureFlag`, `PermissionScope`, `RetryStrategy`.

Bad candidates:

- Free text fields.
- Unbounded external provider values that are not controlled by the domain.
- UI labels, translated strings, icons, colors, CSS classes, or display names. That stuff belongs in presenters/mappers, because apparently even strings need costumes now.

The package exports `Enum`. Some projects may call the same idea `EnumValueObject`. The rule is the same: the class owns valid values, comparison, predicates, and domain behavior.

Bad:

```ts
export enum OrderStatus {
  DRAFT = 'draft',
  PAID = 'paid',
  CANCELLED = 'cancelled',
}

if (order.status === OrderStatus.PAID) {
  // domain decision outside the domain model
}

if (order.status === 'cancelled') {
  // raw string cosplay
}
```

Good:

```ts
import { Enum } from '@haskou/value-objects';

enum OrderStatusPrimitive {
  DRAFT = 'draft',
  PAID = 'paid',
  CANCELLED = 'cancelled',
  SHIPPED = 'shipped',
}

export class OrderStatus extends Enum<string> {
  static readonly DRAFT = new OrderStatus(OrderStatusPrimitive.DRAFT);
  static readonly PAID = new OrderStatus(OrderStatusPrimitive.PAID);
  static readonly CANCELLED = new OrderStatus(OrderStatusPrimitive.CANCELLED);
  static readonly SHIPPED = new OrderStatus(OrderStatusPrimitive.SHIPPED);

  private constructor(value: string) {
    super(value);
  }

  static fromPrimitives(value: string): OrderStatus {
    return new OrderStatus(value);
  }

  getValues(): string[] {
    return Object.values(OrderStatusPrimitive);
  }

  isDraft(): boolean {
    return this.isEqual(OrderStatus.DRAFT);
  }

  isPaid(): boolean {
    return this.isEqual(OrderStatus.PAID);
  }

  isCancelled(): boolean {
    return this.isEqual(OrderStatus.CANCELLED);
  }

  canBePaid(): boolean {
    return this.isDraft();
  }

  canBeShipped(): boolean {
    return this.isPaid();
  }

  pay(): OrderStatus {
    if (this.canBePaid() === false) {
      throw new Error('Only draft orders can be paid');
    }

    return OrderStatus.PAID;
  }
}
```

Rules:

- Keep the primitive enum, literal list, or allowed-values object private to the Value Object module unless the existing codebase already exposes it as contract.
- Prefer static readonly instances for named values.
- Provide `fromPrimitives(value)` when external layers hydrate from strings/numbers.
- Do not export raw enum primitives as the domain API.
- Do not compare `status.valueOf()` to strings inside entities, aggregates, application services, policies, or tests.
- Do not switch on `status.valueOf()` in domain code. Add behavior to the Value Object or to the aggregate.
- Use semantic methods: `isPaid`, `isFinal`, `canTransitionTo`, `canBeCancelled`, `requiresInvoice`, etc.
- Keep transition rules close to the aggregate when they require aggregate state. Keep pure state questions on the Value Object.
- Throw a domain-specific error when an invalid transition matters to the domain. Let constructor validation reject impossible enum values.

Bad transition logic:

```ts
if (order.status.valueOf() === 'draft') {
  order.status = OrderStatus.PAID;
}
```

Good transition logic:

```ts
order.pay();
```

Inside the aggregate:

```ts
pay(): void {
  this.status = this.status.pay();
  this.paidAt = Timestamp.now();
}
```

## Enum labels, mappings, and external contracts

Display metadata is not the enum.

Bad:

```ts
if (order.status.valueOf() === 'paid') {
  return 'Paid order';
}
```

Good at a presentation boundary:

```ts
const orderStatusLabels: Record<string, string> = {
  draft: 'Draft',
  paid: 'Paid',
  cancelled: 'Cancelled',
  shipped: 'Shipped',
};

return {
  status: order.status.valueOf(),
  statusLabel: orderStatusLabels[order.status.valueOf()],
};
```

This is acceptable because it is serialization/presentation code. Do not copy this pattern into domain behavior unless you enjoy debugging business logic hidden inside translation glue.

When external contracts need strict enum schemas, define the API/OpenAPI enum at the boundary and map it to the domain `Enum` Value Object. Do not make the domain depend on generated OpenAPI enums.

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
- Prefer named factories like `fromPrimitives`, `fromString`, `fromSeconds`, `fromTimestamp`, `generate`, or `now` when construction needs intent.

## Equality inside entities and aggregates

Entities and aggregates should expose meaningful behavior instead of forcing callers to inspect ids or status values.

Bad:

```ts
if (order.customerId.valueOf() === customer.id.valueOf()) {
  // ...
}

if (order.status.valueOf() === 'paid') {
  // ...
}
```

Good:

```ts
if (order.belongsToCustomer(customer.id)) {
  // ...
}

if (order.isPaid()) {
  // ...
}
```

Inside the entity:

```ts
belongsToCustomer(customerId: CustomerId): boolean {
  return this.customerId.isEqual(customerId);
}

isPaid(): boolean {
  return this.status.isPaid();
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

Do not force `PrimitiveOf<T>` onto simple `ValueObject` classes that only expose `valueOf()`. For those, either use the primitive at the boundary directly or add a deliberate `toPrimitives()` method if the object has a real serialized contract.

## Testing rules

Test behavior through Value Object methods.

Bad:

```ts
expect(email.valueOf()).toBe('user@example.com');
expect(interval.toPrimitives().start).toBe(start.valueOf());
expect(status.valueOf()).toBe('paid');
```

Good:

```ts
expect(email.isEqual(new Email('user@example.com'))).toBe(true);
expect(interval.getStart().isEqual(start)).toBe(true);
expect(interval.includes(start)).toBe(true);
expect(status.isPaid()).toBe(true);
```

Use primitive assertions only for mappers, serializers, DTO contracts, snapshots, and integration boundaries.

Enum tests should cover:

- valid values can be hydrated through the factory,
- invalid values are rejected,
- semantic predicates return the expected result,
- transition methods accept valid transitions,
- transition methods reject invalid transitions,
- serialized boundary output matches the external contract.

Example:

```ts
expect(OrderStatus.fromPrimitives('paid').isPaid()).toBe(true);
expect(() => OrderStatus.fromPrimitives('whatever')).toThrow();
expect(OrderStatus.DRAFT.pay().isPaid()).toBe(true);
expect(() => OrderStatus.CANCELLED.pay()).toThrow();
```

Primitive enum/string assertions are acceptable only when testing boundary mapping:

```ts
expect(OrderStatusMapper.toPersistence(OrderStatus.PAID)).toBe('paid');
```

## Architecture constraints

- DDD is mandatory.
- SOLID is mandatory.
- Keep application messages at the application boundary.
- Domain code must not depend on HTTP DTOs, OpenAPI schemas, persistence rows, generated clients, or pub/sub payloads.
- Avoid cross-context domain calls. Coordinate through application services, repositories, events, or API flows.
- Follow existing aggregate patterns before introducing abstractions.
- Do not use `as` casts in application/domain code unless there is no sane alternative.
- `as const` is acceptable for literal tuple declarations that define finite values, but do not use unsafe casts to smuggle invalid primitives into Value Objects.
- Prefer cohesive behavior over procedural services.
- Keep finite-state workflow rules in the aggregate or the relevant `Enum` Value Object, not in application handlers.

## Naming constraints

- Classes use UpperCamelCase/PascalCase and singular names: `User`, `UserEmail`, `TimestampInterval`, `OrderStatus`.
- File names use kebab-case and plural names: `users.ts`, `user-emails.ts`, `timestamp-intervals.ts`, `order-statuses.ts`.
- Names must be cohesive. One name, one concept, one reason to change.
- Enum-style Value Objects should name the domain concept, not the implementation: `OrderStatus`, not `OrderStatusEnumValueObject`.
- Avoid vague names like `Data`, `Info`, `Manager`, `Helper`, `Utils`, `Common`, `Base` unless the existing codebase already has a justified convention.

## Review checklist

Before handing off code that touches Value Objects, verify:

- No `.toPrimitives()` is used for comparisons or domain branching.
- No `.valueOf()` or `.toString()` is used for avoidable domain comparison.
- No raw string/number enum value is compared inside domain or application behavior.
- `Enum`/`EnumValueObject`-style classes own allowed values, predicates, and pure transitions.
- Invalid enum/status/type values are rejected by construction or factory hydration.
- Value Objects are built at boundaries and passed into the domain.
- Domain constructors do not receive primitive bags.
- Domain code does not depend on generated DTO enums, OpenAPI enums, persistence enum columns, or UI labels.
- Value Object methods are used for equality, ordering, arithmetic, dates, intervals, ids, enums, and uniqueness.
- Serialization stays in mappers/DTOs/events/persistence.
- Presentation labels and external mappings stay outside the domain.
- Names are cohesive, classes are singular, files are plural kebab-case.
- SOLID and DDD boundaries are preserved.
