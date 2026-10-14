import { StringValueObject } from '@haskou/value-objects';
import { createHash } from 'crypto';

export class CommunityInviteToken extends StringValueObject {
  private static readonly MAX_LENGTH = 128;
  private static readonly JOIN_REFERENCE_CONTEXT =
    'pigeon:community-invite-reference:v1\n';

  /** base64url(sha256(JSON([communityId, creatorIdentityId, nonce]))). */
  public static derive(
    communityId: string,
    creatorIdentityId: string,
    nonce: string,
  ): CommunityInviteToken {
    return new CommunityInviteToken(
      createHash('sha256')
        .update(JSON.stringify([communityId, creatorIdentityId, nonce]))
        .digest('base64url'),
    );
  }

  constructor(value: string | StringValueObject) {
    super(value, CommunityInviteToken.MAX_LENGTH);
  }

  /**
   * The `reference` a signed `invite_link` join carries instead of the token:
   * base64url(sha256("pigeon:community-invite-reference:v1\n" + token)). Every
   * member reads the operation log, so it must not hand out a usable invite.
   */
  public toJoinReference(): string {
    return createHash('sha256')
      .update(`${CommunityInviteToken.JOIN_REFERENCE_CONTEXT}${this.valueOf()}`)
      .digest('base64url');
  }
}
