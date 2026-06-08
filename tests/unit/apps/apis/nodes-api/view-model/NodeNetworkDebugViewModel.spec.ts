import { NodeNetworkDebugViewModel } from '@app/apps/apis/nodes-api/view-model/NodeNetworkDebugViewModel';
import { PublicRelayDebugState } from '@app/shared/infrastructure/network/relay/PublicRelayDebugState';

describe('NodeNetworkDebugViewModel', () => {
  it('should expose only sanitized relay diagnostics', () => {
    const resource = new NodeNetworkDebugViewModel(relayDebugState()).toResource();
    const serializedResource = JSON.stringify(resource);

    expect(resource).toEqual({
      publicRelay: {
        bootstrapRelayCount: 1,
        debugReason: 'Relay enabled and advertised with PIGEON_PUBLIC_HOST.',
        discoveredRelayCount: 1,
        discoveryEnabled: true,
        exposeSensitiveDebug: false,
        listenAddressCount: 1,
        privateRelayDirectory: {
          discoveredRecordCount: 1,
          lastDiscoveredAt: 3000,
          lastIPNSPublishedAt: 3800,
          lastIPNSResolvedAt: 3900,
          lastLookupHadValue: true,
          lastLookupValueKind: 'inline-envelope',
          lastProviderLookupAt: 3500,
          lastProviderLookupHadValue: true,
          lastProviderLookupMultiaddrCount: 1,
          lastPublishedAt: 2500,
          lastPublishedNetworkCount: 1,
          lastPubSubPublishedAt: 3600,
          lastPubSubReceivedAt: 3700,
          lastRequestedNetworkCount: 1,
          privateNetworkCount: 1,
          publicConnectionPeerCount: 2,
        },
        relayAdvertised: true,
        relayAutoEnabled: false,
        relayEnabled: true,
        running: true,
      },
    });
    expect(serializedResource).not.toContain('12D3SensitiveRelay');
    expect(serializedResource).not.toContain('/dns4/relay.example.com');
    expect(serializedResource).not.toContain('/dns4/provider.example.com');
    expect(serializedResource).not.toContain('network-fingerprint');
    expect(serializedResource).not.toContain('12D3SensitiveIPNSName');
    expect(serializedResource).not.toContain('/ipfs/bafy-sensitive-relay-dir');
  });

  it('should expose sensitive relay diagnostics when debug is enabled', () => {
    const resource = new NodeNetworkDebugViewModel(
      relayDebugState(),
      true,
    ).toResource();

    expect(resource).toEqual({
      publicRelay: {
        advertisedAddresses: [
          '/dns4/relay.example.com/tcp/4011/p2p/12D3SensitiveRelay',
        ],
        bootstrapRelayCount: 1,
        bootstrapRelayMultiaddrs: [
          '/dns4/bootstrap.example.com/tcp/4011/p2p/12D3SensitiveBootstrap',
        ],
        debugReason: 'Relay enabled and advertised with PIGEON_PUBLIC_HOST.',
        discoveredRelayCount: 1,
        discoveredRelayMultiaddrs: [
          '/dns4/relay.example.com/tcp/4011/p2p/12D3SensitiveRelay',
        ],
        discoveryEnabled: true,
        exposeSensitiveDebug: true,
        listenAddresses: ['/ip4/0.0.0.0/tcp/4011'],
        listenAddressCount: 1,
        peerId: '12D3SensitiveRelay',
        privateRelayDirectory: {
          discoveredRecordCount: 1,
          discoveredRelayPeerIds: ['12D3SensitiveRelay'],
          lastDiscoveredAt: 3000,
          lastIPNSName: '12D3SensitiveIPNSName',
          lastIPNSPublishedAt: 3800,
          lastIPNSResolvedAt: 3900,
          lastIPNSValue: '/ipfs/bafy-sensitive-relay-dir',
          lastLookupHadValue: true,
          lastLookupValueKind: 'inline-envelope',
          lastProviderLookupAt: 3500,
          lastProviderLookupHadValue: true,
          lastProviderLookupMultiaddrs: [
            '/dns4/provider.example.com/tcp/4011/p2p/12D3SensitiveRelay',
          ],
          lastProviderLookupMultiaddrCount: 1,
          lastPublishedAt: 2500,
          lastPublishedNetworkCount: 1,
          lastPubSubPublishedAt: 3600,
          lastPubSubReceivedAt: 3700,
          lastRequestedNetworkCount: 1,
          privateNetworkCount: 1,
          privateNetworkFingerprints: ['network-fingerprint'],
          publicConnectionPeerCount: 2,
          publicConnectionPeerId: '12D3PublicConnection',
        },
        relayAdvertised: true,
        relayAutoEnabled: false,
        relayEnabled: true,
        relayRecord: {
          expiresAt: 2000,
          issuedAt: 1000,
          multiaddrs: [
            '/dns4/relay.example.com/tcp/4011/p2p/12D3SensitiveRelay',
          ],
          peerId: '12D3SensitiveRelay',
          publicKey: 'public-key',
          role: 'relay',
          signature: 'signature',
          version: 1,
        },
        running: true,
      },
    });
  });

  function relayDebugState(): PublicRelayDebugState {
    return {
      advertisedAddresses: [
        '/dns4/relay.example.com/tcp/4011/p2p/12D3SensitiveRelay',
      ],
      bootstrapRelayMultiaddrs: [
        '/dns4/bootstrap.example.com/tcp/4011/p2p/12D3SensitiveBootstrap',
      ],
      debugReason: 'Relay enabled and advertised with PIGEON_PUBLIC_HOST.',
      discoveredRelayCount: 1,
      discoveredRelayMultiaddrs: [
        '/dns4/relay.example.com/tcp/4011/p2p/12D3SensitiveRelay',
      ],
      discoveryEnabled: true,
      listenAddresses: ['/ip4/0.0.0.0/tcp/4011'],
      peerId: '12D3SensitiveRelay',
      privateRelayDirectory: {
        discoveredRecordCount: 1,
        discoveredRelayPeerIds: ['12D3SensitiveRelay'],
        lastDiscoveredAt: 3000,
        lastIPNSName: '12D3SensitiveIPNSName',
        lastIPNSPublishedAt: 3800,
        lastIPNSResolvedAt: 3900,
        lastIPNSValue: '/ipfs/bafy-sensitive-relay-dir',
        lastLookupHadValue: true,
        lastLookupValueKind: 'inline-envelope',
        lastProviderLookupAt: 3500,
        lastProviderLookupHadValue: true,
        lastProviderLookupMultiaddrs: [
          '/dns4/provider.example.com/tcp/4011/p2p/12D3SensitiveRelay',
        ],
        lastProviderLookupMultiaddrCount: 1,
        lastPublishedAt: 2500,
        lastPublishedNetworkCount: 1,
        lastPubSubPublishedAt: 3600,
        lastPubSubReceivedAt: 3700,
        lastRequestedNetworkCount: 1,
        privateNetworkCount: 1,
        privateNetworkFingerprints: ['network-fingerprint'],
        publicConnectionPeerCount: 2,
        publicConnectionPeerId: '12D3PublicConnection',
      },
      relayAdvertised: true,
      relayAutoEnabled: false,
      relayEnabled: true,
      relayRecord: {
        expiresAt: 2000,
        issuedAt: 1000,
        multiaddrs: [
          '/dns4/relay.example.com/tcp/4011/p2p/12D3SensitiveRelay',
        ],
        peerId: '12D3SensitiveRelay',
        publicKey: 'public-key',
        role: 'relay',
        signature: 'signature',
        version: 1,
      },
      running: true,
    };
  }
});
