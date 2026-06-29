import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { CommunityChannelMessageNotFoundError } from '../../domain/errors/CommunityChannelMessageNotFoundError';
import { CommunityNotFoundError } from '../../domain/errors/CommunityNotFoundError';
import { CommunityChannelMessageWasPinnedEvent } from '../../domain/events/CommunityChannelMessageWasPinnedEvent';
import CommunityChannelMessagePinRepository from '../../domain/repositories/CommunityChannelMessagePinRepository';
import CommunityChannelMessageRepository from '../../domain/repositories/CommunityChannelMessageRepository';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityChannelMessagePinCreateMessage } from './messages/CommunityChannelMessagePinCreateMessage';

export default class CommunityChannelMessagePinner {
  constructor(
    private readonly communityRepository: CommunityRepository,
    private readonly messageRepository: CommunityChannelMessageRepository,
    private readonly pinRepository: CommunityChannelMessagePinRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async pin(
    message: CommunityChannelMessagePinCreateMessage,
  ): Promise<void> {
    const community = await this.communityRepository.findById(
      message.communityId,
    );

    if (!community) {
      throw new CommunityNotFoundError();
    }

    community.manageChannelMessages(message.actorIdentityId, message.channelId);

    const pinnedMessage = await this.messageRepository.findById(
      message.communityId,
      message.channelId,
      message.messageId,
    );

    if (!pinnedMessage) {
      throw new CommunityChannelMessageNotFoundError();
    }

    await this.pinRepository.pin(
      message.communityId,
      message.channelId,
      message.messageId,
      message.actorIdentityId,
    );
    const communityPrimitives = community.toPrimitives();

    await this.eventPublisher.publish([
      new CommunityChannelMessageWasPinnedEvent(message.communityId.valueOf(), {
        channelId: message.channelId.valueOf(),
        communityId: message.communityId.valueOf(),
        memberIds: communityPrimitives.memberIds,
        messageId: message.messageId.valueOf(),
        networkId: communityPrimitives.networkId,
        pinnedByIdentityId: message.actorIdentityId.valueOf(),
      }),
    ]);
  }
}
