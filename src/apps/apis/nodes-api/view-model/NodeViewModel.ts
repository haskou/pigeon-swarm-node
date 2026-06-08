import { Node } from '@app/contexts/nodes/domain/Node';
import { PublicRelayDebugState } from '@app/shared/infrastructure/network/relay/PublicRelayDebugState';

import { NodeResource } from '../resources/NodeResource';
import { NodeRuntimeResource } from '../resources/NodeRuntimeResource';
import { NodeTypeResource } from '../resources/NodeTypeResource';

export class NodeViewModel {
  constructor(
    private readonly node: Node,
    private readonly publicRelay: PublicRelayDebugState = {
      advertisedAddresses: [],
      bootstrapRelayMultiaddrs: [],
      debugReason: 'Relay runtime state was not provided.',
      discoveredRelayCount: 0,
      discoveredRelayMultiaddrs: [],
      discoveryEnabled: false,
      fallbackRelayCount: 0,
      fallbackRelayMultiaddrs: [],
      listenAddresses: [],
      privateRelayDirectory: {
        discoveredRecordCount: 0,
        discoveredRelayPeerIds: [],
        privateNetworkCount: 0,
        privateNetworkFingerprints: [],
      },
      relayAdvertised: false,
      relayAutoEnabled: false,
      relayEnabled: false,
      running: false,
    },
  ) {}

  private getNodeType(): NodeTypeResource {
    if (this.publicRelay.running) {
      return 'relay';
    }

    if (this.publicRelay.relayAdvertised) {
      return 'reachable';
    }

    return 'leaf';
  }

  private getRuntime(): NodeRuntimeResource {
    const transportDsn = process.env.TRANSPORT_DSN || '';

    if (transportDsn.startsWith('libp2p-gossipsub')) {
      return {
        logLevel: process.env.LOG_LEVEL,
        transport: 'libp2p-gossipsub',
      };
    }

    if (transportDsn.startsWith('in-memory')) {
      return {
        logLevel: process.env.LOG_LEVEL,
        transport: 'in-memory',
      };
    }

    return {
      logLevel: process.env.LOG_LEVEL,
      transport: 'unknown',
    };
  }

  public toResource(): NodeResource {
    const primitives = this.node.toPrimitives();
    const networks = Object.values(primitives.networks);
    const publicCount = networks.filter((network) => !network.key).length;
    const privateCount = networks.length - publicCount;

    return {
      id: primitives.id,
      networkSummary: {
        privateCount,
        publicCount,
        total: networks.length,
      },
      nodeType: this.getNodeType(),
      owner: primitives.owner,
      relay: {
        advertised: this.publicRelay.relayAdvertised,
        autoEnabled: this.publicRelay.relayAutoEnabled,
        enabled: this.publicRelay.relayEnabled,
        peerId: this.publicRelay.peerId,
        running: this.publicRelay.running,
      },
      runtime: this.getRuntime(),
    };
  }
}
