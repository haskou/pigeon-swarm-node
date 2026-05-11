import type { json as createHeliaJsonClient } from '@helia/json';
import type { preSharedKey } from '@libp2p/pnet';
import type { multiaddr } from '@multiformats/multiaddr';
import type { MemoryBlockstore } from 'blockstore-core';
import type { FsBlockstore } from 'blockstore-fs';
import type { MemoryDatastore } from 'datastore-core';
import type { FsDatastore } from 'datastore-fs';
import type * as HeliaCore from 'helia';
import type { Key as DatastoreKey } from 'interface-datastore/key';
import type { createLibp2p } from 'libp2p';
import type { CID as MultiformatsCid } from 'multiformats/cid';

export type HeliaJSONClient = ReturnType<typeof createHeliaJsonClient>;
export type HeliaLibp2pConfig = Parameters<typeof createLibp2p>[0];
export type HeliaInstance = HeliaCore.Helia;
export type Libp2pDefaults = ReturnType<typeof HeliaCore.libp2pDefaults>;
export type RuntimeBlockstore = FsBlockstore | MemoryBlockstore;
export type RuntimeDatastore = FsDatastore | MemoryDatastore;
export type DatastoreKeyLike = DatastoreKey;
export type ParsedCidLike = MultiformatsCid;

export class HeliaRuntimeAdapter {
  private heliaModulePromise?: Promise<typeof HeliaCore>;
  private heliaJsonModulePromise?: Promise<typeof import('@helia/json')>;
  private libp2pModulePromise?: Promise<typeof import('libp2p')>;
  private pnetModulePromise?: Promise<typeof import('@libp2p/pnet')>;
  private multiaddrModulePromise?: Promise<
    typeof import('@multiformats/multiaddr')
  >;

  private datastoreKeyModulePromise?: Promise<
    typeof import('interface-datastore/key')
  >;

  private cidModulePromise?: Promise<typeof import('multiformats/cid')>;
  private blockstoreCoreModulePromise?: Promise<
    typeof import('blockstore-core')
  >;

  private blockstoreFsModulePromise?: Promise<typeof import('blockstore-fs')>;
  private datastoreCoreModulePromise?: Promise<typeof import('datastore-core')>;

  private datastoreFsModulePromise?: Promise<typeof import('datastore-fs')>;

  private isJestRuntime(): boolean {
    return process.env.JEST_WORKER_ID !== undefined;
  }

  private async nativeImport<TModule>(modulePath: string): Promise<TModule> {
    if (this.isJestRuntime()) {
      return import(modulePath) as TModule;
    }

    const importer = new Function('path', 'return import(path)') as (
      path: string,
    ) => Promise<TModule>;

    return importer(modulePath);
  }

  private loadHeliaModule(): Promise<typeof HeliaCore> {
    this.heliaModulePromise ??= this.nativeImport<typeof HeliaCore>('helia');

    return this.heliaModulePromise;
  }

  private loadHeliaJsonModule(): Promise<typeof import('@helia/json')> {
    this.heliaJsonModulePromise ??=
      this.nativeImport<typeof import('@helia/json')>('@helia/json');

    return this.heliaJsonModulePromise;
  }

  private loadLibp2pModule(): Promise<typeof import('libp2p')> {
    this.libp2pModulePromise ??=
      this.nativeImport<typeof import('libp2p')>('libp2p');

    return this.libp2pModulePromise;
  }

  private loadPnetModule(): Promise<typeof import('@libp2p/pnet')> {
    this.pnetModulePromise ??=
      this.nativeImport<typeof import('@libp2p/pnet')>('@libp2p/pnet');

    return this.pnetModulePromise;
  }

  private loadMultiaddrModule(): Promise<
    typeof import('@multiformats/multiaddr')
  > {
    this.multiaddrModulePromise ??= this.nativeImport<
      typeof import('@multiformats/multiaddr')
    >('@multiformats/multiaddr');

    return this.multiaddrModulePromise;
  }

  private loadDatastoreKeyModule(): Promise<
    typeof import('interface-datastore/key')
  > {
    this.datastoreKeyModulePromise ??= this.nativeImport<
      typeof import('interface-datastore/key')
    >('interface-datastore/key');

    return this.datastoreKeyModulePromise;
  }

  private loadCidModule(): Promise<typeof import('multiformats/cid')> {
    this.cidModulePromise ??=
      this.nativeImport<typeof import('multiformats/cid')>('multiformats/cid');

    return this.cidModulePromise;
  }

