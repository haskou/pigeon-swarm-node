import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityChannelId } from '../../../domain/value-objects/CommunityChannelId';
import { CommunityChannelName } from '../../../domain/value-objects/CommunityChannelName';
import { CommunityId } from '../../../domain/value-objects/CommunityId';
import {
  CommunityModerationLogMutation,
  CommunityModerationLogMutationPrimitives,
} from '../../record-moderation-log/CommunityModerationLogMutation';
import {
  CommunityOperationMutation,
  CommunityOperationMutationPrimitives,
} from '../../record-operation/CommunityOperationMutation';

export class CommunityChannelRenameMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly channelId: CommunityChannelId;
  public readonly communityId: CommunityId;
  public readonly moderationLog: CommunityModerationLogMutation;
  public readonly operation: CommunityOperationMutation;
  public readonly name: CommunityChannelName;

  constructor(
    communityId: string,
    channelId: string,
    actorIdentityId: string,
    name: string,
    moderationLog: CommunityModerationLogMutationPrimitives,
    operation: CommunityOperationMutationPrimitives,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.channelId = new CommunityChannelId(channelId);
    this.communityId = new CommunityId(communityId);
    this.moderationLog = new CommunityModerationLogMutation(moderationLog);
    this.operation = new CommunityOperationMutation(operation);
    this.name = new CommunityChannelName(name);
  }
}
