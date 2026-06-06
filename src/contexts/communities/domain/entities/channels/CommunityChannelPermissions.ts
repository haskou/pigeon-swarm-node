import { PrimitiveOf } from '@haskou/value-objects';

import { CommunityRoleId } from '../../value-objects/CommunityRoleId';

export class CommunityChannelPermissions {
  public static visibleForEveryone(): CommunityChannelPermissions {
    return new CommunityChannelPermissions([CommunityRoleId.everyone()]);
  }

  public static fromPrimitives(
    primitives: PrimitiveOf<CommunityChannelPermissions> | undefined,
  ): CommunityChannelPermissions {
    return new CommunityChannelPermissions(
      (primitives?.visibleRoleIds || [CommunityRoleId.EVERYONE_VALUE]).map(
        (roleId) => new CommunityRoleId(roleId),
      ),
    );
  }

  constructor(private visibleRoleIds: CommunityRoleId[]) {}

  public updateVisibleRoleIds(roleIds: CommunityRoleId[]): void {
    this.visibleRoleIds =
      roleIds.length > 0 ? roleIds : [CommunityRoleId.everyone()];
  }

  public getVisibleRoleIds(): CommunityRoleId[] {
    return this.visibleRoleIds;
  }

  public toPrimitives() {
    return {
      visibleRoleIds: this.visibleRoleIds.map((roleId) => roleId.valueOf()),
    };
  }
}
