import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { CommunityChannelMessageDeletion } from '../../domain/entities/messages/CommunityChannelMessageDeletion';
import { CommunityModerationLogDetails } from '../../domain/entities/moderation/CommunityModerationLogDetails';
import { CommunityModerationLogEntry } from '../../domain/entities/moderation/CommunityModerationLogEntry';
import { CommunityModerationTarget } from '../../domain/entities/moderation/CommunityModerationTarget';
import { CommunityChannelMessageNotFoundError } from '../../domain/errors/CommunityChannelMessageNotFoundError';
import CommunityChannelMessageRepository from '../../domain/repositories/CommunityChannelMessageRepository';
import CommunityModerationLogRepository from '../../domain/repositories/CommunityModerationLogRepository';
import CommunityChannelMessageSignatureDomainService from '../../domain/services/CommunityChannelMessageSignatureDomainService';
import { CommunityModerationAction } from '../../domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '../../domain/value-objects/CommunityModerationTargetType';
import CommunityFinder from '../find-community/CommunityFinder';
import { CommunityFindMessage } from '../find-community/messages/CommunityFindMessage';
import { CommunityChannelMessageDeleteMessage } from './messages/CommunityChannelMessageDeleteMessage';

export default class CommunityChannelMessageDeleter {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly messageRepository: CommunityChannelMessageRepository,
    private readonly moderationLogRepository: CommunityModerationLogRepository,
    // eslint-disable-next-line max-len
    private readonly signatureService: CommunityChannelMessageSignatureDomainService,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  public async delete(
    message: CommunityChannelMessageDeleteMessage,
  ): Promise<CommunityChannelMessageDeletion> {
    const community = await this.communityFinder.find(
      new CommunityFindMessage(message.communityId.valueOf()),
    );
    const targetMessage = await this.messageRepository.findById(
      message.communityId,
      message.channelId,
      message.targetMessageId,
    );

    if (!targetMessage) {
      throw new CommunityChannelMessageNotFoundError();
    }

    community.deleteChannelMessage(
      message.actorIdentityId,
      targetMessage,
      message.channelId,
      message.deletion,
    );

    this.signatureService.assertValidSignature(
      message.actorIdentityId,
      message.signaturePayload,
      message.signature,
    );

    await this.messageRepository.delete(
      message.communityId,
      message.channelId,
      message.targetMessageId,
    );
    await this.eventPublisher.publish(community.pullDomainEvents());
    await this.moderationLogRepository.save(
      CommunityModerationLogEntry.record(
        message.communityId,
        message.actorIdentityId,
        CommunityModerationAction.MESSAGE_DELETED,
        CommunityModerationTarget.create(
          CommunityModerationTargetType.MESSAGE,
          message.targetMessageId,
        ),
        new CommunityModerationLogDetails({
          channelId: message.channelId.valueOf(),
          targetMessageAuthorId: targetMessage.getAuthorIdentityId().valueOf(),
        }),
      ),
    );

    return message.deletion;
  }
}
