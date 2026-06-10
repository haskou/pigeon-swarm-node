import { ContentReplicaClaim } from '@app/contexts/content-replication/domain/ContentReplicaClaim';
import { OrbitDBContentReplicaClaimDocument } from '@app/contexts/content-replication/infrastructure/orbitdb/documents/OrbitDBContentReplicaClaimDocument';
import OrbitDBContentReplicaClaimMapper from '@app/contexts/content-replication/infrastructure/orbitdb/mappers/OrbitDBContentReplicaClaimMapper';
import OrbitDBContentReplicaClaimRepository from '@app/contexts/content-replication/infrastructure/orbitdb/OrbitDBContentReplicaClaimRepository';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

describe('OrbitDBContentReplicaClaimRepository', () => {
  let put: jest.Mock;
  let query: jest.Mock;
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBContentReplicaClaimRepository;

  const cid = 'bafybeiar4vdblgp6l3rglchiakcfe2vlyy22pjlll6xnvggjy7weal4t4i';
  const networkId = 'ee33cc83-2cf1-40c0-968c-1aae69e38ae7';
  const nodeId = '550e8400-e29b-41d4-a716-446655440001';
  const document: OrbitDBContentReplicaClaimDocument = {
    cid,
    claimedAt: 1780000000000,
    id: `${cid}:${networkId}:${nodeId}`,
    kind: 'content_replica_claim',
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
          ) => document is OrbitDBContentReplicaClaimDocument,
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
                kind: 'content_replication',
              },
            ].filter(matcher),
          ),
      );
    registry = new OrbitDBReplicatedStateRegistry();
    registry.clear();
    registry.register(networkId, {
      contentReplication: {
        put,
        query,
      },
    } as never);
    repository = new OrbitDBContentReplicaClaimRepository(
      registry,
      new OrbitDBContentReplicaClaimMapper(),
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
    const claim = ContentReplicaClaim.create(
      new IPFSId(cid),
      new NetworkId(networkId),
      new NodeId(nodeId),
      new Timestamp(document.claimedAt),
    );

    await repository.save(claim);

    expect(put).toHaveBeenCalledWith(document);
  });
});