  private loadBlockstoreCoreModule(): Promise<
    typeof import('blockstore-core')
  > {
    this.blockstoreCoreModulePromise ??=
      this.nativeImport<typeof import('blockstore-core')>('blockstore-core');

    return this.blockstoreCoreModulePromise;
  }

  private loadBlockstoreFsModule(): Promise<typeof import('blockstore-fs')> {
    this.blockstoreFsModulePromise ??=
      this.nativeImport<typeof import('blockstore-fs')>('blockstore-fs');

    return this.blockstoreFsModulePromise;
  }

  private loadDatastoreCoreModule(): Promise<typeof import('datastore-core')> {
    this.datastoreCoreModulePromise ??=
      this.nativeImport<typeof import('datastore-core')>('datastore-core');

    return this.datastoreCoreModulePromise;
  }

  private loadDatastoreFsModule(): Promise<typeof import('datastore-fs')> {
    this.datastoreFsModulePromise ??=
      this.nativeImport<typeof import('datastore-fs')>('datastore-fs');

    return this.datastoreFsModulePromise;
  }

  private withoutWebRtcTransports(defaults: Libp2pDefaults): Libp2pDefaults {
    const config = defaults as unknown as {
      addresses?: {
        listen?: string[];
      };
      transports?: Array<(...args: unknown[]) => unknown>;
    };

    config.addresses = {
      ...(config.addresses || {}),
      listen: (config.addresses?.listen || []).filter(
        (address) => !address.includes('webrtc'),
      ),
    };
    config.transports = (config.transports || []).filter((transport) => {
      const source = transport.toString().toLowerCase();

      return !source.includes('webrtc');
    });

    return defaults;
  }

  public async createJSONClient(core: HeliaInstance): Promise<HeliaJSONClient> {
    const heliaJsonModule = await this.loadHeliaJsonModule();

    return heliaJsonModule.json(core);
  }

  public async createHelia(
    options: Parameters<typeof HeliaCore.createHelia>[0],
  ): Promise<HeliaInstance> {
    const heliaModule = await this.loadHeliaModule();

    return heliaModule.createHelia(options);
  }

  public async createLibp2p(
    config: HeliaLibp2pConfig,
  ): ReturnType<typeof createLibp2p> {
    const libp2pModule = await this.loadLibp2pModule();

    return libp2pModule.createLibp2p(config);
  }

  public async createMultiaddr(
    address: string,
  ): Promise<ReturnType<typeof multiaddr>> {
    const multiaddrModule = await this.loadMultiaddrModule();

    return multiaddrModule.multiaddr(address);
  }

  public async createPreSharedKey(
    config: Parameters<typeof preSharedKey>[0],
  ): Promise<ReturnType<typeof preSharedKey>> {
    const pnetModule = await this.loadPnetModule();

    return pnetModule.preSharedKey(config);
  }

  public async getLibp2pDefaults(): Promise<Libp2pDefaults> {
    const heliaModule = await this.loadHeliaModule();

    if (typeof heliaModule.libp2pDefaults !== 'function') {
      return {} as Libp2pDefaults;
    }

    return this.withoutWebRtcTransports(heliaModule.libp2pDefaults());
  }

  public async createDatastoreKey(path: string): Promise<DatastoreKey> {
    const datastoreKeyModule = await this.loadDatastoreKeyModule();

    return new datastoreKeyModule.Key(path);
  }

  public async parseCid(value: string): Promise<MultiformatsCid> {
    const cidModule = await this.loadCidModule();

    return cidModule.CID.parse(value);
  }

  public async createMemoryBlockstore(): Promise<MemoryBlockstore> {
    const blockstoreCoreModule = await this.loadBlockstoreCoreModule();

    return new blockstoreCoreModule.MemoryBlockstore();
  }

  public async createFsBlockstore(path: string): Promise<FsBlockstore> {
    const blockstoreFsModule = await this.loadBlockstoreFsModule();

    return new blockstoreFsModule.FsBlockstore(path);
  }

  public async createMemoryDatastore(): Promise<MemoryDatastore> {
    const datastoreCoreModule = await this.loadDatastoreCoreModule();

    return new datastoreCoreModule.MemoryDatastore();
  }

  public async createFsDatastore(path: string): Promise<FsDatastore> {
    const datastoreFsModule = await this.loadDatastoreFsModule();

    return new datastoreFsModule.FsDatastore(path);
  }
}

const heliaRuntimeAdapter = new HeliaRuntimeAdapter();

export default heliaRuntimeAdapter;
