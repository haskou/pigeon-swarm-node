import Kernel from '@app/Kernel';
import {
  ContainerBuilder,
  Autowire,
  YamlFileLoader,
  ServiceFile,
} from 'node-dependency-injection';
import path from 'path';
import fs from 'fs-extra';

export default class DependencyInjection {
  private readonly _container: ContainerBuilder;
  private _autowire: Autowire;
  private static _instance: DependencyInjection;
  private _loader: YamlFileLoader;
  private readonly _servicesYamlPath: string = path.join(
    Kernel.configDirectory,
    'container',
    'services.yaml',
  );

  constructor() {
    this._container = new ContainerBuilder(false, Kernel.sourceDirectory);
  }

  public async compile(): Promise<void> {
    if (process.env.CONTAINER_BUILD === 'true') {
      await this.ensureFolderExists(this._servicesYamlPath);
      this._autowire = new Autowire(this._container);
      this._autowire.serviceFile = new ServiceFile(
        this._servicesYamlPath,
        false,
      );
      await this._autowire.process();
    } else {
      this._loader = new YamlFileLoader(this._container);
      await this._loader.load(this._servicesYamlPath);
    }
    await this._container.compile();
  }

  public static get instance(): DependencyInjection {
    return (
      DependencyInjection._instance ||
      (DependencyInjection._instance = new this())
    );
  }

  public getService<T>(serviceName: unknown): T {
    return this._container.get<T>(serviceName);
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
}
