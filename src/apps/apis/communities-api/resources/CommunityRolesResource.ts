import { CommunityMemberRolesResource } from './CommunityMemberRolesResource';
import { CommunityRoleResource } from './CommunityRoleResource';

export interface CommunityRolesResource {
  memberRoles: CommunityMemberRolesResource[];
  nextCursor: string | null;
  roles: CommunityRoleResource[];
}
