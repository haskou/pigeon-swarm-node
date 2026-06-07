import { PublicRelayDebugState } from '@app/shared/infrastructure/network/relay/PublicRelayDebugState';

import { NodeNetworkDebugResource } from '../resources/NodeNetworkDebugResource';

export class NodeNetworkDebugViewModel {
  public constructor(private readonly publicRelay: PublicRelayDebugState) {}

  public toResource(): NodeNetworkDebugResource {
    return {
      publicRelay: {
        advertisedAddresses: this.publicRelay.advertisedAddresses,
        bootstrapRelayMultiaddrs: this.publicRelay.bootstrapRelayMultiaddrs,
        debugReason: this.publicRelay.debugReason,
        discoveredRelayCount: this.publicRelay.discoveredRelayCount,
        discoveredRelayMultiaddrs: this.publicRelay.discoveredRelayMultiaddrs,
        discoveryEnabled: this.publicRelay.discoveryEnabled,
        listenAddresses: this.publicRelay.listenAddresses,
        peerId: this.publicRelay.peerId,
        relayAdvertised: this.publicRelay.relayAdvertised,
        relayAutoEnabled: this.publicRelay.relayAutoEnabled,
        relayEnabled: this.publicRelay.relayEnabled,
        running: this.publicRelay.running,
      },
    };
  }
}
