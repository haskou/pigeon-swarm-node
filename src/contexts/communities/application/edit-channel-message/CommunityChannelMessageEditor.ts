import { DomainEventPublisher } from '@app/shared/infrastructure/messageBus/DomainEventPublisher';

import { CommunityChannelMessage } from '../../domain/entities/messages/CommunityChannelMessage';
import { CommunityChannelMessageNotFoundError } from '../../domain/errors/CommunityChannelMessageNotFoundError';
import CommunityChannelMessageRepository from '../../domain/repositories/CommunityChannelMessageRepository';
import CommunityChannelMessageSignatureDomainService from '../../domain/services/CommunityChannelMessageSignatureDomainService';
import CommunityFinder from '../find-community/CommunityFinder';
import { CommunityChannelMessageEditMessage } from './messages/CommunityChannelMessageEditMessage';

export default class CommunityChannelMessageEditor {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly messageRepository: CommunityChannelMessageRepository,

    private readonly signatureService: CommunityChannelMessageSignatureDomainService,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async edit(
    message: CommunityChannelMessageEditMessage,
  ): Promise<CommunityChannelMessage> {
    const community = await this.communityFinder.findById(message.communityId);
    const targetMessage = await this.messageRepository.findById(
      message.communityId,
      message.channelId,
      message.messageId,
    );

    if (!targetMessage) {
      throw new CommunityChannelMessageNotFoundError();
    }

    const editedMessage = community.editChannelMessage(
      message.actorIdentityId,
      targetMessage,
      message.channelId,
      message.edition,
    );

    this.signatureService.assertValidSignature(
      message.actorIdentityId,
      message.signaturePayload,
      message.signature,
    );

    await this.messageRepository.save(editedMessage);
    await this.eventPublisher.publish(community.pullDomainEvents());

    return editedMessage;
  }
}
