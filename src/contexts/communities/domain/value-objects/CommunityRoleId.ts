import { ShortId, StringValueObject } from '@haskou/value-objects';
import { createHash } from 'crypto';

export class CommunityRoleId extends StringValueObject {
  public static readonly EVERYONE_VALUE = 'everyone';

  /** First 24 hex chars of sha256(JSON(['role', communityId, creator, createdAt])). */
  public static derive(
    communityId: string,
    creatorIdentityId: string,
    createdAt: number,
  ): CommunityRoleId {
    return new CommunityRoleId(
      createHash('sha256')
        .update(
          JSON.stringify(['role', communityId, creatorIdentityId, createdAt]),
        )
        .digest('hex')
        .slice(0, 24),
    );
  }

  public static everyone(): CommunityRoleId {
    return new CommunityRoleId(CommunityRoleId.EVERYONE_VALUE);
  }

  public static generate(): CommunityRoleId {
    return new CommunityRoleId(ShortId.generate().valueOf());
  }

  public isEveryone(): boolean {
    return this.isEqual(CommunityRoleId.everyone());
  }
}
