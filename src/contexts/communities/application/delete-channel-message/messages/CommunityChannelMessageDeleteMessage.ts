import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';

import { CommunityChannelId } from '../../../domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '../../../domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '../../../domain/value-objects/CommunityId';
import {
  CommunityModerationLogMutation,
  CommunityModerationLogMutationPrimitives,
} from '../../record-moderation-log/CommunityModerationLogMutation';

export class CommunityChannelMessageDeleteMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly channelId: CommunityChannelId;
  public readonly communityId: CommunityId;
  public readonly moderationLog: CommunityModerationLogMutation;
  public readonly proof: PublicMutationProof;
  public readonly targetMessageId: CommunityChannelMessageId;

  constructor(input: {
    actorIdentityId: string;
    channelId: string;
    communityId: string;
    moderationLog: CommunityModerationLogMutationPrimitives;
    mutation: unknown;
    targetMessageId: string;
  }) {
    this.actorIdentityId = new IdentityId(input.actorIdentityId);
    this.communityId = new CommunityId(input.communityId);
    this.channelId = new CommunityChannelId(input.channelId);
    this.targetMessageId = new CommunityChannelMessageId(input.targetMessageId);
    this.moderationLog = new CommunityModerationLogMutation(
      input.moderationLog,
    );
    this.proof = PublicMutationProof.fromPrimitives(input.mutation);
  }
}
