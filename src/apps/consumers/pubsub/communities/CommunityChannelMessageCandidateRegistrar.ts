import { Community } from '@app/contexts/communities/domain/Community';
import { CommunityChannelMessageMentions } from '@app/contexts/communities/domain/CommunityChannelMessageMentions';
import { CommunityChannelMessage } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessage';
import { CommunityChannelMessageEdition } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageEdition';
import { CommunityChannelMessageMention } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageMention';
import { CommunityChannelMessagePayload } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessagePayload';
import { CommunityChannelMessageSignaturePayload } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessageSignaturePayload';
import { CommunityChannelMessageNotFoundError } from '@app/contexts/communities/domain/errors/CommunityChannelMessageNotFoundError';
import CommunityChannelMessageRepository from '@app/contexts/communities/domain/repositories/CommunityChannelMessageRepository';
import CommunityChannelMessageSignatureDomainService from '@app/contexts/communities/domain/services/CommunityChannelMessageSignatureDomainService';
import { CommunityChannelId } from '@app/contexts/communities/domain/value-objects/CommunityChannelId';
import { CommunityChannelMessageId } from '@app/contexts/communities/domain/value-objects/CommunityChannelMessageId';
import { CommunityId } from '@app/contexts/communities/domain/value-objects/CommunityId';
import { CommunityMentionTargetId } from '@app/contexts/communities/domain/value-objects/CommunityMentionTargetId';
import { CommunityMentionType } from '@app/contexts/communities/domain/value-objects/CommunityMentionType';
import { IdentityId } from '@app/contexts/shared/domain/value-objects/IdentityId';
import { assert, Signature, Timestamp } from '@haskou/value-objects';

import { CommunityChannelMessageCandidate } from './CommunityChannelMessageCandidate';

export default class CommunityChannelMessageCandidateRegistrar {
  constructor(
    private readonly messageRepository: CommunityChannelMessageRepository,

    private readonly signatureService: CommunityChannelMessageSignatureDomainService,
  ) {}

  private sameCommunity(
    community: Community,
    communityId: CommunityId,
  ): boolean {
    return community.getId().isEqual(communityId);
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
    acceptedMessageIds: ReadonlySet<string> = new Set(),
  ): Promise<CommunityChannelMessage | undefined> {
    if (primitives.type !== 'sent' || primitives.editedAt) {
      return undefined;
    }

    const payload = this.payloadFrom(primitives);

    if (!payload || !primitives.signature) {
      return undefined;
    }

    const communityId = new CommunityId(primitives.communityId);
    const channelId = new CommunityChannelId(primitives.channelId);
    const authorIdentityId = new IdentityId(primitives.authorIdentityId);

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
    this.signatureService.assertValidSignature(
      authorIdentityId,
      message.toSignaturePayload(),
      new Signature(primitives.signature),
    );

    await this.messageRepository.save(message);

    return message;
  }

  public async registerEdition(
    community: Community,
    primitives: CommunityChannelMessageCandidate,
  ): Promise<CommunityChannelMessage | undefined> {
    if (!primitives.editedAt || !primitives.signature) {
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
        new Signature(primitives.signature),
        new Timestamp(primitives.editedAt),
        mentions,
      ),
    );

    this.signatureService.assertValidSignature(
      authorIdentityId,
      CommunityChannelMessageSignaturePayload.fromPrimitives({
        authorIdentityId: authorIdentityId.valueOf(),
        channelId: primitives.channelId,
        communityId: primitives.communityId,
        createdAt: primitives.editedAt,
        encryptedPayload: primitives.encryptedPayload,
        id: primitives.id,
        mentions: mentions.toPrimitives(),
        plaintextPayload: primitives.plaintextPayload,
        replyToMessageId: undefined,
        type: 'edited',
      }),
      new Signature(primitives.signature),
    );

    await this.messageRepository.save(editedMessage);

    return editedMessage;
  }
}
