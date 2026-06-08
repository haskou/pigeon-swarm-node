import NetworkDiagnosticsLogger from '../../network/NetworkDiagnosticsLogger';
import { PublicRelayConfiguration } from '../../network/relay/PublicRelayConfiguration';
import { PublicRelayRecordDiscovery } from '../../network/relay/PublicRelayRecordDiscovery';
import { Libp2pPubSubNode } from './Libp2pPubSubNode';
import { PublicRelayPeerAnnouncer } from './PublicRelayPeerAnnouncer';

export class Libp2pGossipsubRuntimeAdapter {
  private static readonly globalNodeKey = '__pigeonSwarmPublicLibp2pNode';

  private static readonly DEFAULT_PUBLIC_BOOTSTRAP_MULTIADDRS = [
    '/dnsaddr/am6.bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb',
    '/dnsaddr/sg1.bootstrap.libp2p.io/p2p/QmcZf59bWwK5XFi76CZX8cbJ4BhTzzA3gU1ZjYZcYW3dwt',
    '/dnsaddr/ny5.bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa',
    '/dnsaddr/sv15.bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
  ];

  private bootstrapModulePromise?: Promise<typeof import('@libp2p/bootstrap')>;
  private heliaModulePromise?: Promise<typeof import('helia')>;
  private libp2pModulePromise?: Promise<typeof import('libp2p')>;
  private gossipsubModulePromise?: Promise<typeof import('@libp2p/gossipsub')>;

  public static clearSharedNodeForTesting(): void {
    const globalState = globalThis as typeof globalThis & {
      [Libp2pGossipsubRuntimeAdapter.globalNodeKey]?:
        | Promise<Libp2pPubSubNode>
        | undefined;
    };

    delete globalState[Libp2pGossipsubRuntimeAdapter.globalNodeKey];
  }

  private async nativeImport<TModule>(modulePath: string): Promise<TModule> {
    if (process.env.JEST_WORKER_ID !== undefined) {
      return import(modulePath) as TModule;
    }

    const importer = new Function('path', 'return import(path)') as (
      path: string,
    ) => Promise<TModule>;

    return importer(modulePath);
  }

  private loadHeliaModule(): Promise<typeof import('helia')> {
    this.heliaModulePromise ??=
      this.nativeImport<typeof import('helia')>('helia');

    return this.heliaModulePromise;
  }

  private loadLibp2pModule(): Promise<typeof import('libp2p')> {
    this.libp2pModulePromise ??=
      this.nativeImport<typeof import('libp2p')>('libp2p');

    return this.libp2pModulePromise;
  }

  private loadGossipsubModule(): Promise<typeof import('@libp2p/gossipsub')> {
    this.gossipsubModulePromise ??=
      this.nativeImport<typeof import('@libp2p/gossipsub')>(
        '@libp2p/gossipsub',
      );

    return this.gossipsubModulePromise;
  }

  private get sharedNodePromise(): Promise<Libp2pPubSubNode> | undefined {
    const globalState = globalThis as typeof globalThis & {
      [Libp2pGossipsubRuntimeAdapter.globalNodeKey]?:
        | Promise<Libp2pPubSubNode>
        | undefined;
    };

    return globalState[Libp2pGossipsubRuntimeAdapter.globalNodeKey];
  }

  private set sharedNodePromise(nodePromise: Promise<Libp2pPubSubNode>) {
    const globalState = globalThis as typeof globalThis & {
      [Libp2pGossipsubRuntimeAdapter.globalNodeKey]?:
        | Promise<Libp2pPubSubNode>
        | undefined;
    };

    globalState[Libp2pGossipsubRuntimeAdapter.globalNodeKey] = nodePromise;
  }

  private loadBootstrapModule(): Promise<typeof import('@libp2p/bootstrap')> {
    this.bootstrapModulePromise ??=
      this.nativeImport<typeof import('@libp2p/bootstrap')>(
        '@libp2p/bootstrap',
      );

    return this.bootstrapModulePromise;
  }

