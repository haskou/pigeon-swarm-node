import { StringValueObject } from '@haskou/value-objects';
import { randomBytes } from 'crypto';

export class CommunityInviteToken extends StringValueObject {
  private static readonly MAX_LENGTH = 128;

  public static generate(): CommunityInviteToken {
    return new CommunityInviteToken(randomBytes(32).toString('base64url'));
  }

  constructor(value: string | StringValueObject) {
    super(value, CommunityInviteToken.MAX_LENGTH);
  }
}
