import { CommitmentId } from '@haskou/pigeon-swarm-crypto';
import { ShortId, StringValueObject } from '@haskou/value-objects';

export class CommunityRoleId extends StringValueObject {
  public static readonly EVERYONE_VALUE = 'everyone';

  public static derive(
    communityId: string,
    creatorIdentityId: string,
    createdAt: number,
  ): CommunityRoleId {
    return new CommunityRoleId(
      CommitmentId.communityRole(communityId, creatorIdentityId, createdAt),
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
