---
name: haskou-ddd-kernel
description: Use when working in a TypeScript project that depends on @haskou/ddd-kernel or node-dependency-injection, or when the codebase uses Kernel.di, generated services.yaml metadata, or class-based container resolution.
---

# @haskou/ddd-kernel dependency injection

Apply these conventions only when the project uses `@haskou/ddd-kernel`, `node-dependency-injection`, or already follows the same generated-container pattern.

## Boundaries

- Keep the container at composition boundaries. Domain objects must not depend on `Kernel.di`, a service locator, framework decorators, or container APIs.
- Prefer constructor injection inside application services, domain services, repositories, adapters, consumers, schedulers, runtimes, projectors, publishers, and routes.
- Container-managed application services, repositories, adapters, consumers, schedulers, runtimes, projectors, publishers, and routes should be resolved through the existing DI path instead of manually instantiated with `new`.
- Declare constructor dependencies directly with visibility modifiers when the project uses TypeScript constructor property promotion, for example `constructor(private readonly repository: Repository) {}`.
- Do not call `new` inside constructors to build dependencies.
- Do not make constructor dependencies optional only to simplify tests.
- Do not create production classes or abstractions whose only consumer is a test.
- Routes/controllers call use cases. They must not instantiate repositories, adapters, domain services, or application services.
- Keep the composition root declarative. If `src/index.ts` is the existing composition root, it may choose implementations, build the container, register runtimes/schedulers/consumers/routes, and start the app. Extract app-level composition modules when it becomes noisy.
- If the codebase already uses `src/apps/**/runtimes` or an equivalent app-composition folder, keep application runtimes there rather than hiding startup behavior inside use cases or route constructors.
- If the project has a shared `DependencyInjection` wrapper/module, keep it limited to generic container mechanics; application-specific bindings belong in the composition root, app-level composition modules, or generated configuration.

## `@haskou/ddd-kernel`

`@haskou/ddd-kernel` wraps `node-dependency-injection` and supports class-based resolution.

- Use `Kernel.di.getService(...)`, `kernel.di.getService(...)`, or an existing base-class `this.get(...)` only at composition/resolution boundaries.
- Do not pass `Kernel.di` into ordinary services, consumers, schedulers, or domain/application objects.
- Classes discovered by the generated container should be `default` exports when the repository uses that convention.
- `services.yaml` is generated composition metadata. Do not hand-edit it to hide missing exports, invalid constructors, or incorrect dependency design.
- Regenerate the container through the project's existing build/bootstrap flow. With `@haskou/ddd-kernel`, prefer `kernel.dependencyInjection(...)` instead of parallel ad hoc registration when generated metadata is already in use.
- Bind abstract/domain contracts to concrete implementations in the composition root, app-level composition modules, or generated DI configuration.
- Do not invent string tokens, dependency aliases, alias exports, or parallel registration APIs merely to work around TypeScript interface erasure. Follow the project's injectable-contract pattern.
- Concrete infrastructure implementations must implement the real domain/application contract they satisfy.
- Do not default-export a class and then re-export/import it under a different domain name to satisfy DI. Fix the abstraction or name.
- Consumers, schedulers, runtimes, projectors, publishers, and routes should use one consistent container path unless a real framework boundary requires otherwise.

Example composition-boundary resolution:

```ts
const finder = Kernel.di.getService<UserByIdFinder>(UserByIdFinder);
```

Keep dependencies explicit inside the resolved class:

```ts
export default class UserByIdFinder {
  constructor(private readonly repository: UserRepository) {}
}
```
