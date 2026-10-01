import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { CommunityChannelId } from '../../../domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '../../../domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '../../../domain/value-objects/CommunityId';

export class CommunityChannelMessagePinCreateMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly channelId: CommunityChannelId;
  public readonly communityId: CommunityId;
  public readonly createdAt: Timestamp;
  public readonly messageId: CommunityChannelMessageId;
  public readonly proof: PublicMutationProof;

  constructor(
    actorIdentityId: string,
    communityId: string,
    channelId: string,
    messageId: string,
    createdAt: number,
    proof: unknown,
  ) {
    this.actorIdentityId = new IdentityId(actorIdentityId);
    this.communityId = new CommunityId(communityId);
    this.channelId = new CommunityChannelId(channelId);
    this.messageId = new CommunityChannelMessageId(messageId);
    this.createdAt = new Timestamp(createdAt);
    this.proof = PublicMutationProof.fromPrimitives(proof);
  }
}
