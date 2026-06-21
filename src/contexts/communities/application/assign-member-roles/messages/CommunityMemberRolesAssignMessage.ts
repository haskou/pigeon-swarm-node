import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityId } from '../../../domain/value-objects/CommunityId';
import { CommunityRoleId } from '../../../domain/value-objects/CommunityRoleId';

export class CommunityMemberRolesAssignMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly communityId: CommunityId;
  public readonly roleIdValues: string[];
  public readonly roleIds: CommunityRoleId[];
  public readonly targetIdentityId: IdentityId;

  constructor(
    communityId: string,
    actorIdentityId: string,
    targetIdentityId: string,
    roleIds: string[],
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.communityId = new CommunityId(communityId);
    this.roleIdValues = [...roleIds];
    this.roleIds = roleIds.map((roleId) => new CommunityRoleId(roleId));
    this.targetIdentityId = new IdentityId(targetIdentityId);
  }
}
