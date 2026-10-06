import ReplicatedContentStorage from '@app/contexts/content-replication/application/content-storage/ReplicatedContentStorage';
import ContentGetter from '@app/contexts/content-replication/application/get-content/ContentGetter';
import { ContentGetMessage } from '@app/contexts/content-replication/application/get-content/messages/ContentGetMessage';
import { ReplicatedContentNotFoundError } from '@app/contexts/content-replication/domain/errors/ReplicatedContentNotFoundError';
import { ContentId } from '@app/contexts/content-replication/domain/value-objects/ContentId';
import { mock, MockProxy } from 'jest-mock-extended';

describe('ContentGetter', () => {
  let contentStorage: MockProxy<ReplicatedContentStorage>;
  let getter: ContentGetter;

  beforeEach(() => {
    contentStorage = mock<ReplicatedContentStorage>();
    getter = new ContentGetter(contentStorage);
    contentStorage.isRawContent.mockResolvedValue(false);
  });

  it('serves a sniffed allowlisted type inline', async () => {
    contentStorage.findBytes.mockResolvedValue(
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    );

    const result = await getter.get(new ContentGetMessage('bafkreiacontent'));

    expect(result.getBinaryResponse()).toEqual({
      bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      contentType: 'image/jpeg',
      inline: true,
    });
  });

  it('serves anything else as an opaque download', async () => {
    contentStorage.findBytes.mockResolvedValue(
      Buffer.from('<script>1</script>'),
    );

    const result = await getter.get(new ContentGetMessage('bafkreiacontent'));

    expect(result.getBinaryResponse()).toMatchObject({
      contentType: 'application/octet-stream',
      inline: false,
    });
  });

  it('does not try the JSON fallback when a raw CID is missing as bytes', async () => {
    const cid = 'bafkreieo66jyunrnk3e462w4gzwtyjyfubkv6actsx5jcdgm6xwnmoq73y';

    contentStorage.findBytes.mockRejectedValue(
      new ReplicatedContentNotFoundError(new ContentId(cid)),
    );
    contentStorage.isRawContent.mockResolvedValue(true);

    await expect(getter.get(new ContentGetMessage(cid))).rejects.toThrow(
      ReplicatedContentNotFoundError,
    );
    expect(contentStorage.findJSON).not.toHaveBeenCalled();
  });
});
