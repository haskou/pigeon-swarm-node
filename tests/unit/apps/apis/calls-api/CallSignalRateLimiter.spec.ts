import { CallSignalRateLimiter } from '@app/apps/apis/calls-api/CallSignalRateLimiter';
import { CallSignalRatePolicy } from '@app/apps/apis/calls-api/CallSignalRatePolicy';
import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

describe('CallSignalRateLimiter', () => {
  const callId = new CallId('550e8400-e29b-41d4-a716-446655440000');
  const senderIdentityId = new IdentityId(
    'MCowBQYDK2VwAyEAFuQGsm0WcnE4FhQecwAFGeTfQCZzEMuhE73CyTUxOio=',
  );

  it('consumes the rate bucket with one atomic update', async () => {
    const collection = {
      findOneAndUpdate: jest.fn().mockResolvedValue({
        _id: `${callId.valueOf()}:${senderIdentityId.valueOf()}`,
        count: 1,
        resetAt: 1770000060000,
      }),
    };
    const mongo = {
      getCollection: jest.fn().mockResolvedValue(collection),
    } as unknown as MongoDB;

    await new CallSignalRateLimiter(
      mongo,
      new CallSignalRatePolicy(1),
    ).consume(callId, senderIdentityId);

    expect(collection.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(collection.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: `${callId.valueOf()}:${senderIdentityId.valueOf()}` },
      expect.any(Array),
      {
        returnDocument: 'after',
        upsert: true,
      },
    );
  });

  it('rejects when the atomic bucket count exceeds the limit', async () => {
    const collection = {
      findOneAndUpdate: jest.fn().mockResolvedValue({
        _id: `${callId.valueOf()}:${senderIdentityId.valueOf()}`,
        count: 2,
        resetAt: 1770000060000,
      }),
    };
    const mongo = {
      getCollection: jest.fn().mockResolvedValue(collection),
    } as unknown as MongoDB;
    const limiter = new CallSignalRateLimiter(
      mongo,
      new CallSignalRatePolicy(1),
    );

    await expect(limiter.consume(callId, senderIdentityId)).rejects.toThrow(
      'Call signal rate limit exceeded. Maximum is 1 signals per minute.',
    );
  });
});
