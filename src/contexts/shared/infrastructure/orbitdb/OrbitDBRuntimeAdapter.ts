import { HeliaInstance } from '@app/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';

import { OrbitDBCore } from './OrbitDBCore';
import { OrbitDBInstance } from './OrbitDBInstance';

export class OrbitDBRuntimeAdapter {
  private orbitDBModulePromise?: Promise<OrbitDBCore>;

  private async nativeImport<TModule>(modulePath: string): Promise<TModule> {
    const importer = new Function('path', 'return import(path)') as (
      path: string,
    ) => Promise<TModule>;

    return importer(modulePath);
  }

  private async loadOrbitDBModule(): Promise<OrbitDBCore> {
    this.orbitDBModulePromise ??=
      this.nativeImport<OrbitDBCore>('@orbitdb/core');

    return this.orbitDBModulePromise;
  }

  public async createOrbitDB(options: {
    directory: string;
    id: string;
    ipfs: HeliaInstance;
  }): Promise<OrbitDBInstance> {
    const orbitDBModule = await this.loadOrbitDBModule();

    return orbitDBModule.createOrbitDB(options);
  }

  public async createDocumentsDatabase(): Promise<unknown> {
    const orbitDBModule = await this.loadOrbitDBModule();

    return orbitDBModule.Documents({ indexBy: 'id' });
  }

  public async createPrivateNetworkAccessController(): Promise<unknown> {
    const orbitDBModule = await this.loadOrbitDBModule();

    return orbitDBModule.IPFSAccessController({ write: ['*'] });
  }
}

export const orbitDBRuntimeAdapter = new OrbitDBRuntimeAdapter();
