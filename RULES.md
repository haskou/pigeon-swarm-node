# Project Rules

## Dependency Injection

- `src/shared/infrastructure/dependencyInjection/DependencyInjection.ts` is shared infrastructure. It must only contain generic container mechanics.
- Application-specific bindings belong in the composition root (`src/index.ts`) or app-level composition modules, not in shared infrastructure.
- Routes and app entrypoints must request use cases or domain/application contracts from DI with `this.get<Contract>(Contract)` or `Kernel.di.getService<Contract>(Contract)` at the composition boundary.
- Routes must call use cases. They must not instantiate repositories, infrastructure adapters, domain services, application services, or private factories for those collaborators.
- Use DI instead of manual `new` when the class is an application service, repository, adapter, consumer, scheduler, runtime, projector, publisher, or other app component.
- Do not call `new` inside constructors to build dependencies. Dependencies must be injected by the container.
- Classes that must be resolved automatically by the container should be exported as `default` so the generated `services.yaml` can wire them. `services.yaml` is generated at application startup; do not hand-maintain it to hide missing exports.
- Abstract/domain contracts must be bound to concrete implementations in the composition root or an app-level composition module.
- Infrastructure implementations must implement the real domain/application contract they satisfy. Do not introduce generic repositories or aliases just to make DI compile.
- Do not create classes that exist only to be tested. Test behavior through the real production class or extract a production abstraction only when it has a real runtime responsibility.
- Constructor dependencies must be declared directly in the constructor with visibility modifiers, for example `constructor(private readonly repository: Repository) {}`.
- Do not declare constructor dependency fields separately from the constructor unless there is a concrete technical reason, such as framework-required initialization that cannot use constructor property promotion. If there is a reason, leave it obvious in the code.
- If a constructor parameter is optional only for tests, that is a smell. Prefer proper DI, a real domain/application collaborator, or a typed mock in the test.

## Tests

- Do not create large fake classes in tests just to satisfy interfaces.
- Use `jest-mock-extended` for typed mocks:

```ts
import { mock, MockProxy } from 'jest-mock-extended';
```

- Prefer configuring only the methods required by the scenario.
- Use hand-written test doubles only when they express meaningful domain behavior that a mock would obscure.
