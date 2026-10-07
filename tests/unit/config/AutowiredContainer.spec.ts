import {
  Autowire,
  ContainerBuilder,
  ServiceFile,
} from 'node-dependency-injection';
import fs from 'node:fs';
import path from 'node:path';

/**
 * A node started with `CONTAINER_BUILD=true` autowires every default-exported
 * class under `src` and resolves each constructor parameter by its type. A
 * parameter typed with a type alias or interface has nothing to resolve to, so
 * the node then refuses to start. Plain helpers a service builds for itself
 * must therefore not be default exports.
 */
describe('autowired container', () => {
  const sourceDirectory = path.resolve(process.cwd(), 'src');

  const referencedId = (argument: unknown): string[] =>
    typeof argument === 'object' &&
    argument !== null &&
    'id' in argument &&
    typeof argument.id === 'string'
      ? [argument.id]
      : [];

  const declaresClass = (id: string): boolean =>
    /^\s*export\s+(default\s+)?(abstract\s+)?class\s/m.test(
      fs.readFileSync(path.join(sourceDirectory, `${id}.ts`), 'utf8'),
    );

  it('only resolves constructor parameters to classes', async () => {
    const container = new ContainerBuilder(false, sourceDirectory);
    const autowire = new Autowire(container);

    autowire.serviceFile = new ServiceFile(
      path.resolve(process.cwd(), 'tmp', 'autowired-services.yaml'),
      false,
    );
    await autowire.process();

    // The builder keeps its definitions in a private field with no accessor.
    const state = container as unknown as {
      _definitions: Map<string, { _args?: unknown[] }>;
    };
    const typeOnlyReferences = [...state._definitions.entries()].flatMap(
      ([serviceId, definition]) =>
        (definition._args ?? [])
          .flatMap(referencedId)
          .filter((id) => !state._definitions.has(id))
          .filter(
            (id) =>
              fs.existsSync(path.join(sourceDirectory, `${id}.ts`)) &&
              !declaresClass(id),
          )
          .map((id) => `${serviceId} -> ${id}`),
    );

    expect(typeOnlyReferences).toEqual([]);
  }, 60_000);
});
