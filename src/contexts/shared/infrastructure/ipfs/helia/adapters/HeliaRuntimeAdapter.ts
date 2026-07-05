import type * as HeliaBlockBrokersModule from '@helia/block-brokers';
import type * as IpldDagPbModule from '@ipld/dag-pb';
import type * as CircuitRelayModule from '@libp2p/circuit-relay-v2';
import type * as GossipsubModule from '@libp2p/gossipsub';
import type { PrivateKey as Libp2pPrivateKey } from '@libp2p/interface';
import type { preSharedKey } from '@libp2p/pnet';
import type { multiaddr } from '@multiformats/multiaddr';
import type { MemoryBlockstore } from 'blockstore-core';
import type { FsBlockstore } from 'blockstore-fs';
import type { MemoryDatastore } from 'datastore-core';
import type { FsDatastore } from 'datastore-fs';
import type * as HeliaCore from 'helia';
import type { Key as DatastoreKey } from 'interface-datastore/key';
import type * as IPNSModule from 'ipns';
import type * as IPNSValidatorModule from 'ipns/validator';
import type { createLibp2p } from 'libp2p';
import type { CID as MultiformatsCid } from 'multiformats/cid';
import type * as MultiformatsDigest from 'multiformats/hashes/digest';
import type * as Sha2Module from 'multiformats/hashes/sha2';

import { pigeonEnvironment } from '@app/shared/infrastructure/environment/PigeonEnvironment';

import type { HeliaBlockBrokers } from './types/HeliaBlockBrokers';
import type { HeliaInstance } from './types/HeliaInstance';
import type { HeliaJSONClient } from './types/HeliaJSONClient';
import type { HeliaLibp2pConfig } from './types/HeliaLibp2pConfig';
import type { HeliaUnixfsClient } from './types/HeliaUnixfsClient';
import type { Libp2pDefaults } from './types/Libp2pDefaults';

export type { DatastoreKeyLike } from './types/DatastoreKeyLike';
export type { HeliaInstance } from './types/HeliaInstance';
export type { HeliaJSONClient } from './types/HeliaJSONClient';
export type { HeliaLibp2pConfig } from './types/HeliaLibp2pConfig';
export type { HeliaUnixfsClient } from './types/HeliaUnixfsClient';
export type { HeliaBlockBrokers } from './types/HeliaBlockBrokers';
export type { Libp2pDefaults } from './types/Libp2pDefaults';
export type { ParsedCidLike } from './types/ParsedCidLike';
export type { RuntimeBlockstore } from './types/RuntimeBlockstore';
export type { RuntimeDatastore } from './types/RuntimeDatastore';

export class HeliaRuntimeAdapter {
  private static readonly RAW_CODEC_CODE = 0x55;

  private static readonly DEFAULT_RELAY_DATA_LIMIT_BYTES = 64 * 1024 * 1024;

  private static readonly DEFAULT_PUBLIC_BOOTSTRAP_MULTIADDRS = [
    '/dnsaddr/am6.bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
    '/dnsaddr/sg1.bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt',
    '/dnsaddr/ny5.bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
    '/dnsaddr/sv15.bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
  ];

  private bootstrapModulePromise?: Promise<typeof import('@libp2p/bootstrap')>;
  private blockBrokersModulePromise?: Promise<typeof HeliaBlockBrokersModule>;
  private circuitRelayModulePromise?: Promise<typeof CircuitRelayModule>;
  private heliaModulePromise?: Promise<typeof HeliaCore>;
  private heliaJsonModulePromise?: Promise<typeof import('@helia/json')>;
  private heliaRoutersModulePromise?: Promise<typeof import('@helia/routers')>;
  private heliaUnixfsModulePromise?: Promise<typeof import('@helia/unixfs')>;
  private ipldDagPbModulePromise?: Promise<typeof IpldDagPbModule>;
  private gossipsubModulePromise?: Promise<typeof GossipsubModule>;
  private ipnsModulePromise?: Promise<typeof IPNSModule>;
  private ipnsValidatorModulePromise?: Promise<typeof IPNSValidatorModule>;
  private libp2pModulePromise?: Promise<typeof import('libp2p')>;
  private pnetModulePromise?: Promise<typeof import('@libp2p/pnet')>;
  private multiaddrModulePromise?: Promise<
    typeof import('@multiformats/multiaddr')
  >;

