import { ContentReplicaClaim } from '@app/contexts/content-replication/domain/ContentReplicaClaim';
import { OrbitDBContentReplicaClaimDocument } from '@app/contexts/content-replication/infrastructure/orbitdb/documents/OrbitDBContentReplicaClaimDocument';
import OrbitDBContentReplicaClaimMapper from '@app/contexts/content-replication/infrastructure/orbitdb/mappers/OrbitDBContentReplicaClaimMapper';
import OrbitDBContentReplicaClaimRepository from '@app/contexts/content-replication/infrastructure/orbitdb/OrbitDBContentReplicaClaimRepository';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { NodeId } from '@app/contexts/shared/domain/value-objects/NodeId';
import { ContentId } from '@app/contexts/content-replication/domain/value-objects/ContentId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

describe('OrbitDBContentReplicaClaimRepository', () => {
  let put: jest.Mock;
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

  beforeEach(async () => {
    put = jest.fn().mockResolvedValue('ok');
    registry = new OrbitDBReplicatedStateRegistry();
    registry.clear();
    await registry.register(networkId, {
      contentReplication: {
        put,
      },
      heads: {
        all: jest.fn(async () => [
          {
            key: `content-replica-claim:${cid}:${networkId}:${nodeId}`,
            value: document,
          },
        ]),
        get: jest.fn(async (): Promise<undefined> => undefined),
        put: jest.fn(async () => 'ok'),
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
    const result = await repository.findByCids([new ContentId(cid)]);

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
      new ContentId(cid),
      new NetworkId(networkId),
      new NodeId(nodeId),
      new Timestamp(document.claimedAt),
    );

    await repository.save(claim);

    expect(put).toHaveBeenCalledWith(document);
  });

  it('should ignore withdrawn replica claims', async () => {
    await repository.withdraw(
      new ContentId(cid),
      new NetworkId(networkId),
      new NodeId(nodeId),
    );

    const result = await repository.findByCids([new ContentId(cid)]);

    expect(result).toEqual([]);
  });

  it('should persist withdrawn replica claim tombstones', async () => {
    await repository.withdraw(
      new ContentId(cid),
      new NetworkId(networkId),
      new NodeId(nodeId),
    );

    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({
        cid,
        claimedAt: 0,
        id: `${cid}:${networkId}:${nodeId}`,
        kind: 'content_replica_claim',
        networkId,
        nodeId,
        updatedAt: expect.any(Number),
        withdrawnAt: expect.any(Number),
      }),
    );
  });
});
