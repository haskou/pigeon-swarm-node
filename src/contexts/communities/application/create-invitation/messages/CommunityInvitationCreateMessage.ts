import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityId } from '../../../domain/value-objects/CommunityId';
import { CommunityModerationLogMutation } from '../../record-moderation-log/CommunityModerationLogMutation';
import { CommunityModerationLogMutationPrimitives } from '../../record-moderation-log/CommunityModerationLogMutationPrimitives';
import { CommunityOperationMutation } from '../../record-operation/CommunityOperationMutation';
import { CommunityOperationMutationPrimitives } from '../../record-operation/CommunityOperationMutationPrimitives';

export class CommunityInvitationCreateMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly communityId: CommunityId;
  public readonly expiresAt: number;
  public readonly invitationKey: string;
  public readonly invitee?: string;
  public readonly maxUses: number;
  public readonly moderationLog: CommunityModerationLogMutation;
  public readonly operation: CommunityOperationMutation;

  constructor(
    communityId: string,
    actorIdentityId: string,
    invitation: {
      expiresAt: number;
      invitationKey: string;
      invitee?: string;
      maxUses: number;
    },
    moderationLog: CommunityModerationLogMutationPrimitives,
    operation: CommunityOperationMutationPrimitives,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.communityId = new CommunityId(communityId);
    this.expiresAt = invitation.expiresAt;
    this.invitationKey = invitation.invitationKey;
    this.invitee = invitation.invitee;
    this.maxUses = invitation.maxUses;
    this.moderationLog = new CommunityModerationLogMutation(moderationLog);
    this.operation = new CommunityOperationMutation(operation);
  }
}
