import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { CallSignalRateLimitDocument } from './CallSignalRateLimitDocument';
import { CallSignalRatePolicy } from './CallSignalRatePolicy';
import { CallSignalRateLimitExceededError } from './errors/CallSignalRateLimitExceededError';

export class CallSignalRateLimiter {
  private static readonly COLLECTION = 'call_signal_rate_limits';

  private readonly policy: CallSignalRatePolicy;

  constructor(
    private readonly mongo: MongoDB,
    policy: CallSignalRatePolicy = CallSignalRatePolicy.fromEnvironment(),
  ) {
    this.policy = policy;
  }

  private async collection() {
    return this.mongo.getCollection<CallSignalRateLimitDocument>(
      CallSignalRateLimiter.COLLECTION,
    );
  }

  private id(callId: CallId, senderIdentityId: IdentityId): string {
    return `${callId.valueOf()}:${senderIdentityId.valueOf()}`;
  }

  public async consume(
    callId: CallId,
    senderIdentityId: IdentityId,
  ): Promise<void> {
    if (this.policy.getLimit() === 0) {
      return;
    }

    const id = this.id(callId, senderIdentityId);
    const collection = await this.collection();
    const now = Date.now();
    const resetAt = now + CallSignalRatePolicy.WINDOW_MS;
    const result = await collection.findOneAndUpdate(
      { _id: id },
      [
        {
          $set: {
            count: {
              $cond: [
                {
                  $or: [{ $not: ['$count'] }, { $lte: ['$resetAt', now] }],
                },
                1,
                { $add: ['$count', 1] },
              ],
            },
            resetAt: {
              $cond: [
                {
                  $or: [{ $not: ['$resetAt'] }, { $lte: ['$resetAt', now] }],
                },
                resetAt,
                '$resetAt',
              ],
            },
          },
        },
      ],
      {
        returnDocument: 'after',
        upsert: true,
      },
    );
    const document = result || undefined;

    if (!document || document.count > this.policy.getLimit()) {
      throw new CallSignalRateLimitExceededError(this.policy.getLimit());
    }
  }
}
