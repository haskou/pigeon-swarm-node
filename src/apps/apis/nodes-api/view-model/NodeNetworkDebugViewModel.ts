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
        lastDiscoveredAt:
          this.publicRelay.privateRelayDirectory.lastDiscoveredAt,
        lastError: this.publicRelay.privateRelayDirectory.lastError,
        lastIPNSDocumentEncryptedRecordCount:
          this.publicRelay.privateRelayDirectory
            .lastIPNSDocumentEncryptedRecordCount,
        lastIPNSDocumentOpenedRecordCount:
          this.publicRelay.privateRelayDirectory
            .lastIPNSDocumentOpenedRecordCount,
        lastIPNSPublishedAt:
          this.publicRelay.privateRelayDirectory.lastIPNSPublishedAt,
        lastIPNSRejectedReason:
          this.publicRelay.privateRelayDirectory.lastIPNSRejectedReason,
        lastIPNSResolvedAt:
          this.publicRelay.privateRelayDirectory.lastIPNSResolvedAt,
        lastLookupHadValue:
          this.publicRelay.privateRelayDirectory.lastLookupHadValue,
        lastLookupValueKind:
          this.publicRelay.privateRelayDirectory.lastLookupValueKind,
        lastProviderLookupAt:
          this.publicRelay.privateRelayDirectory.lastProviderLookupAt,
        lastProviderLookupHadValue:
          this.publicRelay.privateRelayDirectory.lastProviderLookupHadValue,
        lastProviderLookupMultiaddrCount:
          this.publicRelay.privateRelayDirectory
            .lastProviderLookupMultiaddrCount,
        lastPublishedAt: this.publicRelay.privateRelayDirectory.lastPublishedAt,
        lastPublishedNetworkCount:
          this.publicRelay.privateRelayDirectory.lastPublishedNetworkCount,
        lastPubSubPublishedAt:
          this.publicRelay.privateRelayDirectory.lastPubSubPublishedAt,
        lastPubSubReceivedAt:
          this.publicRelay.privateRelayDirectory.lastPubSubReceivedAt,
        lastRequestedNetworkCount:
          this.publicRelay.privateRelayDirectory.lastRequestedNetworkCount,
        privateNetworkCount:
          this.publicRelay.privateRelayDirectory.privateNetworkCount,
        publicConnectionPeerCount:
          this.publicRelay.privateRelayDirectory.publicConnectionPeerCount,
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
          lastIPNSName: this.publicRelay.privateRelayDirectory.lastIPNSName,
          lastIPNSValue: this.publicRelay.privateRelayDirectory.lastIPNSValue,
          lastProviderLookupMultiaddrs:
            this.publicRelay.privateRelayDirectory.lastProviderLookupMultiaddrs,
          privateNetworkFingerprints:
            this.publicRelay.privateRelayDirectory.privateNetworkFingerprints,
          publicConnectionPeerId:
            this.publicRelay.privateRelayDirectory.publicConnectionPeerId,
        },
        relayRecord: this.publicRelay.relayRecord,
      },
    };
  }
}
