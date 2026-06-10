import { IPFSContentReplication } from '@app/contexts/ipfs-replication/domain/IPFSContentReplication';
import { IPFSContentReplicationContext } from '@app/contexts/ipfs-replication/domain/value-objects/IPFSContentReplicationContext';
import { IPFSContentReplicationMetadata } from '@app/contexts/ipfs-replication/domain/value-objects/IPFSContentReplicationMetadata';
import { IPFSContentReplicationPriority } from '@app/contexts/ipfs-replication/domain/value-objects/IPFSContentReplicationPriority';
import { OrbitDBIPFSContentReplicationDocument } from '@app/contexts/ipfs-replication/infrastructure/orbitdb/documents/OrbitDBIPFSContentReplicationDocument';
import OrbitDBIPFSContentReplicationMapper from '@app/contexts/ipfs-replication/infrastructure/orbitdb/mappers/OrbitDBIPFSContentReplicationMapper';
import OrbitDBIPFSContentReplicationRepository from '@app/contexts/ipfs-replication/infrastructure/orbitdb/OrbitDBIPFSContentReplicationRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('OrbitDBIPFSContentReplicationRepository', () => {
  let put: jest.Mock;
  let query: jest.Mock;
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBIPFSContentReplicationRepository;

  const identityMother = new IdentityMother();
  const cid = 'bafybeiar4vdblgp6l3rglchiakcfe2vlyy22pjlll6xnvggjy7weal4t4i';
  const networkId = 'ee33cc83-2cf1-40c0-968c-1aae69e38ae7';
  const ownerIdentityId = identityMother.id.valueOf();
  const baseDocument: OrbitDBIPFSContentReplicationDocument = {
    cid,
    contentType: 'image/png',
    context: 'ipfs_private_upload',
    createdAt: 1780000000000,
    filename: 'image.png',
    id: cid,
    networkIds: [networkId],
    ownerIdentityId,
    priority: 'normal',
    sizeBytes: 1024,
    updatedAt: 1780000000001,
  };

  beforeEach(() => {
    put = jest.fn().mockResolvedValue('ok');
    query = jest
      .fn()
      .mockImplementation(
        (
          matcher: (document: OrbitDBIPFSContentReplicationDocument) => boolean,
        ) =>
          Promise.resolve(
            [
              baseDocument,
              {
                ...baseDocument,
                filename: 'old-image.png',
                updatedAt: baseDocument.updatedAt - 1,
              },
              {
                ...baseDocument,
                cid: 'bafybeibfb7fpre6rvg5ujuk7g34kegdd7indjrilpkaogxavta77f4c6iy',
                id: 'bafybeibfb7fpre6rvg5ujuk7g34kegdd7indjrilpkaogxavta77f4c6iy',
                updatedAt: baseDocument.updatedAt + 1,
              },
            ].filter(matcher),
          ),
      );
    registry = new OrbitDBReplicatedStateRegistry();
    registry.clear();
    registry.register('network-1', {
      ipfsReplication: {
        put,
        query,
      },
    } as never);
    repository = new OrbitDBIPFSContentReplicationRepository(
      registry,
      new OrbitDBIPFSContentReplicationMapper(),
    );
  });

  afterEach(() => {
    registry.clear();
  });

  it('should find IPFS content replication metadata by CID from OrbitDB', async () => {
    const result = await repository.findByCid(new IPFSId(cid));

    expect(result?.toPrimitives()).toEqual({
      cid,
      contentType: baseDocument.contentType,
      context: baseDocument.context,
      createdAt: baseDocument.createdAt,
      filename: baseDocument.filename,
      networkIds: baseDocument.networkIds,
      ownerIdentityId,
      priority: baseDocument.priority,
      sizeBytes: baseDocument.sizeBytes,
      updatedAt: baseDocument.updatedAt,
    });
  });

  it('should list replicated content metadata ordered by newest update', async () => {
    const result = await repository.findAll();

    expect(result.map((content) => content.toPrimitives())).toEqual([
      expect.objectContaining({
        cid: 'bafybeibfb7fpre6rvg5ujuk7g34kegdd7indjrilpkaogxavta77f4c6iy',
      }),
      expect.objectContaining({
        cid,
        filename: 'image.png',
      }),
    ]);
  });

  it('should save IPFS content replication metadata into the replicated store', async () => {
    const content = IPFSContentReplication.create(
      new IPFSId(cid),
      new IPFSContentReplicationContext(baseDocument.context),
      [new NetworkId(networkId)],
      IPFSContentReplicationMetadata.fromPrimitives(
        baseDocument.sizeBytes,
        baseDocument.contentType,
        baseDocument.filename,
      ),
      new IdentityId(ownerIdentityId),
      IPFSContentReplicationPriority.NORMAL,
      new Timestamp(baseDocument.createdAt),
    );
    content.touch(new Timestamp(baseDocument.updatedAt));

    await repository.save(content);

    expect(put).toHaveBeenCalledWith(baseDocument);
  });
});
