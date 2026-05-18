import IPFSContentReplicationMetadataRegistrar from '@app/contexts/ipfs-replication/application/register-content/IPFSContentReplicationMetadataRegistrar';
import { IPFSContentReplication } from '@app/contexts/ipfs-replication/domain/IPFSContentReplication';
import { IPFSContentReplicationRepository } from '@app/contexts/ipfs-replication/domain/repositories/IPFSContentReplicationRepository';
import { IPFSContentReplicationContext } from '@app/contexts/ipfs-replication/domain/value-objects/IPFSContentReplicationContext';
import { IPFSContentReplicationPriority } from '@app/contexts/ipfs-replication/domain/value-objects/IPFSContentReplicationPriority';
import { IPFSContentSize } from '@app/contexts/ipfs-replication/domain/value-objects/IPFSContentSize';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import { Timestamp } from '@haskou/value-objects';

describe('IPFSContentReplicationMetadataRegistrar', () => {
  const cid = 'bafy-content';
  const firstNetworkId = '550e8400-e29b-41d4-a716-446655440001';
  const secondNetworkId = '550e8400-e29b-41d4-a716-446655440002';

  it('stores content replication metadata without claiming a local replica', async () => {
    const savedContents: IPFSContentReplication[] = [];
    const contentRepository: IPFSContentReplicationRepository = {
      findAll: async () => [],
      findByCid: async () => undefined,
      save: async (content) => {
        savedContents.push(content);
      },
    };

    const content = await new IPFSContentReplicationMetadataRegistrar(
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
    const savedContents: IPFSContentReplication[] = [];
    const existing = IPFSContentReplication.create(
      new IPFSId(cid),
      new IPFSContentReplicationContext('ipfs_private_upload'),
      [new NetworkId(firstNetworkId)],
      new IPFSContentSize(128),
      undefined,
      IPFSContentReplicationPriority.NORMAL,
      new Timestamp(1770000000000),
    );
    const contentRepository: IPFSContentReplicationRepository = {
      findAll: async () => [],
      findByCid: async () => existing,
      save: async (content) => {
        savedContents.push(content);
      },
    };

    const content = await new IPFSContentReplicationMetadataRegistrar(
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
