import ReplicatedContentStorage from '@app/contexts/content-replication/application/content-storage/ReplicatedContentStorage';
import ContentReplicationStatusFinder from '@app/contexts/content-replication/application/find-status/ContentReplicationStatusFinder';
import ContentReplicationMaintainer from '@app/contexts/content-replication/application/maintain/ContentReplicationMaintainer';
import { maxContentSizeBytes } from '@app/contexts/content-replication/application/publish-content/ContentUploadLimits';
import { IPFSContentTooLargeError } from '@app/contexts/shared/infrastructure/ipfs/errors/IPFSContentTooLargeError';
import { mock, MockProxy } from 'jest-mock-extended';

const NETWORK = '550e8400-e29b-41d4-a716-446655440001';

describe('ContentReplicationMaintainer', () => {
  let finder: MockProxy<ContentReplicationStatusFinder>;
  let storage: MockProxy<ReplicatedContentStorage>;
  let maintainer: ContentReplicationMaintainer;

  const statusOf = (sizeBytes: number, localResponsible: boolean): never =>
    ({
      contents: [
        {
          cid: 'bafkreiacontent',
          context: 'ipfs_public_upload',
          networks: [{ localResponsible, networkId: NETWORK }],
          sizeBytes,
        },
      ],
    }) as never;

  beforeEach(() => {
    finder = mock<ContentReplicationStatusFinder>();
    storage = mock<ReplicatedContentStorage>();
    maintainer = new ContentReplicationMaintainer(finder, storage);
  });

  it('fetches a responsible replica bounded by its declared size, then provides it', async () => {
    finder.find.mockResolvedValue(statusOf(2048, true));

    await expect(maintainer.maintain()).resolves.toEqual({
      failedReplicas: 0,
      maintainedReplicas: 1,
    });
    expect(storage.findBytesInNetwork).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      2048,
    );
    expect(storage.provideInNetwork).toHaveBeenCalledTimes(1);
  });

  it('never bounds a fetch above the upload limit', async () => {
    finder.find.mockResolvedValue(statusOf(maxContentSizeBytes * 4, true));

    await maintainer.maintain();

    expect(storage.findBytesInNetwork).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      maxContentSizeBytes,
    );
  });

  it('counts an aborted oversized fetch as failed and does not provide it', async () => {
    finder.find.mockResolvedValue(statusOf(10, true));
    storage.findBytesInNetwork.mockRejectedValue(
      new IPFSContentTooLargeError('bafkreiacontent', 10),
    );

    await expect(maintainer.maintain()).resolves.toEqual({
      failedReplicas: 1,
      maintainedReplicas: 0,
    });
    expect(storage.provideInNetwork).not.toHaveBeenCalled();
  });

  it('does nothing for a replica another node is responsible for', async () => {
    finder.find.mockResolvedValue(statusOf(10, false));

    await maintainer.maintain();

    expect(storage.findBytesInNetwork).not.toHaveBeenCalled();
  });
});
