import DomainEventPublisher from '@app/shared/domain/events/DomainEventPublisher';

import { Community } from '../../domain/Community';
import { CommunityModerationTarget } from '../../domain/entities/moderation/CommunityModerationTarget';
import CommunityChannelMessageRepository from '../../domain/repositories/CommunityChannelMessageRepository';
import CommunityMessageReactionRepository from '../../domain/repositories/CommunityMessageReactionRepository';
import CommunityRepository from '../../domain/repositories/CommunityRepository';
import { CommunityModerationAction } from '../../domain/value-objects/CommunityModerationAction';
import { CommunityModerationTargetType } from '../../domain/value-objects/CommunityModerationTargetType';
import CommunityFinder from '../find-community/CommunityFinder';
import { CommunityFindMessage } from '../find-community/messages/CommunityFindMessage';
import CommunityModerationLogRecorder from '../record-moderation-log/CommunityModerationLogRecorder';
import { CommunityChannelDeleteMessage } from './messages/CommunityChannelDeleteMessage';

export default class CommunityChannelDeleter {
  constructor(
    private readonly communityFinder: CommunityFinder,
    private readonly communityRepository: CommunityRepository,
    private readonly messageRepository: CommunityChannelMessageRepository,
    private readonly reactionRepository: CommunityMessageReactionRepository,
    private readonly eventPublisher: DomainEventPublisher,
    private readonly moderationLogRecorder: CommunityModerationLogRecorder,
  ) {}

  public async delete(
    message: CommunityChannelDeleteMessage,
  ): Promise<Community> {
    const community = await this.communityFinder.find(
      new CommunityFindMessage(message.communityId.valueOf()),
    );
    const channelType = community.deleteChannel(
      message.actorIdentityId,
      message.channelId,
    );

    await this.communityRepository.save(community);
    await this.eventPublisher.publish(community.pullDomainEvents());
    await this.moderationLogRecorder.record(
      community,
      message.actorIdentityId,
      CommunityModerationAction.CHANNEL_DELETED,
      CommunityModerationTarget.create(
        CommunityModerationTargetType.CHANNEL,
        message.channelId,
      ),
      { type: channelType },
    );

    if (channelType === 'text') {
      await this.messageRepository.deleteByChannel(
        message.communityId,
        message.channelId,
      );
      await this.reactionRepository.deleteByChannel(
        message.communityId,
        message.channelId,
      );
    }

    return community;
  }
}
