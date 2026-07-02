import { PeersViewModel } from '@app/apps/apis/nodes-api/view-model/PeersViewModel';
import { ActiveNodePeers } from '@app/contexts/nodes/application/find-peers/ActiveNodePeers';
import { Node } from '@app/contexts/nodes/domain/Node';
import { NodePeer } from '@app/contexts/nodes/domain/NodePeer';

describe('PeersViewModel', () => {
  it('should expose peer capabilities, connection summary and node type', () => {
    const publicNetworkId = '550e8400-e29b-41d4-a716-446655440011';
    const privateNetworkId = '550e8400-e29b-41d4-a716-446655440012';
    const localNode = Node.fromPrimitives({
      id: '550e8400-e29b-41d4-a716-446655440000',
      networks: {
        [publicNetworkId]: {
          id: publicNetworkId,
          key: undefined,
          name: 'public',
        },
      },
      owner: undefined,
    });
    const peer = NodePeer.fromPrimitives({
      id: '550e8400-e29b-41d4-a716-446655440010',
      lastSeenAt: 1780000000000,
      networks: [
        {
          id: publicNetworkId,
          name: 'public',
          type: 'public',
        },
        {
          id: privateNetworkId,
          name: 'private',
          type: 'private',
        },
      ],
      owner: undefined,
    });

    expect(
      new PeersViewModel(new ActiveNodePeers(localNode, [peer])).toResource(),
    ).toEqual({
      peers: [
        {
          capabilities: {
            privateIpfs: true,
            publicIpfs: true,
            relay: true,
          },
          connectionSummary: {
            isSharedNetworkPeer: true,
            sharedNetworkCount: 1,
          },
          id: '550e8400-e29b-41d4-a716-446655440010',
          lastSeenAt: 1780000000000,
          networks: [
            {
              id: publicNetworkId,
              name: 'public',
            },
            {
              id: privateNetworkId,
              name: 'private',
            },
          ],
          nodeType: 'relay',
        },
      ],
    });
  });

  it('should infer missing peer network types only from shared local networks', () => {
    const publicNetworkId = '550e8400-e29b-41d4-a716-446655440011';
    const unknownNetworkId = '550e8400-e29b-41d4-a716-446655440012';
    const localNode = Node.fromPrimitives({
      id: '550e8400-e29b-41d4-a716-446655440000',
      networks: {
        [publicNetworkId]: {
          id: publicNetworkId,
          key: undefined,
          name: 'public_0',
        },
      },
      owner: undefined,
    });
    const peer = NodePeer.fromPrimitives({
      id: '550e8400-e29b-41d4-a716-446655440010',
      lastSeenAt: 1780000000000,
      networks: [
        {
          id: publicNetworkId,
          name: 'public_0',
        },
        {
          id: unknownNetworkId,
          name: 'legacy-network',
        },
      ],
      owner: undefined,
    });

    expect(
      new PeersViewModel(new ActiveNodePeers(localNode, [peer])).toResource(),
    ).toEqual({
      peers: [
        {
          capabilities: {
            privateIpfs: false,
            publicIpfs: true,
            relay: false,
          },
          connectionSummary: {
            isSharedNetworkPeer: true,
            sharedNetworkCount: 1,
          },
          id: '550e8400-e29b-41d4-a716-446655440010',
          lastSeenAt: 1780000000000,
          networks: [
            {
              id: publicNetworkId,
              name: 'public_0',
            },
            {
              id: unknownNetworkId,
              name: 'legacy-network',
            },
          ],
          nodeType: 'reachable',
        },
      ],
    });
  });
});
