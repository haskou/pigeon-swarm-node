import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityId } from '../../../domain/value-objects/CommunityId';
import { CommunityPermission } from '../../../domain/value-objects/CommunityPermission';
import { CommunityRoleName } from '../../../domain/value-objects/CommunityRoleName';
import {
  CommunityModerationLogMutation,
  CommunityModerationLogMutationPrimitives,
} from '../../record-moderation-log/CommunityModerationLogMutation';

export class CommunityRoleCreateMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly communityId: CommunityId;
  public readonly moderationLog: CommunityModerationLogMutation;
  public readonly name: CommunityRoleName;
  public readonly permissionValues: string[];
  public readonly permissions: CommunityPermission[];

  constructor(
    communityId: string,
    actorIdentityId: string,
    name: string,
    permissions: string[],
    moderationLog: CommunityModerationLogMutationPrimitives,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.communityId = new CommunityId(communityId);
    this.moderationLog = new CommunityModerationLogMutation(moderationLog);
    this.name = new CommunityRoleName(name);
    this.permissionValues = [...permissions];
    this.permissions = permissions.map(
      (permission) => new CommunityPermission(permission),
    );
  }
}
