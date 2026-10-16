import { CommitmentId } from '@haskou/pigeon-swarm-crypto';
import { StringValueObject } from '@haskou/value-objects';
import { createHash } from 'crypto';

export class CommunityInviteToken extends StringValueObject {
  private static readonly MAX_LENGTH = 128;
  private static readonly REFERENCE_CONTEXT =
    'pigeon:community-invite-reference:v1\n';

  /**
   * The token commits to the invite limits, so no record carrying it can
   * rewrite them.
   */
  public static derive(
    communityId: string,
    creatorIdentityId: string,
    nonce: string,
    maxUses: number,
    expiresAt?: number,
  ): CommunityInviteToken {
    return new CommunityInviteToken(
      CommitmentId.communityInviteToken(
        communityId,
        creatorIdentityId,
        nonce,
        maxUses,
        expiresAt,
      ),
    );
  }

  constructor(value: string | StringValueObject) {
    super(value, CommunityInviteToken.MAX_LENGTH);
  }

  /**
   * The public handle of an invite, never redeemable:
   * base64url(sha256("pigeon:community-invite-reference:v1\n" + token)). The
   * signed `invite_link` join and the `invite_link_created` moderation log
   * entry carry it instead of the token, because roles without CREATE_INVITES
   * read both.
   */
  public toReference(): string {
    return createHash('sha256')
      .update(`${CommunityInviteToken.REFERENCE_CONTEXT}${this.valueOf()}`)
      .digest('base64url');
  }
}
