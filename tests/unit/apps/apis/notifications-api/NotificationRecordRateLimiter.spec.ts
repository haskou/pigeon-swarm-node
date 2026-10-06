import NotificationRecordRateLimiter from '@app/apps/apis/notifications-api/NotificationRecordRateLimiter';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { mock, MockProxy } from 'jest-mock-extended';

const IDENTITY = new IdentityId(
  'MCowBQYDK2VwAyEANHSu7gNCaXDe+hzph8c3HomozCnC/LdXe13/WpeIaVM=',
);

describe('NotificationRecordRateLimiter', () => {
  let database: MockProxy<EmbeddedLocalDatabase>;
  let limiter: NotificationRecordRateLimiter;
  const previous = process.env.NOTIFICATIONS_RECORD_RATE_LIMIT_PER_MINUTE;

  beforeEach(() => {
    database = mock<EmbeddedLocalDatabase>();
    limiter = new NotificationRecordRateLimiter(database);
    process.env.NOTIFICATIONS_RECORD_RATE_LIMIT_PER_MINUTE = '30';
  });

  afterAll(() => {
    if (previous === undefined)
      delete process.env.NOTIFICATIONS_RECORD_RATE_LIMIT_PER_MINUTE;
    else process.env.NOTIFICATIONS_RECORD_RATE_LIMIT_PER_MINUTE = previous;
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
    process.env.NOTIFICATIONS_RECORD_RATE_LIMIT_PER_MINUTE = '0';

    await expect(limiter.consume(IDENTITY)).resolves.toBeUndefined();
    expect(database.save).not.toHaveBeenCalled();
  });
});
