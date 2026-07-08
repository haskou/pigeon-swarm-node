import LinkPreviewRateLimiter from '@app/apps/apis/link-previews-api/services/LinkPreviewRateLimiter';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { mock, MockProxy } from 'jest-mock-extended';

describe('LinkPreviewRateLimiter', () => {
  const identityId = new IdentityId(
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
  );
  const originalRateLimit = process.env.LINK_PREVIEW_RATE_LIMIT_PER_MINUTE;
  let database: MockProxy<EmbeddedLocalDatabase>;

  const restoreRateLimit = (): void => {
    if (originalRateLimit === undefined) {
      delete process.env.LINK_PREVIEW_RATE_LIMIT_PER_MINUTE;

      return;
    }

    process.env.LINK_PREVIEW_RATE_LIMIT_PER_MINUTE = originalRateLimit;
  };

  beforeEach(() => {
    process.env.LINK_PREVIEW_RATE_LIMIT_PER_MINUTE = '1';
    database = mock<EmbeddedLocalDatabase>();
    (
      LinkPreviewRateLimiter as unknown as { nextCleanupAt: number }
    ).nextCleanupAt = 0;
  });

  afterEach(() => {
    restoreRateLimit();
  });

  it('purges expired buckets in background while consuming a bucket', async () => {
    database.findOne.mockResolvedValue(undefined);

    await new LinkPreviewRateLimiter(database).consume(
      identityId,
      '127.0.0.1',
    );

    expect(database.deleteMany).toHaveBeenCalledWith(
      'link_preview_rate_limits',
      expect.any(Function),
    );
    expect(database.save).toHaveBeenCalledWith(
      'link_preview_rate_limits',
      `${identityId.valueOf()}:127.0.0.1`,
      {
        count: 1,
        resetAt: expect.any(Number),
      },
    );
  });
});
