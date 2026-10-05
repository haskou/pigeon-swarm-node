import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityChannelMessageMentions } from '@app/contexts/communities/domain/CommunityChannelMessageMentions';
import { CommunityChannelMessage } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessage';
import { CommunityChannelMessageEdition } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageEdition';
import { CommunityChannelMessageMention } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageMention';
import { CommunityChannelMessagePayload } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessagePayload';
import { CommunityChannelMessageNotFoundError } from '@app/contexts/communities/domain/errors/CommunityChannelMessageNotFoundError';
import CommunityChannelMessageRepository from '@app/contexts/communities/domain/repositories/CommunityChannelMessageRepository';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityMentionTargetId } from '@app/contexts/communities/domain/value-objects/CommunityMentionTargetId';
import { CommunityMentionType } from '@app/contexts/communities/domain/value-objects/CommunityMentionType';
import { InvalidPublicMutationError } from '@app/contexts/public-mutations/domain/errors/InvalidPublicMutationError';
import { StalePublicMutationError } from '@app/contexts/public-mutations/domain/errors/StalePublicMutationError';
import { PublicMutationProof } from '@app/contexts/public-mutations/domain/PublicMutationProof';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { assert, Timestamp } from '@haskou/value-objects';

import { CommunityChannelMessageCandidate } from './CommunityChannelMessageCandidate';

export default class CommunityChannelMessageCandidateRegistrar {
  constructor(
    private readonly messageRepository: CommunityChannelMessageRepository,
  ) {}

  private async saveAccepted(
    message: CommunityChannelMessage,
    proof: unknown,
  ): Promise<CommunityChannelMessage | undefined> {
    try {
      await this.messageRepository.save(
        message,
        PublicMutationProof.fromPrimitives(proof),
      );
    } catch (error) {
      if (
        error instanceof InvalidPublicMutationError ||
        error instanceof StalePublicMutationError
      ) {
        return undefined;
      }

      throw error;
    }

    return message;
  }

  private sameCommunity(
    community: Community,
    communityId: CommunityId,
  ): boolean {
    return community.isIdentifiedBy(communityId);
  }

  private payloadFrom(
    primitives: CommunityChannelMessageCandidate,
  ): CommunityChannelMessagePayload | undefined {
    if (!primitives.encryptedPayload && !primitives.plaintextPayload) {
      return undefined;
    }

    return CommunityChannelMessagePayload.fromPrimitives({
      encryptedPayload: primitives.encryptedPayload,
      plaintextPayload: primitives.plaintextPayload,
    });
  }

  private mentionsFrom(
    primitives: CommunityChannelMessageCandidate,
  ): CommunityChannelMessageMentions {
    return CommunityChannelMessageMentions.from(
      (primitives.mentions || []).map(
        (mention) =>
          new CommunityChannelMessageMention(
            new CommunityMentionType(mention.type),
            mention.targetId
              ? new CommunityMentionTargetId(mention.targetId)
              : undefined,
          ),
      ),
    );
  }

  private async assertReplyTargetExists(
    communityId: CommunityId,
    channelId: CommunityChannelId,
    replyToMessageId: string | undefined,
    acceptedMessageIds: ReadonlySet<string>,
  ): Promise<void> {
    if (!replyToMessageId || acceptedMessageIds.has(replyToMessageId)) {
      return;
    }

    const replyTarget = await this.messageRepository.findById(
      communityId,
      channelId,
      new CommunityChannelMessageId(replyToMessageId),
    );

    assert(replyTarget, new CommunityChannelMessageNotFoundError());
  }

  public async registerSent(
    community: Community,
    primitives: CommunityChannelMessageCandidate,
    proof: unknown,
    acceptedMessageIds: ReadonlySet<string> = new Set(),
  ): Promise<CommunityChannelMessage | undefined> {
    if (primitives.type !== 'sent' || primitives.editedAt) {
      return undefined;
    }

    const payload = this.payloadFrom(primitives);

    if (!payload) {
      return undefined;
    }

    const communityId = new CommunityId(primitives.communityId);
    const channelId = new CommunityChannelId(primitives.channelId);

    if (!this.sameCommunity(community, communityId)) {
      return undefined;
    }

    const message = CommunityChannelMessage.fromPrimitives(primitives);

    community.acceptSentChannelMessage(message, payload);
    await this.assertReplyTargetExists(
      communityId,
      channelId,
      primitives.replyToMessageId,
      acceptedMessageIds,
    );

    return this.saveAccepted(message, proof);
  }

  public async registerEdition(
    community: Community,
    primitives: CommunityChannelMessageCandidate,
    proof: unknown,
  ): Promise<CommunityChannelMessage | undefined> {
    if (!primitives.editedAt) {
      return undefined;
    }

    const payload = this.payloadFrom(primitives);

    if (!payload) {
      return undefined;
    }

    const communityId = new CommunityId(primitives.communityId);
    const channelId = new CommunityChannelId(primitives.channelId);
    const messageId = new CommunityChannelMessageId(primitives.id);
    const authorIdentityId = new IdentityId(primitives.authorIdentityId);

    if (!this.sameCommunity(community, communityId)) {
      return undefined;
    }

    const targetMessage = await this.messageRepository.findById(
      communityId,
      channelId,
      messageId,
    );

    assert(targetMessage, new CommunityChannelMessageNotFoundError());
    const mentions = this.mentionsFrom(primitives);

    const editedMessage = community.editChannelMessage(
      authorIdentityId,
      targetMessage,
      channelId,
      new CommunityChannelMessageEdition(
        payload,
        new Timestamp(primitives.editedAt),
        mentions,
      ),
      PublicMutationProof.fromPrimitives(proof),
    );

    return this.saveAccepted(editedMessage, proof);
  }
}
