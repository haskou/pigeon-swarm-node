import { NodeViewModel } from '@app/apps/apis/nodes-api/view-model/NodeViewModel';
import { Network } from '@app/contexts/nodes/domain/Network';
import { Node } from '@app/contexts/nodes/domain/Node';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { PublicRelayDebugState } from '@app/shared/infrastructure/network/relay/PublicRelayDebugState';

describe('NodeViewModel', () => {
  it('should expose safe node runtime and relay summary', () => {
    process.env.TRANSPORT_DSN = 'libp2p-gossipsub://';
    process.env.LOG_LEVEL = 'info';
    const node = new Node(
      new NodeId('550e8400-e29b-41d4-a716-446655440010'),
      new Map([
        [
          new NetworkId('550e8400-e29b-41d4-a716-446655440011'),
          Network.fromPrimitives({
            id: '550e8400-e29b-41d4-a716-446655440011',
            key: undefined,
            name: 'public',
          }),
        ],
        [
          new NetworkId('550e8400-e29b-41d4-a716-446655440012'),
          Network.fromPrimitives({
            id: '550e8400-e29b-41d4-a716-446655440012',
            key: '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIGAjx38RTkT7ZsPCcTRgrTAWjBdk5+Pq+/a5h2dPLsw3\n-----END PRIVATE KEY-----\n',
            name: 'private',
          }),
        ],
      ]),
      new IdentityId(
        'MCowBQYDK2VwAyEAIZERRRhGaokvb3xQqMGr9Y2ble6jUd51OuZRsvW52Q4=',
      ),
    );

    expect(new NodeViewModel(node, relayState({ running: true })).toResource())
      .toMatchObject({
        id: '550e8400-e29b-41d4-a716-446655440010',
        networkSummary: {
          privateCount: 1,
          publicCount: 1,
          total: 2,
        },
        nodeType: 'relay',
        owner:
          'MCowBQYDK2VwAyEAIZERRRhGaokvb3xQqMGr9Y2ble6jUd51OuZRsvW52Q4=',
        relay: {
          advertised: true,
          autoEnabled: false,
          enabled: true,
          peerId: 'relay-peer',
          running: true,
        },
        runtime: {
          logLevel: 'info',
          transport: 'libp2p-gossipsub',
        },
      });
  });

  function relayState(
    overrides: Partial<PublicRelayDebugState> = {},
  ): PublicRelayDebugState {
    return {
      advertisedAddresses: [],
      bootstrapRelayMultiaddrs: [],
      debugReason: 'test',
      discoveredRelayCount: 0,
      discoveredRelayMultiaddrs: [],
      discoveryEnabled: true,
      listenAddresses: [],
      peerId: 'relay-peer',
      privateRelayDirectory: {
        discoveredRecordCount: 0,
        discoveredRelayPeerIds: [],
        privateNetworkCount: 0,
        privateNetworkFingerprints: [],
      },
      relayAdvertised: true,
      relayAutoEnabled: false,
      relayEnabled: true,
      running: false,
      ...overrides,
    };
  }
});