  private datastoreKeyModulePromise?: Promise<
    typeof import('interface-datastore/key')
  >;

  private cidModulePromise?: Promise<typeof import('multiformats/cid')>;
  private digestModulePromise?: Promise<typeof MultiformatsDigest>;
  private sha2ModulePromise?: Promise<typeof Sha2Module>;
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

  private loadHeliaUnixfsModule(): Promise<typeof import('@helia/unixfs')> {
    this.heliaUnixfsModulePromise ??=
      this.nativeImport<typeof import('@helia/unixfs')>('@helia/unixfs');

    return this.heliaUnixfsModulePromise;
  }

  private loadHeliaRoutersModule(): Promise<typeof import('@helia/routers')> {
    this.heliaRoutersModulePromise ??=
      this.nativeImport<typeof import('@helia/routers')>('@helia/routers');

    return this.heliaRoutersModulePromise;
  }

  private loadIpldDagPbModule(): Promise<typeof IpldDagPbModule> {
    this.ipldDagPbModulePromise ??=
      this.nativeImport<typeof IpldDagPbModule>('@ipld/dag-pb');

    return this.ipldDagPbModulePromise;
  }

  private loadBlockBrokersModule(): Promise<typeof HeliaBlockBrokersModule> {
    this.blockBrokersModulePromise ??= this.nativeImport<
      typeof HeliaBlockBrokersModule
    >('@helia/block-brokers');

    return this.blockBrokersModulePromise;
  }

  private loadGossipsubModule(): Promise<typeof GossipsubModule> {
    this.gossipsubModulePromise ??=
      this.nativeImport<typeof GossipsubModule>('@libp2p/gossipsub');

    return this.gossipsubModulePromise;
  }

  private loadCircuitRelayModule(): Promise<typeof CircuitRelayModule> {
    this.circuitRelayModulePromise ??= this.nativeImport<
      typeof CircuitRelayModule
    >('@libp2p/circuit-relay-v2');

    return this.circuitRelayModulePromise;
  }

  private loadBootstrapModule(): Promise<typeof import('@libp2p/bootstrap')> {
    this.bootstrapModulePromise ??=
      this.nativeImport<typeof import('@libp2p/bootstrap')>(
        '@libp2p/bootstrap',
      );

    return this.bootstrapModulePromise;
  }

  private loadIPNSModule(): Promise<typeof IPNSModule> {
    this.ipnsModulePromise ??= this.nativeImport<typeof IPNSModule>('ipns');

    return this.ipnsModulePromise;
  }

