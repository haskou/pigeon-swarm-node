import { InvalidPageCursorError } from '@app/apps/apis/shared/errors/InvalidPageCursorError';
import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import { CommunityOperationsFindMessage } from '@app/contexts/communities/application/find-operations/messages/CommunityOperationsFindMessage';
import { CommunityOperation } from '@app/contexts/communities/domain/operations/CommunityOperation';
import { assert } from '@haskou/value-objects';

import { InvalidCommunityOperationsQueryError } from '../errors/InvalidCommunityOperationsQueryError';

/** One page of community operations, read after the position of its cursor. */
export class GetCommunityOperationsRequest {
  private static readonly DEFAULT_LIMIT = 50;
  private static readonly LIMIT_PATTERN = /^[1-9]\d{0,2}$/;
  private static readonly MAX_LIMIT = 100;

  public constructor(
    private readonly communityId: string,
    private readonly actorIdentityId: string,
    private readonly cursor: string | undefined,
    private readonly limit: unknown,
  ) {}

  /** A decimal integer from 1 to 100 without leading zeros, 50 when absent. */
  private pageLimit(): number {
    const { limit } = this;

    if (limit === undefined) return GetCommunityOperationsRequest.DEFAULT_LIMIT;

    assert(
      typeof limit === 'string' &&
        GetCommunityOperationsRequest.LIMIT_PATTERN.test(limit) &&
        Number(limit) <= GetCommunityOperationsRequest.MAX_LIMIT,
      new InvalidCommunityOperationsQueryError(),
    );

    return Number(limit);
  }

  /** The digest to read after: the position of a decoded cursor, an operation digest. */
  private afterDigest(): string | undefined {
    if (this.cursor === undefined) return undefined;

    const position = PageCursor.decode(this.cursor, this.scope());

    if (!CommunityOperation.DIGEST.test(position)) {
      throw new InvalidPageCursorError();
    }

    return position;
  }

  /** The resource a cursor for this list is issued for. */
  public scope(): string {
    return `communities/${this.communityId}/operations`;
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
