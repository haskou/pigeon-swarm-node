import Kernel from '@app/Kernel';
import fs from 'fs-extra';
import {
  Autowire,
  ContainerBuilder,
  Reference,
  ServiceFile,
  YamlFileLoader,
} from 'node-dependency-injection';
import path from 'path';

import { ContainerDefinition } from './ContainerDefinition';
import { DependencyAlias } from './DependencyAlias';
import ExplicitServiceDefinition from './ExplicitServiceDefinition';

export default class DependencyInjection {
  private static _instance: DependencyInjection;
  private readonly container: ContainerBuilder;
  private autowire: Autowire | undefined;
  private loader: YamlFileLoader | undefined;
  private readonly _servicesYamlPath: string = path.join(
    Kernel.configDirectory,
    'container',
    'services.yaml',
  );

  private readonly aliases: Map<unknown, unknown>;

  constructor(
    aliases: readonly DependencyAlias[] = [],
    // eslint-disable-next-line max-len
    private readonly explicitServices: readonly ExplicitServiceDefinition[] = [],
  ) {
    this.aliases = new Map<unknown, unknown>(aliases);
    this.container = new ContainerBuilder(false, Kernel.sourceDirectory);
  }

  private async ensureFolderExists(directoryPath: string): Promise<void> {
    const directoryPathWithoutFilename = path.dirname(directoryPath);
    try {
      const stat = await fs.stat(directoryPathWithoutFilename);

      if (!stat) {
        await fs.mkdir(directoryPathWithoutFilename, { recursive: true });
      }
    } catch (error) {
      return;
    }
  }

  private serviceIdFromSource(sourcePath: string, serviceName: string): string {
    const readableId = sourcePath
      .replace(/\//g, '__')
      .replace('.ts', '')
      .replace('@', '__')
      .concat(`__${serviceName}`);

    return Buffer.from(readableId, 'utf-8').toString('base64');
  }

  private serviceReferenceFor(serviceClass: unknown): Reference {
    const serviceId = this.serviceIdFor(
      this.aliases.get(serviceClass) ?? serviceClass,
    );

    if (typeof serviceId !== 'string') {
      throw new Error(`Service ${String(serviceClass)} is not registered.`);
    }

    return new Reference(serviceId);
  }

  private registerExplicitServices(): void {
    for (const { dependencyClasses = [], serviceClass, sourcePath } of this
      .explicitServices) {
      const serviceId = this.serviceIdFromSource(sourcePath, serviceClass.name);
      const definition = this.container.register(serviceId, serviceClass);

      for (const dependencyClass of dependencyClasses) {
        definition.addArgument(this.serviceReferenceFor(dependencyClass));
      }
    }
  }

  private containerDefinitions(): Array<[string, ContainerDefinition]> {
    const definitions = (
      this.container as unknown as {
        readonly definitions:
          | Map<string, ContainerDefinition>
          | Record<string, ContainerDefinition>;
      }
    ).definitions;

    if (definitions instanceof Map) {
      return Array.from(definitions.entries());
    }

    return Object.entries(definitions);
  }

  private serviceIdFor(serviceClass: unknown): unknown {
    if (typeof serviceClass !== 'function') {
      return serviceClass;
    }

    const exactDefinition = this.containerDefinitions().find(
      ([, definition]) => definition.Object === serviceClass,
    );

    if (exactDefinition) {
      return exactDefinition[0];
    }

    const namedDefinition = this.containerDefinitions().find(
      ([, definition]) => definition.Object?.name === serviceClass.name,
    );

    return namedDefinition ? namedDefinition[0] : serviceClass;
  }

  private registerAliases(): void {
    for (const [alias, implementation] of this.aliases) {
      const aliasId = this.serviceIdFor(alias);
      const implementationId = this.serviceIdFor(implementation);

      if (typeof aliasId === 'string' && typeof implementationId === 'string') {
        this.container.setAlias(aliasId, implementationId);
      }
    }
  }

  public async compile(): Promise<void> {
    if (process.env.CONTAINER_BUILD === 'true') {
      await this.ensureFolderExists(this._servicesYamlPath);
      this.autowire = new Autowire(this.container);
      this.autowire.serviceFile = new ServiceFile(
        this._servicesYamlPath,
        false,
      );
      await this.autowire.process();
    } else {
      this.loader = new YamlFileLoader(this.container);
      await this.loader.load(this._servicesYamlPath);
    }
    this.registerExplicitServices();
    this.registerAliases();
    await this.container.compile();
  }

  public static get instance(): DependencyInjection {
    return (
      DependencyInjection._instance ||
      (DependencyInjection._instance = new this())
    );
  }

  public getService<T>(serviceName: unknown): T {
    return this.container.get<T>(
      this.serviceIdFor(this.aliases.get(serviceName) ?? serviceName),
    );
  }
}
