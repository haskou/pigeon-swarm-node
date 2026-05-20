import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import MongoDB from '@app/shared/infrastructure/mongodb/MongoDB';

import { LinkPreviewRateLimitExceededError } from '../errors/LinkPreviewRateLimitExceededError';
import {
  LinkPreviewRateBucket,
  LinkPreviewRatePolicy,
} from './LinkPreviewRatePolicy';

type LinkPreviewRateLimitDocument = LinkPreviewRateBucket & {
  _id: string;
};

export class LinkPreviewRateLimiter {
  private static readonly COLLECTION = 'link_preview_rate_limits';

  private readonly policy: LinkPreviewRatePolicy;

  constructor(
    private readonly mongo: MongoDB,
    policy: LinkPreviewRatePolicy = LinkPreviewRatePolicy.fromEnvironment(),
  ) {
    this.policy = policy;
  }

  private async collection() {
    return this.mongo.getCollection<LinkPreviewRateLimitDocument>(
      LinkPreviewRateLimiter.COLLECTION,
    );
  }

  private id(identityId: IdentityId, ipAddress: string): string {
    return `${identityId.valueOf()}:${ipAddress}`;
  }

  public async consume(
    identityId: IdentityId,
    ipAddress: string,
  ): Promise<void> {
    if (this.policy.getLimit() === 0) {
      return;
    }

    const collection = await this.collection();
    const now = Date.now();
    const resetAt = now + LinkPreviewRatePolicy.WINDOW_MS;
    const result = await collection.findOneAndUpdate(
      { _id: this.id(identityId, ipAddress) },
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

    if (!result || result.count > this.policy.getLimit()) {
      throw new LinkPreviewRateLimitExceededError(this.policy.getLimit());
    }
  }
}