  private publicBootstrapMultiaddrs(): string[] {
    if (process.env.PIGEON_PUBLIC_BOOTSTRAP_ENABLED === 'false') {
      return [];
    }

    return (
      process.env.PIGEON_PUBLIC_BOOTSTRAP_MULTIADDRS ||
      Libp2pGossipsubRuntimeAdapter.DEFAULT_PUBLIC_BOOTSTRAP_MULTIADDRS.join(
        ',',
      )
    )
      .split(',')
      .map((address) => address.trim())
      .filter(Boolean);
  }

  private withoutWebRtcTransports<
    TConfig extends {
      addresses?: { listen?: string[] };
      transports?: Array<(...args: unknown[]) => unknown>;
    },
  >(config: TConfig): TConfig {
    return {
      ...config,
      addresses: {
        ...(config.addresses || {}),
        listen: (config.addresses?.listen || []).filter(
          (address) => !address.includes('webrtc'),
        ),
      },
      transports: (config.transports || []).filter((transport) => {
        const source = transport.toString().toLowerCase();

        return !source.includes('webrtc');
      }),
    };
  }

  private async withBootstrapRelays<
    TConfig extends { peerDiscovery?: unknown[] },
  >(config: TConfig): Promise<TConfig> {
    const publicBootstrapMultiaddrs = this.publicBootstrapMultiaddrs();
    const relayBootstrapMultiaddrs =
      PublicRelayConfiguration.fromEnvironment().getBootstrapRelayMultiaddrs();

    if (
      publicBootstrapMultiaddrs.length === 0 &&
      relayBootstrapMultiaddrs.length === 0
    ) {
      return config;
    }

    const bootstrapModule = await this.loadBootstrapModule();
    const peerDiscovery = [...(config.peerDiscovery || [])];

    if (publicBootstrapMultiaddrs.length > 0) {
      peerDiscovery.push(
        bootstrapModule.bootstrap({
          list: publicBootstrapMultiaddrs,
          tagName: 'pigeon-public-bootstrap',
          tagTTL: Infinity,
        }),
      );
    }

    if (relayBootstrapMultiaddrs.length > 0) {
      peerDiscovery.push(
        bootstrapModule.bootstrap({
          list: relayBootstrapMultiaddrs,
          tagName: 'pigeon-relay-bootstrap',
          tagTTL: Infinity,
        }),
      );
    }

    return {
      ...config,
      peerDiscovery,
    };
  }

  private async createNewNode(): Promise<Libp2pPubSubNode> {
    const [heliaModule, libp2pModule, gossipsubModule] = await Promise.all([
      this.loadHeliaModule(),
      this.loadLibp2pModule(),
      this.loadGossipsubModule(),
    ]);
    const libp2pConfig = await this.withBootstrapRelays(
      this.withoutWebRtcTransports(heliaModule.libp2pDefaults()),
    );
    const configWithServices = libp2pConfig as unknown as {
      services: Record<string, unknown>;
    };

    configWithServices.services = {
      ...(configWithServices.services || {}),
      pubsub: gossipsubModule.gossipsub({
        allowPublishToZeroTopicPeers: true,
      }) as unknown,
    };

    const node = (await libp2pModule.createLibp2p(
      libp2pConfig as unknown as Parameters<
        typeof libp2pModule.createLibp2p
      >[0],
    )) as unknown as Libp2pPubSubNode;

    NetworkDiagnosticsLogger.logStartup(node, {
      config: libp2pConfig,
      mode: 'public',
      name: 'standalone-gossipsub',
      pskEnabled: false,
    });
    NetworkDiagnosticsLogger.attachConnectionEvents(node, {
      mode: 'public',
      name: 'standalone-gossipsub',
    });
    const relayRecordDiscovery = new PublicRelayRecordDiscovery();

    await relayRecordDiscovery.start(node);
    await relayRecordDiscovery.connectKnown(node);
    await new PublicRelayPeerAnnouncer().start(node);

    return node;
  }

  public async createNode(): Promise<Libp2pPubSubNode> {
    if (this.sharedNodePromise) {
      return this.sharedNodePromise;
    }

    this.sharedNodePromise = this.createNewNode();

    return this.sharedNodePromise;
  }
}

const libp2pGossipsubRuntimeAdapter = new Libp2pGossipsubRuntimeAdapter();

export default libp2pGossipsubRuntimeAdapter;
