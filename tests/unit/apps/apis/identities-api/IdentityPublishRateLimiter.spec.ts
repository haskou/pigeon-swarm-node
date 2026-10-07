import IdentityPublishRateLimiter from '@app/apps/apis/identities-api/IdentityPublishRateLimiter';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { mock, MockProxy } from 'jest-mock-extended';

const IDENTITY = new IdentityId(
  'MCowBQYDK2VwAyEANHSu7gNCaXDe+hzph8c3HomozCnC/LdXe13/WpeIaVM=',
);

describe('IdentityPublishRateLimiter', () => {
  let database: MockProxy<EmbeddedLocalDatabase>;
  let limiter: IdentityPublishRateLimiter;
  const previous = process.env.IDENTITIES_PUBLISH_RATE_LIMIT_PER_MINUTE;

  beforeEach(() => {
    database = mock<EmbeddedLocalDatabase>();
    limiter = new IdentityPublishRateLimiter(database);
    process.env.IDENTITIES_PUBLISH_RATE_LIMIT_PER_MINUTE = '30';
  });

  afterAll(() => {
    if (previous === undefined)
      delete process.env.IDENTITIES_PUBLISH_RATE_LIMIT_PER_MINUTE;
    else process.env.IDENTITIES_PUBLISH_RATE_LIMIT_PER_MINUTE = previous;
  });

  it('admits the record that reaches the cap and refuses the next one', async () => {
    database.findOne.mockResolvedValue({
      count: 29,
      resetAt: Date.now() + 30_000,
    } as never);
    await expect(limiter.consume(IDENTITY)).resolves.toBeUndefined();

    database.findOne.mockResolvedValue({
      count: 30,
      resetAt: Date.now() + 30_000,
    } as never);
    await expect(limiter.consume(IDENTITY)).rejects.toThrow();
  });

  it('starts a new window once the previous one expired', async () => {
    database.findOne.mockResolvedValue({
      count: 99,
      resetAt: Date.now() - 1,
    } as never);

    await expect(limiter.consume(IDENTITY)).resolves.toBeUndefined();
    expect(database.save).toHaveBeenCalledWith(
      expect.any(String),
      IDENTITY.valueOf(),
      expect.objectContaining({ count: 1 }),
    );
  });

  it('is disabled by a limit of 0', async () => {
    process.env.IDENTITIES_PUBLISH_RATE_LIMIT_PER_MINUTE = '0';

    await expect(limiter.consume(IDENTITY)).resolves.toBeUndefined();
    expect(database.save).not.toHaveBeenCalled();
  });
});
