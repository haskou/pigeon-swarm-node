import heliaRuntimeAdapter, {
  Libp2pDefaults,
} from '@app/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';
import libp2pKeyAdapter, {
  Libp2pPrivateKeyLike,
} from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import NetworkDiagnosticsLogger from '@app/shared/infrastructure/network/NetworkDiagnosticsLogger';
import { PublicRelayPeerAnnouncer } from '@app/shared/infrastructure/pubsub/libp2p/PublicRelayPeerAnnouncer';

import { PublicRelayAddressFactory } from './PublicRelayAddressFactory';
import { PublicRelayConfiguration } from './PublicRelayConfiguration';
import { PublicRelayRuntimeNode } from './PublicRelayRuntimeNode';

export class PublicRelayRuntimeAdapter {
  private circuitRelayModulePromise?: Promise<
    typeof import('@libp2p/circuit-relay-v2')
  >;

  private gossipsubModulePromise?: Promise<typeof import('@libp2p/gossipsub')>;

  public constructor(
    private readonly configuration = PublicRelayConfiguration.fromEnvironment(),
    private readonly addressFactory = new PublicRelayAddressFactory(
      configuration,
    ),
  ) {}

  private async nativeImport<TModule>(modulePath: string): Promise<TModule> {
    if (process.env.JEST_WORKER_ID !== undefined) {
      return import(modulePath) as TModule;
    }

    const importer = new Function('path', 'return import(path)') as (
      path: string,
    ) => Promise<TModule>;

    return importer(modulePath);
  }

  private loadCircuitRelayModule(): Promise<
    typeof import('@libp2p/circuit-relay-v2')
  > {
    this.circuitRelayModulePromise ??= this.nativeImport<
      typeof import('@libp2p/circuit-relay-v2')
    >('@libp2p/circuit-relay-v2');

    return this.circuitRelayModulePromise;
  }

  private loadGossipsubModule(): Promise<typeof import('@libp2p/gossipsub')> {
    this.gossipsubModulePromise ??=
      this.nativeImport<typeof import('@libp2p/gossipsub')>(
        '@libp2p/gossipsub',
      );

    return this.gossipsubModulePromise;
  }

  private configureAddresses(
    config: Libp2pDefaults,
    peerId: string,
  ): Libp2pDefaults {
    const mutableConfig = config as unknown as {
      addresses?: {
        announce?: string[];
        listen?: string[];
      };
    };
    const announceAddress = this.addressFactory.relayAdvertiseAddress(peerId);

    mutableConfig.addresses = {
      ...(mutableConfig.addresses || {}),
      ...(announceAddress ? { announce: [announceAddress] } : {}),
      listen: [this.addressFactory.relayListenAddress()],
    };

    return config;
  }

  private async configureRelayService(
    config: Libp2pDefaults,
  ): Promise<Libp2pDefaults> {
    const [relayModule, gossipsubModule] = await Promise.all([
      this.loadCircuitRelayModule(),
      this.loadGossipsubModule(),
    ]);
    const mutableConfig = config as unknown as {
      services?: Record<string, unknown>;
    };

    const services = mutableConfig.services || {};

    mutableConfig.services = {
      ...services,
      ...(services.relay || services.circuitRelay
        ? {}
        : { circuitRelay: relayModule.circuitRelayServer() }),
      pubsub: gossipsubModule.gossipsub({
        allowPublishToZeroTopicPeers: true,
      }),
    };

    return config;
  }

  public async createNode(
    privateKey: Libp2pPrivateKeyLike,
  ): Promise<PublicRelayRuntimeNode> {
    const config = (await this.configureRelayService(
      this.configureAddresses(
        await heliaRuntimeAdapter.getLibp2pDefaults(),
        libp2pKeyAdapter.peerIdFromPrivateKey(privateKey),
      ),
    )) as unknown as Libp2pDefaults & {
      privateKey?: Libp2pPrivateKeyLike;
    };

    config.privateKey = privateKey;

    const node = (await heliaRuntimeAdapter.createLibp2p(
      config as never,
    )) as unknown as PublicRelayRuntimeNode;

    NetworkDiagnosticsLogger.logStartup(node, {
      config,
      mode: 'public',
      name: 'public-relay',
      pskEnabled: false,
    });
    NetworkDiagnosticsLogger.attachConnectionEvents(node, {
      mode: 'public',
      name: 'public-relay',
    });
    await new PublicRelayPeerAnnouncer(true).start(node);

    return node;
  }
}
