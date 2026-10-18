import { InvalidPageCursorError } from '@app/apps/apis/shared/errors/InvalidPageCursorError';
import { PageCursor } from '@app/apps/apis/shared/pagination/PageCursor';
import { PageLimit } from '@app/apps/apis/shared/pagination/PageLimit';
import { CommunityInvitationClaimsFindMessage } from '@app/contexts/communities/application/find-invitation-claims/messages/CommunityInvitationClaimsFindMessage';
import { CommunityInvitationClaim } from '@app/contexts/communities/domain/entities/invitations/CommunityInvitationClaim';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

/** One page of a community's pending invitation claims, read after the position of its cursor. */
export class GetCommunityInvitationClaimsRequest {
  private static readonly POSITION_PATTERN =
    /^invitation-claim:([A-Za-z0-9_-]{43}):([\s\S]+)$/;

  public constructor(
    private readonly communityId: string,
    private readonly actorIdentityId: string,
    private readonly cursor: string | undefined,
    private readonly limit: unknown,
  ) {}

  /** The claim to read after: the position of a decoded cursor, which must be a claim id. */
  private afterPosition(): string | undefined {
    if (this.cursor === undefined) return undefined;

    const position = PageCursor.decode(this.cursor, this.scope());

    if (!this.isClaimId(position)) {
      throw new InvalidPageCursorError();
    }

    return position;
  }

  /** Whether a position is exactly the id of a claim: it must rebuild to itself. */
  private isClaimId(position: string): boolean {
    const match =
      GetCommunityInvitationClaimsRequest.POSITION_PATTERN.exec(position);

    if (match === null) return false;

    try {
      return (
        CommunityInvitationClaim.idOf(match[1], new IdentityId(match[2])) ===
        position
      );
    } catch {
      return false;
    }
  }

  /** The resource a cursor for this list is issued for. */
  public scope(): string {
    return `communities/${this.communityId}/invitation-claims`;
  }

  public getMessage(): CommunityInvitationClaimsFindMessage {
    return new CommunityInvitationClaimsFindMessage(
      this.communityId,
      this.actorIdentityId,
      PageLimit.parse(this.limit),
      this.afterPosition(),
    );
  }
}
