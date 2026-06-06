import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityRoleId } from '../../value-objects/CommunityRoleId';

export type CommunityMemberRoleAssignment = {
  identityId: IdentityId;
  roleIds: CommunityRoleId[];
};
