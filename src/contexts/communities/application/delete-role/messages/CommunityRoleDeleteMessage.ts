import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityId } from '../../../domain/value-objects/CommunityId';
import { CommunityRoleId } from '../../../domain/value-objects/CommunityRoleId';

export class CommunityRoleDeleteMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly communityId: CommunityId;
  public readonly roleId: CommunityRoleId;

  constructor(communityId: string, roleId: string, actorIdentityId: string) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.communityId = new CommunityId(communityId);
    this.roleId = new CommunityRoleId(roleId);
  }
}
