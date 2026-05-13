import { CallId } from '@app/contexts/calls/domain/value-objects/CallId';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import {
  CallSignalRateBucket,
  CallSignalRatePolicy,
} from './CallSignalRatePolicy';
import { CallSignalRateLimitExceededError } from './errors/CallSignalRateLimitExceededError';

type CallSignalRateLimitDocument = CallSignalRateBucket & {
  _id: string;
};

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
    const id = this.id(callId, senderIdentityId);
    const collection = await this.collection();
    const document = await collection.findOne({ _id: id });
    const next = this.policy.consume(document || undefined, Date.now());

    if (!next.allowed) {
      throw new CallSignalRateLimitExceededError(this.policy.getLimit());
    }

    await collection.updateOne(
      { _id: id },
      {
        $set: {
          count: next.bucket.count,
          resetAt: next.bucket.resetAt,
        },
      },
      { upsert: true },
    );
  }
}
