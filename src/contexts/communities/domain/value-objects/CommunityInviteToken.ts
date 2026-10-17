import {
  CommitmentId,
  CommunityInviteReference,
} from '@haskou/pigeon-swarm-crypto';
import { StringValueObject } from '@haskou/value-objects';

export class CommunityInviteToken extends StringValueObject {
  private static readonly MAX_LENGTH = 128;

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
   * read both. Throws InvalidCommunityInviteReferenceError unless the token is
   * 32 canonical base64url bytes, as every derived token is.
   */
  public toReference(): string {
    return CommunityInviteReference.of(this.valueOf());
  }
}
