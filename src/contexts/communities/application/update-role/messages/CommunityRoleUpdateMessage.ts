import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityId } from '../../../domain/value-objects/CommunityId';
import { CommunityPermission } from '../../../domain/value-objects/CommunityPermission';
import { CommunityRoleId } from '../../../domain/value-objects/CommunityRoleId';
import { CommunityRoleName } from '../../../domain/value-objects/CommunityRoleName';

export class CommunityRoleUpdateMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly communityId: CommunityId;
  public readonly name: CommunityRoleName;
  public readonly permissionValues: string[];
  public readonly permissions: CommunityPermission[];
  public readonly roleId: CommunityRoleId;

  constructor(
    communityId: string,
    roleId: string,
    actorIdentityId: string,
    name: string,
    permissions: string[],
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.communityId = new CommunityId(communityId);
    this.name = new CommunityRoleName(name);
    this.permissionValues = [...permissions];
    this.permissions = permissions.map(
      (permission) => new CommunityPermission(permission),
    );
    this.roleId = new CommunityRoleId(roleId);
  }
}
