import ContentReplicationStatusFinder from '@app/contexts/content-replication/application/find-status/ContentReplicationStatusFinder';
import { ContentReplicaClaim } from '@app/contexts/content-replication/domain/ContentReplicaClaim';
import { ContentReplication } from '@app/contexts/content-replication/domain/ContentReplication';
import ContentReplicationPolicy from '@app/contexts/content-replication/domain/ContentReplicationPolicy';
import ContentReplicaClaimRepository from '@app/contexts/content-replication/domain/repositories/ContentReplicaClaimRepository';
import ContentReplicationRepository from '@app/contexts/content-replication/domain/repositories/ContentReplicationRepository';
import { ContentReplicationContext } from '@app/contexts/content-replication/domain/value-objects/ContentReplicationContext';
import { ContentReplicationMetadata } from '@app/contexts/content-replication/domain/value-objects/ContentReplicationMetadata';
import { ContentReplicationPriority } from '@app/contexts/content-replication/domain/value-objects/ContentReplicationPriority';
import { Node } from '@app/contexts/nodes/domain/Node';
import { NodePeer } from '@app/contexts/nodes/domain/NodePeer';
import { NodeRelayConfiguration } from '@app/contexts/nodes/domain/NodeRelayConfiguration';
import NodePeerRepository from '@app/contexts/nodes/domain/repositories/NodePeerRepository';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { ContentId } from '@app/contexts/content-replication/domain/value-objects/ContentId';
import { Timestamp } from '@haskou/value-objects';

describe('ContentReplicationStatusFinder', () => {
  const networkId = '550e8400-e29b-41d4-a716-446655440001';
  const localNodeId = '550e8400-e29b-41d4-a716-446655440010';
  const peerNodeId = '550e8400-e29b-41d4-a716-446655440011';

  it('should assign every active node while the network is small', async () => {
    const content = ContentReplication.create(
      new ContentId('bafy-content'),
      new ContentReplicationContext('ipfs_private_upload'),
      [new NetworkId(networkId)],
      ContentReplicationMetadata.fromPrimitives(128),
      undefined,
      ContentReplicationPriority.NORMAL,
      new Timestamp(1770000000000),
    );
    const contentRepository: ContentReplicationRepository = {
      findAll: () => Promise.resolve([content]),
      findByCid: () => Promise.resolve(undefined),
      save: () => Promise.resolve(),
    };
    const claimRepository: ContentReplicaClaimRepository = {
      findByCids: () =>
        Promise.resolve([
          ContentReplicaClaim.create(
            new ContentId('bafy-content'),
            new NetworkId(networkId),
            new NodeId(localNodeId),
            new Timestamp(1770000000000),
          ),
        ]),
      save: () => Promise.resolve(),
    };
    const nodeRepository: NodeRepository = {
      loadLocalNodeId: () => Promise.resolve(new NodeId(localNodeId)),
      loadLocalNode: () =>
        Promise.resolve(
          Node.fromPrimitives({
            id: localNodeId,
            networks: {},
            owner: undefined,
            relayConfiguration: NodeRelayConfiguration.default().toPrimitives(),
          }),
        ),
      saveLocalNode: () => Promise.resolve(),
    };
    const nodePeerRepository: NodePeerRepository = {
      findActive: () =>
        Promise.resolve([
          NodePeer.fromPrimitives({
            id: peerNodeId,
            lastSeenAt: 1770000000000,
            networks: [{ id: networkId, name: 'private' }],
            owner: undefined,
          }),
        ]),
      save: () => Promise.resolve(),
    };

    const status = await new ContentReplicationStatusFinder(
      contentRepository,
      claimRepository,
      nodeRepository,
      nodePeerRepository,
      new ContentReplicationPolicy(),
    ).find();

    expect(status.contents[0].networks[0]).toMatchObject({
      activeNodeCount: 2,
      desiredReplicas: 2,
      knownReplicaNodeIds: [localNodeId],
      knownReplicas: 1,
      localResponsible: true,
      networkId,
      releaseLocalReplica: false,
      responsibleNodeIds: [localNodeId, peerNodeId],
    });
  });
});
