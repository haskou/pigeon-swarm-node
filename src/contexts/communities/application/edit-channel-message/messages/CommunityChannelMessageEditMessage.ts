import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { Timestamp } from '@haskou/value-objects';

import { CommunityChannelMessageMentions } from '../../../domain/CommunityChannelMessageMentions';
import { CommunityChannelMessageEdition } from '../../../domain/entities/messages/CommunityChannelMessageEdition';
import { CommunityChannelMessageMention } from '../../../domain/entities/messages/CommunityChannelMessageMention';
import { CommunityChannelMessagePayload } from '../../../domain/entities/messages/CommunityChannelMessagePayload';
import { CommunityChannelId } from '../../../domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '../../../domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '../../../domain/value-objects/CommunityId';
import { CommunityMentionTargetId } from '../../../domain/value-objects/CommunityMentionTargetId';
import { CommunityMentionType } from '../../../domain/value-objects/CommunityMentionType';

export class CommunityChannelMessageEditMessage {
  public readonly actorIdentityId: IdentityId;
  public readonly channelId: CommunityChannelId;
  public readonly communityId: CommunityId;
  public readonly edition: CommunityChannelMessageEdition;
  public readonly messageId: CommunityChannelMessageId;
  public readonly proof: PublicMutationProof;

  constructor(input: {
    actorIdentityId: string;
    channelId: string;
    communityId: string;
    createdAt: number;
    encryptedPayload?: string;
    mentions?: Array<{ targetId?: string; type: string }>;
    messageId: string;
    plaintextPayload?: string;
    mutation: unknown;
  }) {
    this.actorIdentityId = new IdentityId(input.actorIdentityId);
    this.communityId = new CommunityId(input.communityId);
    this.channelId = new CommunityChannelId(input.channelId);
    this.messageId = new CommunityChannelMessageId(input.messageId);
    this.proof = PublicMutationProof.fromPrimitives(input.mutation);

    const payload = CommunityChannelMessagePayload.fromPrimitives({
      encryptedPayload: input.encryptedPayload,
      plaintextPayload: input.plaintextPayload,
    });
    const mentions = CommunityChannelMessageMentions.from(
      (input.mentions ?? []).map(
        (mention) =>
          new CommunityChannelMessageMention(
            new CommunityMentionType(mention.type),
            mention.targetId
              ? new CommunityMentionTargetId(mention.targetId)
              : undefined,
          ),
      ),
    );
    this.edition = new CommunityChannelMessageEdition(
      payload,
      new Timestamp(input.createdAt),
      mentions,
    );
  }
}
