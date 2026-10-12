import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

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
    const community = await this.communityRepository.requireById(
      message.communityId,
    );

    community.manageChannelMessages(message.actorIdentityId, message.channelId);

    await this.messageRepository.requireById(
      message.communityId,
      message.channelId,
      message.messageId,
    );

    await this.pinRepository.pin(
      message.communityId,
      message.channelId,
      message.messageId,
      message.actorIdentityId,
      message.createdAt,
      message.proof,
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
