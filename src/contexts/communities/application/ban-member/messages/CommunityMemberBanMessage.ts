import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityId } from '../../../domain/value-objects/CommunityId';
import {
  CommunityModerationLogMutation,
  CommunityModerationLogMutationPrimitives,
} from '../../record-moderation-log/CommunityModerationLogMutation';

export class CommunityMemberBanMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly communityId: CommunityId;
  public readonly moderationLog: CommunityModerationLogMutation;
  public readonly reason?: string;
  public readonly targetIdentityId: IdentityId;

  constructor(
    communityId: string,
    actorIdentityId: string,
    targetIdentityId: string,
    moderationLog: CommunityModerationLogMutationPrimitives,
    reason?: string,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.communityId = new CommunityId(communityId);
    this.moderationLog = new CommunityModerationLogMutation(moderationLog);
    this.reason = reason;
    this.targetIdentityId = new IdentityId(targetIdentityId);
  }
}
