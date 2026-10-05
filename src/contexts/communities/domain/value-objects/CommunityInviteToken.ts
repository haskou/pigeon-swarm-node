import { StringValueObject } from '@haskou/value-objects';
import { createHash } from 'crypto';

export class CommunityInviteToken extends StringValueObject {
  private static readonly MAX_LENGTH = 128;

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
}
