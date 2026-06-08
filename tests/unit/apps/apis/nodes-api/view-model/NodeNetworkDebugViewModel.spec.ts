import { NodeNetworkDebugViewModel } from '../../../../../../src/apps/apis/nodes-api/view-model/NodeNetworkDebugViewModel';
import { PublicRelayDebugState } from '../../../../../../src/shared/infrastructure/network/relay/PublicRelayDebugState';

describe('NodeNetworkDebugViewModel', () => {
  it('should not expose relay signatures or private topology metadata', () => {
    const resource = new NodeNetworkDebugViewModel({
      advertisedAddresses: ['/dns4/relay.test/tcp/4011/p2p/12D3Relay'],
      bootstrapRelayMultiaddrs: ['/dns4/bootstrap.test/tcp/4011/p2p/12D3Boot'],
      debugReason: 'Relay enabled and advertised with PIGEON_PUBLIC_HOST.',
      discoveryEnabled: true,
      discoveredRelayCount: 1,
      discoveredRelayMultiaddrs: ['/dns4/relay.test/tcp/4011/p2p/12D3Relay'],
      listenAddresses: ['/ip4/0.0.0.0/tcp/4011'],
      peerId: '12D3Relay',
      privateRelayDirectory: {
        discoveredRecordCount: 1,
        discoveredRelayPeerIds: ['12D3Relay'],
        privateNetworkCount: 1,
        privateNetworkFingerprints: ['safe-fingerprint'],
      },
      relayAutoEnabled: false,
      relayAdvertised: true,
      relayEnabled: true,
      relayRecord: {
        expiresAt: 2000,
        issuedAt: 1000,
        multiaddrs: ['/dns4/relay.test/tcp/4011/p2p/12D3Relay'],
        peerId: '12D3Relay',
        publicKey: 'public-key',
        role: 'relay',
        signature: 'signed-record',
        version: 1,
      },
      running: true,
    } satisfies PublicRelayDebugState).toResource();

    expect(resource.publicRelay).toEqual({
      advertisedAddresses: ['/dns4/relay.test/tcp/4011/p2p/12D3Relay'],
      bootstrapRelayMultiaddrs: ['/dns4/bootstrap.test/tcp/4011/p2p/12D3Boot'],
      debugReason: 'Relay enabled and advertised with PIGEON_PUBLIC_HOST.',
      discoveryEnabled: true,
      discoveredRelayCount: 1,
      discoveredRelayMultiaddrs: ['/dns4/relay.test/tcp/4011/p2p/12D3Relay'],
      listenAddresses: ['/ip4/0.0.0.0/tcp/4011'],
      peerId: '12D3Relay',
      privateRelayDirectory: {
        discoveredRecordCount: 1,
        discoveredRelayPeerIds: ['12D3Relay'],
        privateNetworkCount: 1,
        privateNetworkFingerprints: ['safe-fingerprint'],
      },
      relayAutoEnabled: false,
      relayAdvertised: true,
      relayEnabled: true,
      running: true,
    });
    expect(JSON.stringify(resource)).not.toContain('signature');
    expect(JSON.stringify(resource)).not.toContain('owner');
    expect(JSON.stringify(resource)).not.toContain('networkId');
  });
});
