import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityId } from '../../../domain/value-objects/CommunityId';
import { CommunityModerationLogMutation } from '../../record-moderation-log/CommunityModerationLogMutation';
import { CommunityModerationLogMutationPrimitives } from '../../record-moderation-log/CommunityModerationLogMutationPrimitives';
import { CommunityOperationMutation } from '../../record-operation/CommunityOperationMutation';
import { CommunityOperationMutationPrimitives } from '../../record-operation/CommunityOperationMutationPrimitives';

export class CommunityMemberBanMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly communityId: CommunityId;
  public readonly moderationLog: CommunityModerationLogMutation;
  public readonly operation: CommunityOperationMutation;
  public readonly reason?: string;
  public readonly targetIdentityId: IdentityId;

  constructor(
    communityId: string,
    actorIdentityId: string,
    targetIdentityId: string,
    moderationLog: CommunityModerationLogMutationPrimitives,
    operation: CommunityOperationMutationPrimitives,
    reason?: string,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.communityId = new CommunityId(communityId);
    this.moderationLog = new CommunityModerationLogMutation(moderationLog);
    this.operation = new CommunityOperationMutation(operation);
    this.reason = reason;
    this.targetIdentityId = new IdentityId(targetIdentityId);
  }
}
