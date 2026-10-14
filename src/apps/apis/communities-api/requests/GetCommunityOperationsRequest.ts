import { CommunityOperationsFindMessage } from '@app/contexts/communities/application/find-operations/messages/CommunityOperationsFindMessage';
import { assert } from '@haskou/value-objects';

import { InvalidCommunityOperationsQueryError } from '../errors/InvalidCommunityOperationsQueryError';

/** The `after` digest and `limit` of one page of community operations. */
export class GetCommunityOperationsRequest {
  private static readonly DIGEST_PATTERN = /^[A-Za-z0-9_-]{43}$/;
  private static readonly LIMIT_PATTERN = /^[1-9]\d{0,2}$/;
  private static readonly MAX_LIMIT = 500;

  public constructor(
    private readonly communityId: string,
    private readonly actorIdentityId: string,
    private readonly after: unknown,
    private readonly limit: unknown,
  ) {}

  /** A decimal integer from 1 to 500 without leading zeros, 500 when absent. */
  private pageLimit(): number {
    const { limit } = this;

    if (limit === undefined) return GetCommunityOperationsRequest.MAX_LIMIT;

    assert(
      typeof limit === 'string' &&
        GetCommunityOperationsRequest.LIMIT_PATTERN.test(limit) &&
        Number(limit) <= GetCommunityOperationsRequest.MAX_LIMIT,
      new InvalidCommunityOperationsQueryError(),
    );

    return Number(limit);
  }

  /** An operation digest: 43 base64url characters. */
  private afterDigest(): string | undefined {
    const { after } = this;

    assert(
      after === undefined ||
        (typeof after === 'string' &&
          GetCommunityOperationsRequest.DIGEST_PATTERN.test(after)),
      new InvalidCommunityOperationsQueryError(),
    );

    return after as string | undefined;
  }

  public getMessage(): CommunityOperationsFindMessage {
    return new CommunityOperationsFindMessage(
      this.communityId,
      this.actorIdentityId,
      this.pageLimit(),
      this.afterDigest(),
    );
  }
}
