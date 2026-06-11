import { ContentReplication } from '@app/contexts/content-replication/domain/ContentReplication';
import ContentReplicationRepository from '@app/contexts/content-replication/domain/repositories/ContentReplicationRepository';
import { ContentReplicationContext } from '@app/contexts/content-replication/domain/value-objects/ContentReplicationContext';
import { ContentReplicationMetadata } from '@app/contexts/content-replication/domain/value-objects/ContentReplicationMetadata';
import { ContentReplicationPriority } from '@app/contexts/content-replication/domain/value-objects/ContentReplicationPriority';
import ContentGetter from '@app/contexts/content-replication/application/get-content/ContentGetter';
import { ContentGetMessage } from '@app/contexts/content-replication/application/get-content/messages/ContentGetMessage';
import { NetworkId } from '@app/contexts/shared/domain/value-objects/NetworkId';
import { IPFSContentNotFoundError } from '@app/contexts/shared/infrastructure/ipfs/errors/IPFSContentNotFoundError';
import { IPFSId } from '@app/contexts/shared/infrastructure/ipfs/helia/IPFSId';
import IPFS from '@app/contexts/shared/infrastructure/ipfs/IPFS';
import { Timestamp } from '@haskou/value-objects';
import { mock, MockProxy } from 'jest-mock-extended';

describe('ContentGetter', () => {
  let contentRepository: MockProxy<ContentReplicationRepository>;
  let ipfs: MockProxy<IPFS>;
  let getter: ContentGetter;

  beforeEach(() => {
    contentRepository = mock<ContentReplicationRepository>();
    ipfs = mock<IPFS>();
    getter = new ContentGetter(ipfs, contentRepository);
  });

  it('should resolve binary metadata in parallel with IPFS bytes', async () => {
    const calls: string[] = [];
    let resolveBytes: (bytes: Buffer) => void = () => undefined;
    const content = ContentReplication.create(
      new IPFSId('bafkreiacontent'),
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

    ipfs.getBytes.mockImplementation(async () => {
      calls.push('bytes');

      return new Promise<Buffer>((resolve) => {
        resolveBytes = resolve;
      });
    });
    ipfs.getJSON.mockRejectedValue(new IPFSContentNotFoundError('bafkreiacontent'));
    contentRepository.findByCid.mockImplementation(async () => {
      calls.push('metadata');

      return content;
    });

    const result = getter.get(new ContentGetMessage('bafkreiacontent'));

    await Promise.resolve();

    expect(calls).toEqual(['metadata', 'bytes']);

    resolveBytes(Buffer.from('data'));

    await expect(result).resolves.toEqual({
      bytes: Buffer.from('data'),
      contentType: 'image/png',
      filename: 'avatar.png',
      kind: 'binary',
    });
    expect(ipfs.getJSON).not.toHaveBeenCalled();
  });
});