  private loadIPNSValidatorModule(): Promise<typeof IPNSValidatorModule> {
    this.ipnsValidatorModulePromise ??=
      this.nativeImport<typeof IPNSValidatorModule>('ipns/validator');

    return this.ipnsValidatorModulePromise;
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

  private loadDigestModule(): Promise<typeof MultiformatsDigest> {
    this.digestModulePromise ??= this.nativeImport<typeof MultiformatsDigest>(
      'multiformats/hashes/digest',
    );

    return this.digestModulePromise;
  }

  private loadSha2Module(): Promise<typeof Sha2Module> {
    this.sha2ModulePromise ??= this.nativeImport<typeof Sha2Module>(
      'multiformats/hashes/sha2',
    );

    return this.sha2ModulePromise;
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

  private withoutNetwork(defaults: Libp2pDefaults): Libp2pDefaults {
    const config = defaults as unknown as {
      addresses?: {
        listen?: string[];
      };
      peerDiscovery?: unknown[];
      transports?: unknown[];
    };

    config.addresses = {
      ...(config.addresses || {}),
      listen: [],
    };
    config.peerDiscovery = [];
    config.transports = [];

    return defaults;
  }

  private async withGossipsub(
    defaults: Libp2pDefaults,
  ): Promise<Libp2pDefaults> {
    const gossipsubModule = await this.loadGossipsubModule();
    const config = defaults as unknown as {
      services?: Record<string, unknown>;
    };

    config.services = {
      ...(config.services || {}),
      pubsub: gossipsubModule.gossipsub({
        allowPublishToZeroTopicPeers: true,
        runOnLimitedConnection: true,
      }) as unknown,
    };

    return defaults;
  }

  private getPublicBootstrapMultiaddrs(): string[] {
    const environment = pigeonEnvironment();

    if (!environment.PIGEON_PUBLIC_BOOTSTRAP_ENABLED) {
      return [];
    }

    return (
      environment.PIGEON_PUBLIC_BOOTSTRAP_MULTIADDRS ||
      HeliaRuntimeAdapter.DEFAULT_PUBLIC_BOOTSTRAP_MULTIADDRS.join(',')
    )
      .split(',')
      .map((address) => address.trim())
      .filter(Boolean);
  }

  private async withPublicBootstrap(
    defaults: Libp2pDefaults,
  ): Promise<Libp2pDefaults> {
    const bootstrapMultiaddrs = this.getPublicBootstrapMultiaddrs();

    if (bootstrapMultiaddrs.length === 0) {
      return defaults;
    }

    const bootstrapModule = await this.loadBootstrapModule();
    const config = defaults as unknown as {
      peerDiscovery?: unknown[];
    };

    config.peerDiscovery = [
      ...(config.peerDiscovery || []),
      bootstrapModule.bootstrap({
        list: bootstrapMultiaddrs,
        tagName: 'pigeon-public-bootstrap',
        tagTTL: Infinity,
      }),
    ];

    return defaults;
  }

  public async withBootstrapRelays(
    defaults: Libp2pDefaults,
    relayMultiaddrs: string[] = [],
  ): Promise<Libp2pDefaults> {
    if (relayMultiaddrs.length === 0) {
      return defaults;
    }

    const bootstrapModule = await this.loadBootstrapModule();
    const config = defaults as unknown as {
      peerDiscovery?: unknown[];
    };

    config.peerDiscovery = [
      ...(config.peerDiscovery || []),
      bootstrapModule.bootstrap({
        list: relayMultiaddrs,
        tagName: 'pigeon-relay-bootstrap',
        tagTTL: Infinity,
      }),
    ];

    return defaults;
  }

  public async withRelayServer(
    defaults: Libp2pDefaults,
    dataLimitBytes: number = HeliaRuntimeAdapter.DEFAULT_RELAY_DATA_LIMIT_BYTES,
  ): Promise<Libp2pDefaults> {
    const circuitRelayModule = await this.loadCircuitRelayModule();
    const config = defaults as unknown as {
      services?: Record<string, unknown>;
    };

    config.services = {
      ...(config.services || {}),
      relay: circuitRelayModule.circuitRelayServer({
        reservations: {
          defaultDataLimit: BigInt(dataLimitBytes),
        },
      }) as unknown,
    };

    return defaults;
  }

  public async createRelayBlockBrokers(): Promise<HeliaBlockBrokers> {
    const blockBrokersModule = await this.loadBlockBrokersModule();

    const blockBrokers: HeliaBlockBrokers = [
      blockBrokersModule.bitswap({
        runOnLimitedConnections: true,
      }),
    ];

    return blockBrokers;
  }

  public async createJSONClient(core: HeliaInstance): Promise<HeliaJSONClient> {
    const heliaJsonModule = await this.loadHeliaJsonModule();

    return heliaJsonModule.json(core);
  }

  public async createUnixfsClient(
    core: HeliaInstance,
  ): Promise<HeliaUnixfsClient> {
    const heliaUnixfsModule = await this.loadHeliaUnixfsModule();

    return heliaUnixfsModule.unixfs(core);
  }

  public async createUnixfsClientFromBlockstore(
    blockstore: Pick<HeliaInstance['blockstore'], 'get' | 'has' | 'put'>,
  ): Promise<HeliaUnixfsClient> {
    const heliaUnixfsModule = await this.loadHeliaUnixfsModule();

    return heliaUnixfsModule.unixfs({ blockstore });
  }

  public async createHelia(
    options: Parameters<typeof HeliaCore.createHelia>[0],
  ): Promise<HeliaInstance> {
    const heliaModule = await this.loadHeliaModule();

    return heliaModule.createHelia(options);
  }

  public async createPrivateHelia(options: {
    blockstore?: unknown;
    datastore?: unknown;
    libp2p: unknown;
  }): Promise<HeliaInstance> {
    const [heliaModule, blockBrokersModule, routersModule] = await Promise.all([
      this.loadHeliaModule(),
      this.loadBlockBrokersModule(),
      this.loadHeliaRoutersModule(),
    ]);
    const libp2p = options.libp2p as Parameters<
      typeof routersModule.libp2pRouting
    >[0];

    return heliaModule.createHelia({
      ...options,
      blockBrokers: [
        blockBrokersModule.bitswap({
          runOnLimitedConnections: true,
        }),
      ],
      routers: [routersModule.libp2pRouting(libp2p)],
    } as unknown as Parameters<typeof HeliaCore.createHelia>[0]);
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

  public async createRawSha256Cid(value: string): Promise<MultiformatsCid> {
    const [cidModule, digestModule, sha2Module] = await Promise.all([
      this.loadCidModule(),
      this.loadDigestModule(),
      this.loadSha2Module(),
    ]);
    const hash = await sha2Module.sha256.digest(
      new TextEncoder().encode(value),
    );

    return cidModule.CID.createV1(
      HeliaRuntimeAdapter.RAW_CODEC_CODE,
      digestModule.create(hash.code, hash.digest),
    );
  }

  public async createPreSharedKey(
    config: Parameters<typeof preSharedKey>[0],
  ): Promise<ReturnType<typeof preSharedKey>> {
    const pnetModule = await this.loadPnetModule();

    return pnetModule.preSharedKey(config);
  }

  public async createMarshalledIPNSRecord(
    privateKey: Libp2pPrivateKey,
    value: string,
    sequence: number | bigint,
    lifetimeMs: number,
  ): Promise<Uint8Array> {
    const ipnsModule = await this.loadIPNSModule();
    const record = await ipnsModule.createIPNSRecord(
      privateKey,
      value,
      sequence,
      lifetimeMs,
    );

    return ipnsModule.marshalIPNSRecord(record);
  }

  public async createIPNSRoutingKey(
    privateKey: Libp2pPrivateKey,
  ): Promise<Uint8Array> {
    const ipnsModule = await this.loadIPNSModule();

    return ipnsModule.multihashToIPNSRoutingKey(
      privateKey.publicKey.toMultihash(),
    );
  }

  public getIPNSName(privateKey: Libp2pPrivateKey): string {
    return privateKey.publicKey.toString();
  }

  public async readIPNSRecordValue(
    routingKey: Uint8Array,
    marshalledRecord: Uint8Array,
  ): Promise<string | undefined> {
    const [ipnsModule, ipnsValidatorModule] = await Promise.all([
      this.loadIPNSModule(),
      this.loadIPNSValidatorModule(),
    ]);

    await ipnsValidatorModule.ipnsValidator(routingKey, marshalledRecord);

    const record = ipnsModule.unmarshalIPNSRecord(marshalledRecord);

    if (ipnsValidatorModule.validFor(record) <= 0) {
      return undefined;
    }

    return record.value;
  }

  public async getLibp2pDefaults(options?: {
    offline?: boolean;
  }): Promise<Libp2pDefaults> {
    const heliaModule = await this.loadHeliaModule();

    if (typeof heliaModule.libp2pDefaults !== 'function') {
      return {} as Libp2pDefaults;
    }

    const defaults = this.withoutWebRtcTransports(heliaModule.libp2pDefaults());

    if (options?.offline) {
      return this.withGossipsub(this.withoutNetwork(defaults));
    }

    return this.withGossipsub(await this.withPublicBootstrap(defaults));
  }

  public async createDatastoreKey(path: string): Promise<DatastoreKey> {
    const datastoreKeyModule = await this.loadDatastoreKeyModule();

    return new datastoreKeyModule.Key(path);
  }

  public async parseCid(value: string): Promise<MultiformatsCid> {
    const cidModule = await this.loadCidModule();

    return cidModule.CID.parse(value);
  }

  public async decodeDagPbLinks(block: Uint8Array): Promise<MultiformatsCid[]> {
    const dagPbModule = await this.loadIpldDagPbModule();

    return dagPbModule.decode(block).Links.map((link) => link.Hash);
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
