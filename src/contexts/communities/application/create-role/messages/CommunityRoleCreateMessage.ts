import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityId } from '../../../domain/value-objects/CommunityId';
import { CommunityPermission } from '../../../domain/value-objects/CommunityPermission';
import { CommunityRoleName } from '../../../domain/value-objects/CommunityRoleName';
import { CommunityModerationLogMutation } from '../../record-moderation-log/CommunityModerationLogMutation';
import { CommunityModerationLogMutationPrimitives } from '../../record-moderation-log/CommunityModerationLogMutationPrimitives';
import { CommunityOperationMutation } from '../../record-operation/CommunityOperationMutation';
import { CommunityOperationMutationPrimitives } from '../../record-operation/CommunityOperationMutationPrimitives';

export class CommunityRoleCreateMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly communityId: CommunityId;
  public readonly moderationLog: CommunityModerationLogMutation;
  public readonly operation: CommunityOperationMutation;
  public readonly name: CommunityRoleName;
  public readonly permissionValues: string[];
  public readonly permissions: CommunityPermission[];

  constructor(
    communityId: string,
    actorIdentityId: string,
    name: string,
    permissions: string[],
    moderationLog: CommunityModerationLogMutationPrimitives,
    operation: CommunityOperationMutationPrimitives,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.communityId = new CommunityId(communityId);
    this.moderationLog = new CommunityModerationLogMutation(moderationLog);
    this.operation = new CommunityOperationMutation(operation);
    this.name = new CommunityRoleName(name);
    this.permissionValues = [...permissions];
    this.permissions = permissions.map(
      (permission) => new CommunityPermission(permission),
    );
  }
}
