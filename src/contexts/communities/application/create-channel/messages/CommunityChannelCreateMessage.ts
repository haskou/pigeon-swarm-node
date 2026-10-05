import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityChannelName } from '../../../domain/value-objects/CommunityChannelName';
import { CommunityId } from '../../../domain/value-objects/CommunityId';
import {
  CommunityModerationLogMutation,
  CommunityModerationLogMutationPrimitives,
} from '../../record-moderation-log/CommunityModerationLogMutation';

export class CommunityChannelCreateMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly communityId: CommunityId;
  public readonly moderationLog: CommunityModerationLogMutation;
  public readonly name: CommunityChannelName;

  constructor(
    communityId: string,
    actorIdentityId: string,
    name: string,
    moderationLog: CommunityModerationLogMutationPrimitives,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.communityId = new CommunityId(communityId);
    this.moderationLog = new CommunityModerationLogMutation(moderationLog);
    this.name = new CommunityChannelName(name);
  }
}
