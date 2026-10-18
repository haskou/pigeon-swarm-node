import { InvalidPageCursorError } from '@app/apps/apis/shared/errors/InvalidPageCursorError';
import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import { PageLimit } from '@app/apps/apis/shared/pagination/PageLimit';
import { CommunityMembershipRequestPosition } from '@app/contexts/communities/application/find-membership-requests/CommunityMembershipRequestPosition';
import { CommunityMembershipRequestsFindMessage } from '@app/contexts/communities/application/find-membership-requests/messages/CommunityMembershipRequestsFindMessage';

/** One page of the caller's membership requests, read after the position of its cursor. */
export class GetCommunityMembershipRequestsRequest {
  public constructor(
    private readonly actorIdentityId: string,
    private readonly cursor: string | undefined,
    private readonly limit: unknown,
  ) {}

  /** The position to read after: the position of a decoded cursor, which must be a request position. */
  private afterPosition(): string | undefined {
    if (this.cursor === undefined) return undefined;

    const position = PageCursor.decode(this.cursor, this.scope());

    if (!CommunityMembershipRequestPosition.isValid(position)) {
      throw new InvalidPageCursorError();
    }

    return position;
  }

  /** The resource a cursor for this list is issued for. */
  public scope(): string {
    return 'community-membership-requests';
  }

  public getMessage(): CommunityMembershipRequestsFindMessage {
    return new CommunityMembershipRequestsFindMessage(
      this.actorIdentityId,
      PageLimit.parse(this.limit),
      this.afterPosition(),
    );
  }
}
