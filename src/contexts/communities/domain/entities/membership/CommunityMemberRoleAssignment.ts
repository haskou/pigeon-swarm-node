import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityRoleId } from '../../value-objects/CommunityRoleId';

export class CommunityMemberRoleAssignment {
  public readonly identityId!: IdentityId;
  public roleIds!: CommunityRoleId[];
}
