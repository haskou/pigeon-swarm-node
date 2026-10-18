import { InvalidPageCursorError } from '@app/apps/apis/shared/errors/InvalidPageCursorError';
import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import { PageLimit } from '@app/apps/apis/shared/pagination/PageLimit';
import { CommunityMembersFindMessage } from '@app/contexts/communities/application/find-members/messages/CommunityMembersFindMessage';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

/** One page of a community's members, read after the position of its cursor. */
export class GetCommunityMembersRequest {
  /** Whether a position is the one canonical encoding of an identity id. */
  private static isIdentityId(position: string): boolean {
    try {
      return new IdentityId(position).valueOf() === position;
    } catch {
      return false;
    }
  }

  public constructor(
    private readonly communityId: string,
    private readonly actorIdentityId: string,
    private readonly cursor: string | undefined,
    private readonly limit: unknown,
  ) {}

  /** The member to read after: the position of a decoded cursor, which must be a member's identity id. */
  private afterPosition(): string | undefined {
    if (this.cursor === undefined) return undefined;

    const position = PageCursor.decode(this.cursor, this.scope());

    if (!GetCommunityMembersRequest.isIdentityId(position)) {
      throw new InvalidPageCursorError();
    }

    return position;
  }

  /** The resource a cursor for this list is issued for. */
  public scope(): string {
    return `communities/${this.communityId}/members`;
  }

  public getMessage(): CommunityMembersFindMessage {
    return new CommunityMembersFindMessage(
      this.communityId,
      this.actorIdentityId,
      PageLimit.parse(this.limit),
      this.afterPosition(),
    );
  }
}
