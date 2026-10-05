import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityAvatar } from '../../../domain/value-objects/CommunityAvatar';
import { CommunityBanner } from '../../../domain/value-objects/CommunityBanner';
import { CommunityDescription } from '../../../domain/value-objects/CommunityDescription';
import { CommunityId } from '../../../domain/value-objects/CommunityId';
import { CommunityName } from '../../../domain/value-objects/CommunityName';
import {
  CommunityModerationLogMutation,
  CommunityModerationLogMutationPrimitives,
} from '../../record-moderation-log/CommunityModerationLogMutation';
import {
  CommunityOperationMutation,
  CommunityOperationMutationPrimitives,
} from '../../record-operation/CommunityOperationMutation';

export class CommunityProfileUpdateMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly autoJoinEnabled?: boolean;
  public readonly avatar?: CommunityAvatar;
  public readonly banner?: CommunityBanner;
  public readonly communityId: CommunityId;
  public readonly description: CommunityDescription;
  public readonly discoverable?: boolean;
  public readonly moderationLog: CommunityModerationLogMutation;
  public readonly operation: CommunityOperationMutation;
  public readonly name: CommunityName;

  constructor(params: {
    actorIdentityId: string;
    autoJoinEnabled?: boolean;
    avatar?: string;
    banner?: string;
    communityId: string;
    description: string;
    discoverable?: boolean;
    moderationLog: CommunityModerationLogMutationPrimitives;
    name: string;
    operation: CommunityOperationMutationPrimitives;
  }) {
    const {
      actorIdentityId,
      autoJoinEnabled,
      avatar,
      banner,
      communityId,
      description,
      discoverable,
      moderationLog,
      name,
      operation,
    } = params;

    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.autoJoinEnabled = autoJoinEnabled;
    this.communityId = new CommunityId(communityId);
    this.name = new CommunityName(name);
    this.description = new CommunityDescription(description);
    this.avatar = avatar ? new CommunityAvatar(avatar) : undefined;
    this.banner = banner ? new CommunityBanner(banner) : undefined;
    this.discoverable = discoverable;
    this.moderationLog = new CommunityModerationLogMutation(moderationLog);
    this.operation = new CommunityOperationMutation(operation);
  }
}
