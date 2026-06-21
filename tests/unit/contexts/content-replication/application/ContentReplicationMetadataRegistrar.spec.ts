import ContentReplicationMetadataRegistrar from '@app/contexts/content-replication/application/register-content/ContentReplicationMetadataRegistrar';
import { ContentReplication } from '@app/contexts/content-replication/domain/ContentReplication';
import ContentReplicationRepository from '@app/contexts/content-replication/domain/repositories/ContentReplicationRepository';
import { ContentReplicationContext } from '@app/contexts/content-replication/domain/value-objects/ContentReplicationContext';
import { ContentReplicationMetadata } from '@app/contexts/content-replication/domain/value-objects/ContentReplicationMetadata';
import { ContentReplicationPriority } from '@app/contexts/content-replication/domain/value-objects/ContentReplicationPriority';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { ContentId } from '@app/contexts/content-replication/domain/value-objects/ContentId';
import { Timestamp } from '@haskou/value-objects';

describe('ContentReplicationMetadataRegistrar', () => {
  const cid = 'bafy-content';
  const firstNetworkId = '550e8400-e29b-41d4-a716-446655440001';
  const secondNetworkId = '550e8400-e29b-41d4-a716-446655440002';

  it('stores content replication metadata without claiming a local replica', async () => {
    const savedContents: ContentReplication[] = [];
    const contentRepository: ContentReplicationRepository = {
      findAll: async () => [],
      findByCid: async () => undefined,
      save: async (content) => {
        savedContents.push(content);
      },
    };

    const content = await new ContentReplicationMetadataRegistrar(
      contentRepository,
    ).register({
      cid,
      context: 'ipfs_private_upload',
      createdAt: 1770000000000,
      networkIds: [firstNetworkId],
      priority: 'normal',
      sizeBytes: 128,
      updatedAt: 1770000001000,
    });

    expect(content.toPrimitives()).toMatchObject({
      cid,
      context: 'ipfs_private_upload',
      createdAt: 1770000000000,
      networkIds: [firstNetworkId],
      priority: 'normal',
      sizeBytes: 128,
      updatedAt: 1770000001000,
    });
    expect(savedContents).toHaveLength(1);
  });

  it('adds announced networks to existing content metadata', async () => {
    const savedContents: ContentReplication[] = [];
    const existing = ContentReplication.create(
      new ContentId(cid),
      new ContentReplicationContext('ipfs_private_upload'),
      [new NetworkId(firstNetworkId)],
      ContentReplicationMetadata.fromPrimitives(128),
      undefined,
      ContentReplicationPriority.NORMAL,
      new Timestamp(1770000000000),
    );
    const contentRepository: ContentReplicationRepository = {
      findAll: async () => [],
      findByCid: async () => existing,
      save: async (content) => {
        savedContents.push(content);
      },
    };

    const content = await new ContentReplicationMetadataRegistrar(
      contentRepository,
    ).register({
      cid,
      context: 'ipfs_private_upload',
      networkIds: [firstNetworkId, secondNetworkId],
      priority: 'normal',
      sizeBytes: 128,
      updatedAt: 1770000001000,
    });

    expect(content.toPrimitives().networkIds.sort()).toEqual([
      firstNetworkId,
      secondNetworkId,
    ]);
    expect(savedContents).toHaveLength(1);
  });
});
