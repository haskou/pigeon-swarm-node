# Equality semantics

`isEqual()` and `hasValue()` answer different questions. Do not treat them as aliases.

- `isEqual(other)` means **same concrete Value Object type and same value**.
- `hasValue(other)` means **same underlying value**, regardless of the other Value Object type, and also supports primitive comparisons.
- `isEqual(primitive)` is false. If a boundary or adapter deliberately needs to compare a Value Object with a primitive, use `hasValue(primitive)`.

```ts
class UserId extends StringValueObject {}
class CommunityId extends StringValueObject {}

const userId = new UserId('123');

userId.isEqual(new UserId('123')); // true
userId.isEqual(new CommunityId('123')); // false
userId.isEqual('123'); // false

userId.hasValue(new CommunityId('123')); // true
userId.hasValue('123'); // true
```

Inside domain behavior, prefer `isEqual()` because the domain type is normally part of identity/equality. Use `hasValue()` only when ignoring the type is a deliberate part of the operation, not as a shortcut to primitive obsession.
