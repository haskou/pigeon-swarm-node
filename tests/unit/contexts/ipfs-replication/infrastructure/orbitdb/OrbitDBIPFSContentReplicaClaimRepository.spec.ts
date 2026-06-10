import { IPFSContentReplicaClaim } from '@app/contexts/ipfs-replication/domain/IPFSContentReplicaClaim';
import { OrbitDBIPFSContentReplicaClaimDocument } from '@app/contexts/ipfs-replication/infrastructure/orbitdb/documents/OrbitDBIPFSContentReplicaClaimDocument';
import OrbitDBIPFSContentReplicaClaimMapper from '@app/contexts/ipfs-replication/infrastructure/orbitdb/mappers/OrbitDBIPFSContentReplicaClaimMapper';
import OrbitDBIPFSContentReplicaClaimRepository from '@app/contexts/ipfs-replication/infrastructure/orbitdb/OrbitDBIPFSContentReplicaClaimRepository';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

describe('OrbitDBIPFSContentReplicaClaimRepository', () => {
  let put: jest.Mock;
  let query: jest.Mock;
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBIPFSContentReplicaClaimRepository;

  const cid = 'bafybeiar4vdblgp6l3rglchiakcfe2vlyy22pjlll6xnvggjy7weal4t4i';
  const networkId = 'ee33cc83-2cf1-40c0-968c-1aae69e38ae7';
  const nodeId = '550e8400-e29b-41d4-a716-446655440001';
  const document: OrbitDBIPFSContentReplicaClaimDocument = {
    cid,
    claimedAt: 1780000000000,
    id: `${cid}:${networkId}:${nodeId}`,
    kind: 'ipfs_content_replica_claim',
    networkId,
    nodeId,
  };

  beforeEach(() => {
    put = jest.fn().mockResolvedValue('ok');
    query = jest
      .fn()
      .mockImplementation(
        (
          matcher: (
            document: Record<string, unknown>,
          ) => document is OrbitDBIPFSContentReplicaClaimDocument,
        ) =>
          Promise.resolve(
            [
              document,
              {
                ...document,
                cid: 'bafyothercid',
                id: 'bafyothercid:network:node',
              },
              {
                ...document,
                kind: 'ipfs_content_replication',
              },
            ].filter(matcher),
          ),
      );
    registry = new OrbitDBReplicatedStateRegistry();
    registry.clear();
    registry.register(networkId, {
      ipfsReplication: {
        put,
        query,
      },
    } as never);
    repository = new OrbitDBIPFSContentReplicaClaimRepository(
      registry,
      new OrbitDBIPFSContentReplicaClaimMapper(),
    );
  });

  afterEach(() => {
    registry.clear();
  });

  it('should find replica claims by CID from OrbitDB', async () => {
    const result = await repository.findByCids([new IPFSId(cid)]);

    expect(result.map((claim) => claim.toPrimitives())).toEqual([
      {
        cid,
        claimedAt: document.claimedAt,
        networkId,
        nodeId,
      },
    ]);
  });

  it('should save replica claims into the replicated store', async () => {
    const claim = IPFSContentReplicaClaim.create(
      new IPFSId(cid),
      new NetworkId(networkId),
      new NodeId(nodeId),
      new Timestamp(document.claimedAt),
    );

    await repository.save(claim);

    expect(put).toHaveBeenCalledWith(document);
  });
});
