import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityId } from '../../../domain/value-objects/CommunityId';
import { CommunityPermission } from '../../../domain/value-objects/CommunityPermission';
import { CommunityRoleName } from '../../../domain/value-objects/CommunityRoleName';

export class CommunityRoleCreateMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly communityId: CommunityId;
  public readonly name: CommunityRoleName;
  public readonly permissionValues: string[];
  public readonly permissions: CommunityPermission[];

  constructor(
    communityId: string,
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
  }
}
