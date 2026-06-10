# Project Rules

## Dependency Injection

- `src/shared/infrastructure/dependencyInjection/DependencyInjection.ts` is shared infrastructure. It must only contain generic container mechanics.
- Application-specific bindings belong in the composition root (`src/index.ts`) or app-level composition modules, not in shared infrastructure.
- Routes and app entrypoints must request use cases or domain/application contracts from DI. They must not instantiate repositories, infrastructure adapters, or use cases manually.
- Use DI instead of manual `new` when the class is an application service, repository, adapter, consumer, scheduler, runtime, or other app component.
- Classes that must be resolved automatically by the container should be exported as `default` so the generated `services.yaml` can wire them.
- Abstract/domain contracts must be bound to concrete implementations in the composition root.
- Do not create classes that exist only to be tested. Test behavior through the real production class or extract a production abstraction only when it has a real runtime responsibility.
- Constructor dependencies should be declared directly in the constructor with visibility modifiers, for example `constructor(private readonly repository: Repository) {}`.
- Do not declare constructor dependency fields separately from the constructor unless there is a concrete technical reason.
- If a constructor parameter is optional only for tests, that is a smell. Prefer proper DI, a real domain/application collaborator, or a typed mock in the test.

## Tests

- Do not create large fake classes in tests just to satisfy interfaces.
- Use `jest-mock-extended` for typed mocks:

```ts
import { mock, MockProxy } from 'jest-mock-extended';
```

- Prefer configuring only the methods required by the scenario.
- Use hand-written test doubles only when they express meaningful domain behavior that a mock would obscure.
