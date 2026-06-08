import { PeersViewModel } from '@app/apps/apis/nodes-api/view-model/PeersViewModel';
import { NodePeer } from '@app/contexts/nodes/domain/NodePeer';

describe('PeersViewModel', () => {
  it('should expose safe peer capabilities and connection summary', () => {
    const peer = NodePeer.fromPrimitives({
      id: '550e8400-e29b-41d4-a716-446655440020',
      lastSeenAt: 1234,
      networks: [
        {
          id: '550e8400-e29b-41d4-a716-446655440021',
          name: 'public',
        },
        {
          id: '550e8400-e29b-41d4-a716-446655440022',
          name: 'private',
        },
      ],
      owner: 'MCowBQYDK2VwAyEAIZERRRhGaokvb3xQqMGr9Y2ble6jUd51OuZRsvW52Q4=',
    });

    expect(new PeersViewModel([peer]).toResource()).toEqual({
      peers: [
        {
          capabilities: {
            gossipsub: true,
            privateIpfs: true,
            publicIpfs: true,
            relay: false,
          },
          connectionSummary: {
            isSharedNetworkPeer: true,
            sharedNetworkCount: 2,
          },
          id: '550e8400-e29b-41d4-a716-446655440020',
          lastSeenAt: 1234,
          networks: [
            {
              id: '550e8400-e29b-41d4-a716-446655440021',
              name: 'public',
            },
            {
              id: '550e8400-e29b-41d4-a716-446655440022',
              name: 'private',
            },
          ],
          nodeType: 'unknown',
          owner:
            'MCowBQYDK2VwAyEAIZERRRhGaokvb3xQqMGr9Y2ble6jUd51OuZRsvW52Q4=',
        },
      ],
    });
  });
});
