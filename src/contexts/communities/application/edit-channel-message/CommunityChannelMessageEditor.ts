import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { CommunityChannelMessage } from '../../domain/entities/messages/CommunityChannelMessage';
import { CommunityChannelMessageNotFoundError } from '../../domain/errors/CommunityChannelMessageNotFoundError';
import CommunityChannelMessageRepository from '../../domain/repositories/CommunityChannelMessageRepository';
import CommunityChannelMessageSignatureDomainService from '../../domain/services/CommunityChannelMessageSignatureDomainService';
import CommunityFinder from '../find-community/CommunityFinder';
import { CommunityFindMessage } from '../find-community/messages/CommunityFindMessage';
import { CommunityChannelMessageEditMessage } from './messages/CommunityChannelMessageEditMessage';

export default class CommunityChannelMessageEditor {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly messageRepository: CommunityChannelMessageRepository,
    // eslint-disable-next-line max-len
    private readonly signatureService: CommunityChannelMessageSignatureDomainService,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async edit(
    message: CommunityChannelMessageEditMessage,
  ): Promise<CommunityChannelMessage> {
    const community = await this.communityFinder.find(
      new CommunityFindMessage(message.communityId.valueOf()),
    );
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
