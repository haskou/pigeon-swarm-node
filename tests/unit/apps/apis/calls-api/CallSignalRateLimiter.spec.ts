import CallSignalRateLimiter from '@app/apps/apis/calls-api/CallSignalRateLimiter';
import { CallSignalRatePolicy } from '@app/apps/apis/calls-api/CallSignalRatePolicy';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import EmbeddedLocalDatabase from '@app/shared/infrastructure/local-db/EmbeddedLocalDatabase';
import { mock, MockProxy } from 'jest-mock-extended';

describe('CallSignalRateLimiter', () => {
  const callId = new CallId('550e8400-e29b-41d4-a716-446655440000');
  const senderIdentityId = new IdentityId(
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
  );
  const originalRateLimit = process.env.CALLS_SIGNAL_RATE_LIMIT_PER_MINUTE;
  let database: MockProxy<EmbeddedLocalDatabase>;

  const restoreRateLimit = (): void => {
    if (originalRateLimit === undefined) {
      delete process.env.CALLS_SIGNAL_RATE_LIMIT_PER_MINUTE;

      return;
    }

    process.env.CALLS_SIGNAL_RATE_LIMIT_PER_MINUTE = originalRateLimit;
  };

  beforeEach(() => {
    process.env.CALLS_SIGNAL_RATE_LIMIT_PER_MINUTE = '1';
    database = mock<EmbeddedLocalDatabase>();
    (
      CallSignalRateLimiter as unknown as { nextCleanupAt: number }
    ).nextCleanupAt = 0;
  });

  afterEach(() => {
    restoreRateLimit();
  });

  it('consumes the rate bucket in local storage', async () => {
    database.findOne.mockResolvedValue(undefined);

    await new CallSignalRateLimiter(database).consume(callId, senderIdentityId);

    expect(database.findOne).toHaveBeenCalledWith(
      'call_signal_rate_limits',
      `${callId.valueOf()}:${senderIdentityId.valueOf()}`,
    );
    expect(database.save).toHaveBeenCalledWith(
      'call_signal_rate_limits',
      `${callId.valueOf()}:${senderIdentityId.valueOf()}`,
      {
        count: 1,
        resetAt: expect.any(Number),
      },
    );
    expect(database.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      database.save.mock.invocationCallOrder[0],
    );
  });

  it('rejects when the bucket count exceeds the limit', async () => {
    database.findOne.mockResolvedValue({
      _id: `${callId.valueOf()}:${senderIdentityId.valueOf()}`,
      count: 1,
      resetAt: Date.now() + CallSignalRatePolicy.WINDOW_MS,
    });
    const limiter = new CallSignalRateLimiter(database);

    await expect(limiter.consume(callId, senderIdentityId)).rejects.toThrow(
      'Call signal rate limit exceeded. Maximum is 1 signals per minute.',
    );

    expect(database.save).toHaveBeenCalledWith(
      'call_signal_rate_limits',
      `${callId.valueOf()}:${senderIdentityId.valueOf()}`,
      expect.objectContaining({
        count: 2,
      }),
    );
  });
});
