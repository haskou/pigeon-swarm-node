import { CommunityChannelMessage } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessage';
import { CommunityChannelMessageNotFoundError } from '@app/contexts/communities/domain/errors/CommunityChannelMessageNotFoundError';
import { CommunityChannelMessageWasSentEvent } from '@app/contexts/communities/domain/events/CommunityChannelMessageWasSentEvent';
import CommunityChannelMessageRepository from '@app/contexts/communities/domain/repositories/CommunityChannelMessageRepository';
import CommunityChannelMessageSignatureDomainService from '@app/contexts/communities/domain/services/CommunityChannelMessageSignatureDomainService';
import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import CommunityFinder from '../find-community/CommunityFinder';
import { CommunityFindMessage } from '../find-community/messages/CommunityFindMessage';
import { CommunityChannelMessageSendMessage } from './messages/CommunityChannelMessageSendMessage';

export default class CommunityChannelMessageSender {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly messageRepository: CommunityChannelMessageRepository,
    // eslint-disable-next-line max-len
    private readonly signatureService: CommunityChannelMessageSignatureDomainService,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  private async assertReplyTargetExists(
    message: CommunityChannelMessageSendMessage,
  ): Promise<void> {
    if (!message.replyToMessageId) {
      return;
    }

    const replyTarget = await this.messageRepository.findById(
      message.communityId,
      message.channelId,
      message.replyToMessageId,
    );

    if (!replyTarget) {
      throw new CommunityChannelMessageNotFoundError();
    }
  }

  public async send(
    message: CommunityChannelMessageSendMessage,
  ): Promise<CommunityChannelMessage> {
    const community = await this.communityFinder.find(
      new CommunityFindMessage(message.communityId.valueOf()),
    );

    await this.assertReplyTargetExists(message);

    const channelMessage = community.sendChannelMessage(
      message.metadata,
      message.payload,
      message.signature,
      message.attachmentExternalIdentifiers,
      message.mentions,
    );
    const messagePrimitives = channelMessage.toPrimitives();

    this.signatureService.assertValidSignature(
      message.authorIdentityId,
      messagePrimitives,
      message.signature,
    );

    await this.messageRepository.save(channelMessage);

    const communityPrimitives = community.toPrimitives();

    await this.eventPublisher.publish([
      new CommunityChannelMessageWasSentEvent(message.communityId.valueOf(), {
        authorIdentityId: message.authorIdentityId.valueOf(),
        channelId: message.channelId.valueOf(),
        community: communityPrimitives,
        communityId: message.communityId.valueOf(),
        memberIds: communityPrimitives.memberIds,
        message: messagePrimitives,
        messageId: messagePrimitives.id,
        networkId: communityPrimitives.networkId,
      }),
    ]);

    return channelMessage;
  }
}
