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

  public static get instance(): DependencyInjection {
    return (
      DependencyInjection._instance ||
      (DependencyInjection._instance = new this())
    );
  }

  public getService<T>(serviceName: unknown): T {
    return this.container.get<T>(serviceName);
  }
}
