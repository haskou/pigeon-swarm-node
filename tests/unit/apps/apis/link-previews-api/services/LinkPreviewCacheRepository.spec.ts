import LinkPreviewCacheRepository from '@app/apps/apis/link-previews-api/services/LinkPreviewCacheRepository';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { mock, MockProxy } from 'jest-mock-extended';

describe('LinkPreviewCacheRepository', () => {
  let database: MockProxy<EmbeddedLocalDatabase>;

  beforeEach(() => {
    database = mock<EmbeddedLocalDatabase>();
    (
      LinkPreviewCacheRepository as unknown as { nextCleanupAt: number }
    ).nextCleanupAt = 0;
  });

  it('purges expired previews before saving a preview', async () => {
    await new LinkPreviewCacheRepository(database).save({
      finalUrl: 'https://example.com/',
      title: 'Example',
      url: 'https://example.com/',
    });

    expect(database.deleteMany).toHaveBeenCalledWith(
      'link_preview_cache',
      expect.any(Function),
    );
    expect(database.save).toHaveBeenCalledWith(
      'link_preview_cache',
      'https://example.com/',
      {
        expiresAt: expect.any(Number),
        finalUrl: 'https://example.com/',
        title: 'Example',
        url: 'https://example.com/',
      },
    );
    expect(database.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      database.save.mock.invocationCallOrder[0],
    );
  });
});
