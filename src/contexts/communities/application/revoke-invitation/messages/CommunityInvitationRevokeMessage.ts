import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityId } from '../../../domain/value-objects/CommunityId';
import { CommunityModerationLogMutation } from '../../record-moderation-log/CommunityModerationLogMutation';
import { CommunityModerationLogMutationPrimitives } from '../../record-moderation-log/CommunityModerationLogMutationPrimitives';
import { CommunityOperationMutation } from '../../record-operation/CommunityOperationMutation';
import { CommunityOperationMutationPrimitives } from '../../record-operation/CommunityOperationMutationPrimitives';

export class CommunityInvitationRevokeMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly communityId: CommunityId;
  public readonly invitationId: string;
  public readonly moderationLog: CommunityModerationLogMutation;
  public readonly operation: CommunityOperationMutation;

  constructor(
    communityId: string,
    invitationId: string,
    actorIdentityId: string,
    moderationLog: CommunityModerationLogMutationPrimitives,
    operation: CommunityOperationMutationPrimitives,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.communityId = new CommunityId(communityId);
    this.invitationId = invitationId;
    this.moderationLog = new CommunityModerationLogMutation(moderationLog);
    this.operation = new CommunityOperationMutation(operation);
  }
}
