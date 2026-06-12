import { CommunityPermissionValue } from '@app/contexts/communities/domain/value-objects/CommunityPermission';

export interface OrbitDBCommunityRoleDocument {
  builtIn: boolean;
  id: string;
  name: string;
  permissions: CommunityPermissionValue[];
}
