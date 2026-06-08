import { PublicRelayDebugState } from '@app/shared/infrastructure/network/relay/PublicRelayDebugState';

import { NodeNetworkDebugResource } from '../resources/NodeNetworkDebugResource';

export class NodeNetworkDebugViewModel {
  public constructor(
    private readonly publicRelay: PublicRelayDebugState,
    private readonly exposeSensitiveDebug = false,
  ) {}

  public toResource(): NodeNetworkDebugResource {
    const publicRelay: NodeNetworkDebugResource['publicRelay'] = {
      bootstrapRelayCount: this.publicRelay.bootstrapRelayMultiaddrs.length,
      debugReason: this.publicRelay.debugReason,
      discoveredRelayCount: this.publicRelay.discoveredRelayCount,
      discoveryEnabled: this.publicRelay.discoveryEnabled,
      exposeSensitiveDebug: this.exposeSensitiveDebug,
      listenAddressCount: this.publicRelay.listenAddresses.length,
      privateRelayDirectory: {
        discoveredRecordCount:
          this.publicRelay.privateRelayDirectory.discoveredRecordCount,
        privateNetworkCount:
          this.publicRelay.privateRelayDirectory.privateNetworkCount,
      },
      relayAdvertised: this.publicRelay.relayAdvertised,
      relayAutoEnabled: this.publicRelay.relayAutoEnabled,
      relayEnabled: this.publicRelay.relayEnabled,
      running: this.publicRelay.running,
    };

    if (!this.exposeSensitiveDebug) {
      return { publicRelay };
    }

    return {
      publicRelay: {
        ...publicRelay,
        advertisedAddresses: this.publicRelay.advertisedAddresses,
        bootstrapRelayMultiaddrs: this.publicRelay.bootstrapRelayMultiaddrs,
        discoveredRelayMultiaddrs: this.publicRelay.discoveredRelayMultiaddrs,
        listenAddresses: this.publicRelay.listenAddresses,
        peerId: this.publicRelay.peerId,
        privateRelayDirectory: {
          ...publicRelay.privateRelayDirectory,
          discoveredRelayPeerIds:
            this.publicRelay.privateRelayDirectory.discoveredRelayPeerIds,
          privateNetworkFingerprints:
            this.publicRelay.privateRelayDirectory.privateNetworkFingerprints,
        },
        relayRecord: this.publicRelay.relayRecord,
      },
    };
  }
}
