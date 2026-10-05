import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityId } from '../../../domain/value-objects/CommunityId';
import { CommunityRoleId } from '../../../domain/value-objects/CommunityRoleId';
import {
  CommunityModerationLogMutation,
  CommunityModerationLogMutationPrimitives,
} from '../../record-moderation-log/CommunityModerationLogMutation';
import {
  CommunityOperationMutation,
  CommunityOperationMutationPrimitives,
} from '../../record-operation/CommunityOperationMutation';

export class CommunityRoleDeleteMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly communityId: CommunityId;
  public readonly moderationLog: CommunityModerationLogMutation;
  public readonly operation: CommunityOperationMutation;
  public readonly roleId: CommunityRoleId;

  constructor(
    communityId: string,
    roleId: string,
    actorIdentityId: string,
    moderationLog: CommunityModerationLogMutationPrimitives,
    operation: CommunityOperationMutationPrimitives,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.communityId = new CommunityId(communityId);
    this.moderationLog = new CommunityModerationLogMutation(moderationLog);
    this.operation = new CommunityOperationMutation(operation);
    this.roleId = new CommunityRoleId(roleId);
  }
}
