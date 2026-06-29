# Value objects and serialization

Use this reference when a task touches value objects, primitive conversion, persistence hydration, DTO mapping, authorization, equality, sorting, filtering, or lifecycle decisions.

## Principles

Value objects are domain concepts, not decorated primitives. Follow the project's existing value-object library before creating custom wrappers or aliases.

A value object should expose behavior for decisions that belong to that concept. If calling code must pull out primitive internals to decide something, first ask whether that decision belongs inside the value object, entity, aggregate, or policy.

## Comparisons

Prefer behavior over serialization:

- `identityId.isEqual(otherIdentityId)` over `identityId.toPrimitives() === otherIdentityId.toPrimitives()`.
- `period.includes(timestamp)` over comparing serialized dates.
- `role.can(permission)` over checking a primitive permission array outside the role.
- Numeric value objects should expose comparison methods when ordering or thresholds matter.
- Time and interval value objects should expose date/interval behavior when inclusion, overlap, duration, or ordering matters.

Do not compare, sort, filter, or branch on serialized primitive internals in domain or application code.

## Serialization

Serialization methods such as `toPrimitives()`, `valueOf()`, and `toString()` are boundary tools only.

Valid places for `toPrimitives()`:

- Repository persistence.
- Resource or DTO mapping.
- Published event payloads.
- Logs, telemetry, and external SDK calls.
- Contract tests that assert serialized shape.

Valid places for `fromPrimitives()`:

- Repository hydration.
- Test fixtures that intentionally build persisted state.
- Message classes only when the primitive payload is explicitly a serialized version of a value object or aggregate and the local pattern allows it.

Invalid uses:

- Equality checks.
- Authorization rules.
- Sorting or filtering domain collections.
- Deciding lifecycle transitions.
- Reaching through nested values because adding a method felt slower.

## Missing behavior

If behavior is missing, prefer adding it to the owning value object or domain concept instead of creating a helper that knows its internals.

Avoid generic conversion helpers unless the project already has a boundary-owned mapper pattern and the helper is explicitly about boundary conversion, not domain decision-making.

## Nullish behavior

Do not return `Foo | undefined`, `Foo | null`, or broad optional unions from domain/application code as defensive programming.

If absence is part of the ubiquitous language, model it explicitly with a named domain concept. If the project uses `@haskou/value-objects` and a required value/object is missing, return `NullObject.new(Foo)` instead of widening the return type, and let the appropriate error handler handle that failure path.
