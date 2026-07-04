import { ContentReplication } from '@app/contexts/content-replication/domain/ContentReplication';
import { ContentReplicationContext } from '@app/contexts/content-replication/domain/value-objects/ContentReplicationContext';
import { ContentReplicationMetadata } from '@app/contexts/content-replication/domain/value-objects/ContentReplicationMetadata';
import { ContentReplicationPriority } from '@app/contexts/content-replication/domain/value-objects/ContentReplicationPriority';
import { OrbitDBContentReplicationDocument } from '@app/contexts/content-replication/infrastructure/orbitdb/documents/OrbitDBContentReplicationDocument';
import OrbitDBContentReplicationMapper from '@app/contexts/content-replication/infrastructure/orbitdb/mappers/OrbitDBContentReplicationMapper';
import OrbitDBContentReplicationRepository from '@app/contexts/content-replication/infrastructure/orbitdb/OrbitDBContentReplicationRepository';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { ContentId } from '@app/contexts/content-replication/domain/value-objects/ContentId';
import OrbitDBReplicatedStateRegistry from '@app/contexts/shared/infrastructure/orbitdb/OrbitDBReplicatedStateRegistry';
import { Timestamp } from '@haskou/value-objects';

import { IdentityMother } from '../../../../mothers/IdentityMother';

describe('OrbitDBContentReplicationRepository', () => {
  let put: jest.Mock;
  let query: jest.Mock;
  let headGet: jest.Mock;
  let headPut: jest.Mock;
  const heads = new Map<string, Record<string, unknown>>();
  let registry: OrbitDBReplicatedStateRegistry;
  let repository: OrbitDBContentReplicationRepository;

  const identityMother = new IdentityMother();
  const cid = 'bafybeiar4vdblgp6l3rglchiakcfe2vlyy22pjlll6xnvggjy7weal4t4i';
  const networkId = 'ee33cc83-2cf1-40c0-968c-1aae69e38ae7';
  const ownerIdentityId = identityMother.id.valueOf();
  const baseDocument: OrbitDBContentReplicationDocument = {
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
    heads.clear();
    headGet = jest.fn(async (key) => {
      const value = heads.get(key);

      return value ? { key, value } : undefined;
    });
    headPut = jest.fn(async (key, value) => {
      heads.set(key as string, value as Record<string, unknown>);

      return 'ok';
    });
    put = jest.fn().mockResolvedValue('ok');
    query = jest
      .fn()
      .mockImplementation(
        (
          matcher: (document: OrbitDBContentReplicationDocument) => boolean,
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
    registry.register(networkId, {
      contentReplication: {
        put,
        query,
      },
      heads: {
        all: jest.fn(async () =>
          [...heads.entries()].map(([key, value]) => ({ key, value })),
        ),
        get: headGet,
        put: headPut,
      },
    } as never);
    repository = new OrbitDBContentReplicationRepository(
      registry,
      new OrbitDBContentReplicationMapper(),
    );
  });

  afterEach(() => {
    registry.clear();
  });

  it('should find IPFS content replication metadata by CID from the direct head', async () => {
    await registry.putHead(
      `content-replication:${cid}`,
      { ...baseDocument },
      [networkId],
    );

    const result = await repository.findByCid(new ContentId(cid));

    expect(result?.toPrimitives()).toEqual(
      expect.objectContaining({
        cid,
        contentType: baseDocument.contentType,
        filename: baseDocument.filename,
      }),
    );
    expect(headGet).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('should not scan OrbitDB content replication documents when CID head is missing', async () => {
    const result = await repository.findByCid(new ContentId(cid));

    expect(result).toBeUndefined();
    expect(query).not.toHaveBeenCalled();
    expect(headPut).not.toHaveBeenCalled();
  });

  it('should list replicated content metadata ordered by newest update', async () => {
    await registry.putHead(
      `content-replication:${cid}`,
      { ...baseDocument },
      [networkId],
    );
    await registry.putHead(
      'content-replication:bafybeibfb7fpre6rvg5ujuk7g34kegdd7indjrilpkaogxavta77f4c6iy',
      {
        ...baseDocument,
        cid: 'bafybeibfb7fpre6rvg5ujuk7g34kegdd7indjrilpkaogxavta77f4c6iy',
        id: 'bafybeibfb7fpre6rvg5ujuk7g34kegdd7indjrilpkaogxavta77f4c6iy',
        updatedAt: baseDocument.updatedAt + 1,
      },
      [networkId],
    );

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
    const content = ContentReplication.create(
      new ContentId(cid),
      new ContentReplicationContext(baseDocument.context),
      [new NetworkId(networkId)],
      ContentReplicationMetadata.fromPrimitives(
        baseDocument.sizeBytes,
        baseDocument.contentType,
        baseDocument.filename,
      ),
      new IdentityId(ownerIdentityId),
      ContentReplicationPriority.NORMAL,
      new Timestamp(baseDocument.createdAt),
    );
    content.touch(new Timestamp(baseDocument.updatedAt));

    await repository.save(content);

    expect(put).toHaveBeenCalledWith(baseDocument);
    expect(headPut).toHaveBeenCalledWith(
      `content-replication:${cid}`,
      baseDocument,
    );
  });
});
