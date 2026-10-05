import { CommunityChannelMessage } from '@app/contexts/communities/domain/entities/messages/CommunityChannelMessage';
import { CommunityChannelMessageNotFoundError } from '@app/contexts/communities/domain/errors/CommunityChannelMessageNotFoundError';
import CommunityChannelMessageRepository from '@app/contexts/communities/domain/repositories/CommunityChannelMessageRepository';
import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import CommunityFinder from '../find-community/CommunityFinder';
import { CommunityChannelMessageSendMessage } from './messages/CommunityChannelMessageSendMessage';

export default class CommunityChannelMessageSender {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly messageRepository: CommunityChannelMessageRepository,
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
    const community = await this.communityFinder.findById(message.communityId);

    await this.assertReplyTargetExists(message);

    const channelMessage = community.sendChannelMessage(
      message.metadata,
      message.payload,
      message.mentions,
      message.proof,
    );

    await this.messageRepository.save(channelMessage, message.proof);
    await this.eventPublisher.publish(community.pullDomainEvents());

    return channelMessage;
  }
}
