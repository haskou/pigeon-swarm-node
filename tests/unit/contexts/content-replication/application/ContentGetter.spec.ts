import ReplicatedContentStorage from '@app/contexts/content-replication/application/content-storage/ReplicatedContentStorage';
import { ContentReplication } from '@app/contexts/content-replication/domain/ContentReplication';
import ContentReplicationRepository from '@app/contexts/content-replication/domain/repositories/ContentReplicationRepository';
import { ReplicatedContentNotFoundError } from '@app/contexts/content-replication/domain/errors/ReplicatedContentNotFoundError';
import { ContentId } from '@app/contexts/content-replication/domain/value-objects/ContentId';
import { ContentReplicationContext } from '@app/contexts/content-replication/domain/value-objects/ContentReplicationContext';
import { ContentReplicationMetadata } from '@app/contexts/content-replication/domain/value-objects/ContentReplicationMetadata';
import { ContentReplicationPriority } from '@app/contexts/content-replication/domain/value-objects/ContentReplicationPriority';
import ContentGetter from '@app/contexts/content-replication/application/get-content/ContentGetter';
import { ContentGetMessage } from '@app/contexts/content-replication/application/get-content/messages/ContentGetMessage';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { Timestamp } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

describe('ContentGetter', () => {
  let contentRepository: MockProxy<ContentReplicationRepository>;
  let contentStorage: MockProxy<ReplicatedContentStorage>;
  let getter: ContentGetter;

  beforeEach(() => {
    contentRepository = mock<ContentReplicationRepository>();
    contentStorage = mock<ReplicatedContentStorage>();
    getter = new ContentGetter(contentStorage, contentRepository);

    contentStorage.isRawContent.mockResolvedValue(false);
  });

  it('should resolve binary metadata after IPFS bytes exist', async () => {
    const calls: string[] = [];
    let resolveBytes: (bytes: Buffer) => void = () => undefined;
    const content = ContentReplication.create(
      new ContentId('bafkreiacontent'),
      new ContentReplicationContext('ipfs_private_upload'),
      [new NetworkId('550e8400-e29b-41d4-a716-446655440001')],
      ContentReplicationMetadata.fromPrimitives(
        4,
        'image/png',
        'avatar.png',
      ),
      undefined,
      ContentReplicationPriority.NORMAL,
      new Timestamp(1780000000000),
    );

    contentStorage.findBytes.mockImplementation(async () => {
      calls.push('bytes');

      return new Promise<Buffer>((resolve) => {
        resolveBytes = resolve;
      });
    });
    contentStorage.findJSON.mockRejectedValue(
      new ReplicatedContentNotFoundError(new ContentId('bafkreiacontent')),
    );
    contentRepository.findByCid.mockImplementation(async () => {
      calls.push('metadata');

      return content;
    });

    const result = getter.get(new ContentGetMessage('bafkreiacontent'));

    await Promise.resolve();

    expect(calls).toEqual(['bytes']);

    resolveBytes(Buffer.from('data'));

    await expect(result).resolves.toMatchObject({
      getBinaryResponse: expect.any(Function),
      isBinary: expect.any(Function),
    });
    expect((await result).getBinaryResponse()).toEqual({
      bytes: Buffer.from('data'),
      contentType: 'image/png',
      filename: 'avatar.png',
    });
    expect(calls).toEqual(['bytes', 'metadata']);
    expect(contentStorage.findJSON).not.toHaveBeenCalled();
  });

  it('should not try JSON fallback when a raw CID is missing as bytes', async () => {
    const cid = 'bafkreieo66jyunrnk3e462w4gzwtyjyfubkv6actsx5jcdgm6xwnmoq73y';

    contentStorage.findBytes.mockRejectedValue(
      new ReplicatedContentNotFoundError(new ContentId(cid)),
    );
    contentStorage.isRawContent.mockResolvedValue(true);
    contentRepository.findByCid.mockResolvedValue(undefined);

    await expect(getter.get(new ContentGetMessage(cid))).rejects.toThrow(
      ReplicatedContentNotFoundError,
    );
    expect(contentRepository.findByCid).not.toHaveBeenCalled();
    expect(contentStorage.findJSON).not.toHaveBeenCalled();
  });
});
