import Kernel from '@app/Kernel';
import fs from 'fs-extra';
import {
  ContainerBuilder,
  Autowire,
  YamlFileLoader,
  ServiceFile,
} from 'node-dependency-injection';
import path from 'path';

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

  constructor() {
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

  private get definitions(): Map<
    string,
    { _abstract?: boolean; _parent?: string | null }
  > {
    const container = this.container as unknown as {
      _definitions?: Map<
        string,
        { _abstract?: boolean; _parent?: string | null }
      >;
    };

    return container._definitions || new Map();
  }

  private getServiceClassName(serviceName: unknown): string | undefined {
    return typeof serviceName === 'function' ? serviceName.name : undefined;
  }

  private parentMatchesService(
    parentId: string | null | undefined,
    serviceClassName: string,
  ): boolean {
    if (!parentId) {
      return false;
    }

    const parentName = Buffer.from(parentId, 'base64').toString('utf8');

    return parentName.endsWith(`__${serviceClassName}__${serviceClassName}`);
  }

  private findConcreteChildServiceId(serviceName: unknown): string | undefined {
    const serviceClassName = this.getServiceClassName(serviceName);

    if (!serviceClassName) {
      return undefined;
    }

    const matches = [...this.definitions.entries()]
      .filter(([, definition]) => definition._abstract !== true)
      .filter(([, definition]) =>
        this.parentMatchesService(definition._parent, serviceClassName),
      )
      .map(([id]) => id);

    return matches[matches.length - 1];
  }

  public static get instance(): DependencyInjection {
    return (
      DependencyInjection._instance ||
      (DependencyInjection._instance = new this())
    );
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
    await this.container.compile();
  }

  public getService<T>(serviceName: unknown): T {
    const childServiceId = this.findConcreteChildServiceId(serviceName);

    if (childServiceId) {
      return this.container.get<T>(childServiceId);
    }

    return this.container.get<T>(serviceName);
  }
}
