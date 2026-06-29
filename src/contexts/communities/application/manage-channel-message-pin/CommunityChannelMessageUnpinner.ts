import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { CommunityNotFoundError } from '../../domain/errors/CommunityNotFoundError';
import { CommunityChannelMessageWasUnpinnedEvent } from '../../domain/events/CommunityChannelMessageWasUnpinnedEvent';
import CommunityChannelMessagePinRepository from '../../domain/repositories/CommunityChannelMessagePinRepository';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityChannelMessagePinDeleteMessage } from './messages/CommunityChannelMessagePinDeleteMessage';

export default class CommunityChannelMessageUnpinner {
  constructor(
    private readonly communityRepository: CommunityRepository,
    private readonly pinRepository: CommunityChannelMessagePinRepository,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async unpin(
    message: CommunityChannelMessagePinDeleteMessage,
  ): Promise<void> {
    const community = await this.communityRepository.findById(
      message.communityId,
    );

    if (!community) {
      throw new CommunityNotFoundError();
    }

    community.manageChannelMessages(message.actorIdentityId, message.channelId);
    await this.pinRepository.unpin(
      message.communityId,
      message.channelId,
      message.messageId,
    );
    const communityPrimitives = community.toPrimitives();

    await this.eventPublisher.publish([
      new CommunityChannelMessageWasUnpinnedEvent(
        message.communityId.valueOf(),
        {
          channelId: message.channelId.valueOf(),
          communityId: message.communityId.valueOf(),
          memberIds: communityPrimitives.memberIds,
          messageId: message.messageId.valueOf(),
          networkId: communityPrimitives.networkId,
          unpinnedByIdentityId: message.actorIdentityId.valueOf(),
        },
      ),
    ]);
  }
}
