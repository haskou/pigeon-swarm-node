import IPFSReplicationStatusFinder from '@app/contexts/ipfs-replication/application/find-status/IPFSReplicationStatusFinder';
import { IPFSContentReplicaClaim } from '@app/contexts/ipfs-replication/domain/IPFSContentReplicaClaim';
import { IPFSContentReplication } from '@app/contexts/ipfs-replication/domain/IPFSContentReplication';
import IPFSReplicationPolicy from '@app/contexts/ipfs-replication/domain/IPFSReplicationPolicy';
import IPFSContentReplicaClaimRepository from '@app/contexts/ipfs-replication/domain/repositories/IPFSContentReplicaClaimRepository';
import IPFSContentReplicationRepository from '@app/contexts/ipfs-replication/domain/repositories/IPFSContentReplicationRepository';
import { IPFSContentReplicationContext } from '@app/contexts/ipfs-replication/domain/value-objects/IPFSContentReplicationContext';
import { IPFSContentReplicationMetadata } from '@app/contexts/ipfs-replication/domain/value-objects/IPFSContentReplicationMetadata';
import { IPFSContentReplicationPriority } from '@app/contexts/ipfs-replication/domain/value-objects/IPFSContentReplicationPriority';
import { Node } from '@app/contexts/nodes/domain/Node';
import { NodePeer } from '@app/contexts/nodes/domain/NodePeer';
import NodePeerRepository from '@app/contexts/nodes/domain/repositories/NodePeerRepository';
import NodeRepository from '@app/contexts/nodes/domain/repositories/NodeRepository';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import { Timestamp } from '@haskou/value-objects';

describe('IPFSReplicationStatusFinder', () => {
  const networkId = '550e8400-e29b-41d4-a716-446655440001';
  const localNodeId = '550e8400-e29b-41d4-a716-446655440010';
  const peerNodeId = '550e8400-e29b-41d4-a716-446655440011';

  it('should assign every active node while the network is small', async () => {
    const content = IPFSContentReplication.create(
      new IPFSId('bafy-content'),
      new IPFSContentReplicationContext('ipfs_private_upload'),
      [new NetworkId(networkId)],
      IPFSContentReplicationMetadata.fromPrimitives(128),
      undefined,
      IPFSContentReplicationPriority.NORMAL,
      new Timestamp(1770000000000),
    );
    const contentRepository: IPFSContentReplicationRepository = {
      findAll: () => Promise.resolve([content]),
      findByCid: () => Promise.resolve(undefined),
      save: () => Promise.resolve(),
    };
    const claimRepository: IPFSContentReplicaClaimRepository = {
      findByCids: () =>
        Promise.resolve([
          IPFSContentReplicaClaim.create(
            new IPFSId('bafy-content'),
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

    const status = await new IPFSReplicationStatusFinder(
      contentRepository,
      claimRepository,
      nodeRepository,
      nodePeerRepository,
      new IPFSReplicationPolicy(),
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
