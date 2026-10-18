import { InvalidPageCursorError } from '@app/apps/apis/shared/errors/InvalidPageCursorError';
import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import { PageLimit } from '@app/apps/apis/shared/pagination/PageLimit';
import { CommunityInvitationsFindMessage } from '@app/contexts/communities/application/find-invitations/messages/CommunityInvitationsFindMessage';

/** One page of a community's invitations, read after the position of its cursor. */
export class GetCommunityInvitationsRequest {
  /** An invitation id is the canonical base64url SHA-256 digest of its operation. */
  private static readonly POSITION_PATTERN = /^[A-Za-z0-9_-]{43}$/;

  public constructor(
    private readonly communityId: string,
    private readonly actorIdentityId: string,
    private readonly cursor: string | undefined,
    private readonly limit: unknown,
  ) {}

  /** The invitation to read after: the position of a decoded cursor, which must be an invitation id. */
  private afterPosition(): string | undefined {
    if (this.cursor === undefined) return undefined;

    const position = PageCursor.decode(this.cursor, this.scope());

    if (!GetCommunityInvitationsRequest.POSITION_PATTERN.test(position)) {
      throw new InvalidPageCursorError();
    }

    return position;
  }

  /** The resource a cursor for this list is issued for. */
  public scope(): string {
    return `communities/${this.communityId}/invitations`;
  }

  public getMessage(): CommunityInvitationsFindMessage {
    return new CommunityInvitationsFindMessage(
      this.communityId,
      this.actorIdentityId,
      PageLimit.parse(this.limit),
      this.afterPosition(),
    );
  }
}
