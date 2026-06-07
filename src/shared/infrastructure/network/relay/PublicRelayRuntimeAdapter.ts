import heliaRuntimeAdapter, {
  Libp2pDefaults,
} from '@app/contexts/shared/infrastructure/ipfs/helia/adapters/HeliaRuntimeAdapter';
import libp2pKeyAdapter, {
  Libp2pPrivateKeyLike,
} from '@app/contexts/shared/infrastructure/ipfs/networks/adapters/Libp2pKeyAdapter';
import NetworkDiagnosticsLogger from '@app/shared/infrastructure/network/NetworkDiagnosticsLogger';

import { PublicRelayAddressFactory } from './PublicRelayAddressFactory';
import { PublicRelayConfiguration } from './PublicRelayConfiguration';
import { PublicRelayRuntimeNode } from './PublicRelayRuntimeNode';

export class PublicRelayRuntimeAdapter {
  public constructor(
    private readonly configuration = PublicRelayConfiguration.fromEnvironment(),
    private readonly addressFactory = new PublicRelayAddressFactory(
      configuration,
    ),
  ) {}

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

  public async createNode(
    privateKey: Libp2pPrivateKeyLike,
  ): Promise<PublicRelayRuntimeNode> {
    const config = this.configureAddresses(
      await heliaRuntimeAdapter.getLibp2pDefaults(),
      libp2pKeyAdapter.peerIdFromPrivateKey(privateKey),
    ) as unknown as Libp2pDefaults & {
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

    return node;
  }
}
